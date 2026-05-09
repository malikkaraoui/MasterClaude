# Bootstrap pour session Claude spawned via Telegram

> Destiné à la prochaine session spawned. Lire AVANT de répondre.

## État courant (2026-05-09)

| Clé | Valeur |
| --- | --- |
| Phase | v0.2.0 — E1 livré (secrétaire Ollama + triage Telegram + auto-confirm fenêtres) · **next: E2 session-manager** |
| Stack | Node.js (master daemon) + Go (parachute orchestrator) + Python (Telegram bridge) |
| Repo | /Users/malik/MasterClaude (fork v0.26.0 claude-atelier) |
| Vault global | /Users/malik/Vault/Malik/ (lu au boot daemon via vault-loader.js) |
| Daemon | master.js (Node.js) orchestré via LaunchAgent KeepAlive + parachute (Go) HTTP :4001 |
| Sessions | par projet via parachute SessionManager — spawn via osascript Terminal.app |
| Contexte | injecté au spawn via vault-global + project .claude/CLAUDE.md + handoff non consommé |
| Ollama | :11434 local (qwen3.5 secrétaire, deeper reasoning optionnel) |
| Telegram | bridge Python, polling long master.js → write /tmp/tg-inbox.jsonl → monitor tail-f → read /tmp/tg-responses/ |
| Mémoire | claude-mem v13.0.0 :37701, auto-capture observations (decision/feature/bugfix/discovery) |

## Démarrage session — Points critiques

### 1. Lire immédiatement (dans cet ordre)

1. **vault/30-discoveries.md** → état technique actuel + décisions architecture
2. **vault/40-roadmap.md** → ce qui est livré vs en-cours vs planifié
3. **.claude/CLAUDE.md §0** → contexte local session (phase, stack, endpoints actifs)
4. **.claude/CLAUDE.md §22** → secrets & git gate (non négociable)

### 2. IPC / Monitoring

- **Telegram inbox** : `/tmp/tg-inbox.jsonl` (JSONL, 1 msg/ligne) — Monitor tail -f doit tourner
- **Guard-monitor-bridge** : `hooks/guard-monitor-bridge.sh` sur `UserPromptSubmit` — auto-relance Monitor si mort
- **Session signal** : `/tmp/masterclaude-real-claude-active` (ts:shellPID:parentPID, TTL 3600s) — master lit pour détecter sessions vivantes

### 3. Context saturation (IMPORTANT)

- Seuil: **60% tokens utilisés** → getCtxPct() détecté → master demande `/compact` OUI/NON
- Si refusé : session continue, danger silencieux (peut crasher court-terme)
- Si accepté 1-2x : normal
- Si accepté >3x : **migration automatique** (master écrit MIGRATE_REQUEST → tu écris `/tmp/masterclaude-handoff-{projectKey}.json` → parachute facilite)

### 4. Handoff migration

Cas: contexte saturé, refait 3x `/compact`.
- Master envoie « Migration en cours… »
- Tu écris `/tmp/masterclaude-handoff-{projectKey}.json` contenant:
  ```json
  {
    "fil_rouge": "où on en est",
    "next_action": "quoi faire maintenant",
    "warnings_for_successor": "pièges à connaître",
    "todos": ["todo 1", "todo 2"],
    "vault_malik_slice": "extrait pertinent /Users/malik/Vault/Malik/",
    "last_user_message": "dernier message utilisateur"
  }
  ```
- Master attends 90s max → call parachute POST /v1/migrate → nouvelle session spawned

### 5. Projet courant

- Lire `/tmp/masterclaude-real-claude-active` au démarrage (même si None, c'est ok)
- SessionManager se charge via master (vu dans bin/master.js)
- Si besoin switcher projet : `/projet <nom|path>` (update ~/.claude-atelier/projects.json)

## Commandes système disponibles

### Via Telegram (master daemon route)

- `/projets` → lister projects
- `/projet <nom|path>` → activer project
- `/register <nom> <path>` → nouveau project
- `/git status|log|diff|commit|push` → forwarding git
- `/github events` → fetch GitHub events → Telegram notif
- `/compact` → context compression + signal write (Master à l'écoute)
- `@claude` ou `urgent|critique|bloqué|sos` → wake si sleeping

### Via terminal (direct)

```bash
# Parachute CLI
cc-parachute health
cc-parachute sessions list
cc-parachute sessions logs
cc-parachute restart

# Master daemon control
npm run master:start
npm run master:stop
npm run master:restart
npm run master:status

# Pre-push gate (AVANT tout git push)
bash scripts/pre-push-gate.sh
```

## Hiérarchie des règles (§21 CLAUDE.md)

1. **§5 Anti-hallucination** → absolu (jamais inventer)
2. **§22 Secrets & git gate** → absolu (pré-push-gate.sh obligatoire)
3. Contrat front/back → sans validation explicite
4. **§7 Qualité / conventions** → systématique
5. **§15 Optimisation tokens** → si 1-4 satisfaits

## Next steps — Phase E2

- **Session-manager optimisé** : spawn par projet + context mapping + cwd correct
- **Vault injection per-project** : plutôt que juste global
- **Token burn detection** : getCtxPct() continu → auto-summary → auto-restart sans demander
- **LaunchAgent install** : `scripts/install-daemon.sh` + plist KeepAlive=true

## Contacts / Escalade

- Malik : récepteur Telegram (routage master daemon)
- Peter vault : agent synthèse (Idriss 🌙 21h05, Léonor 🔭 vend 22h)
- Claude Code (toi) : répondeur Telegram + developer projet

---

**Mémo** : cette session a été spawned **sans contexte préalable** (pure Telegram message). La vault et claude-mem doivent suffire à récupérer état + décisions. Si Missing Critical Info → demande Malik via Telegram.
