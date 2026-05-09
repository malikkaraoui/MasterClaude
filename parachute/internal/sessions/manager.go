// Package sessions gère le cycle de vie des sessions Claude par projet.
// Spawn via osascript, heartbeat SQLite, détection mort, intégration vault.
package sessions

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
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
	WindowID      int // ID fenêtre Terminal — pour fermeture au kill
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

	pid, windowID, err := spawnClaude(cwd, systemPrompt)
	if err != nil {
		return fmt.Errorf("spawn claude [%s]: %w", projectKey, err)
	}

	m.sessions[projectKey] = &SessionState{
		ProjectKey:    projectKey,
		Cwd:           cwd,
		Pid:           pid,
		WindowID:      windowID,
		StartedAt:     time.Now().UTC(),
		LastHeartbeat: time.Now().UTC(),
		VaultHash:     vaultHash,
	}

	m.log.Info("session spawned", "project", projectKey, "pid", pid, "window_id", windowID, "vault_hash", vaultHash)
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
	// Fermer la fenêtre Terminal par son ID
	if state.WindowID > 0 {
		script := fmt.Sprintf(`tell application "Terminal" to close (windows whose id is %d)`, state.WindowID)
		_ = exec.Command("osascript", "-e", script).Run()
	}
	delete(m.sessions, projectKey)
	m.log.Info("session killed", "project", projectKey, "pid", state.Pid, "window_id", state.WindowID)
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

// spawnClaude lance claude CLI dans cwd via un fichier .command ouvert par Terminal.app.
// Un fichier .command ouvert par Terminal.app s'exécute TOUJOURS dans une nouvelle fenêtre.
// Le script capture son windowId Terminal, le persiste dans un fichier temp, et ferme
// automatiquement la fenêtre quand claude quitte.
// Retourne (PID de `open`, windowID Terminal, error).
func spawnClaude(cwd, systemPrompt string) (int, int, error) {
	claudePath, err := exec.LookPath("claude")
	if err != nil {
		claudePath = filepath.Join(os.Getenv("HOME"), ".claude", "local", "claude")
	}

	claudeCmd := claudePath
	if systemPrompt != "" {
		promptFile := filepath.Join(os.TempDir(), fmt.Sprintf("mc-prompt-%d.txt", time.Now().UnixNano()))
		if e := os.WriteFile(promptFile, []byte(systemPrompt), 0600); e == nil {
			claudeCmd = claudePath + ` --append-system-prompt "$(cat ` + promptFile + `)"`
		}
	}

	home := os.Getenv("HOME")
	ts := time.Now().UnixNano()
	cmdFile := filepath.Join(os.TempDir(), fmt.Sprintf("mc-spawn-%d.command", ts))
	winIDFile := filepath.Join(os.TempDir(), fmt.Sprintf("mc-winid-%d.txt", ts))

	// Le script capture le windowId de sa propre fenêtre dès l'ouverture,
	// lance claude (sans exec pour permettre le cleanup), puis ferme la fenêtre.
	script := fmt.Sprintf(`#!/bin/zsh
export NVM_DIR=%q
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
cd %q
_WIN_ID=$(osascript -e 'tell application "Terminal" to id of front window' 2>/dev/null)
echo "$_WIN_ID" > %q
%s
[ -n "$_WIN_ID" ] && osascript -e "tell application \"Terminal\" to close (windows whose id is $_WIN_ID)"
`,
		filepath.Join(home, ".nvm"), cwd, winIDFile, claudeCmd)

	if e := os.WriteFile(cmdFile, []byte(script), 0755); e != nil {
		return 0, 0, fmt.Errorf("write .command: %w", e)
	}

	cmd := exec.Command("open", "-a", "Terminal", cmdFile)
	if err := cmd.Start(); err != nil {
		return 0, 0, fmt.Errorf("open Terminal: %w", err)
	}
	pid := cmd.Process.Pid
	go func() { _ = cmd.Wait() }() // évite zombie

	// Attendre que Terminal ouvre la fenêtre et que le script écrive le windowId
	time.Sleep(800 * time.Millisecond)
	windowID := 0
	if raw, e := os.ReadFile(winIDFile); e == nil {
		windowID, _ = strconv.Atoi(strings.TrimSpace(string(raw)))
	}
	_ = os.Remove(winIDFile)

	return pid, windowID, nil
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
