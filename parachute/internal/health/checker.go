// Package health surveille les composants critiques de MasterClaude
// et déclenche des alertes Telegram si un composant est down > 2 cycles.
package health

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Status représente l'état d'un composant.
type Status string

const (
	StatusUp      Status = "up"
	StatusDown    Status = "down"
	StatusUnknown Status = "unknown"
)

// ComponentState historise l'état d'un composant.
type ComponentState struct {
	Name        string
	Status      Status
	DownSince   *time.Time
	DownCycles  int
	LastChecked time.Time
	LastErr     string
}

// AlertFunc est appelée quand un composant passe down > threshold cycles.
type AlertFunc func(component, message string)

// Checker surveille une liste de composants HTTP.
type Checker struct {
	mu         sync.RWMutex
	components map[string]*ComponentState
	alert      AlertFunc
	threshold  int // cycles down avant alerte
	client     *http.Client
}

// New crée un Checker. alert est appelée pour chaque alerte (nil = no-op).
func New(alert AlertFunc, threshold int) *Checker {
	if threshold <= 0 {
		threshold = 2
	}
	if alert == nil {
		alert = func(_, _ string) {}
	}
	return &Checker{
		components: make(map[string]*ComponentState),
		alert:      alert,
		threshold:  threshold,
		client:     &http.Client{Timeout: 3 * time.Second},
	}
}

// Register enregistre un composant à surveiller via son URL de health.
func (c *Checker) Register(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.components[name] = &ComponentState{Name: name, Status: StatusUnknown}
}

// CheckHTTP vérifie un composant via GET sur healthURL.
// À appeler périodiquement depuis un ticker (ex: toutes les 30s).
func (c *Checker) CheckHTTP(name, healthURL string) ComponentState {
	resp, err := c.client.Get(healthURL)
	if resp != nil {
		resp.Body.Close()
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	state, ok := c.components[name]
	if !ok {
		state = &ComponentState{Name: name}
		c.components[name] = state
	}
	state.LastChecked = time.Now().UTC()

	if err != nil || resp.StatusCode >= 500 {
		errMsg := fmt.Sprintf("HTTP error: %v", err)
		if err == nil {
			errMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		state.LastErr = errMsg
		if state.Status != StatusDown {
			now := time.Now().UTC()
			state.DownSince = &now
			state.DownCycles = 1
		} else {
			state.DownCycles++
		}
		state.Status = StatusDown

		if state.DownCycles >= c.threshold {
			dur := time.Since(*state.DownSince).Round(time.Second)
			c.alert(name, fmt.Sprintf("⚠ %s est down depuis %s (%s)", name, dur, errMsg))
		}
	} else {
		if state.Status == StatusDown {
			c.alert(name, fmt.Sprintf("✅ %s est revenu up", name))
		}
		state.Status = StatusUp
		state.DownSince = nil
		state.DownCycles = 0
		state.LastErr = ""
	}

	return *state
}

// Snapshot retourne l'état actuel de tous les composants.
func (c *Checker) Snapshot() []ComponentState {
	c.mu.RLock()
	defer c.mu.RUnlock()

	out := make([]ComponentState, 0, len(c.components))
	for _, s := range c.components {
		out = append(out, *s)
	}
	return out
}

// AllUp retourne true si tous les composants enregistrés sont up.
func (c *Checker) AllUp() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	for _, s := range c.components {
		if s.Status != StatusUp {
			return false
		}
	}
	return true
}
