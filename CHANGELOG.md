# Changelog

All notable changes to `claude-atelier` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning policy

- **MAJOR** — breaking change to an absolute rule (anti-hallucination, secrets, rule hierarchy)
- **MINOR** — new satellite, new stack, new CLI command, new opt-in feature
- **PATCH** — wording fix, typo, broken link, dependency bump

---

## [Unreleased]

---

## [0.22.0-preview.0] — 2026-04-24

### Added — API programmatique `applyProfile()` (preview)

**API programmatique** pour l'intégration `@paperclipai/plugin-atelier` :
- `applyProfile({ cwd, profile, mergeStrategy, dryRun })` — injecte skills, hooks, settings et mcp dans un worktree
- Presets `full` / `lean` / `review-only` dans `src/profiles/index.js`
- Deep merge `.claude/` selon 4 règles Paperclip (settings, hooks/agents, mcp, skills)
- Préfixe `atelier-` automatique sur les skills injectés

**CLI `apply`** :
- `claude-atelier apply --profile <name> --cwd <path> --yes --dry-run --merge <strategy>`
- Délègue entièrement à `applyProfile()` — zéro logique dupliquée

**Module `src/merge.js`** :
- `mergeSettings` — deep merge JSON, winner configurable
- `mergeMcpServers` — merge par clé mcpServers
- `mergeFileDirectory` — union par nom de fichier avec collision warning
- `mergeSkills` — union stricte avec préfixe atelier-
- 14 tests unitaires dans `test/merge.js`

**Export programmatique** :
- `index.js` : `export { applyProfile, PROFILES }`
- `package.json` : champs `main` et `exports` ajoutés

> **Preview** — API stable, pas encore utilisée en production Paperclip.
> Tag npm : `preview` (pas `latest`).

---

## [0.21.26] — 2026-04-22

### Added — MCP GitHub + Loop Copilot finalisé

**MCP GitHub** : nouveau serveur MCP intégré dans settings.json
- Outils : `get_pull_request`, `request_copilot_review`, `create_pull_request`
- Auth automatique via `gh` CLI (OAuth Copilot)
- Remplace les fallbacks bash pour manipuler les PRs

**Skill `copilot-loop` finalisé** :
- Vérification MCP des reviews Copilot (avec fallback bash)
- Lecture des commentaires inline via MCP ou API REST
- Génération automatique handoffs `docs/handoffs/[DATE].json`
- Polling configurable + auto-merge après validation

**Skill `review-copilot` finalisé** :
- Étape 5 : sélection du modèle Copilot (GPT-5.4 recommandé)
- Instructions UI pour forcer le modèle via le sélecteur GitHub
- Automatisation copilot-loop après création de PR

### Changed — Métadonnées npm + README

- Description mise à jour : "Framework complet Claude Code: 30 agents, 18 skills..."
- Keywords ajoutés : `copilot`, `github`, `mcp`, `review-automation`
- README : section "Loop Copilot autonome" expliquant le flux complet
- Comptage agents : 30 (mise à jour depuis 14), skills : 18 (depuis 16)

---

## [0.21.24] — 2026-04-20

### Added — Agent La Bise 🌬️ + Copilot Code Review

**Agent La Bise** : 5e agent nommé, coordonne les échanges inter-LLM (GPT-4o, Mistral, Ollama local).
- Skill `/la-bise` : brief compact ≤ 500 tokens, prompt copier-coller, intégration des réponses
- Double sens : vent léger (Mistral fait rage, La Bise trouve sa place) + bise entre Claude et GPT (ni fusion, ni silence)
- Ajouté dans `website/docs/agents.md` et README

**Copilot Code Review** automatique sur les PRs :
- Ruleset "Copilot review for default branch" activé (3 règles · 1 branche)
- Automated code reviews on push → déclenché sur toute PR ouverte vers `main`

---

## [0.21.3] — 2026-04-17

### Added — Extension 20 langages (16 nouveaux satellites)

**16 nouveaux satellites** avec persona féminine, frontmatter YAML, 8 sections standard (60-100 lignes) :

- Systèmes : `c.md` (Clara 🔧), `cpp.md` (Célia ⚙️), `rust.md` (Roxane 🦀), `assembly.md` (Astrid 🔩), `ada.md` (Ada 👑)
- Managés : `csharp.md` (Carmen 🎵), `php.md` (Phoebe 🐘), `go.md` (Gaëlle 🦫), `perl.md` (Perla 🐪), `visual-basic.md` (Violette 💜)
- Scientifique/spéciaux : `sql.md` (Selma 🗄️), `r.md` (Rosalie 📊), `fortran.md` (Florence 🔬), `matlab.md` (Mathilde 📐), `delphi.md` (Daphné 🏛️), `scratch.md` (Sofia 🧩)

### Changed — Amélioration 4 satellites existants

- **`python.md`** : uv (100x pip), free-threaded 3.13, bandit+pip-audit, pyright, hypothesis
- **`java.md`** : Virtual Threads Java 21+, Structured Concurrency JEP 505/506, Testcontainers, Find Security Bugs
- **`javascript.md`** : Biome (remplace ESLint+Prettier), Bun production-ready, Vitest, TypeScript 6, Node.js 22+
- **`ios-xcode.md`** : Swift 6 strict concurrency, Swift Testing framework, SwiftData, Observation framework

