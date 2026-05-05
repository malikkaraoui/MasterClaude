// ollama-proxy — Anthropic /v1/messages → Ollama /api/chat
//
// Listens on localhost:4000 (configurable via PORT env).
// Translates Anthropic Messages API requests to Ollama chat format,
// including tool_use / tool_result bidirectional mapping.
//
// Limitations :
//   - system prompt extracted from "system" field (not system messages)
//
// Usage:
//
//	go run main.go
//	ANTHROPIC_BASE_URL=http://localhost:4000 claude
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	OllamaURL    string        `json:"ollama_url"`
	Port         string        `json:"port"`
	Model        string        `json:"model"`
	Presets      []ModelPreset `json:"presets"`
	Triage       bool          `json:"triage"`        // enable local/Anthropic triage routing
	TriageModel  string        `json:"triage_model"`  // model for classification (defaults to Model)
	AnthropicURL string        `json:"anthropic_url"` // default: https://api.anthropic.com
}

type ModelPreset struct {
	Name   string `json:"name"`
	Model  string `json:"model"`
	MaxRAM int    `json:"max_ram_gb"`
}

func loadConfig() Config {
	cfg := Config{
		OllamaURL:    "http://localhost:11434",
		Port:         "4000",
		Model:        "qwen3.5:4b",
		Triage:       false,
		AnthropicURL: "https://api.anthropic.com",
		Presets: []ModelPreset{
			{Name: "light", Model: "qwen3.5:4b", MaxRAM: 8},
			{Name: "standard", Model: "qwen3.5:9b", MaxRAM: 16},
			{Name: "heavy", Model: "qwen3.5:35b", MaxRAM: 0},
		},
	}

	data, err := os.ReadFile("config.json")
	if err != nil {
		return cfg
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		log.Printf("[warn] config.json parse error: %v — using defaults", err)
	}
	return cfg
}

// ── Anthropic types ─────────────────────────────────────────────────────────

type AnthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    interface{}        `json:"system,omitempty"` // string or []ContentBlock
	Messages  []AnthropicMessage `json:"messages"`
	Tools     []AnthropicTool    `json:"tools,omitempty"`
	Stream    bool               `json:"stream,omitempty"`
}

type AnthropicMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"` // string or []ContentBlock
}

type AnthropicTool struct {
	Name        string      `json:"name"`
	Description string      `json:"description,omitempty"`
	InputSchema interface{} `json:"input_schema"` // JSON Schema object
}

type AnthropicResponse struct {
	ID           string         `json:"id"`
	Type         string         `json:"type"`
	Role         string         `json:"role"`
	Content      []ContentBlock `json:"content"`
	Model        string         `json:"model"`
	StopReason   string         `json:"stop_reason"`
	StopSequence *string        `json:"stop_sequence"`
	Usage        AnthropicUsage `json:"usage"`
}

type AnthropicUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type ContentBlock struct {
	Type      string      `json:"type"`
	Text      string      `json:"text,omitempty"`
	ID        string      `json:"id,omitempty"`         // tool_use
	Name      string      `json:"name,omitempty"`       // tool_use
	Input     interface{} `json:"input,omitempty"`       // tool_use
	ToolUseID string      `json:"tool_use_id,omitempty"` // tool_result
	Content   interface{} `json:"content,omitempty"`     // tool_result (string or blocks)
	IsError   bool        `json:"is_error,omitempty"`    // tool_result
}

// ── Ollama types ────────────────────────────────────────────────────────────

type OllamaRequest struct {
	Model    string          `json:"model"`
	Messages []OllamaMessage `json:"messages"`
	Tools    []OllamaTool    `json:"tools,omitempty"`
	Stream   bool            `json:"stream"`
	Think    *bool           `json:"think,omitempty"`   // disable thinking mode (qwen3.5)
	Options  map[string]int  `json:"options,omitempty"`
}

