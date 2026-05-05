---
stack: go
applies_to: ["*.go", "go.mod", "go.sum"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Gaëlle
---

# Stack — Go

> **Gaëlle** 🦫 — Simple, concurrent, efficace.
> Dernière mise à jour : avril 2026 (Go 1.26, generics matures, PGO, crypto post-quantum).

## Principes

- **Simplicité** : pas de magie, pas d'héritage, pas de génériques abusifs
- **Erreurs explicites** : `if err != nil` — pas de try/catch, c'est voulu
- **Interfaces implicites** : petites interfaces (1-3 méthodes), composées
- **Goroutines** : concurrence légère native, pas de thread pools manuels
- **Go 1.26** (fév 2026) : `new()` avec expressions, `crypto/hpke` (HPKE — hybrid encryption, pas post-quantum)
- **Generics** (1.18+) matures : utiliser pour les collections et utilitaires génériques

## Tooling par défaut

- `go build` / `go test` / `go vet` : tout est intégré
- **Lint** : `golangci-lint` (agrège staticcheck, errcheck, gosimple, etc.)
- **Format** : `gofmt` (non négociable, formatage unique)
- **Modules** : `go.mod` + `go.sum` pour la reproductibilité
- **Debug** : Delve (`dlv`) ; profiling : `pprof`

## Sécurité

- **govulncheck** : détecte les CVE connues dans le code source (curé par l'équipe Go)
- **gosec** : détecte les CWE (peut ne pas être des CVE)
- Utiliser les deux en CI : govulncheck pour les CVE, gosec pour les CWE
- `go test -race` : détecteur de races obligatoire en CI (`-race` flag)
- `crypto/tls` avec config sécurisée par défaut ; pas de TLS < 1.2
- Context timeout sur toutes les requêtes réseau

## Performance et Mémoire

- **PGO** (Profile-Guided Optimization) depuis Go 1.22 : optimise avec des profils runtime
- `pprof` : CPU, mémoire, blocking, goroutine profiles
- `go test -bench` : benchmarks intégrés avec comparaison (`benchstat`)
- Go 1.24 : 2-3% réduction overhead CPU
- Escape analysis : `go build -gcflags='-m'` pour voir les allocations heap

## Discipline de modules

- Structure plate au root du repo ; éviter l'imbrication profonde
- `cmd/` pour les exécutables, packages au top-level pour les bibliothèques
- Un package par dossier, nom = dossier (lowercase, un seul mot)
- Interfaces définies par le consommateur, pas le fournisseur
- `internal/` pour le code non exportable hors du module

## Ce qu'on ne fait plus

- `GOPATH` (utiliser Go modules depuis Go 1.11)
- Thread pools manuels pour I/O (utiliser goroutines)
- `interface{}` au lieu de `any` (Go 1.18+)
- Packages `util` ou `common` fourre-tout (nommer par responsabilité)
- `init()` fonctions sauf pour les drivers/registrations

## Gestion d'erreurs

- `if err != nil { return fmt.Errorf("context: %w", err) }` — wrapping systématique
- `errors.Is()` / `errors.As()` pour inspecter les erreurs wrappées
- Types d'erreurs custom si le caller doit distinguer les cas
- Jamais de `panic` sauf pour les invariants de programmation

## Tests

- **go test** : table-driven tests (standard Go)
- **testify** : assertions simplifiées (`assert`, `require`, `suite`)
- **gomock** : génération de mocks par interface
- `go test -race ./...` : toujours en CI pour détecter les data races
- `t.Parallel()` pour accélérer les tests indépendants
- `testcontainers-go` pour les tests d'intégration avec vrais services
