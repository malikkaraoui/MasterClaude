package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/store"
)

// newTestServer crée un serveur en mémoire avec un store dans tempDir.
func newTestServer(t *testing.T, token string) (*httptest.Server, *store.Store) {
	t.Helper()
	st, err := store.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	srv := New(st, token)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return ts, st
}

func doReq(t *testing.T, method, url, token string, body any) (*http.Response, []byte) {
	t.Helper()
	var bodyR io.Reader
	if body != nil {
		switch v := body.(type) {
		case string:
			bodyR = strings.NewReader(v)
		case []byte:
			bodyR = bytes.NewReader(v)
		default:
			b, err := json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
			bodyR = bytes.NewReader(b)
		}
	}
	req, err := http.NewRequest(method, url, bodyR)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp, data
}

func TestHealth(t *testing.T) {
	ts, _ := newTestServer(t, "")
	resp, body := doReq(t, "GET", ts.URL+"/health", "", nil)
	if resp.StatusCode != 200 {
		t.Fatalf("attendu 200, got %d (%s)", resp.StatusCode, body)
	}
	var got map[string]any
	_ = json.Unmarshal(body, &got)
	if got["status"] != "ok" {
		t.Errorf("status: %v", got["status"])
	}
	if got["version"] != Version {
		t.Errorf("version: %v vs %v", got["version"], Version)
	}
}

func TestPutGetHandoff_Roundtrip(t *testing.T) {
	ts, _ := newTestServer(t, "")
	h := store.Handoff{Version: 1, ProjectKey: "Demo", Cwd: "/x", Reason: "t", FilRouge: "fr"}
	resp, _ := doReq(t, "POST", ts.URL+"/v1/handoff/Demo", "", h)
	if resp.StatusCode != 200 {
		t.Fatalf("POST: %d", resp.StatusCode)
	}
	resp, body := doReq(t, "GET", ts.URL+"/v1/handoff/Demo", "", nil)
	if resp.StatusCode != 200 {
		t.Fatalf("GET: %d", resp.StatusCode)
	}
	var got store.Handoff
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if got.FilRouge != "fr" {
		t.Errorf("fil_rouge: %q", got.FilRouge)
	}
}

func TestConsumeHandoff(t *testing.T) {
	ts, _ := newTestServer(t, "")
	h := store.Handoff{Version: 1, ProjectKey: "Demo", FilRouge: "consume_me"}
	doReq(t, "POST", ts.URL+"/v1/handoff/Demo", "", h)

	resp, body := doReq(t, "POST", ts.URL+"/v1/handoff/Demo/consume", "", nil)
	if resp.StatusCode != 200 {
		t.Fatalf("CONSUME: %d", resp.StatusCode)
	}
	var got store.Handoff
	_ = json.Unmarshal(body, &got)
	if got.FilRouge != "consume_me" {
		t.Errorf("consume returned wrong handoff: %q", got.FilRouge)
	}

	resp2, _ := doReq(t, "GET", ts.URL+"/v1/handoff/Demo", "", nil)
	if resp2.StatusCode != 404 {
		t.Errorf("après consume attendu 404, got %d", resp2.StatusCode)
	}
}

func TestAuth_Bearer(t *testing.T) {
	ts, _ := newTestServer(t, "secret-token")

	resp, _ := doReq(t, "GET", ts.URL+"/health", "", nil)
	if resp.StatusCode != 200 {
		t.Errorf("/health doit être public, got %d", resp.StatusCode)
	}
	resp, _ = doReq(t, "GET", ts.URL+"/v1/projects", "", nil)
	if resp.StatusCode != 401 {
		t.Errorf("sans token attendu 401, got %d", resp.StatusCode)
	}
	resp, _ = doReq(t, "GET", ts.URL+"/v1/projects", "wrong", nil)
	if resp.StatusCode != 401 {
		t.Errorf("token invalide attendu 401, got %d", resp.StatusCode)
	}
	resp, _ = doReq(t, "GET", ts.URL+"/v1/projects", "secret-token", nil)
	if resp.StatusCode != 200 {
		t.Errorf("token valide attendu 200, got %d", resp.StatusCode)
	}
}

