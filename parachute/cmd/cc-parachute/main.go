// cc-parachute — CLI client pour l'API parachute.
//
// Usage :
//
//	cc-parachute health                        # état du daemon
//	cc-parachute sessions                      # sessions Claude actives
//	cc-parachute logs [--n 50]                 # dernières alertes
//	cc-parachute restart <projectKey> [--cwd]  # kill + re-spawn session
//
// Variables d'env :
//
//	PARACHUTE_BASE   — base URL (défaut: http://127.0.0.1:4001)
//	PARACHUTE_TOKEN  — bearer token
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	flag.Parse()
	args := flag.Args()

	if len(args) == 0 {
		usage()
		os.Exit(1)
	}

	c := &client{
		base:  envOr("PARACHUTE_BASE", "http://127.0.0.1:4001"),
		token: os.Getenv("PARACHUTE_TOKEN"),
		http:  &http.Client{Timeout: 10 * time.Second},
	}

	switch args[0] {
	case "health":
		cmdHealth(c)
	case "sessions":
		cmdSessions(c)
	case "logs":
		n := 50
		fs := flag.NewFlagSet("logs", flag.ExitOnError)
		fs.IntVar(&n, "n", 50, "nombre de lignes")
		_ = fs.Parse(args[1:])
		cmdLogs(c, n)
	case "restart":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "restart: projectKey requis")
			os.Exit(1)
		}
		cwd := ""
		fs := flag.NewFlagSet("restart", flag.ExitOnError)
		fs.StringVar(&cwd, "cwd", "", "répertoire de travail (optionnel, déduit des sessions actives)")
		_ = fs.Parse(args[2:])
		cmdRestart(c, args[1], cwd)
	default:
		fmt.Fprintf(os.Stderr, "commande inconnue : %s\n", args[0])
		usage()
		os.Exit(1)
	}
}

// --- Commands ---

func cmdHealth(c *client) {
	var d map[string]any
	if err := c.getJSON("/health", &d); err != nil {
		die("health: %v", err)
	}
	fmt.Printf("status   : %v\n", d["status"])
	fmt.Printf("version  : %v\n", d["version"])
	fmt.Printf("uptime   : %vs\n", d["uptime_sec"])
	fmt.Printf("now      : %v\n", d["now"])
}

func cmdSessions(c *client) {
	var d struct {
		Sessions []struct {
			ProjectKey    string    `json:"ProjectKey"`
			Cwd           string    `json:"Cwd"`
			Pid           int       `json:"Pid"`
			StartedAt     time.Time `json:"StartedAt"`
			LastHeartbeat time.Time `json:"LastHeartbeat"`
		} `json:"sessions"`
	}
	if err := c.getJSON("/v1/sessions", &d); err != nil {
		die("sessions: %v", err)
	}
	if len(d.Sessions) == 0 {
		fmt.Println("Aucune session active.")
		return
	}
	fmt.Printf("%-20s  %-6s  %-8s  %s\n", "PROJET", "PID", "UPTIME", "CWD")
	fmt.Println(strings.Repeat("─", 72))
	for _, s := range d.Sessions {
		uptime := time.Since(s.StartedAt).Round(time.Second)
		fmt.Printf("%-20s  %-6d  %-8s  %s\n", s.ProjectKey, s.Pid, uptime, s.Cwd)
	}
}

func cmdLogs(c *client, n int) {
	var d struct {
		Lines []struct {
			Ts        int64  `json:"ts"`
			Component string `json:"component"`
			Message   string `json:"message"`
		} `json:"lines"`
	}
	if err := c.getJSON("/v1/logs", &d); err != nil {
		die("logs: %v", err)
	}
	if len(d.Lines) == 0 {
		fmt.Println("Aucune alerte.")
		return
	}
	lines := d.Lines
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	for _, l := range lines {
		ts := time.Unix(l.Ts, 0).Format("2006-01-02 15:04:05")
		fmt.Printf("[%s] %-16s %s\n", ts, l.Component, l.Message)
	}
}

func cmdRestart(c *client, projectKey, cwd string) {
	// Si cwd non fourni, le déduire des sessions actives.
	if cwd == "" {
		var d struct {
			Sessions []struct {
				ProjectKey string `json:"ProjectKey"`
				Cwd        string `json:"Cwd"`
			} `json:"sessions"`
		}
		if err := c.getJSON("/v1/sessions", &d); err != nil {
			die("sessions: %v", err)
		}
		for _, s := range d.Sessions {
			if s.ProjectKey == projectKey {
				cwd = s.Cwd
				break
			}
		}
		if cwd == "" {
			die("session %q introuvable et --cwd non spécifié", projectKey)
		}
	}

	// Kill.
	if err := c.do("DELETE", "/v1/sessions/"+projectKey, nil, nil); err != nil {
		fmt.Fprintf(os.Stderr, "warn: kill session: %v\n", err)
	} else {
		fmt.Printf("Session %q arrêtée.\n", projectKey)
	}

	// Spawn.
	body := map[string]string{"cwd": cwd}
	var resp map[string]any
	if err := c.postJSON("/v1/sessions/"+projectKey+"/spawn", body, &resp); err != nil {
		die("spawn: %v", err)
	}
	fmt.Printf("Session %q redémarrée (cwd: %s).\n", projectKey, cwd)
}

// --- HTTP client ---

type client struct {
	base  string
	token string
	http  *http.Client
}

func (c *client) getJSON(path string, out any) error {
	return c.do("GET", path, nil, out)
}

func (c *client) postJSON(path string, body, out any) error {
	return c.do("POST", path, body, out)
}

func (c *client) do(method, path string, body, out any) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = strings.NewReader(string(b))
	}
	req, err := http.NewRequest(method, c.base+path, bodyReader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// --- Helpers ---

func usage() {
	fmt.Fprintln(os.Stderr, "usage: cc-parachute <health|sessions|logs|restart> [args]")
}

func die(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "erreur: "+format+"\n", args...)
	os.Exit(1)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