type OllamaMessage struct {
	Role      string          `json:"role"`
	Content   string          `json:"content"`
	ToolCalls []OllamaToolCall `json:"tool_calls,omitempty"` // assistant → tool invocation
	ToolName  string          `json:"tool_name,omitempty"`   // role:"tool" → result
}

type OllamaToolCall struct {
	Type     string             `json:"type"` // "function"
	Function OllamaFunctionCall `json:"function"`
}

type OllamaFunctionCall struct {
	Index     int         `json:"index,omitempty"`
	Name      string      `json:"name"`
	Arguments interface{} `json:"arguments"` // object (not string)
}

type OllamaTool struct {
	Type     string         `json:"type"` // "function"
	Function OllamaFunction `json:"function"`
}

type OllamaFunction struct {
	Name        string      `json:"name"`
	Description string      `json:"description,omitempty"`
	Parameters  interface{} `json:"parameters"` // JSON Schema
}

type OllamaResponse struct {
	Model      string        `json:"model"`
	Message    OllamaRespMsg `json:"message"`
	Done       bool          `json:"done"`
	DoneReason string        `json:"done_reason,omitempty"`
}

type OllamaRespMsg struct {
	Role      string           `json:"role"`
	Content   string           `json:"content"`
	Thinking  string           `json:"thinking,omitempty"` // qwen3.5 thinking mode
	ToolCalls []OllamaToolCall `json:"tool_calls,omitempty"`
}

// ── Translation: Anthropic → Ollama ─────────────────────────────────────────

// translateTools converts Anthropic tool definitions to Ollama format.
func translateTools(tools []AnthropicTool) []OllamaTool {
	if len(tools) == 0 {
		return nil
	}
	out := make([]OllamaTool, len(tools))
	for i, t := range tools {
		out[i] = OllamaTool{
			Type: "function",
			Function: OllamaFunction{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  t.InputSchema,
			},
		}
	}
	return out
}