func TestPutHandoff_BadJSON(t *testing.T) {
	ts, _ := newTestServer(t, "")
	resp, _ := doReq(t, "POST", ts.URL+"/v1/handoff/Demo", "", "{not valid json")
	if resp.StatusCode != 400 {
		t.Errorf("attendu 400 sur JSON invalide, got %d", resp.StatusCode)
	}
}

func TestPutHandoff_TooLarge(t *testing.T) {
	ts, _ := newTestServer(t, "")
	huge := strings.Repeat("x", 2*1024*1024) // 2 MB
	body := fmt.Sprintf(`{"version":1,"fil_rouge":%q}`, huge)
	resp, _ := doReq(t, "POST", ts.URL+"/v1/handoff/Demo", "", body)
	if resp.StatusCode == 200 {
		t.Errorf("attendu rejet sur >1MB, got 200")
	}
}

func TestProjectKey_Validation(t *testing.T) {
	ts, _ := newTestServer(t, "")
	cases := []struct {
		key  string
		want int
	}{
		{"OK_Project-1", 200},
		{".hidden", 400},
		{"-leading-dash", 400},
		{"with/slash", 404}, // route ne matche pas (path normalisé)
		{strings.Repeat("a", 65), 400},
		{"a b c", 400},
	}
	for _, c := range cases {
		t.Run(c.key, func(t *testing.T) {
			h := store.Handoff{Version: 1}
			resp, _ := doReq(t, "POST", ts.URL+"/v1/handoff/"+c.key, "", h)
			if resp.StatusCode != c.want {
				t.Errorf("key=%q want=%d got=%d", c.key, c.want, resp.StatusCode)
			}
		})
	}
}

// TestConcurrentClients : 50 clients HTTP concurrents qui push la même clé.
// On vérifie qu'aucun ne reçoit 5xx et que la clé est lisible à la fin.
func TestConcurrentClients(t *testing.T) {
	ts, _ := newTestServer(t, "")
	const N = 50
	var wg sync.WaitGroup
	failures := make(chan int, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			h := store.Handoff{Version: 1, FilRouge: "race"}
			resp, _ := doReq(t, "POST", ts.URL+"/v1/handoff/Race", "", h)
			if resp.StatusCode >= 500 {
				failures <- resp.StatusCode
			}
		}(i)
	}
	wg.Wait()
	close(failures)
	for code := range failures {
		t.Errorf("5xx sous charge: %d", code)
	}
	resp, body := doReq(t, "GET", ts.URL+"/v1/handoff/Race", "", nil)
	if resp.StatusCode != 200 {
		t.Fatalf("get final: %d", resp.StatusCode)
	}
	if !bytes.Contains(body, []byte(`"fil_rouge":"race"`)) {
		t.Errorf("handoff final corrompu: %s", body[:min(200, len(body))])
	}
}

func TestMethodNotAllowed(t *testing.T) {
	ts, _ := newTestServer(t, "")
	// PUT sur /v1/handoff/{key} : le router exige POST/GET, donc PUT → 405
	resp, _ := doReq(t, "PUT", ts.URL+"/v1/handoff/Demo", "", store.Handoff{Version: 1})
	if resp.StatusCode != http.StatusMethodNotAllowed && resp.StatusCode != 404 {
		t.Errorf("PUT attendu 405 ou 404, got %d", resp.StatusCode)
	}
}

func TestServerSlow(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}
	ts, _ := newTestServer(t, "")
	deadline := time.Now().Add(2 * time.Second)
	count := 0
	for time.Now().Before(deadline) {
		resp, _ := doReq(t, "GET", ts.URL+"/health", "", nil)
		if resp.StatusCode != 200 {
			t.Fatalf("health KO sous load: %d", resp.StatusCode)
		}
		count++
	}
	if count < 100 {
		t.Errorf("trop lent: %d req en 2s (attendu ≥100)", count)
	}
	t.Logf("health throughput: %d req/2s", count)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
