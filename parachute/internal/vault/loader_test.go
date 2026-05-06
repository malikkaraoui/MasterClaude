package vault_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/malikkaraoui/MasterClaude/parachute/internal/vault"
)

func makeVault(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "vault"), 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestLoadVaultContext_FreshReport(t *testing.T) {
	dir := makeVault(t)
	vd := filepath.Join(dir, "vault")
	writeFile(t, filepath.Join(vd, "PETER_REPORT.md"), "rapport frais")
	writeFile(t, filepath.Join(vd, "00-brief.md"), "brief fallback")

	ctx, err := vault.LoadVaultContext(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(ctx.Summary, "rapport frais") {
		t.Errorf("attendu PETER_REPORT.md frais, got: %q", ctx.Summary)
	}
}

func TestLoadVaultContext_StaleReport(t *testing.T) {
	dir := makeVault(t)
	vd := filepath.Join(dir, "vault")
	reportPath := filepath.Join(vd, "PETER_REPORT.md")
	writeFile(t, reportPath, "rapport périmé")
	stale := time.Now().Add(-3 * time.Hour)
	if err := os.Chtimes(reportPath, stale, stale); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(vd, "00-brief.md"), "brief fallback")

	ctx, err := vault.LoadVaultContext(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(ctx.Summary, "brief fallback") {
		t.Errorf("attendu fallback 00-brief.md, got: %q", ctx.Summary)
	}
}

func TestBuildContextUnder800Tokens(t *testing.T) {
	dir := makeVault(t)
	vd := filepath.Join(dir, "vault")
	big := strings.Repeat("a", 5000)
	writeFile(t, filepath.Join(vd, "PETER_REPORT.md"), big)
	writeFile(t, filepath.Join(vd, "20-decisions.md"), big)
	writeFile(t, filepath.Join(vd, "30-discoveries.md"), big)
	writeFile(t, filepath.Join(vd, "40-roadmap.md"), big)

	ctx, err := vault.LoadVaultContext(dir)
	if err != nil {
		t.Fatal(err)
	}
	if ctx.TokenCount > 800 {
		t.Errorf("TokenCount %d > 800 (budget dépassé)", ctx.TokenCount)
	}
}

func TestLoadVaultContext_MissingVault(t *testing.T) {
	_, err := vault.LoadVaultContext("/tmp/vault-inexistant-masterclaude-xyz")
	if err == nil {
		t.Error("attendu erreur pour vault inexistant")
	}
}

func TestHashIsStable(t *testing.T) {
	dir := makeVault(t)
	writeFile(t, filepath.Join(dir, "vault", "PETER_REPORT.md"), "contenu stable")

	ctx1, err := vault.LoadVaultContext(dir)
	if err != nil {
		t.Fatal(err)
	}
	ctx2, err := vault.LoadVaultContext(dir)
	if err != nil {
		t.Fatal(err)
	}
	if ctx1.Hash != ctx2.Hash {
		t.Errorf("hash instable pour contenu identique: %q vs %q", ctx1.Hash, ctx2.Hash)
	}
	if ctx1.Hash == "" {
		t.Error("hash vide")
	}
}
