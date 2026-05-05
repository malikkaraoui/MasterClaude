# Découvertes projet

> Géré par Peter via claude-atelier vault. Markdown vivant, pas document gravé.

## Découvertes

Ce que Claude ou Peter apprend sur le projet et qui mérite de survivre à la session.

### 2026-05-04 — Phase B Telegram voix livrée (PR #49 mergée)

- **VoiceTranscriber** : faster-whisper lazy-loaded (device=cpu, compute_type=int8), `asyncio.to_thread` obligatoire — le générateur faster-whisper DOIT être consommé entièrement dans le thread (pas dans la boucle événement asyncio, sinon deadlock)
- **OllamaPolisher** : httpx async, POST `/api/generate`, timeout 10s, fallback gracieux sur texte brut
- **6 fixes Copilot robustesse** : try/finally download (cleanup partial), try/except transcription (reply erreur user), polished[:4000] troncation, reply explicite si project_dir invalide, inbox_writer en try/except, `_run()` helper consommant le générateur en thread
- **17/17 smoke tests passants** — 4 nouveaux tests Phase B ajoutés à test/telegram.test.js
- **Déférés PR #49** : mcp/server.js framing stdio (Phase G), graph reload, test vault maintain

### 2026-05-04 — État multi-chantiers après merge PR #50

- **main propre, 0 PR ouverte** — Lots 0+4+10 + 6 fixes Copilot mergés, 74/74 tests
- **feat/lot3-vault** : 1 commit en avance (telegram-bridge-plan.md update Copilot) — à merger ou squasher
- **PETER_REPORT** : décalé (dit v0.23.5 / Phase B) — vault/00-brief.md pas encore mis à jour avec Lots 0+4+10
- **Déférés PR #50** : mcp/server.js framing stdio (Phase G), graph reload, telegram-bridge.py erreurs vocaux, test vault maintain
- **Prochains chantiers identifiés** : bump version, Phase B voix (faster-whisper), Phase C graphe minimal (déjà partiellement implémenté dans Lots 0+4+10)

### YYYY-MM-DD — Découverte

- Observation :
- Impact :
- Source :
- Remontée globale candidate : non