### Changed — Intégration

- **`CLAUDE.md §10`** : 26 stacks listés (vs 10 avant)
- **`routing-check.sh`** : détection auto C/C++, Rust, Go, PHP, C#, Ada + frameworks (gin/fiber/axum/actix)
- **`context7-mapping.md`** : 14 nouvelles entrées langages
- **`hooks-manifest.json`** : SHA resynchronisé

### Fixed — Corrections post-review Copilot

- Go : HPKE ≠ post-quantum (claim faux corrigé) + `go test -race` ajouté
- Rust : `cargo vet` ajouté (supply chain)
- C++ : "C++26 disponible" → "en finalisation, support compilateur partiel"
- routing-check.sh : regex C# élargie (`\.cs\b` + `Program\.cs`)

### Changed — Mise en avant du « contexte dynamique du Context7 »

- **README** : la promesse produit met maintenant en avant le **contexte dynamique du Context7** dans le hero, le tableau "Killer bundle" et les sections FR/EN.
- **`docs/methodology.md`** : la mécanique `§0 (Phase + Stack) → context7-mapping.md` est désormais formulée explicitement comme une discipline d'ingénierie de contexte, pas juste comme un détail de satellite.

### Added — Séréna, chef designer senior + MCP magic (21st.dev)

- **`src/skills/design-senior/SKILL.md`** : nouveau skill Séréna — flow complet (vérif UI/UX Pro Max, onboarding clé API magic, design-first avant toute implémentation UI).
- **`hooks/detect-design-need.sh`** : hook `UserPromptSubmit` — 30+ keywords design (charte, landing page, ui, ux, shadcn…). Propose `/design-senior` avec throttle session-scoped (flag `/tmp/` par hash de session).
- **`src/templates/.mcp.json`** : template MCP avec `qmd` + `magic` (`@21st-dev/magic@latest`, clé via `${MAGIC_API_KEY}`).
- **`src/templates/.env.example`** : guide clé API usage 21st.dev (`an_sk_...`, free tier 100 uses, gitignored).
- **`bin/init.js`** : étapes 7 (merge `.mcp.json`) + 8 (copie `.env.example`) ajoutées à l'init.
- **`src/skills/atelier-setup/SKILL.md`** : étape 5 (Séréna + magic), renumérotation BMAD→6, QMD→7, Résumé→8.
- **Architecture deux clés distinctes** : clé MCP connexion (dans `~/.claude.json`, non critique) vs clé API usage `an_sk_...` (dans `.env`, gitignored, facturation 21st.dev).
- **40/40 tests passent** (`node test/hooks.js`).

---

## [0.20.0] — 2026-04-14

### Fixed — Détection modèle + durcissement `reviewedRange` (Copilot v5)

**Référence** : commit `e1b2a20` (Malik) + durcissement `validate-handoff.js` + `handoff-draft.sh`.

- **`hooks/routing-check.sh`** : priorité `live` (model depuis le JSON du hook) > `transcript` (`Set model to`) > `cache` (`/tmp/claude-atelier-current-model`). Affiche `[ROUTING] source modèle: live|transcript|cache`. Avertissement explicite si source = cache (stale possible). **Ferme le bug** : je prétendais `claude-sonnet-4-6` dans mon horodatage alors que la session avait basculé sur Opus 4.6[1m] via `/model default`.
- **`test/validate-handoff.js`** : nouveau critère anti-triche — `reviewedRange.to` DOIT correspondre au **premier commit d'intégration réel** du fichier (détecté via `git log --follow` + inspection du contenu à ce sha). Ferme la faille "bourrer la section Intégration d'un vieux handoff pour truquer le to-sha".
- **`scripts/handoff-draft.sh`** : résout `reviewedRange` en SHAs stables via `git rev-parse` à la génération (plus robuste face aux alias git).
- **`scripts/handoff-debt.sh`** : avant d'accepter un handoff comme "intégré", passe par `node test/validate-handoff.js` — si invalide, skip. Verrouille la cohérence runtime/validator.
- **Manifest hooks** mis à jour (inputs `routing-check` incluent maintenant `model` depuis le JSON du hook).

### Note release npm

Première release après la séance §25 HANDOFF-ENFORCEMENT (0.15.0 → 0.20.0). Le registry npm était sur 0.5.0 — saut de 15 versions. Les entrées 0.6.x → 0.15.0 sont documentées dans les tags git (pas dans npm pour cause de non-publication).

---

## [0.19.0] — 2026-04-14

### Fixed — Durcissement §25 `reviewedRange` (bug structurel Copilot v4)

**Référence** : review Copilot dans `docs/handoffs/2026-04-14-lot4-enforcement-ergonomie.md` section "## Réponse de :".

**Bug fermé** : *« Si je prends un vieux handoff, que je lui ajoute aujourd'hui 120 caractères d'intégration creuse, puis que je committe, ce fichier devient le dernier handoff intégré, son SHA devient mon commit actuel, et la dette est recalculée depuis ce commit de handoff, pas depuis le vrai range reviewé. »* → **conformité documentaire fictive** possible avant ce fix.

