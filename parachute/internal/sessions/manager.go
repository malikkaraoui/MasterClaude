// Package sessions gère le cycle de vie des sessions Claude par projet.
// Spawn via osascript, heartbeat SQLite, détection mort, intégration vault.
package sessions

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/store"
	"github.com/malikkaraoui/MasterClaude/parachute/internal/vault"
)

const (
	heartbeatInterval       = 30 * time.Second
	deadTimeout             = 2 * heartbeatInterval
	defaultVaultPath        = "/Users/malik/Vault/Malik"
	envVaultPath            = "PARACHUTE_VAULT_PATH"
)

// SessionState représente l'état d'une session Claude active.
type SessionState struct {
	ProjectKey    string
	Cwd           string
	Pid           int
	StartedAt     time.Time
	LastHeartbeat time.Time
	VaultHash     string // hash du contexte vault injecté au spawn
}

// Manager orchestre les sessions Claude par projet. Thread-safe.
type Manager struct {
	mu        sync.RWMutex
	sessions  map[string]*SessionState
	store     *store.Store
	log       *slog.Logger
	vaultPath string
}

func New(s *store.Store, log *slog.Logger) *Manager {
	vp := os.Getenv(envVaultPath)
	if vp == "" {
		vp = defaultVaultPath
	}
	return &Manager{
		sessions:  make(map[string]*SessionState),
		store:     s,
		log:       log,
		vaultPath: vp,
	}
}

// Spawn démarre une session Claude pour projectKey dans cwd.
// Injecte le vault Malik + le handoff non consommé via --append-system-prompt.
// Si une session est déjà active pour ce projet, retourne ErrAlreadyRunning.
func (m *Manager) Spawn(projectKey, cwd string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[projectKey]; exists {
		return ErrAlreadyRunning
	}

	systemPrompt, vaultHash, err := m.buildSystemPrompt(projectKey)
	if err != nil {
		// Vault inaccessible : on spawn quand même, on log le warning.
		m.log.Warn("vault inaccessible au spawn", "project", projectKey, "err", err)
		systemPrompt = ""
		vaultHash = ""
	}

	pid, err := spawnClaude(cwd, systemPrompt)
	if err != nil {
		return fmt.Errorf("spawn claude [%s]: %w", projectKey, err)
	}

	m.sessions[projectKey] = &SessionState{
		ProjectKey:    projectKey,
		Cwd:           cwd,
		Pid:           pid,
		StartedAt:     time.Now().UTC(),
		LastHeartbeat: time.Now().UTC(),
		VaultHash:     vaultHash,
	}

	m.log.Info("session spawned", "project", projectKey, "pid", pid, "vault_hash", vaultHash)
	return nil
}

// Kill arrête la session d'un projet.
// Envoie SIGINT best-effort au PID enregistré (= PID osascript, déjà terminé
// après le spawn). La suppression de la session du registre est toujours
// effectuée, même si le signal échoue.
func (m *Manager) Kill(projectKey string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	state, exists := m.sessions[projectKey]
	if !exists {
		return ErrNotFound
	}

	proc, err := os.FindProcess(state.Pid)
	if err == nil {
		_ = proc.Signal(os.Interrupt)
	}
	delete(m.sessions, projectKey)
	m.log.Info("session killed", "project", projectKey, "pid", state.Pid)
	return nil
}

// Heartbeat met à jour le timestamp de dernière activité d'une session.
func (m *Manager) Heartbeat(projectKey string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	state, exists := m.sessions[projectKey]
	if !exists {
		return ErrNotFound
	}
	state.LastHeartbeat = time.Now().UTC()
	return nil
}

// List retourne un snapshot des sessions actives.
func (m *Manager) List() []SessionState {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]SessionState, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, *s)
	}
	return out
}

// CheckDeadSessions détecte les sessions sans heartbeat depuis > deadTimeout
// et les supprime. Retourne les projectKeys morts pour alerte Telegram.
func (m *Manager) CheckDeadSessions() []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	var dead []string
	for key, state := range m.sessions {
		if time.Since(state.LastHeartbeat) > deadTimeout {
			m.log.Warn("session morte détectée", "project", key, "last_heartbeat", state.LastHeartbeat)
			dead = append(dead, key)
			delete(m.sessions, key)
		}
	}
	return dead
}

// buildSystemPrompt assemble vault + handoff en un bloc < 800 tokens.
func (m *Manager) buildSystemPrompt(projectKey string) (string, string, error) {
	vctx, err := vault.LoadVaultContext(m.vaultPath)
	if err != nil {
		return "", "", err
	}

	assembled := vctx.Assemble()

	// Ajouter le handoff non consommé s'il existe.
	if h, err := m.store.GetHandoff(projectKey); err == nil {
		assembled += fmt.Sprintf("\n\n<handoff>\n## Tâche en cours\n%s\n\n## Prochaine action\n%s\n\n## Avertissements\n%s\n</handoff>",
			h.FilRouge, h.NextAction, h.WarningsForSuccessor)
	}

	return assembled, vctx.Hash, nil
}

// spawnClaude lance claude CLI dans cwd via osascript (Terminal macOS).
// Retourne le PID du processus osascript — NB : ce PID sera mort quelques
// secondes après le spawn (osascript exit). Il identifie l'opération de
// spawn, pas le processus Claude lui-même. Kill envoie SIGINT best-effort.
func spawnClaude(cwd, systemPrompt string) (int, error) {
	claudePath, err := exec.LookPath("claude")
	if err != nil {
		claudePath = filepath.Join(os.Getenv("HOME"), ".claude", "local", "claude")
	}

	args := []string{claudePath}
	if systemPrompt != "" {
		args = append(args, "--append-system-prompt", systemPrompt)
	}

	script := fmt.Sprintf(
		`tell application "Terminal" to do script "cd %q && %s"`,
		cwd, shellJoin(args),
	)

	cmd := exec.Command("osascript", "-e", script)
	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("osascript: %w", err)
	}
	return cmd.Process.Pid, nil
}

// shellJoin joint les args en une commande shell basique (sans quoting complet).
func shellJoin(args []string) string {
	result := ""
	for i, a := range args {
		if i > 0 {
			result += " "
		}
		result += fmt.Sprintf("%q", a)
	}
	return result
}

var (
	ErrAlreadyRunning = fmt.Errorf("sessions: projet déjà actif")
	ErrNotFound       = fmt.Errorf("sessions: projet introuvable")
)
