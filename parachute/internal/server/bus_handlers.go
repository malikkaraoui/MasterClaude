package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/bus"
)

// handleBusPost traite POST /v1/bus/messages
func (s *Server) handleBusPost(w http.ResponseWriter, r *http.Request) {
	var body struct {
		From    string         `json:"from"`
		To      string         `json:"to"`
		Type    string         `json:"type"`
		Payload map[string]any `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "body JSON invalide: "+err.Error())
		return
	}
	m, err := s.bus.Post(body.From, body.To, body.Type, body.Payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

// handleBusPending traite GET /v1/bus/messages/pending/{agentId}
func (s *Server) handleBusPending(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agentId")
	if agentID == "" {
		writeError(w, http.StatusBadRequest, "agentId obligatoire")
		return
	}
	msgs := s.bus.Pending(agentID)
	if msgs == nil {
		msgs = []*bus.Message{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": msgs, "count": len(msgs)})
}

// handleBusAck traite POST /v1/bus/messages/{msgId}/ack
func (s *Server) handleBusAck(w http.ResponseWriter, r *http.Request) {
	msgID := r.PathValue("msgId")
	if msgID == "" {
		writeError(w, http.StatusBadRequest, "msgId obligatoire")
		return
	}
	if err := s.bus.Ack(msgID); errors.Is(err, bus.ErrNotFound) {
		writeError(w, http.StatusNotFound, "message non trouvé: "+msgID)
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"acked": true, "id": msgID})
}

// handleBusPutAgentConfig traite POST /v1/bus/agent_configs/{agentId}
func (s *Server) handleBusPutAgentConfig(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agentId")
	if agentID == "" {
		writeError(w, http.StatusBadRequest, "agentId obligatoire")
		return
	}
	var cfg bus.AgentConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeError(w, http.StatusBadRequest, "body JSON invalide: "+err.Error())
		return
	}
	cfg.AgentID = agentID
	if err := s.bus.PutAgentConfig(&cfg); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, &cfg)
}

// handleBusGetAgentConfig traite GET /v1/bus/agent_configs/{agentId}
func (s *Server) handleBusGetAgentConfig(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agentId")
	if agentID == "" {
		writeError(w, http.StatusBadRequest, "agentId obligatoire")
		return
	}
	cfg, err := s.bus.GetAgentConfig(agentID)
	if errors.Is(err, bus.ErrNotFound) {
		writeError(w, http.StatusNotFound, "config non trouvée pour: "+agentID)
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

// handleBusListAgentConfigs traite GET /v1/bus/agent_configs
func (s *Server) handleBusListAgentConfigs(w http.ResponseWriter, _ *http.Request) {
	cfgs := s.bus.ListAgentConfigs()
	writeJSON(w, http.StatusOK, map[string]any{"agents": cfgs, "count": len(cfgs)})
}
