package store

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestPutGetConsume(t *testing.T) {
	dir := t.TempDir()
	s, err := New(dir)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	h := &Handoff{
		Version:    1,
		Cwd:        "/tmp",
		Reason:     "unit_test",
		FilRouge:   "test fil rouge",
		NextAction: "rien",
		Todos:      []Todo{{Subject: "subj", Status: "pending"}},
	}
	if err := s.PutHandoff("Demo", h); err != nil {
		t.Fatalf("PutHandoff: %v", err)
	}

	got, err := s.GetHandoff("Demo")
	if err != nil {
		t.Fatalf("GetHandoff: %v", err)
	}
	if got.FilRouge != "test fil rouge" || got.ProjectKey != "Demo" {
		t.Fatalf("handoff mismatch: %+v", got)
	}
	if got.CreatedAt.IsZero() {
		t.Errorf("CreatedAt non auto-rempli")
	}

	consumed, err := s.ConsumeHandoff("Demo")
	if err != nil {
		t.Fatalf("ConsumeHandoff: %v", err)
	}
	if consumed.FilRouge != "test fil rouge" {
		t.Fatalf("consumed mismatch")
	}

	if _, err := s.GetHandoff("Demo"); err != ErrNotFound {
		t.Fatalf("après consume, attendu ErrNotFound, got %v", err)
	}

	matches, _ := filepath.Glob(filepath.Join(dir, "archive", "*-Demo.json"))
	if len(matches) != 1 {
		t.Fatalf("attendu 1 archive, got %d (%v)", len(matches), matches)
	}
}

func TestPutHandoff_Overwrite(t *testing.T) {
	s, _ := New(t.TempDir())
	for i := 0; i < 3; i++ {
		h := &Handoff{Version: 1, FilRouge: "v" + string(rune('0'+i)), CreatedAt: time.Now().Add(time.Duration(i) * time.Second)}
		if err := s.PutHandoff("Same", h); err != nil {
			t.Fatalf("put %d: %v", i, err)
		}
	}
	got, err := s.GetHandoff("Same")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.FilRouge != "v2" {
		t.Errorf("attendu v2 (dernier write), got %s", got.FilRouge)
	}
}

func TestGetHandoff_NotFound(t *testing.T) {
	s, _ := New(t.TempDir())
	if _, err := s.GetHandoff("Absent"); err != ErrNotFound {
		t.Errorf("attendu ErrNotFound, got %v", err)
	}
}

func TestPutHandoff_RejectsEmptyKey(t *testing.T) {
	s, _ := New(t.TempDir())
	if err := s.PutHandoff("", &Handoff{}); err == nil {
		t.Errorf("attendu erreur sur key vide")
	}
	if err := s.PutHandoff("X", nil); err == nil {
		t.Errorf("attendu erreur sur handoff nil")
	}
}

func TestListProjects(t *testing.T) {
	s, _ := New(t.TempDir())
	for _, k := range []string{"A", "B", "C"} {
		if err := s.PutHandoff(k, &Handoff{Version: 1}); err != nil {
			t.Fatal(err)
		}
	}
	projects, err := s.ListProjects()
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != 3 {
		t.Fatalf("attendu 3 projets, got %d (%v)", len(projects), projects)
	}
}

