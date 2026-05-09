package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestBusPostAndPending(t *testing.T) {
	ts, _ := newTestServer(t, "")

	// POST un message
	body := map[string]any{"from": "executor-1", "to": "masterclaude", "type": "task_done", "payload": map[string]any{"ok": true}}
	resp, raw := doReq(t, "POST", ts.URL+"/v1/bus/messages", "", body)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("POST messages: attendu 201, got %d — %s", resp.StatusCode, raw)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	msgID := fmt.Sprint(m["id"])
	if msgID == "" || msgID == "<nil>" {
		t.Fatal("id vide")
	}

	// Récupérer les pending
	resp2, raw2 := doReq(t, "GET", ts.URL+"/v1/bus/messages/pending/masterclaude", "", nil)
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("GET pending: attendu 200, got %d — %s", resp2.StatusCode, raw2)
	}
	var pr map[string]any
	if err := json.Unmarshal(raw2, &pr); err != nil {
		t.Fatal(err)
	}
	if int(pr["count"].(float64)) != 1 {
		t.Fatalf("attendu 1 message pending, got %v", pr["count"])
	}

	// Autre agent ne voit rien
	_, raw3 := doReq(t, "GET", ts.URL+"/v1/bus/messages/pending/executor-1", "", nil)
	var pr3 map[string]any
	_ = json.Unmarshal(raw3, &pr3)
	if int(pr3["count"].(float64)) != 0 {
		t.Fatal("executor-1 ne doit pas voir le message")
	}
}

func TestBusAck(t *testing.T) {
	ts, _ := newTestServer(t, "")

	body := map[string]any{"from": "executor-1", "to": "masterclaude", "type": "heartbeat"}
	_, raw := doReq(t, "POST", ts.URL+"/v1/bus/messages", "", body)
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	msgID := fmt.Sprint(m["id"])

	// Ack
	resp, raw2 := doReq(t, "POST", ts.URL+"/v1/bus/messages/"+msgID+"/ack", "", map[string]any{})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("ack: attendu 200, got %d — %s", resp.StatusCode, raw2)
	}

	// Plus de pending
	_, raw3 := doReq(t, "GET", ts.URL+"/v1/bus/messages/pending/masterclaude", "", nil)
	var pr map[string]any
	_ = json.Unmarshal(raw3, &pr)
	if int(pr["count"].(float64)) != 0 {
		t.Fatal("message doit disparaître après ack")
	}
}

func TestBusAckNotFound(t *testing.T) {
	ts, _ := newTestServer(t, "")
	resp, _ := doReq(t, "POST", ts.URL+"/v1/bus/messages/inexistant/ack", "", map[string]any{})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("attendu 404, got %d", resp.StatusCode)
	}
}

func TestBusAgentConfig(t *testing.T) {
	ts, _ := newTestServer(t, "")

	cfg := map[string]any{"project_path": "/projects/co-pilot", "config_snapshot": "test"}
	resp, raw := doReq(t, "POST", ts.URL+"/v1/bus/agent_configs/co-pilot", "", cfg)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("PUT config: attendu 201, got %d — %s", resp.StatusCode, raw)
	}

	resp2, raw2 := doReq(t, "GET", ts.URL+"/v1/bus/agent_configs/co-pilot", "", nil)
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("GET config: attendu 200, got %d — %s", resp2.StatusCode, raw2)
	}
	var got map[string]any
	_ = json.Unmarshal(raw2, &got)
	if got["project_path"] != "/projects/co-pilot" {
		t.Fatalf("project_path mismatch: %v", got["project_path"])
	}
}

func TestBusAgentConfigNotFound(t *testing.T) {
	ts, _ := newTestServer(t, "")
	resp, _ := doReq(t, "GET", ts.URL+"/v1/bus/agent_configs/inexistant", "", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("attendu 404, got %d", resp.StatusCode)
	}
}

func TestBusListAgentConfigs(t *testing.T) {
	ts, _ := newTestServer(t, "")

	for _, id := range []string{"a1", "a2"} {
		doReq(t, "POST", ts.URL+"/v1/bus/agent_configs/"+id, "", map[string]any{"project_path": "/p/" + id})
	}
	_, raw := doReq(t, "GET", ts.URL+"/v1/bus/agent_configs", "", nil)
	var res map[string]any
	_ = json.Unmarshal(raw, &res)
	if int(res["count"].(float64)) != 2 {
		t.Fatalf("attendu 2 configs, got %v", res["count"])
	}
}

func TestBusMessageMaxBody(t *testing.T) {
	ts, _ := newTestServer(t, "")
	huge := strings.Repeat("x", 70<<10)
	body := `{"from":"a","to":"b","type":"t","payload":{"data":"` + huge + `"}}`
	req, _ := http.NewRequest("POST", ts.URL+"/v1/bus/messages", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode == http.StatusCreated {
		t.Fatal("body > 64KB doit être rejeté")
	}
}

func TestBusAuth(t *testing.T) {
	ts, _ := newTestServer(t, "secret")
	body := map[string]any{"from": "a", "to": "b", "type": "t"}

	resp, _ := doReq(t, "POST", ts.URL+"/v1/bus/messages", "", body)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("sans token: attendu 401, got %d", resp.StatusCode)
	}

	resp2, _ := doReq(t, "POST", ts.URL+"/v1/bus/messages", "secret", body)
	if resp2.StatusCode != http.StatusCreated {
		t.Fatalf("avec token: attendu 201, got %d", resp2.StatusCode)
	}
}

