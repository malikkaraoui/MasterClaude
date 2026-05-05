# Décisions projet

> Géré par Peter via claude-atelier vault. Markdown vivant, pas document gravé.

## Décisions durables

### 2026-04-17 — Peter = agent mainteneur, pas dossier Markdown

- Contexte : risque de réduire Peter à un README enrichi sans valeur propre
- Décision : Peter doit avoir carte + graphe + mémoire vivante + tri inbox + stratégie de reprise
- Conséquence : implémentation incrémentale en 7 phases (A→G), Phase A livrée en v0.23.0
- À revalider si : scope trop lourd pour usage quotidien

### 2026-04-17 — Local-first, pas de cloud obligatoire pour le core

- Contexte : dépendances cloud bloquent l'usage offline et la confidentialité
- Décision : Peter core doit tourner sans service externe ; multimodal/cloud optionnel
- Conséquence : extraction via AST/regex local, cache SHA256 fichier, pas d'API IA obligatoire
- À revalider si : besoin de sémantique profonde sans GPU local

### 2026-03-15 — Pulse & Maestro multi-agents (v0.23.0)

- Contexte : orchestration multi-agents nécessite coordination et état partagé
- Décision : pouls.md comme registre de présence, Maestro §0 watcher pour supervision
- Conséquence : hooks Pulse + skill Maestro dans le framework, state visible en session
- À revalider si : trop de friction pour projets solo

### 2026-02-01 — Node.js pour hooks/scripts, Go pour proxy Ollama seulement

- Contexte : Go offre performance mais alourdit la maintenance pour les scripts quotidiens
- Décision : Node.js pour tout sauf l'ollama-proxy (performance réseau critique)
- Conséquence : stack cohérente, tests npm, pas de dualité Go/Node dans le repo principal
- À revalider si : besoin de perf critique hors proxy

### 2026-05-03 — website/docs/ est sous responsabilité Peter, pas une tâche ad hoc

- Contexte : la doc Vercel (`website/docs/`) était mise à jour manuellement, de façon discontinue, et non indexée par Peter
- Décision : `website/docs/*.md` fait partie du périmètre Peter (scan + manifest + stale detection). La routine commit/push/bump/publish inclut systématiquement une passe de mise à jour de `website/docs/`
- Conséquence : Peter doit scanner `website/docs/` et signaler quand des features sont commitées sans MAJ doc correspondante. La doc Vercel = source de vérité publique du npm ; elle doit refléter l'état réel du package
- À revalider si : le site Docusaurus migre vers un repo séparé

### 2026-05-05 — Séparation claude-atelier / MasterClaude

- **Contexte** : master daemon + Telegram ont fait dériver claude-atelier de sa cible core (harnais Claude Code npm)
- **Décision** :
  - `claude-atelier` (npm) = harnais Claude Code pur : hooks, Peter vault, skills, gate, Ollama. **Sans** master, **sans** Telegram
  - `MasterClaude` = nouveau projet forké depuis claude-atelier, contenant master daemon + Telegram + routing multi-projets
- **Actions immédiates** : exclure `bin/master.js`, `bin/telegram.js`, `src/master/`, scripts Telegram du package npm via `.npmignore`
- **Conséquence** : claude-atelier reste publiable npm, focalisé. MasterClaude = usage personnel avancé, pas sur npm
- **À revalider si** : MasterClaude prend de l'ampleur et mérite sa propre publication

---

### 2026-05-04 — Master daemon : architecture Claude Atelier comme sous-couche universelle

- **Décision** : Claude Atelier devient un runtime Master autonome, pas seulement un npm de config
- **Architecture** :
  ```
  Malik (Telegram)
       ↕
  [MASTER] claude-atelier daemon (LaunchAgent, KeepAlive)
       ├── Obsidian Vault /Users/malik/Vault/Malik/ (contexte global)
       ├── spawn sessions Claude Code par projet (cwd = repo projet)
       ├── monitor token burn → restart session avec summary
       └── Claude A / B / C ... (subagents projets)
  ```
- **Règles de contrôle** : le Master a tous les pouvoirs d'orchestration, mais Malik garde le contrôle ferme (commandes Telegram, budget, permission gates)
- **Capacités requises** :
  1. Boot automatique (LaunchAgent macOS, KeepAlive=true)
  2. Redémarre après shutdown machine
  3. Lance `claude` sessions dans le bon répertoire projet
  4. Détecte context burn → crée summary → relance session
  5. Route les messages Telegram vers le bon projet ou répond en Master
- **Conséquence** : le CLI `claude-atelier master start/stop/status` devient l'interface de contrôle. `bin/master.js` = nouveau entry point principal
- **À revalider si** : Anthropic sort une API sessions persistantes