// TestConcurrentPutsSameKey vérifie que des writes concurrents sur la même clé
// se sérialisent et qu'aucun écriteur ne corrompt le fichier (atomic rename).
// On accepte que la version finale soit n'importe laquelle des écritures —
// l'important : pas de fichier corrompu, pas d'erreur.
func TestConcurrentPutsSameKey(t *testing.T) {
	s, _ := New(t.TempDir())
	const N = 50
	var wg sync.WaitGroup
	errs := make(chan error, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			h := &Handoff{Version: 1, FilRouge: "iter"}
			if err := s.PutHandoff("Race", h); err != nil {
				errs <- err
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("write concurrent: %v", err)
	}
	got, err := s.GetHandoff("Race")
	if err != nil {
		t.Fatalf("get after race: %v", err)
	}
	if got.FilRouge != "iter" {
		t.Errorf("FilRouge corrompu: %q", got.FilRouge)
	}
	matches, _ := filepath.Glob(filepath.Join(s.dataDir, "archive", "*-Race.json"))
	if len(matches) < 1 {
		t.Errorf("attendu ≥1 archive, got %d", len(matches))
	}
}

// TestConcurrentPutsDifferentKeys vérifie que des writes concurrents sur des
// clés différentes ne s'inter-bloquent pas et écrivent toutes.
func TestConcurrentPutsDifferentKeys(t *testing.T) {
	s, _ := New(t.TempDir())
	const N = 20
	var wg sync.WaitGroup
	errs := make(chan error, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := "K" + string(rune('A'+i%26)) + string(rune('A'+i/26))
			h := &Handoff{Version: 1, FilRouge: key}
			if err := s.PutHandoff(key, h); err != nil {
				errs <- err
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("write: %v", err)
	}
	projects, _ := s.ListProjects()
	if len(projects) != N {
		t.Errorf("attendu %d projets, got %d", N, len(projects))
	}
}

// TestPutHandoff_AtomicRename vérifie qu'aucun .tmp ne reste après une write
// réussie (atomic rename complet).
func TestPutHandoff_AtomicRename(t *testing.T) {
	dir := t.TempDir()
	s, _ := New(dir)
	for i := 0; i < 10; i++ {
		_ = s.PutHandoff("Atomic", &Handoff{Version: 1, FilRouge: "x"})
	}
	tmps, _ := filepath.Glob(filepath.Join(dir, "*.tmp"))
	if len(tmps) > 0 {
		t.Errorf("résidus .tmp détectés: %v", tmps)
	}
}

// TestGetHandoff_CorruptedJSON vérifie qu'un handoff corrompu sur disque
// produit une erreur claire (pas de panic, pas de crash).
func TestGetHandoff_CorruptedJSON(t *testing.T) {
	dir := t.TempDir()
	s, _ := New(dir)
	corruptPath := filepath.Join(dir, "Corrupt.json")
	if err := os.WriteFile(corruptPath, []byte("{not valid json"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := s.GetHandoff("Corrupt")
	if err == nil {
		t.Errorf("attendu erreur sur JSON corrompu, got nil")
	}
	if err == ErrNotFound {
		t.Errorf("attendu erreur unmarshal, got ErrNotFound")
	}
}

// TestConsumeHandoff_RaceWithGet : 1 goroutine consume, N goroutines get.
// Avec mutex Lock/RLock, soit get voit le handoff soit ErrNotFound — jamais corrompu.
func TestConsumeHandoff_RaceWithGet(t *testing.T) {
	s, _ := New(t.TempDir())
	if err := s.PutHandoff("Race2", &Handoff{Version: 1, FilRouge: "v"}); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 11)
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, err := s.ConsumeHandoff("Race2")
		if err != nil && err != ErrNotFound {
			errs <- err
		}
	}()
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.GetHandoff("Race2")
			if err != nil && err != ErrNotFound {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("race: %v", err)
	}
}

// TestMassiveProjects valide la perf sur 200 projets — list reste raisonnable.
func TestMassiveProjects(t *testing.T) {
	if testing.Short() {
		t.Skip("skip stress en -short")
	}
	s, _ := New(t.TempDir())
	const N = 200
	for i := 0; i < N; i++ {
		key := "P" + leftPad(i, 4)
		if err := s.PutHandoff(key, &Handoff{Version: 1, FilRouge: key}); err != nil {
			t.Fatalf("put %d: %v", i, err)
		}
	}
	projects, err := s.ListProjects()
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != N {
		t.Errorf("attendu %d projets, got %d", N, len(projects))
	}
}

func leftPad(n, width int) string {
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	for len(s) < width {
		s = "0" + s
	}
	return s
}

func BenchmarkPutHandoff(b *testing.B) {
	s, _ := New(b.TempDir())
	h := &Handoff{Version: 1, FilRouge: "bench"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := s.PutHandoff("Bench", h); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkGetHandoff(b *testing.B) {
	s, _ := New(b.TempDir())
	_ = s.PutHandoff("Bench", &Handoff{Version: 1, FilRouge: "bench"})
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := s.GetHandoff("Bench"); err != nil {
			b.Fatal(err)
		}
	}
}
