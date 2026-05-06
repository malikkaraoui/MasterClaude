// Package vault charge le contexte global Malik depuis l'Obsidian Vault
// et l'assemble en un bloc < 800 tokens pour --append-system-prompt.
package vault

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	maxBriefTokens      = 200
	maxDecisionsTokens  = 150
	maxDiscovTokens     = 150
	maxRoadmapTokens    = 100
	charsPerToken       = 4
	peterReportMaxAge   = 2 * time.Hour
)

// VaultContext contient le contexte Malik assemblé pour injection.
type VaultContext struct {
	Summary     string
	Decisions   string
	Discoveries string
	Roadmap     string
	Hash        string // SHA256 du bloc assemblé (traçabilité vault_snapshots)
	TokenCount  int
}

// LoadVaultContext lit le Vault Obsidian Malik et retourne un contexte
// prêt pour --append-system-prompt. vaultPath = /Users/malik/Vault/Malik/.
// Si le vault est inaccessible, retourne une erreur non-bloquante pour le
// caller (spawn quand même, alerter Telegram).
func LoadVaultContext(vaultPath string) (VaultContext, error) {
	var ctx VaultContext

	summary, err := loadSummary(vaultPath)
	if err != nil {
		return ctx, fmt.Errorf("vault summary: %w", err)
	}
	ctx.Summary = truncateTokens(summary, maxBriefTokens)
	ctx.Decisions = truncateTokens(readFileOrEmpty(filepath.Join(vaultPath, "vault", "20-decisions.md")), maxDecisionsTokens)
	ctx.Discoveries = truncateTokens(readFileOrEmpty(filepath.Join(vaultPath, "vault", "30-discoveries.md")), maxDiscovTokens)
	ctx.Roadmap = truncateTokens(readFileOrEmpty(filepath.Join(vaultPath, "vault", "40-roadmap.md")), maxRoadmapTokens)

	assembled := ctx.assemble()
	ctx.Hash = sha256hex(assembled)
	ctx.TokenCount = len(assembled) / charsPerToken

	return ctx, nil
}

// Assemble retourne le bloc final pour --append-system-prompt.
func (c VaultContext) Assemble() string {
	return c.assemble()
}

// loadSummary retourne PETER_REPORT.md si < 2h, sinon 00-brief.md.
func loadSummary(vaultPath string) (string, error) {
	reportPath := filepath.Join(vaultPath, "vault", "PETER_REPORT.md")
	if info, err := os.Stat(reportPath); err == nil {
		if time.Since(info.ModTime()) < peterReportMaxAge {
			if data, err := os.ReadFile(reportPath); err == nil {
				return string(data), nil
			}
		}
	}
	data, err := os.ReadFile(filepath.Join(vaultPath, "vault", "00-brief.md"))
	if err != nil {
		return "", fmt.Errorf("00-brief.md introuvable: %w", err)
	}
	return string(data), nil
}

func (c VaultContext) assemble() string {
	var b strings.Builder
	b.WriteString("<vault-context>\n")
	if c.Summary != "" {
		b.WriteString("## État projet\n")
		b.WriteString(c.Summary)
		b.WriteString("\n")
	}
	if c.Decisions != "" {
		b.WriteString("## Décisions durables\n")
		b.WriteString(c.Decisions)
		b.WriteString("\n")
	}
	if c.Discoveries != "" {
		b.WriteString("## Découvertes récentes\n")
		b.WriteString(c.Discoveries)
		b.WriteString("\n")
	}
	if c.Roadmap != "" {
		b.WriteString("## Sur le feu\n")
		b.WriteString(c.Roadmap)
		b.WriteString("\n")
	}
	b.WriteString("</vault-context>")
	return b.String()
}

// truncateTokens coupe s au budget maxTokens (approximation 4 chars/token),
// à la dernière frontière de ligne pour ne pas couper une ligne à mi-mot.
func truncateTokens(s string, maxTokens int) string {
	maxChars := maxTokens * charsPerToken
	if len(s) <= maxChars {
		return s
	}
	truncated := s[:maxChars]
	if idx := strings.LastIndexByte(truncated, '\n'); idx > maxChars/2 {
		truncated = truncated[:idx]
	}
	return truncated + "\n…[tronqué]"
}

func readFileOrEmpty(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}

func sha256hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", h)
}
