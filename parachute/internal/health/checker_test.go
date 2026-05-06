package health_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/health"
)

func TestCheckHTTP_Up(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := health.New(nil, 2)
	c.Register("test")
	state := c.CheckHTTP("test", srv.URL)

	if state.Status != health.StatusUp {
		t.Errorf("attendu up, got %s", state.Status)
	}
	if state.DownCycles != 0 {
		t.Errorf("attendu 0 down cycles, got %d", state.DownCycles)
	}
}

func TestCheckHTTP_Down_AlertAfterThreshold(t *testing.T) {
	alerts := 0
	c := health.New(func(name, msg string) { alerts++ }, 2)
	c.Register("dead")

	// Cycle 1 — down mais pas encore alerte (threshold=2)
	c.CheckHTTP("dead", "http://127.0.0.1:1") // port fermé
	if alerts != 0 {
		t.Errorf("pas d'alerte attendue au cycle 1, got %d", alerts)
	}

	// Cycle 2 — alerte déclenchée
	c.CheckHTTP("dead", "http://127.0.0.1:1")
	if alerts != 1 {
		t.Errorf("1 alerte attendue au cycle 2, got %d", alerts)
	}

	// Cycle 3 — alerte répétée
	c.CheckHTTP("dead", "http://127.0.0.1:1")
	if alerts != 2 {
		t.Errorf("2 alertes attendues au cycle 3, got %d", alerts)
	}
}

func TestCheckHTTP_Recovery(t *testing.T) {
	alerts := []string{}
	c := health.New(func(_, msg string) { alerts = append(alerts, msg) }, 2)
	c.Register("flaky")

	// 2 cycles down → alerte
	c.CheckHTTP("flaky", "http://127.0.0.1:1")
	c.CheckHTTP("flaky", "http://127.0.0.1:1")

	// Recovery : serveur revient up
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	c.CheckHTTP("flaky", srv.URL)

	// Doit avoir au moins une alerte down + une alerte recovery
	hasDown := false
	hasUp := false
	for _, a := range alerts {
		if len(a) > 2 && a[:2] == "⚠" {
			hasDown = true
		}
		if len(a) > 2 && a[:3] == "✅" {
			hasUp = true
		}
	}
	if !hasDown {
		t.Error("attendu alerte down")
	}
	if !hasUp {
		t.Error("attendu alerte recovery")
	}
}

func TestAllUp_FalseWhenDown(t *testing.T) {
	c := health.New(nil, 2)
	c.Register("A")
	c.Register("B")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c.CheckHTTP("A", srv.URL)
	c.CheckHTTP("B", "http://127.0.0.1:1")

	if c.AllUp() {
		t.Error("AllUp doit être false quand B est down")
	}
}

func TestSnapshot_ReturnsAllComponents(t *testing.T) {
	c := health.New(nil, 2)
	c.Register("X")
	c.Register("Y")

	snap := c.Snapshot()
	if len(snap) != 2 {
		t.Errorf("attendu 2 composants, got %d", len(snap))
	}
}
