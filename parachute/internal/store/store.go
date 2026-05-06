// Package store gère la persistance des handoffs et de l'état du parachute.
// Implémentation initiale : JSON-on-disk avec mutex global. Migration vers
// SQLite prévue dès qu'on dépasse ~100 handoffs ou qu'on a besoin de queries.
package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Handoff représente le testament d'une session Claude avant migration.
// Mêmes champs que /tmp/masterclaude-handoff-*.json pour rétrocompatibilité.
type Handoff struct {
	Version              int       `json:"version"`
	CreatedAt            time.Time `json:"created_at"`
	FromSessionID        *string   `json:"from_session_id"`
	ProjectKey           string    `json:"project_key"`
	Cwd                  string    `json:"cwd"`
	Reason               string    `json:"reason"`
	FilRouge             string    `json:"fil_rouge"`
	NextAction           string    `json:"next_action"`
	WarningsForSuccessor string    `json:"warnings_for_successor"`
	Todos                []Todo    `json:"todos"`
	VaultMalikSlice      string    `json:"vault_malik_slice"`
	LastUserMessage      string    `json:"last_user_message"`
}

type Todo struct {
	Subject string `json:"subject"`
	Status  string `json:"status"`
}

// Store est l'API de persistance. Thread-safe.
type Store struct {
	mu      sync.RWMutex
	dataDir string
}

func New(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("créer dataDir %s: %w", dataDir, err)
	}
	return &Store{dataDir: dataDir}, nil
}

// PutHandoff écrit le handoff live pour un projet. Écrase l'existant.
// Archive aussi une copie horodatée dans dataDir/archive/.
func (s *Store) PutHandoff(projectKey string, h *Handoff) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if projectKey == "" {
		return fmt.Errorf("projectKey vide")
	}
	if h == nil {
		return fmt.Errorf("handoff nil")
	}
	h.ProjectKey = projectKey
	if h.CreatedAt.IsZero() {
		h.CreatedAt = time.Now().UTC()
	}

	data, err := json.MarshalIndent(h, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal handoff: %w", err)
	}

	livePath := s.livePath(projectKey)
	if err := writeAtomic(livePath, data); err != nil {
		return err
	}

	archiveDir := filepath.Join(s.dataDir, "archive")
	if err := os.MkdirAll(archiveDir, 0o755); err != nil {
		return fmt.Errorf("créer archive: %w", err)
	}
	stamp := h.CreatedAt.Format("20060102-150405")
	archivePath := filepath.Join(archiveDir, fmt.Sprintf("%s-%s.json", stamp, projectKey))
	return writeAtomic(archivePath, data)
}

// GetHandoff lit le handoff live d'un projet. Retourne ErrNotFound si absent.
func (s *Store) GetHandoff(projectKey string) (*Handoff, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if projectKey == "" {
		return nil, fmt.Errorf("projectKey vide")
	}
	data, err := os.ReadFile(s.livePath(projectKey))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("lire handoff %s: %w", projectKey, err)
	}
	var h Handoff
	if err := json.Unmarshal(data, &h); err != nil {
		return nil, fmt.Errorf("unmarshal handoff: %w", err)
	}
	return &h, nil
}

// ConsumeHandoff lit + supprime le handoff live (atomique côté store).
// Le handoff archivé est conservé.
func (s *Store) ConsumeHandoff(projectKey string) (*Handoff, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	livePath := s.livePath(projectKey)
	data, err := os.ReadFile(livePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("lire handoff %s: %w", projectKey, err)
	}
	var h Handoff
	if err := json.Unmarshal(data, &h); err != nil {
		return nil, fmt.Errorf("unmarshal handoff: %w", err)
	}
	if err := os.Remove(livePath); err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("supprimer handoff %s: %w", projectKey, err)
	}
	return &h, nil
}

// ListProjects retourne les projets ayant un handoff live.
func (s *Store) ListProjects() ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.dataDir)
	if err != nil {
		return nil, fmt.Errorf("read dataDir: %w", err)
	}
	var out []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || filepath.Ext(name) != ".json" {
			continue
		}
		key := name[:len(name)-len(".json")]
		out = append(out, key)
	}
	return out, nil
}

func (s *Store) livePath(projectKey string) string {
	return filepath.Join(s.dataDir, projectKey+".json")
}

func writeAtomic(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("écrire tmp %s: %w", tmp, err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("rename %s → %s: %w", tmp, path, err)
	}
	return nil
}

var ErrNotFound = fmt.Errorf("handoff: not found")