**Fix livré** :

- **`docs/handoffs/_template.md`** : nouveau champ frontmatter `reviewedRange: <sha-from>..<sha-to>` obligatoire.
- **`scripts/handoff-debt.sh`** : la dette se calcule désormais depuis `reviewedRange.to` du handoff (plus depuis le sha du commit qui a touché le fichier). Si `reviewedRange` absent ou shas invalides → le handoff est **rejeté** (pas de conformité par défaut).
- **`test/validate-handoff.js`** : exige `reviewedRange` au format `sha..sha` avec les 2 shas réellement présents dans `git cat-file`.
- **`scripts/handoff-draft.sh`** : auto-remplit `reviewedRange: <last-integrated-sha>..HEAD-now` à la génération du draft.
- **Handoffs récents patchés rétroactivement** : `lot1-a-3-enforcement-25.md` (`5822f0e..090d96d`), `lot4-enforcement-ergonomie.md` (`090d96d..e5f050e`).

**Fix secondaire (rappel §25 ciblé)** :

- **`hooks/guard-commit-french.sh`** : le rappel `§25 : commit sans tag` ne s'affiche plus à chaque `feat:`/`fix:` — désormais **uniquement si** (a) diff staged > 50 lignes OU (b) dette déjà dépassée. Évite l'usure du signal (Copilot v4 : « trop fréquent, va s'user »).

**Angle encore ouvert** (identifié par Copilot, reporté à 0.20.0) :

- Le validateur ne vérifie pas encore que les fichiers listés dans `### Fichiers à lire` existent au sha `reviewedRange.to`. À durcir.
- Pas de check de similarité entre handoffs (détection de bourrage par copier-coller d'un handoff ancien).

---

## [0.18.0] — 2026-04-14

### Added — Lot 4 HANDOFF-ENFORCEMENT (ergonomie de sortie)

- **Skill `/handoff-debt`** (`.claude/skills/handoff-debt/SKILL.md`) : affiche la dette §25 live depuis git, liste les commits non reviewés, génère un draft via `handoff-draft.sh`.
- **`scripts/handoff-draft.sh`** : génère un handoff pré-rempli dans `docs/handoffs/YYYY-MM-DD-<slug>.md` — contexte + commits + fichiers à lire extraits du range git. Les sections `Question précise` et `Intégration` restent à remplir par Claude/user.
- **`hooks/guard-commit-french.sh`** : rappel doux (pas bloquant) si commit `feat:`/`fix:`/`refactor:` sans tag `[needs-review]` ou `[no-review-needed: <raison>]`. Point d'entrée visible pour la convention accountability.
- **`scripts/pre-push-gate.sh`** : étape 6b valide désormais le handoff **intégré** (obtenu via `handoff-debt.sh --json`) plutôt que le plus récent sur disque — évite qu'un draft local non-commité bloque la gate.

### Anti-pattern retenu

- Pas de hook bloquant sur l'absence de tag `[needs-review]` : Copilot a noté "conditionnel" — la friction doit venir du push, pas du commit. Le hook se contente de rappeler.

---

## [0.17.0] — 2026-04-14

### Added — Lot 2 + Lot 3 HANDOFF-ENFORCEMENT §25 (enforcement physique)

**Référence** : `docs/HANDOFF-ENFORCEMENT.md` sections 9.2-9.4 (corrections anti-triche Copilot v2+v3).

**Lot 2 — Visibilité permanente** :

- **`hooks/routing-check.sh`** : bandeau `[HANDOFF DEBT §25]` injecté après l'horodatage à chaque message utilisateur si dette dépassée. Source : `handoff-debt.sh --json`.

**Lot 3 — Contrainte dure (triple gate anti-bypass)** :

- **`test/validate-handoff.js`** : validation **structurelle** d'un handoff (5 critères, aucun par nombre de mots). Sections obligatoires, texte réel non-template, bloc de fichiers à lire. `npm run validate:handoffs`.
- **`scripts/version-gate.js`** : bloque `npm version` si dette dépassée. Ajouté en `preversion` dans `package.json`.
- **`scripts/install-git-hooks.sh`** : installe `.git/hooks/pre-push` physique qui appelle `pre-push-gate.sh` en direct (impossible à bypass par composition shell — seul `--no-verify` passerait, interdit par §13+§22).
- **`scripts/pre-push-gate.sh` étape 6 enrichie** : en plus du check de dette, valide structurellement le dernier handoff via `validate-handoff.js`.

**Bootstrap note** : le git hook physique n'est pas installé par ce commit — il doit être lancé manuellement via `bash scripts/install-git-hooks.sh` après ce push. Les pushes suivants seront alors bloqués par git directement, pas par ma composition shell.

**Handoff associé** : `docs/handoffs/2026-04-14-lot1-a-3-enforcement-25.md` (intégration remplie avec les 3 rounds Copilot précédents).

---

## [0.16.0] — 2026-04-14

### Fixed — Lot 1 HANDOFF-ENFORCEMENT : arrêter le mensonge système §25

**Minimum non négociable demandé par Copilot v3** (implémentation, pas spécification) :

- **`hooks/routing-check.sh`** : retiré le `echo "$CURRENT_HEAD" > "$LAST_REVIEW_FILE"` (ligne 140) qui acquittait automatiquement §25 à l'affichage du rappel.
- **`hooks/guard-review-auto.sh`** : retirés les 3 resets `rev-parse HEAD > last-reviewed-commit` + resets des compteurs `LINES_FILE`/`COMMITS_FILE`. Le hook affiche le rappel, **mais n'acquitte plus jamais la dette**.
- **`scripts/handoff-debt.sh`** (nouveau) : calcule la dette §25 **depuis git** (jamais depuis un JSON éditable). Source de vérité = dernier handoff `docs/handoffs/*.md` avec section `## Intégration` > 100 caractères + sha du commit qui l'a intégré + `git log <sha>..HEAD --shortstat`.
- **`scripts/pre-push-gate.sh` étape 6/6** : ajoute un check `handoff debt` qui bloque le push si dépassement de seuils (100 lignes / 3 commits feat+fix / 7 jours).
- **`test/doctor.js`** : nouvelle catégorie `handoffs` avec check `handoffs/debt` live depuis `handoff-debt.sh --json`. Doctor passe à **28 checks sur 10 catégories**.
- **Reset de la dette = `/integrate-review` uniquement** (via remplissage `## Intégration` du handoff). Aucun autre chemin ne reset la dette.

**Reste à faire** (Lots 2-4 du doc `HANDOFF-ENFORCEMENT.md`) : bandeau visible dans hook, doctor warn freshness, validation qualité handoff, pre-commit, `/integrate-review` formalisé, ergonomie.

---

## [0.15.0] — 2026-04-14

### Fixed — §1 horodatage non négociable + actionlint

- **`CLAUDE.md` §1 réécrit** : règle impérative ("Ta réponse DOIT commencer par cette ligne, AVANT tout texte ou tool call") au lieu d'un "ouvrir chaque réponse" ambigu. **Cause racine identifiée** : le hook `routing-check.sh` injecte déjà l'horodatage dans le contexte → biais "c'est déjà fait, pas ma responsabilité". Le fix lève l'ambiguïté.
- **`test/doctor.js`** : nouveau check `ci/actionlint` qui valide tous les `.github/workflows/*.yml` (warn si actionlint absent — `brew install actionlint`). Doctor passe à **27 checks sur 9 catégories**.
- **`.github/workflows/ci.yml`** : nouveau job `actionlint` via `docker://rhysd/actionlint:latest` — **ferme l'angle mort qui a causé le fail CI précédent** (workflow YAML jamais validé localement avant push).

---

## [0.14.0] — 2026-04-14

### Added — README EN complet (parité avec FR)

- **README** : 4 sections EN ajoutées (Parallelization, Inter-LLM Review, Structure, Security) — l'EN était amputé de ces sections.
- **README** : section CI/CD EN enrichie (mention Node matrix, shellcheck, doctor artifact).
- **README FR** : Structure mise à jour (10 hooks au lieu de 7, 14 skills au lieu de 13, mention `hooks-manifest.json`, `update-security.js`, `test/*` enrichi, doctor 26 checks).

---

## [0.13.0] — 2026-04-14

### Changed — CI GitHub Actions enrichi

- **`.github/workflows/ci.yml`** : `npm test` complet (lint + doctor + hooks) au lieu de `npm run lint` seul. Matrice **Node 18 / 20 / 22** (couvre `engines.node: >=18`). Cache npm activé.
- **Job `shellcheck`** dédié : lint `hooks/*.sh` + `scripts/*.sh` avec `--severity=warning` (au lieu de `pre-push-gate.sh` seul).
- **Artifact** : output JSON du doctor uploadé par version Node (rétention 7j) — utile pour debug d'un fail CI.

---

## [0.12.0] — 2026-04-14

### Added — shellcheck dans le doctor

- **`test/doctor.js`** : nouveau check `hooks/shellcheck` qui run `shellcheck --severity=warning` sur tous les `hooks/*.sh` + `scripts/*.sh`. Si shellcheck pas installé → warn (`brew install shellcheck`).
- **`hooks/_parse-input.sh`** : annotation `# shellcheck disable=SC2034` (les variables sont consommées par les scripts qui sourcent — shellcheck ne peut pas le détecter).
- Doctor passe maintenant à **26 checks**, tous verts sur le repo source.

---

## [0.11.0] — 2026-04-14

### Added — `npm run doctor` enrichi (25 checks structurés)

- **`test/doctor.js` réécrit** : 25 checks sur 8 catégories (`env`, `core`, `satellites`, `config`, `security`, `hooks`, `docs`, `refs`, `git`). Inspiré du `claw doctor` (claw-code).
- **Mode `--json`** : `node test/doctor.js --json` → output JSON structuré (`{healthy, total, byStatus, byCategory, results, mode, timestamp}`) — exploitable en CI.
- **Nouveaux checks** : version Node ≥ 18, git installé, `package.json` valide, hooks exécutables (helpers `_*.sh` ignorés), `hooks-manifest.json` valide + cohérent, `PHILOSOPHY.md`, `PARITY.md`, `SECURITY.md`, `LICENSE` présents.
- **Détection self-repo** : le doctor distingue le repo `claude-atelier` lui-même d'un projet utilisateur installé.

---

## [0.10.0] — 2026-04-14

### Added — `.claude/hooks-manifest.json` typé

- **`.claude/hooks-manifest.json`** : manifeste typé de tous les hooks (10 entrées). Chaque hook documenté avec : type (PreToolUse, PostToolUse, SessionStart, UserPromptSubmit), trigger, inputs, outputs, exit codes, règle CLAUDE.md référencée, test associé. Inspiré du modèle `PluginHooks` typé de claw-code.
- **`test/lint-hooks-manifest.js`** : vérifie la cohérence manifest ↔ filesystem (chaque hook listé existe physiquement et inversement, stats.total cohérent). Ajouté à `npm run lint`.
- **`CLAUDE.md` §11** : règle "tout hook → MAJ `test/hooks.js` + `.claude/hooks-manifest.json`".

---

## [0.9.0] — 2026-04-14

### Added — `PARITY.md` racine

- **`PARITY.md`** : tableau complet feature par feature claude-atelier vs Claude Code natif. 12 catégories (config, hooks, skills, orchestration, MCPs, sécurité, sessions, tokens, stacks, autonomie, inter-agents, CLI). Couverture résumée : **33 ajouts ➕, 5 extensions 🔧, 6 hors-scope ❌**.
- **README** : lien `📊 Parity` ajouté dans la barre de hero.

---

## [0.8.0] — 2026-04-14

### Added — `PHILOSOPHY.md` racine

- **`PHILOSOPHY.md`** : document 1 page qui pose les 5 partis pris de l'atelier (markdown source de vérité, FR-first, sécurité non négociable, théâtre mémorisable, token-conscient). Inspiré du `PHILOSOPHY.md` de [claw-code](https://github.com/ultraworkers/claw-code) — vision adaptée à un package de configs (pas un client custom).
- **README** : lien `📜 Philosophy` ajouté dans la barre de liens du hero.

---

## [0.7.0] — 2026-04-14

### Added — Théâtre stack complet (11 figures nommées)

- **7 nouveaux agents nommés** sur les stacks JS/TS, Python, Java, React+Vite, Firebase, Docker, Ollama : Nael, Anthonio, Marcel, Nicolas & Fazia, Camille, Pascal, Jeffrey. Chaque stack `.md` ouvre par une mise en scène avec voix et personnalité.
- **`SECURITY.md`** : politique réelle (versions supportées auto-syncées depuis `package.json`), guide de signalement via GitHub Issues.
- **`scripts/update-security.js`** : sync automatique du tableau des versions, appelé par `pre-push-gate.sh` à chaque push.
- **`CLAUDE.md` §2** : limite stricte ≤ 25 mots entre tool calls, ≤ 100 mots pour réponse finale.
- **`CLAUDE.md` §15** : compaction à ~60% (pas attendre 75-98%).
- **`CLAUDE.md` §17** : todos persistants hors flux messages (survivent aux compactions).

---

## [0.4.3] — 2026-04-13

### Fix critique — CLAUDE.md non écrasé lors des mises à jour

#### Fixed

- **`bin/init.js`** : `CLAUDE.md` existant n'est plus jamais écrasé lors d'un `init` ou d'une mise à jour. Message `[SKIP]` affiché. Les fichiers satellites (`autonomy/`, `security/`…) sont toujours mis à jour normalement.

---

## [0.4.2] — 2026-04-13

### Night-mode — autonomie complète + watchdog CAS F

#### Changed

- **Push autonome autorisé la nuit** (`night-mode.md`, `CLAUDE.md §23`) : `git push` autorisé après gate verte — Claude pousse sans intervention humaine. Suppression de la règle "ne pas pusher la nuit".
- **Procédure night-mode** : la commande de lancement inclut désormais le cycle commit → gate → push automatique.

#### Added

- **CAS F watchdog** (`night-mode.md`) : détection erreur API Anthropic 500 — iMessage + Dispatch envoyés, aucune interaction avec VSCode, anti-spam à la prochaine exécution.
- **Protocole REPRISE étendu** : le mot-clé `relance` (seul) est reconnu comme déclencheur, au même titre que `REPRISE suite à la limite de quota`.

---

## [0.3.11] — 2026-04-13

### Fix robustesse — 5 points review Copilot (tous traités)

#### Fixed

- **Fix 1 — Portabilité `stat` macOS → Linux** (`routing-check.sh`) : `stat -f %z` (macOS) suivi de `|| stat -c %s` (Linux) — monitoring de session actif sur les deux OS. Même fix pour `stat -f %m` (handoff date) → `|| stat -c %Y`
- **Fix 2 — Checkpoint §25 dans `.git/`** (`routing-check.sh` + `guard-review-auto.sh`) : `LAST_REVIEW_FILE` déplacé de `/tmp/` vers `$REPO_ROOT/.git/claude-atelier-last-reviewed-commit` — résiste aux reboots, reste par-repo
- **Fix 2 (suite) — Fallback `HEAD~30`** : plage élargie de 10 à 30 commits si le checkpoint est absent/invalide
- **Fix 3 — Exclusions QMD-first** (`guard-qmd-first.sh`) : ajout de `README\.md$`, `/handoffs/`, `/templates/` — Claude peut lire directement les fichiers à structure exacte (handoffs, templates, README)
- **Fix 4 — Session hash anti-collision** (`routing-check.sh`) : clé enrichie avec `REPO_ROOT` → `echo "TRANSCRIPT|REPO_ROOT" | cksum` — deux projets ouverts simultanément ne peuvent plus partager le même flag de session
- **Fix 5 — Haiku regex : garde négatif** (`routing-check.sh`) : ajout d'un `grep -qiE "(erreur|bug|debug|crash|fail|broken|pourquoi|why|cause|fix|résoudre|bloquant|deadlock|stacktrace|flaky|architecture)"` — si le prompt contient un signal de complexité, Haiku n'est pas suggéré même si un mot d'exploration est présent

---

## [0.3.10] — 2026-04-13

### Mohamed 📋 — Agent review inter-LLM + narration silencieuse

#### Added

- **Mohamed 📋** — agent review inter-LLM. Figure du skill `/review-copilot`. Instruit le dossier : commits, diff, question précise, handoff Copilot/GPT. *"Un code non challengé n'est pas fini. C'est une bombe à retardement."*
- **README FR** — Mohamed ajouté dans la table des agents avec storytelling + citation
- **Tous les triggers Challenger** (`guard-review-auto.sh`) — rebrandés `[MOHAMED]` avec sa voix narrative

#### Changed

- `src/skills/review-copilot/SKILL.md` — `figure: Greffier` → `figure: Mohamed`, storytelling ajouté
- `hooks/routing-check.sh` — trigger §25 cross-session rebrandé `[MOHAMED]`

#### Fixed (feedback)

- **Narration silencieuse** : les steps des skills ne sont plus annoncées à voix haute. Livrable direct, zéro narration interne visible.

---

## [0.3.9] — 2026-04-13

### Fix §25 — Review cross-session (béton armé)

#### Fixed

- **Trou dans la raquette §25** : `guard-review-auto.sh` était aveugle aux commits des sessions précédentes (il ne fire que PostToolUse `git commit` dans la session courante). Si les commits sont dans une session antérieure → le trigger ne partait jamais.

#### Added

- **`routing-check.sh` — REVIEW CHECK §25** : au premier message de chaque session, scanne `git log` pour détecter des commits `feat:` / `refactor:` non reviewés depuis le dernier checkpoint. Fire si `feat/refactor > 0` OU `lignes > 100`. Émet `🔍 [REVIEW §25]` avec liste des commits + appel à `/review-copilot`. Utilise un flag session-scoped (`/tmp/...-checked-${SESSION_HASH}`) pour ne pas spammer.
- **Checkpoint cross-session** (`/tmp/claude-atelier-last-reviewed-commit`) : stocke le HEAD au moment du dernier trigger review. `routing-check.sh` compare à ce checkpoint à chaque démarrage de session.
- **`guard-review-auto.sh`** : écrit le checkpoint quand il fire (VOLUME ≥ 100, FEATURE_DONE, COMMITS ≥ 10) — les deux couches restent synchronisées.

---

## [0.3.8] — 2026-04-13

### Horodatage machine + modèle en tête de réponse

#### Added

- **Hook horodatage** (`routing-check.sh`) — injecte `[HORODATAGE] YYYY-MM-DD HH:MM:SS | model` à chaque message UserPromptSubmit (heure machine via `date`, pas serveurs Anthropic)
- **§1 CLAUDE.md** — règle mise à jour : Claude doit ouvrir chaque réponse avec `[YYYY-MM-DD HH:MM:SS | model]` en utilisant la valeur injectée par le hook

#### Changed

- **README FR+EN** — table des rails mise à jour : 11 → 14 rails documentés (QMD-first, session length, Haiku auto-suggestion)
- **Structure README** — hooks : 6 → 7

---

## [0.3.7] — 2026-04-13

### Token economy — session length + Haiku routing

#### Added

- **Hook session length** (`routing-check.sh`) — détecte la taille du transcript JSONL à chaque message :
  - ≥ 300KB : avertissement `⚠️ [SESSION] Contexte long → /compact recommandé`
  - ≥ 600KB : alerte forte `🔴 [SESSION] Contexte très long` avec suggestion `/compact`
- **Suggestion Haiku automatique** (`routing-check.sh`) — si le prompt est court (< 200 chars) et contient des mots d'exploration (`cherche`, `liste`, `grep`, `audit`, `scan`, `résumé`...), suggère `/model haiku` (10x moins cher qu'Opus)

---

## [0.2.0] — 2026-04-12

### Phase 5 — Skills, méthodologie & token routing (completed 2026-04-12)

#### Added (phase 5)

- `src/skills/` — 11 slash commands as SKILL.md files:
  `/atelier-help` (oracle + catalog CSV), `/atelier-setup` (7-step onboarding),
  `/review-copilot` (handoff Copilot/GPT), `/integrate-review` (closes inter-LLM loop),
  `/angle-mort` (blind-spot review), `/audit-safe` (5-step security audit),
  `/night-launch` (night-mode preflight), `/atelier-doctor` (27-check diagnostic),
  `/token-routing` (Haiku/Sonnet/Opus routing guide), `/bmad-init` (installs BMAD-METHOD),
  `/qmd-init` (installs QMD if ≥ 5 .md files)
- `src/skills/atelier-help/atelier-help.csv` — machine-readable catalog (code, skill,
  display-name, description, phase, required)
- `docs/methodology.md` — complete 9-section framework doc (Token Routing, Permissions,
  Git Workflow, Night-Mode, Review Inter-LLM, Security, Multi-Stack, Orchestration,
  Slash Commands)

#### Changed (phase 5)

- `src/fr/CLAUDE.md §15` — model alert now suggests `/model sonnet` / `/model haiku`
  with the exact command instead of vague "recommend a switch"
- `src/fr/CLAUDE.md §18` — auto-montée + auto-descente effort levels, anti-flapping rule
  (no change > 1 per message)
- `src/fr/CLAUDE.md §25` — automatic Copilot review trigger added (feature done, critical
  bug fix, 100+ lines changed, 3+ failed attempts)
- `src/fr/autonomy/night-mode.md` — watchdog v4 (screenshot + auto-click Allow +
  iMessage), v5 adds Étape 0 pgrep check (terminate silently if no Claude process),
  comparison table of 3 scheduling methods
- `bin/init.js` — copies `src/skills/` into `.claude/skills/` during installation
- `package.json` — added `test/` to `files` array (fix: CLI lint+doctor would crash
  after npm publish)
- `src/skills/token-routing/SKILL.md` — documents `/model` command for mid-session
  model switching

### Phase 4 — CLI, CI & inter-LLM (completed 2026-04-12)

#### Added (phase 4)

- `.github/workflows/ci.yml` — GitHub Actions CI: `npm run lint` +
  `shellcheck scripts/pre-push-gate.sh` on push main and PRs
- `test/doctor.js` — 27-check health verification (CLAUDE.md length,
  21 satellite files present, settings.json valid, .gitignore/.claudeignore,
  gate executable, markdown refs, zero _legacy, git hooks).
  Dual mode: source repo vs installed project.
- `bin/init.js` — real installer: copies 32 files to `.claude/`,
  merges `settings.json` intelligently (union allow/deny lists, preserves
  existing values), copies templates to project root, copies scripts.
  Supports `--global`, `--lang fr|en`, `--dry-run`.
- `src/en/README.md` — EN strategy placeholder. FR-only for v0.2.0,
  EN parity planned for v0.3.0.
- `docs/handoffs/` — inter-LLM handoff system (Claude ↔ Copilot/GPT):
  convention, template, first real handoff (P1→P4 review request).
  Structured markdown exchange, versionable, QMD-indexable.

#### Changed (phase 4)

- `bin/cli.js` — `init` and `doctor` commands now functional (were stubs).
  `main()` is now async. Help text updated.
- `package.json` — added `doctor` script, `test` now runs `lint + doctor`

### Added (validation tooling — pre-P4)

- Real validation entrypoints:
  - `npm run lint` checks markdown references + CLAUDE.md length
  - `claude-atelier lint` runs the same from CLI

### Fixed (validation tooling — pre-P4)

- CLI help advertises `lint` as implemented
- `src/fr/security/pre-push-gate.md` points to real script path

### Phase 3 — Satellites & modernité (completed 2026-04-12)

#### Added (phase 3 — ecosystem)

- `src/fr/ecosystem/skills.md` — skills system (local + plugin), when to
  use, when not to, hygiene (max 2-3 simultaneous), creating a skill
- `src/fr/ecosystem/plugins.md` — marketplace plugins, discipline,
  understanding plugin suggestions (MANDATORY vs best-practice)
- `src/fr/ecosystem/hooks.md` — Claude Code hooks (SessionStart,
  UserPromptSubmit, PreToolUse, PostToolUse, Stop), pitfalls (false
  positives, context saturation)
- `src/fr/ecosystem/memory-system.md` — auto-memory system
  (`~/.claude/projects/*/memory/`), types (user/feedback/project/reference),
  read/write discipline
- `src/fr/ecosystem/qmd-integration.md` — how Claude should use QMD
  (when to query, score filtering, invocation patterns)

#### Added (phase 3 — orchestration)

- `src/fr/orchestration/modes.md` — Fork/Teammate/Worktree details
- `src/fr/orchestration/subagents.md` — **new**: complete catalog of
  available subagents (Explore, Plan, feature-dev:*, code-simplifier,
  superpowers:*, plugin agents) with cost indicators
- `src/fr/orchestration/parallelization.md` — when to parallelize and
  patterns (fork exploratoire, feature parallèle, audit croisé)
- `src/fr/orchestration/models-routing.md` — model per role table
  (Haiku/Sonnet/Opus), when to escalate
- `src/fr/orchestration/spawn-rules.md` — 5 fundamental spawn rules,
  prompt template, limits
- `src/fr/orchestration/mcp-lifecycle.md` — MCP loading/purging, context
  window impact (200k → ~70k)

#### Added (phase 3 — security)

- `src/fr/security/secrets-rules.md` — absolute principle, forbidden files
  list, suspect patterns regex, manual audit commands
- `src/fr/security/pre-push-gate.md` — gate documentation (5 steps, stack
  auto-detection table, git hook installation)
- `src/fr/security/emergency.md` — secret leak procedure (revoke →
  filter-branch → force push → notify), timeline, post-mortem template
- `scripts/pre-push-gate.sh` — **finally shipped**: the pre-push gate
  script referenced since P1 §0, with stack auto-detection (node/python/
  maven/gradle), `--quick` mode, colored output, strict bash
- `src/templates/.claudeignore` — template for files Claude must never read
- `src/templates/.gitignore` — multi-stack .gitignore template

#### Added (phase 3 — autonomy)

- `src/fr/autonomy/permission-modes.md` — 5 permission modes with rules,
  recommendations per context, anti-patterns
- `src/fr/autonomy/night-mode.md` — **canonical source** (was duplicated
  between autonomy and orchestration), specs template, pitfalls, use cases
- `src/fr/autonomy/loop-watchers.md` — **canonical source** (was duplicated),
  syntax, discipline, anti-patterns

#### Changed (phase 3)

- `src/fr/CLAUDE.md` — all `_legacy.md` references replaced with structured
  satellite paths. File now at 145 lines (target ≤ 150).

#### Removed (phase 3)

- `src/fr/autonomy/_legacy.md` — replaced by 3 structured satellites
- `src/fr/orchestration/_legacy.md` — replaced by 6 structured satellites
- `src/fr/security/_legacy.md` — replaced by 3 structured satellites
- **All `_legacy.md` files are now gone.** Zero legacy debt remaining.

#### Fixed (phase 3)

- **Night-mode duplication eliminated.** Was duplicated between autonomy
  and orchestration. Now single canonical source in `autonomy/night-mode.md`.
- **`/loop` duplication eliminated.** Same fix, canonical source in
  `autonomy/loop-watchers.md`.

### Phase 2 — Core refactor (completed 2026-04-12)

#### Fixed (phase 2)

- **Contradiction §5 vs §12 resolved.** `§12 Code Review` used to demand
  « at least one critique even if the code seems correct », forcing Claude
  to violate `§5 Anti-hallucination`. Section removed from the template;
  empty `Problèmes identifiés` / `Angles morts détectés` are now a valid
  quality signal. `§5 prime` explicitly documented.
- **Broken `/docs/claude/*` references fixed.** All §13/§16/§19/§22/§23/§24
  cross-refs now point to real relative paths under `./security/_legacy.md`,
  `./orchestration/_legacy.md`, `./autonomy/_legacy.md`.
- **Legacy markdown lint issues cleared** in `src/fr/CLAUDE.md` (MD041,
  MD012, MD040, MD047, MD060).

#### Changed (phase 2)

- **`src/fr/CLAUDE.md` trimmed from 285 → 149 lines** (target ≤ 150).
  Sections §0–§25 preserved for stable referencing.
- **`§15 Token Management`** now points to `../templates/settings.json`
  instead of inlining an env block.
- **`§13 Git Workflow`** now explicitly states « jamais signer (pas de
  trailer `Co-Authored-By`) » — enforces the user's permanent preference.

#### Added (phase 2)

- `src/templates/settings.json` — single source of truth consolidating
  `env`, `permissions.allow`, `permissions.deny`, `preferences.maxBudgetUsd`.
  Strengthened denylist (`git reset --hard`, `git filter-branch`,
  `curl | sh` patterns); broadened allowlist (`pnpm`, `git log`, `npm ci`).
- `src/templates/project-structure.md` — extracted from former §9, with
  a « Quand ne pas utiliser ce template » section for opinionated frameworks.
- `src/stacks/javascript.md`, `python.md`, `java.md` — migrated from former §10.
- `src/stacks/react-vite.md`, `firebase.md`, `docker.md`, `ollama.md` —
  stubs reserving architecture slots, detailed content planned for P3.
- `src/fr/runtime/code-review.md` — extracted from former §12 with
  anti-patterns and context-to-load section.
- `src/fr/runtime/todo-session.md` — extracted from former §17.
- `src/fr/runtime/extended-thinking.md` — extracted from former §18 with
  a decision table for `low`/`medium`/`high` effort levels.

### Phase 1 — Foundation (completed 2026-04-11)

#### Added (phase 1)

- MIT `LICENSE`
- Root `.gitignore` (node_modules, secrets, OS files, Claude Code local state)
- `package.json` with semver `0.1.0`, `bin: claude-atelier`, `files` whitelist
- Bilingual FR/EN `README.md` with quickstart, target structure and phase roadmap
- `CHANGELOG.md` (this file) following Keep a Changelog
- `src/` scaffolding (fr, en, stacks, templates) with `.gitkeep`
- Legacy files relocated into `src/fr/**/_legacy.md`
- `QMD-config.md` relocated to `docs/qmd-user-guide.md` (no longer runtime)
- `bin/cli.js` skeleton (`--version`, `--help`, stubbed commands)

---

## [0.1.0] — 2026-04-11 (scaffolding)

Initial scaffolding commit. No functional code yet — infrastructure only.

[Unreleased]: https://github.com/malikkaraoui/claude-atelier/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/malikkaraoui/claude-atelier/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/malikkaraoui/claude-atelier/releases/tag/v0.1.0
