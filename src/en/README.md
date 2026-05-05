# English version — not yet available

> **Status:** planned for `v0.3.0`
> **Current version:** FR-only (`src/fr/`)

## Why not now?

The French version (`src/fr/`) is the source of truth and is still evolving.
Translating 32 files while the content is actively changing would create
drift between FR and EN that is expensive to maintain and detect.

## What's ready

- Directory structure mirrors `src/fr/` (same subdirectories)
- `bin/cli.js init --lang en` is wired and will work once files exist
- `scripts/sync-translations.js` is planned for P4 to detect structural
  drift between FR and EN

## How to contribute EN content

1. Pick a file from `src/fr/` (e.g., `src/fr/runtime/code-review.md`)
2. Translate to `src/en/runtime/code-review.md`
3. Keep the same frontmatter structure (kind, name, loads_from)
4. Change `loads_from` path from `src/fr/` to `src/en/`
5. PR with both files to verify parity

## Timeline

- `v0.2.0` — FR-only, EN structure placeholder (this file)
- `v0.3.0` — EN parity for core files (CLAUDE.md + rules/ + runtime/)
- `v0.4.0` — EN parity for all satellites