// extractSystemPrompt handles both string and array system prompts.
func extractSystemPrompt(system interface{}) string {
	if system == nil {
		return ""
	}
	switch v := system.(type) {
	case string:
		return v
	case []interface{}:
		var parts []string
		for _, block := range v {
			if m, ok := block.(map[string]interface{}); ok {
				if t, ok := m["text"].(string); ok {
					parts = append(parts, t)
				}
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
}

// toolUseCounter generates unique tool_use IDs (atomic for goroutine safety).
var toolUseCounter int64

func genToolUseID() string {
	n := atomic.AddInt64(&toolUseCounter, 1)
	return fmt.Sprintf("toolu_proxy_%d_%d", time.Now().UnixNano(), n)
}

// buildToolIDMap scans all messages to build a map of tool_use_id → tool_name.
// This resolves the cross-message mapping that Claude Code relies on.
func buildToolIDMap(messages []AnthropicMessage) map[string]string {
	idMap := make(map[string]string)
	for _, m := range messages {
		blocks, ok := m.Content.([]interface{})
		if !ok {
			continue
		}
		for _, block := range blocks {
			bm, ok := block.(map[string]interface{})
			if !ok {
				continue
			}
			if bm["type"] == "tool_use" {
				id, _ := bm["id"].(string)
				name, _ := bm["name"].(string)
				if id != "" && name != "" {
					idMap[id] = name
				}
			}
		}
	}
	return idMap
}

// translateMessages converts Anthropic messages to Ollama format.
// Handles text, tool_use, tool_result blocks with correct ordering and is_error.
func translateMessages(req AnthropicRequest) (system string, messages []OllamaMessage) {
	system = extractSystemPrompt(req.System)
	toolIDMap := buildToolIDMap(req.Messages)

	for _, m := range req.Messages {
		switch v := m.Content.(type) {
		case string:
			messages = append(messages, OllamaMessage{Role: m.Role, Content: v})

		case []interface{}:
			if m.Role == "assistant" {
				// Collect text + tool_calls together (single assistant message)
				var textParts []string
				var toolCalls []OllamaToolCall
				for _, block := range v {
					bm, ok := block.(map[string]interface{})
					if !ok {
						continue
					}
					switch bm["type"] {
					case "text":
						if t, ok := bm["text"].(string); ok {
							textParts = append(textParts, t)
						}
					case "tool_use":
						name, _ := bm["name"].(string)
						toolCalls = append(toolCalls, OllamaToolCall{
							Type: "function",
							Function: OllamaFunctionCall{
								Index:     len(toolCalls),
								Name:      name,
								Arguments: bm["input"],
							},
						})
					}
				}
				msg := OllamaMessage{
					Role:    "assistant",
					Content: strings.Join(textParts, "\n"),
				}
				if len(toolCalls) > 0 {
					msg.ToolCalls = toolCalls
				}
				messages = append(messages, msg)

			} else if m.Role == "user" {
				// Preserve block order: emit messages in sequence as they appear
				for _, block := range v {
					bm, ok := block.(map[string]interface{})
					if !ok {
						continue
					}
					switch bm["type"] {
					case "text":
						if t, ok := bm["text"].(string); ok && t != "" {
							messages = append(messages, OllamaMessage{
								Role:    "user",
								Content: t,
							})
						}
					case "tool_result":
						toolUseID, _ := bm["tool_use_id"].(string)
						toolName := toolIDMap[toolUseID] // resolve from earlier tool_use
						content := extractToolResultContent(bm["content"])
						// Propagate is_error: prefix content so LLM knows the tool failed
						if isErr, ok := bm["is_error"].(bool); ok && isErr {
							content = "[ERROR] " + content
						}
						messages = append(messages, OllamaMessage{
							Role:     "tool",
							Content:  content,
							ToolName: toolName,
						})
					}
				}
			}
		}
	}
	return
}

// extractToolResultContent gets the text from a tool_result content field.
func extractToolResultContent(content interface{}) string {
	if content == nil {
		return ""
	}
	switch v := content.(type) {
	case string:
		return v
	case []interface{}:
		var parts []string
		for _, block := range v {
			if m, ok := block.(map[string]interface{}); ok {
				if t, ok := m["text"].(string); ok {
					parts = append(parts, t)
				}
			}
		}
		return strings.Join(parts, "\n")
	}
	return fmt.Sprintf("%v", content)
}

// ── Translation: Ollama → Anthropic (response) ─────────────────────────────

// translateResponse converts an Ollama response to Anthropic format.
func translateResponse(ollamaResp OllamaResponse, model string) AnthropicResponse {
	var contentBlocks []ContentBlock
	stopReason := "end_turn"

	// Add text content — fallback to thinking if content is empty (qwen3.5 thinking mode)
	text := ollamaResp.Message.Content
	if text == "" && ollamaResp.Message.Thinking != "" {
		log.Printf("[PROXY] fallback: thinking used as content (%d chars)", len(ollamaResp.Message.Thinking))
		text = "[thinking fallback] " + ollamaResp.Message.Thinking
	}
	if text != "" {
		contentBlocks = append(contentBlocks, ContentBlock{
			Type: "text",
			Text: text,
		})
	}

	// Convert tool_calls to tool_use content blocks
	if len(ollamaResp.Message.ToolCalls) > 0 {
		stopReason = "tool_use"
		for _, tc := range ollamaResp.Message.ToolCalls {
			contentBlocks = append(contentBlocks, ContentBlock{
				Type:  "tool_use",
				ID:    genToolUseID(),
				Name:  tc.Function.Name,
				Input: tc.Function.Arguments,
			})
		}
	}

	// Ensure at least one content block
	if len(contentBlocks) == 0 {
		contentBlocks = append(contentBlocks, ContentBlock{
			Type: "text",
			Text: "",
		})
	}

	return AnthropicResponse{
		ID:         fmt.Sprintf("msg_ollama_%d", time.Now().UnixNano()),
		Type:       "message",
		Role:       "assistant",
		Content:    contentBlocks,
		Model:      model,
		StopReason: stopReason,
		Usage: AnthropicUsage{
			InputTokens:  0,
			OutputTokens: 0,
		},
	}
}

// ── Triage: classify → LOCAL or ANTHROPIC ───────────────────────────────────

type triageDecision int

const (
	triageLocal    triageDecision = iota // Ollama handles locally
	triageForward                        // Forward to real Anthropic
)

// extractLastUserMessage returns the last user text message from the request.
func extractLastUserMessage(req AnthropicRequest) string {
	for i := len(req.Messages) - 1; i >= 0; i-- {
		m := req.Messages[i]
		if m.Role != "user" {
			continue
		}
		switch v := m.Content.(type) {
		case string:
			return v
		case []interface{}:
			for _, b := range v {
				if bm, ok := b.(map[string]interface{}); ok {
					if bm["type"] == "text" {
						if t, ok := bm["text"].(string); ok && t != "" {
							return t
						}
					}
				}
			}
		}
	}
	return ""
}

// hasToolResults returns true if any user message contains a tool_result block.
// When Claude Code is in an agentic tool loop, only the real Anthropic model
// can reliably continue the conversation.
func hasToolResults(req AnthropicRequest) bool {
	for _, m := range req.Messages {
		blocks, ok := m.Content.([]interface{})
		if !ok {
			continue
		}
		for _, b := range blocks {
			if bm, ok := b.(map[string]interface{}); ok {
				if bm["type"] == "tool_result" {
					return true
				}
			}
		}
	}
	return false
}

// classifyRequest asks Ollama whether it can handle the request locally.
// Falls back to triageLocal on any error (never breaks the proxy).
func classifyRequest(cfg Config, req AnthropicRequest) triageDecision {
	// Fast path: agentic tool loop in progress → always forward
	if hasToolResults(req) {
		log.Printf("[triage] tool_result detected → ANTHROPIC")
		return triageForward
	}

	lastMsg := extractLastUserMessage(req)
	if lastMsg == "" {
		return triageLocal
	}

	classifyModel := cfg.TriageModel
	if classifyModel == "" {
		classifyModel = cfg.Model
	}

	thinkFalse := false
	classifyReq := OllamaRequest{
		Model: classifyModel,
		Messages: []OllamaMessage{
			{
				Role: "user",
				Content: "Réponds uniquement avec LOCAL ou ANTHROPIC, sans aucune explication.\n" +
					"LOCAL = tu peux répondre seul (question simple, correction courte, explication basique).\n" +
					"ANTHROPIC = trop complexe (architecture système, analyse multi-fichiers, raisonnement long, code critique).\n\n" +
					"Demande : " + lastMsg,
			},
		},
		Stream: false,
		Think:  &thinkFalse,
		Options: map[string]int{"num_predict": 5},
	}

	body, _ := json.Marshal(classifyReq)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(cfg.OllamaURL+"/api/chat", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[triage] ollama unreachable, defaulting to LOCAL: %v", err)
		return triageLocal
	}
	defer resp.Body.Close()

	var ollamaResp OllamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		log.Printf("[triage] classify decode error, defaulting to LOCAL: %v", err)
		return triageLocal
	}

	answer := strings.ToUpper(strings.TrimSpace(ollamaResp.Message.Content))
	if strings.Contains(answer, "ANTHROPIC") {
		log.Printf("[triage] → ANTHROPIC (Ollama: %q)", answer)
		return triageForward
	}
	log.Printf("[triage] → LOCAL (Ollama: %q)", answer)
	return triageLocal
}

// forwardToAnthropic pipes the original request body to the real Anthropic API
// and streams the response back verbatim (works for both streaming and buffered).
func forwardToAnthropic(w http.ResponseWriter, r *http.Request, cfg Config, body []byte, authHeader string) {
	anthropicURL := cfg.AnthropicURL
	if anthropicURL == "" {
		anthropicURL = "https://api.anthropic.com"
	}

	proxyReq, err := http.NewRequest(http.MethodPost, anthropicURL+r.URL.Path, bytes.NewReader(body))
	if err != nil {
		http.Error(w, `{"type":"error","error":{"type":"api_error","message":"failed to create proxy request"}}`, http.StatusInternalServerError)
		return
	}

	proxyReq.Header.Set("Content-Type", "application/json")
	proxyReq.Header.Set("Authorization", authHeader)

	// Forward Anthropic-specific headers if present
	if v := r.Header.Get("anthropic-version"); v != "" {
		proxyReq.Header.Set("anthropic-version", v)
	} else {
		proxyReq.Header.Set("anthropic-version", "2023-06-01")
	}
	if v := r.Header.Get("anthropic-beta"); v != "" {
		proxyReq.Header.Set("anthropic-beta", v)
	}

	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(proxyReq)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"type":"error","error":{"type":"api_error","message":"anthropic unreachable: %s"}}`, err.Error()), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Pipe headers + body back verbatim
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body) //nolint:errcheck
	log.Printf("[triage] Anthropic response piped: HTTP %d", resp.StatusCode)
}

// ── Streaming: Ollama NDJSON → Anthropic SSE ────────────────────────────────

func writeSSE(w http.ResponseWriter, event, data string) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// handleStreamingRequest proxies a streaming request: Ollama NDJSON → Anthropic SSE.
func handleStreamingRequest(w http.ResponseWriter, cfg Config, anthropicReq AnthropicRequest, ollamaBody []byte, ollamaModel string) {
	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Post(cfg.OllamaURL+"/api/chat", "application/json", strings.NewReader(string(ollamaBody)))
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"type":"error","error":{"type":"api_error","message":"ollama unreachable: %s"}}`, err.Error()), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	msgID := fmt.Sprintf("msg_ollama_%d", time.Now().UnixNano())

	// message_start
	startMsg := map[string]interface{}{
		"type": "message_start",
		"message": map[string]interface{}{
			"id":            msgID,
			"type":          "message",
			"role":          "assistant",
			"content":       []interface{}{},
			"model":         ollamaModel,
			"stop_reason":   nil,
			"stop_sequence": nil,
			"usage":         map[string]int{"input_tokens": 0, "output_tokens": 0},
		},
	}
	startData, _ := json.Marshal(startMsg)
	writeSSE(w, "message_start", string(startData))
	writeSSE(w, "ping", `{"type":"ping"}`)

	// content_block_start (text index 0)
	cbStart, _ := json.Marshal(map[string]interface{}{
		"type":  "content_block_start",
		"index": 0,
		"content_block": map[string]string{"type": "text", "text": ""},
	})
	writeSSE(w, "content_block_start", string(cbStart))

	scanner := bufio.NewScanner(resp.Body)
	var accText strings.Builder
	var finalChunk OllamaResponse
	outputTokens := 0
	gotDone := false

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var chunk OllamaResponse
		if err := json.Unmarshal(line, &chunk); err != nil {
			continue
		}
		if !chunk.Done {
			if chunk.Message.Content != "" {
				accText.WriteString(chunk.Message.Content)
				outputTokens++
				delta, _ := json.Marshal(map[string]interface{}{
					"type":  "content_block_delta",
					"index": 0,
					"delta": map[string]string{"type": "text_delta", "text": chunk.Message.Content},
				})
				writeSSE(w, "content_block_delta", string(delta))
			}
		} else {
			finalChunk = chunk
			gotDone = true
		}
	}

	// EOF before done:true or scanner error → stream was truncated
	if !gotDone || scanner.Err() != nil {
		errMsg := "stream truncated: ollama closed connection before done:true"
		if scanner.Err() != nil {
			errMsg = fmt.Sprintf("stream error: %s", scanner.Err().Error())
		}
		log.Printf("[PROXY] %s", errMsg)
		cbStop, _ := json.Marshal(map[string]interface{}{"type": "content_block_stop", "index": 0})
		writeSSE(w, "content_block_stop", string(cbStop))
		errData, _ := json.Marshal(map[string]interface{}{
			"type":  "error",
			"error": map[string]string{"type": "api_error", "message": errMsg},
		})
		writeSSE(w, "error", string(errData))
		return
	}

	// thinking fallback: emit as delta if content was empty
	if accText.Len() == 0 && finalChunk.Message.Thinking != "" {
		log.Printf("[PROXY] fallback: thinking used as content (%d chars)", len(finalChunk.Message.Thinking))
		fallbackText := "[thinking fallback] " + finalChunk.Message.Thinking
		accText.WriteString(fallbackText)
		delta, _ := json.Marshal(map[string]interface{}{
			"type":  "content_block_delta",
			"index": 0,
			"delta": map[string]string{"type": "text_delta", "text": fallbackText},
		})
		writeSSE(w, "content_block_delta", string(delta))
	}

	// content_block_stop (text)
	cbStop, _ := json.Marshal(map[string]interface{}{"type": "content_block_stop", "index": 0})
	writeSSE(w, "content_block_stop", string(cbStop))

	stopReason := "end_turn"
	nextIndex := 1

	// tool_use blocks (tool_calls only available on final chunk)
	for _, tc := range finalChunk.Message.ToolCalls {
		stopReason = "tool_use"
		toolID := genToolUseID()
		inputJSON, _ := json.Marshal(tc.Function.Arguments)

		tbStart, _ := json.Marshal(map[string]interface{}{
			"type":  "content_block_start",
			"index": nextIndex,
			"content_block": map[string]interface{}{
				"type":  "tool_use",
				"id":    toolID,
				"name":  tc.Function.Name,
				"input": map[string]interface{}{},
			},
		})
		writeSSE(w, "content_block_start", string(tbStart))

		tbDelta, _ := json.Marshal(map[string]interface{}{
			"type":  "content_block_delta",
			"index": nextIndex,
			"delta": map[string]string{"type": "input_json_delta", "partial_json": string(inputJSON)},
		})
		writeSSE(w, "content_block_delta", string(tbDelta))

		tbStop, _ := json.Marshal(map[string]interface{}{"type": "content_block_stop", "index": nextIndex})
		writeSSE(w, "content_block_stop", string(tbStop))
		nextIndex++
	}

	// message_delta + message_stop
	msgDelta, _ := json.Marshal(map[string]interface{}{
		"type":  "message_delta",
		"delta": map[string]interface{}{"stop_reason": stopReason, "stop_sequence": nil},
		"usage": map[string]int{"output_tokens": outputTokens},
	})
	writeSSE(w, "message_delta", string(msgDelta))
	writeSSE(w, "message_stop", `{"type":"message_stop"}`)

	log.Printf("[proxy] stream %s → %s (%d chars, %s)", anthropicReq.Model, ollamaModel, accText.Len(), stopReason)
}

