package bus_test

import (
	"testing"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/bus"
)

func TestPostAndPending(t *testing.T) {
	b := bus.New()

	m, err := b.Post("executor-1", "masterclaude", "task_done", map[string]any{"summary": "ok"})
	if err != nil {
		t.Fatalf("Post: %v", err)
	}
	if m.ID == "" {
		t.Fatal("ID vide")
	}

	pending := b.Pending("masterclaude")
	if len(pending) != 1 {
		t.Fatalf("attendu 1 pending, got %d", len(pending))
	}
	if pending[0].ID != m.ID {
		t.Fatal("ID mismatch")
	}

	// Autre agent ne voit pas le message
	if len(b.Pending("executor-1")) != 0 {
		t.Fatal("executor-1 ne doit pas voir le message de masterclaude")
	}
}

func TestAck(t *testing.T) {
	b := bus.New()
	m, _ := b.Post("executor-1", "masterclaude", "heartbeat", nil)

	if err := b.Ack(m.ID); err != nil {
		t.Fatalf("Ack: %v", err)
	}
	if len(b.Pending("masterclaude")) != 0 {
		t.Fatal("message doit disparaître après ack")
	}
	// Idempotent
	if err := b.Ack(m.ID); err != nil {
		t.Fatalf("double ack: %v", err)
	}
}

func TestAckNotFound(t *testing.T) {
	b := bus.New()
	if err := b.Ack("inexistant"); err == nil {
		t.Fatal("attendu erreur ErrNotFound")
	}
}

func TestAgentConfig(t *testing.T) {
	b := bus.New()
	cfg := &bus.AgentConfig{
		AgentID:     "co-pilot",
		ProjectPath: "/projects/co-pilot",
		ConfigSnapshot: "test config",
	}
	if err := b.PutAgentConfig(cfg); err != nil {
		t.Fatalf("PutAgentConfig: %v", err)
	}
	got, err := b.GetAgentConfig("co-pilot")
	if err != nil {
		t.Fatalf("GetAgentConfig: %v", err)
	}
	if got.ProjectPath != cfg.ProjectPath {
		t.Fatalf("mismatch project path")
	}
}

func TestPostValidation(t *testing.T) {
	b := bus.New()
	if _, err := b.Post("", "to", "type", nil); err == nil {
		t.Fatal("from vide doit échouer")
	}
	if _, err := b.Post("from", "", "type", nil); err == nil {
		t.Fatal("to vide doit échouer")
	}
	if _, err := b.Post("from", "to", "", nil); err == nil {
		t.Fatal("type vide doit échouer")
	}
}
