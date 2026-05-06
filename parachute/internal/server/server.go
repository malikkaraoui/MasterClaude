// Package server expose l'API HTTP du parachute (port :4001 par défaut).
//
// Endpoints :
//
//	GET  /health                              → liveness + version
//	GET  /v1/handoff/{projectKey}             → récupère le handoff live (404 si absent)
//	POST /v1/handoff/{projectKey}             → écrit le handoff (overwrite + archive)
//	POST /v1/handoff/{projectKey}/consume     → lit + supprime le handoff (atomique)
//	GET  /v1/projects                         → liste les projets avec handoff actif
//	GET  /v1/sessions                         → liste les sessions Claude actives
//	POST /v1/sessions/{projectKey}/spawn      → spawn une session Claude (vault + handoff injectés)
//	POST /v1/sessions/{projectKey}/heartbeat  → mise à jour heartbeat (session vivante)
//	DELETE /v1/sessions/{projectKey}          → kill propre de la session
//
// Auth : token bearer optionnel via PARACHUTE_TOKEN.
package server

import (
	"encoding/json"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/sessions"
	"github.com/malikkaraoui/MasterClaude/parachute/internal/store"
)

const Version = "0.2.0"

type Server struct {
	store   *store.Store
	manager *sessions.Manager
	token   string
	mux     *http.ServeMux
	start   time.Time
}

func New(s *store.Store, token string) *Server {
	return NewWithSessions(s, token, nil)
}

func NewWithSessions(s *store.Store, token string, mgr *sessions.Manager) *Server {
	srv := &Server{
		store:   s,
		manager: mgr,
		token:   token,
		mux:     http.NewServeMux(),
		start:   time.Now(),
	}
	srv.routes()
	return srv
}

func (s *Server) Handler() http.Handler {
	return loggingMiddleware(s.mux)
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		dur := time.Since(start)
		if rec.status == 0 {
			rec.status = http.StatusOK
		}
		if r.URL.Path == "/health" && rec.status == 200 {
			return
		}
		level := slog.LevelInfo
		if rec.status >= 500 {
			level = slog.LevelError
		} else if rec.status >= 400 {
			level = slog.LevelWarn
		}
		slog.Log(r.Context(), level, "http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"bytes", rec.bytes,
			"dur_ms", dur.Milliseconds(),
			"remote", r.RemoteAddr,
		)
	})
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/projects", s.guard(s.handleListProjects))
	s.mux.HandleFunc("GET /v1/handoff/{projectKey}", s.guard(s.handleGetHandoff))
	s.mux.HandleFunc("POST /v1/handoff/{projectKey}", s.guard(s.handlePutHandoff))
	s.mux.HandleFunc("POST /v1/handoff/{projectKey}/consume", s.guard(s.handleConsumeHandoff))
	s.mux.HandleFunc("GET /v1/sessions", s.guard(s.handleListSessions))
	s.mux.HandleFunc("POST /v1/sessions/{projectKey}/spawn", s.guard(s.handleSpawnSession))
	s.mux.HandleFunc("POST /v1/sessions/{projectKey}/heartbeat", s.guard(s.handleHeartbeat))
	s.mux.HandleFunc("DELETE /v1/sessions/{projectKey}", s.guard(s.handleKillSession))
}

func (s *Server) guard(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.token == "" {
			h(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer "+s.token {
			writeError(w, http.StatusUnauthorized, "auth: token bearer invalide")
			return
		}
		h(w, r)
	}
}

// requireManager retourne false et écrit 503 si le sessions manager n'est pas initialisé.
func (s *Server) requireManager(w http.ResponseWriter) bool {
	if s.manager == nil {
		writeError(w, http.StatusServiceUnavailable, "sessions manager non initialisé")
		return false
	}
	return true
}

// --- Handoff handlers ---

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "ok",
		"version":    Version,
		"uptime_sec": int(time.Since(s.start).Seconds()),
		"now":        time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleListProjects(w http.ResponseWriter, _ *http.Request) {
	projects, err := s.store.ListProjects()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": projects})
}

func (s *Server) handleGetHandoff(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("projectKey")
	if !validProjectKey(key) {
		writeError(w, http.StatusBadRequest, "projectKey invalide (a-zA-Z0-9_- requis, max 64 chars)")
		return
	}
	h, err := s.store.GetHandoff(key)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "handoff non trouvé pour "+key)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "get: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h)
}

func (s *Server) handlePutHandoff(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("projectKey")
	if !validProjectKey(key) {
		writeError(w, http.StatusBadRequest, "projectKey invalide")
		return
	}
	var h store.Handoff
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&h); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalide: "+err.Error())
		return
	}
	if err := s.store.PutHandoff(key, &h); err != nil {
		writeError(w, http.StatusInternalServerError, "put: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "stored",
		"project_key": key,
		"created_at":  h.CreatedAt.Format(time.RFC3339),
	})
}

func (s *Server) handleConsumeHandoff(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("projectKey")
	if !validProjectKey(key) {
		writeError(w, http.StatusBadRequest, "projectKey invalide")
		return
	}
	h, err := s.store.ConsumeHandoff(key)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "handoff non trouvé pour "+key)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "consume: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h)
}

// --- Sessions handlers ---

func (s *Server) handleListSessions(w http.ResponseWriter, _ *http.Request) {
	if !s.requireManager(w) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": s.manager.List()})
}

func (s *Server) handleSpawnSession(w http.ResponseWriter, r *http.Request) {
	if !s.requireManager(w) {
		return
	}
	key := r.PathValue("projectKey")
	if !validProjectKey(key) {
		writeError(w, http.StatusBadRequest, "projectKey invalide")
		return
	}
	var body struct {
		Cwd string `json:"cwd"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalide: "+err.Error())
		return
	}
	if body.Cwd == "" {
		writeError(w, http.StatusBadRequest, "cwd requis")
		return
	}
	if err := s.manager.Spawn(key, body.Cwd); err != nil {
		if errors.Is(err, sessions.ErrAlreadyRunning) {
			writeError(w, http.StatusConflict, "session déjà active pour "+key)
			return
		}
		writeError(w, http.StatusInternalServerError, "spawn: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"status": "spawned", "project_key": key})
}

func (s *Server) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	if !s.requireManager(w) {
		return
	}
	key := r.PathValue("projectKey")
	if !validProjectKey(key) {
		writeError(w, http.StatusBadRequest, "projectKey invalide")
		return
	}
	if err := s.manager.Heartbeat(key); err != nil {
		if errors.Is(err, sessions.ErrNotFound) {
			writeError(w, http.StatusNotFound, "session introuvable: "+key)
			return
		}
		writeError(w, http.StatusInternalServerError, "heartbeat: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "project_key": key})
}

func (s *Server) handleKillSession(w http.ResponseWriter, r *http.Request) {
	if !s.requireManager(w) {
		return
	}
	key := r.PathValue("projectKey")
	if !validProjectKey(key) {
		writeError(w, http.StatusBadRequest, "projectKey invalide")
		return
	}
	if err := s.manager.Kill(key); err != nil {
		if errors.Is(err, sessions.ErrNotFound) {
			writeError(w, http.StatusNotFound, "session introuvable: "+key)
			return
		}
		writeError(w, http.StatusInternalServerError, "kill: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "killed", "project_key": key})
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("writeJSON: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg, "status": status})
}

func validProjectKey(key string) bool {
	if key == "" || len(key) > 64 {
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
	return !strings.HasPrefix(key, ".") && !strings.HasPrefix(key, "-")
}
