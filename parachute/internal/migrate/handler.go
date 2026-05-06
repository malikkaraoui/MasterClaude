// Package migrate implémente le protocole de migration bipartite via Unix socket.
// Claude pousse son handoff + "ready to die" → parachute kill + spawn nouvelle session.
package migrate

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/sessions"
	"github.com/malikkaraoui/MasterClaude/parachute/internal/store"
)

const socketPath = "/tmp/parachute.sock"

// MigrateRequest est le payload envoyé par Claude via cc-parachute migrate.
type MigrateRequest struct {
	ProjectKey string     `json:"project_key"`
	Cwd        string     `json:"cwd"`
	Handoff    store.Handoff `json:"handoff"`
}

// MigrateResponse confirme la migration.
type MigrateResponse struct {
	Status     string    `json:"status"`
	ProjectKey string    `json:"project_key"`
	MigratedAt time.Time `json:"migrated_at"`
}

// Handler gère les requêtes de migration sur le Unix socket.
type Handler struct {
	store   *store.Store
	manager *sessions.Manager
	log     *slog.Logger
}

func NewHandler(s *store.Store, mgr *sessions.Manager, log *slog.Logger) *Handler {
	return &Handler{store: s, manager: mgr, log: log}
}

// ListenAndServe démarre le Unix socket server sur socketPath.
// Bloque jusqu'au signal d'arrêt ou erreur fatale.
func (h *Handler) ListenAndServe(stopCh <-chan struct{}) error {
	// Nettoyage socket résiduel (crash précédent).
	_ = os.Remove(socketPath)

	ln, err := net.Listen("unix", socketPath)
	if err != nil {
		return fmt.Errorf("unix socket listen: %w", err)
	}
	defer os.Remove(socketPath)

	// Permissions : seul l'utilisateur courant peut écrire.
	if err := os.Chmod(socketPath, 0o600); err != nil {
		return fmt.Errorf("chmod socket: %w", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/migrate", h.handleMigrate)
	mux.HandleFunc("POST /v1/heartbeat/{projectKey}", h.handleHeartbeat)
	mux.HandleFunc("GET /v1/handoff/{projectKey}/consume", h.handleConsume)

	srv := &http.Server{
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		<-stopCh
		_ = srv.Close()
	}()

	h.log.Info("unix socket prêt", "path", socketPath)
	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("unix socket serve: %w", err)
	}
	return nil
}

// handleMigrate : Claude pousse handoff + déclenche kill/spawn.
func (h *Handler) handleMigrate(w http.ResponseWriter, r *http.Request) {
	var req MigrateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalide: "+err.Error())
		return
	}
	if req.ProjectKey == "" || req.Cwd == "" {
		writeError(w, http.StatusBadRequest, "project_key et cwd requis")
		return
	}
	if !validProjectKey(req.ProjectKey) {
		writeError(w, http.StatusBadRequest, "project_key invalide (a-zA-Z0-9_- requis, max 64 chars)")
		return
	}

	// 1. Écrire le handoff en store (archive incluse).
	if err := h.store.PutHandoff(req.ProjectKey, &req.Handoff); err != nil {
		writeError(w, http.StatusInternalServerError, "store handoff: "+err.Error())
		return
	}

	// 2. Kill session courante (best-effort — peut ne pas exister).
	if err := h.manager.Kill(req.ProjectKey); err != nil && err != sessions.ErrNotFound {
		h.log.Warn("kill session avant migration", "project", req.ProjectKey, "err", err)
	}

	// 3. Spawn nouvelle session (vault + handoff injectés automatiquement).
	if err := h.manager.Spawn(req.ProjectKey, req.Cwd); err != nil {
		writeError(w, http.StatusInternalServerError, "spawn session: "+err.Error())
		return
	}

	h.log.Info("migration réussie", "project", req.ProjectKey)
	writeJSON(w, http.StatusOK, MigrateResponse{
		Status:     "migrated",
		ProjectKey: req.ProjectKey,
		MigratedAt: time.Now().UTC(),
	})
}

// handleHeartbeat : session active signale sa présence.
func (h *Handler) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("projectKey")
	if err := h.manager.Heartbeat(key); err != nil {
		writeError(w, http.StatusNotFound, "session introuvable: "+key)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleConsume : nouvelle session lit + consomme le handoff de la précédente.
func (h *Handler) handleConsume(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("projectKey")
	hf, err := h.store.ConsumeHandoff(key)
	if err == store.ErrNotFound {
		writeError(w, http.StatusNotFound, "pas de handoff pour "+key)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "consume: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, hf)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg, "status": status})
}

// validProjectKey accepte uniquement a-zA-Z0-9_- (max 64 chars, pas de préfixe . ou -).
func validProjectKey(key string) bool {
	if len(key) == 0 || len(key) > 64 {
		return false
	}
	if key[0] == '.' || key[0] == '-' {
		return false
	}
	for _, r := range key {
		ok := (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_' || r == '-'
		if !ok {
			return false
		}
	}
	return true
}
