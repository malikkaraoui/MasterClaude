// Package server expose l'API HTTP du parachute (port :4001 par défaut).
//
// Endpoints :
//   GET  /health                         → liveness + version
//   GET  /v1/handoff/{projectKey}        → récupère le handoff live (404 si absent)
//   POST /v1/handoff/{projectKey}        → écrit le handoff (overwrite + archive)
//   POST /v1/handoff/{projectKey}/consume → lit + supprime le handoff (atomique)
//   GET  /v1/projects                    → liste les projets avec handoff actif
//
// Auth : token bearer optionnel via PARACHUTE_TOKEN. Si absent, écoute en
// localhost-only (127.0.0.1) — usage personnel mono-machine.
package server

import (
	"encoding/json"
	"log"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/store"
)

const Version = "0.1.0"

type Server struct {
	store *store.Store
	token string
	mux   *http.ServeMux
	start time.Time
}

func New(s *store.Store, token string) *Server {
	srv := &Server{
		store: s,
		token: token,
		mux:   http.NewServeMux(),
		start: time.Now(),
	}
	srv.routes()
	return srv
}

func (s *Server) Handler() http.Handler {
	return loggingMiddleware(s.mux)
}

// statusRecorder capture le code HTTP pour le logging.
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

// loggingMiddleware log chaque requête avec slog (clé/valeur structuré).
// Filtre les /health pour éviter de noyer le log (KeepAlive en pingue).
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		dur := time.Since(start)
		if rec.status == 0 {
			rec.status = http.StatusOK
		}
		// Skip /health pour ne pas spammer le log (santé monitoring fréquent).
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
}

// guard applique l'auth bearer si un token est configuré.
func (s *Server) guard(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.token == "" {
			h(w, r)
			return
		}
		auth := r.Header.Get("Authorization")
		expected := "Bearer " + s.token
		if auth != expected {
			writeError(w, http.StatusUnauthorized, "auth: token bearer invalide")
			return
		}
		h(w, r)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "ok",
		"version":    Version,
		"uptime_sec": int(time.Since(s.start).Seconds()),
		"now":        time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
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
	if err == store.ErrNotFound {
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
	if err == store.ErrNotFound {
		writeError(w, http.StatusNotFound, "handoff non trouvé pour "+key)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "consume: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h)
}

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

// validProjectKey limite aux caractères safe pour fs paths.
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
	if strings.HasPrefix(key, ".") || strings.HasPrefix(key, "-") {
		return false
	}
	return true
}

