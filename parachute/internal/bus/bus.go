// Package bus implémente le message bus inter-agents de parachute v2.
// Stockage in-memory thread-safe. Pas de SQLite pour l'instant.
//
// Flux: executor POST /v1/bus/messages → masterclaude GET /v1/bus/messages/pending/masterclaude
//       masterclaude POST /v1/bus/messages (ack/task_assign) → executor GET /v1/bus/messages/pending/{agentId}
package bus

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// ErrNotFound est retourné quand un message ou config est introuvable.
var ErrNotFound = errors.New("not found")

// Message représente un message entre agents.
type Message struct {
	ID        string         `json:"id"`
	From      string         `json:"from"`
	To        string         `json:"to"`
	Type      string         `json:"type"`
	Payload   map[string]any `json:"payload"`
	CreatedAt time.Time      `json:"created_at"`
	AckedAt   *time.Time     `json:"acked_at,omitempty"`
}

// AgentConfig enregistre la config d'un executor au boot de sa session.
type AgentConfig struct {
	AgentID         string    `json:"agent_id"`
	ProjectPath     string    `json:"project_path"`
	ConfigSnapshot  string    `json:"config_snapshot"`
	RegisteredAt    time.Time `json:"registered_at"`
}

// Bus gère la file de messages et les configs d'agents. Thread-safe.
type Bus struct {
	mu       sync.RWMutex
	messages []*Message
	configs  map[string]*AgentConfig
	counter  uint64
}

func New() *Bus {
	return &Bus{configs: make(map[string]*AgentConfig)}
}

// Post enregistre un message et retourne l'ID attribué.
func (b *Bus) Post(from, to, msgType string, payload map[string]any) (*Message, error) {
	if from == "" || to == "" || msgType == "" {
		return nil, fmt.Errorf("from/to/type obligatoires")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.counter++
	m := &Message{
		ID:        fmt.Sprintf("msg-%d-%d", time.Now().UnixNano(), b.counter),
		From:      from,
		To:        to,
		Type:      msgType,
		Payload:   payload,
		CreatedAt: time.Now().UTC(),
	}
	b.messages = append(b.messages, m)
	// Purge automatique : garder max 500 messages (anciens acquittés supprimés en premier)
	if len(b.messages) > 500 {
		b.gc()
	}
	return m, nil
}

// Pending retourne les messages non-acquittés destinés à agentId.
func (b *Bus) Pending(agentID string) []*Message {
	b.mu.RLock()
	defer b.mu.RUnlock()
	var out []*Message
	for _, m := range b.messages {
		if m.To == agentID && m.AckedAt == nil {
			out = append(out, m)
		}
	}
	return out
}

// Ack marque un message comme acquitté.
func (b *Bus) Ack(msgID string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, m := range b.messages {
		if m.ID == msgID {
			if m.AckedAt != nil {
				return nil // déjà acquitté, idempotent
			}
			now := time.Now().UTC()
			m.AckedAt = &now
			return nil
		}
	}
	return ErrNotFound
}

// PutAgentConfig enregistre ou met à jour la config d'un agent.
func (b *Bus) PutAgentConfig(cfg *AgentConfig) error {
	if cfg == nil || cfg.AgentID == "" {
		return fmt.Errorf("agentID obligatoire")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	cfg.RegisteredAt = time.Now().UTC()
	b.configs[cfg.AgentID] = cfg
	return nil
}

// GetAgentConfig retourne la config d'un agent.
func (b *Bus) GetAgentConfig(agentID string) (*AgentConfig, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	c, ok := b.configs[agentID]
	if !ok {
		return nil, ErrNotFound
	}
	return c, nil
}

// ListAgentConfigs retourne toutes les configs enregistrées.
func (b *Bus) ListAgentConfigs() []*AgentConfig {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]*AgentConfig, 0, len(b.configs))
	for _, c := range b.configs {
		out = append(out, c)
	}
	return out
}

// gc supprime les messages acquittés les plus anciens pour rester sous 500.
// Appelé sous b.mu.Lock().
func (b *Bus) gc() {
	var kept []*Message
	// Retirer d'abord les acquittés vieux de plus de 1h
	cutoff := time.Now().Add(-1 * time.Hour)
	for _, m := range b.messages {
		if m.AckedAt != nil && m.AckedAt.Before(cutoff) {
			continue
		}
		kept = append(kept, m)
	}
	// Si toujours > 400, tronquer les plus anciens
	if len(kept) > 400 {
		kept = kept[len(kept)-400:]
	}
	b.messages = kept
}
