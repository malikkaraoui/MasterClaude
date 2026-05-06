// parachute — orchestrateur local pour MasterClaude.
//
// Usage :
//
//	parachute                  # écoute sur 127.0.0.1:4001
//	parachute -addr :4001      # écoute toutes interfaces (déconseillé)
//	parachute -data /custom/dir
//
// Variables d'env :
//
//	PARACHUTE_TOKEN  — bearer token pour l'API (optionnel mais recommandé)
//	PARACHUTE_DATA   — répertoire de stockage (défaut: ./data)
//	PARACHUTE_ADDR   — addr d'écoute (défaut: 127.0.0.1:4001)
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/server"
	"github.com/malikkaraoui/MasterClaude/parachute/internal/sessions"
	"github.com/malikkaraoui/MasterClaude/parachute/internal/store"
)

func main() {
	var (
		addr    = flag.String("addr", envOr("PARACHUTE_ADDR", "127.0.0.1:4001"), "adresse d'écoute")
		dataDir = flag.String("data", envOr("PARACHUTE_DATA", defaultDataDir()), "répertoire de stockage")
	)
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	token := os.Getenv("PARACHUTE_TOKEN")

	st, err := store.New(*dataDir)
	if err != nil {
		log.Fatalf("init store: %v", err)
	}

	mgr := sessions.New(st, logger)
	srv := server.NewWithSessions(st, token, mgr)

	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	authStatus := "anon"
	if token != "" {
		authStatus = "bearer"
	}
	log.Printf("parachute v%s · listen=%s · data=%s · auth=%s", server.Version, *addr, *dataDir, authStatus)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Watchdog : détecte les sessions mortes toutes les 30s, log + alerte future Telegram.
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if dead := mgr.CheckDeadSessions(); len(dead) > 0 {
					slog.Warn("sessions mortes détectées", "projects", dead)
				}
			}
		}
	}()

	errCh := make(chan error, 1)
	go func() {
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		log.Fatalf("listen: %v", err)
	case <-ctx.Done():
		log.Printf("signal reçu — shutdown gracieux…")
	}

	shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(shutCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	log.Printf("parachute arrêté.")
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func defaultDataDir() string {
	if dir, err := os.Getwd(); err == nil {
		return filepath.Join(dir, "data")
	}
	return "data"
}