// ── HTTP handler ────────────────────────────────────────────────────────────

func makeHandler(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/health" {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"status":"ok","proxy":"ollama","version":"0.2.0"}`)
			return
		}

		if r.URL.Path != "/v1/messages" {
			http.Error(w, `{"type":"error","error":{"type":"not_found","message":"only /v1/messages is supported"}}`, http.StatusNotFound)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, `{"type":"error","error":{"type":"method_not_allowed"}}`, http.StatusMethodNotAllowed)
			return
		}

		body, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
		if err != nil {
			http.Error(w, `{"type":"error","error":{"type":"api_error","message":"failed to read body"}}`, http.StatusInternalServerError)
			return
		}

		var anthropicReq AnthropicRequest
		if err := json.Unmarshal(body, &anthropicReq); err != nil {
			http.Error(w, `{"type":"error","error":{"type":"invalid_request_error","message":"invalid JSON"}}`, http.StatusBadRequest)
			return
		}

		// Triage: classify request → LOCAL (Ollama) or ANTHROPIC
		if cfg.Triage {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				// Claude Code sometimes sends the key as x-api-key
				if key := r.Header.Get("x-api-key"); key != "" {
					authHeader = "Bearer " + key
				}
			}
			if authHeader == "" {
				log.Printf("[triage] no auth header — cannot forward, routing to Ollama")
			} else {
				decision := classifyRequest(cfg, anthropicReq)
				if decision == triageForward {
					forwardToAnthropic(w, r, cfg, body, authHeader)
					return
				}
			}
		}

		// Resolve model: use config.json "model" field as default
		ollamaModel := cfg.Model
		if ollamaModel == "" && len(cfg.Presets) > 0 {
			ollamaModel = cfg.Presets[0].Model
		}

		system, messages := translateMessages(anthropicReq)

		// Prepend system as first message if present
		if system != "" {
			messages = append([]OllamaMessage{{Role: "system", Content: system}}, messages...)
		}

		// Translate tools
		ollamaTools := translateTools(anthropicReq.Tools)

		thinkFalse := false
		ollamaReq := OllamaRequest{
			Model:    ollamaModel,
			Messages: messages,
			Tools:    ollamaTools,
			Stream:   anthropicReq.Stream,
			Think:    &thinkFalse, // disable thinking mode for faster, cleaner responses
		}
		if anthropicReq.MaxTokens > 0 {
			ollamaReq.Options = map[string]int{"num_predict": anthropicReq.MaxTokens}
		}

		ollamaBody, _ := json.Marshal(ollamaReq)
		log.Printf("[proxy] → ollama %s (%d tools, %d messages, stream=%v)", ollamaModel, len(ollamaTools), len(messages), anthropicReq.Stream)

		if anthropicReq.Stream {
			handleStreamingRequest(w, cfg, anthropicReq, ollamaBody, ollamaModel)
			return
		}

		// Buffered (non-streaming) path
		client := &http.Client{Timeout: 120 * time.Second}
		resp, err := client.Post(cfg.OllamaURL+"/api/chat", "application/json", strings.NewReader(string(ollamaBody)))
		if err != nil {
			msg := fmt.Sprintf(`{"type":"error","error":{"type":"api_error","message":"ollama unreachable: %s"}}`, err.Error())
			http.Error(w, msg, http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)

		var ollamaResp OllamaResponse
		if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
			msg := fmt.Sprintf(`{"type":"error","error":{"type":"api_error","message":"invalid ollama response: %s"}}`, string(respBody))
			http.Error(w, msg, http.StatusBadGateway)
			return
		}

		anthropicResp := translateResponse(ollamaResp, ollamaModel)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(anthropicResp)

		toolInfo := ""
		if len(ollamaResp.Message.ToolCalls) > 0 {
			toolInfo = fmt.Sprintf(" [%d tool_calls]", len(ollamaResp.Message.ToolCalls))
		}
		log.Printf("[proxy] %s → %s (%d chars out)%s", anthropicReq.Model, ollamaModel, len(ollamaResp.Message.Content), toolInfo)
	}
}

// ── Main ────────────────────────────────────────────────────────────────────

func main() {
	cfg := loadConfig()

	port := os.Getenv("PORT")
	if port != "" {
		cfg.Port = port
	}

	addr := "localhost:" + cfg.Port
	log.Printf("[ollama-proxy] v0.4.0 — triage routing enabled=%v", cfg.Triage)
	log.Printf("[ollama-proxy] listening on http://%s", addr)
	log.Printf("[ollama-proxy] ollama backend: %s", cfg.OllamaURL)
	log.Printf("[ollama-proxy] default model: %s", cfg.Model)
	log.Printf("[ollama-proxy] presets:")
	for _, p := range cfg.Presets {
		ram := fmt.Sprintf("≤%dGB", p.MaxRAM)
		if p.MaxRAM == 0 {
			ram = ">16GB"
		}
		log.Printf("  %-10s %s  (%s RAM)", p.Name, p.Model, ram)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", makeHandler(cfg))

	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 130 * time.Second,
	}

	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("[ollama-proxy] fatal: %v", err)
	}
}
