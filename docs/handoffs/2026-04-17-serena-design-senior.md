# Handoff Review — Séréna (Design Senior) + MCP magic 21st.dev

> Date : 2026-04-17
> Type : review
> Priorité : haute
> reviewedRange: 914aa5126e091e5cb9db6809d82a5d8060b7da92..ef0b878404f13dbb26e2d6fdc7516f2e7bad1461

---

## De : Claude (Sonnet 4.6)

### Contexte

Ajout d'un responsable design dans claude-atelier : **Séréna**, chef designer senior.
Elle s'active automatiquement quand l'utilisateur parle UI/UX/design/charte/landing page.
Intégration du MCP **magic** (21st.dev) pour les composants UI premium, et du skill
**UI/UX Pro Max** (upstream, non embarqué — option A délégation).

### Question précise

Le hook `detect-design-need.sh` et le skill Séréna sont-ils correctement intégrés dans le repo (throttle session-scoped, runtime sync, sécurité `.env`, packaging npm) ?

### Fichiers à lire

```text
hooks/detect-design-need.sh
src/skills/design-senior/SKILL.md
src/templates/.env.example
src/templates/.mcp.json
bin/init.js
.claude/hooks-manifest.json
test/hooks.js
```

### Contraintes / hors scope

Ne pas modifier l'architecture Séréna. Review uniquement — pas d'implémentation.

## Fichiers créés

| Fichier | Rôle |
|---|---|
| `src/skills/design-senior/SKILL.md` | Skill Séréna — flow complet : vérif outillage, onboarding clé, design-first |
| `hooks/detect-design-need.sh` | Hook UserPromptSubmit — 30+ keywords design, propose `/design-senior`, throttle 1x/session |
| `src/templates/.env.example` | Template `.env` avec guide clé API usage 21st.dev (`an_sk_...`) |
| `src/templates/.mcp.json` | Template MCP avec `qmd` + `magic` (clé via `${MAGIC_API_KEY}`) |

## Fichiers modifiés

| Fichier | Nature de la modif |
|---|---|
| `bin/init.js` | +37 lignes — étapes 7 (merge `.mcp.json`) + 8 (copie `.env.example`) |
| `.claude/settings.json` | Hook detect-design-need ajouté dans `UserPromptSubmit` |
| `.claude/hooks-manifest.json` | Entrée #12 detect-design-need, stats mises à jour (12 hooks, 8 warning-only) |
| `src/skills/atelier-setup/SKILL.md` | Étape 5 ajoutée (Séréna + magic), renumérotation 6-7-8 |
| `test/hooks.js` | +4 tests detect-design-need (total 40/40 passent) |

## Architecture des clés 21st.dev

Deux clés distinctes — point critique à valider :

| Clé | Fichier | Sensibilité | Usage |
|---|---|---|---|
| MCP connexion | `~/.claude.json` (en clair) | Faible | Connecter le MCP à Claude Code |
| API usage `an_sk_...` | `.env` (gitignored) | **Élevée** | Facturation 21st.dev, free tier 100 uses |

La commande `claude mcp add magic --scope user --env API_KEY="..." -- npx -y @21st-dev/magic@latest`
gère la clé MCP connexion. La clé API usage est dans `.env` localement.

## Points à reviewer

1. **Sécurité `.env`** — vérifier que `.gitignore`, `.claudeignore`, `.npmignore` excluent bien `.env` et `.env.*` (sauf `.env.example`). Actuellement OK dans les templates.

2. **init.js merge `.mcp.json`** — la stratégie est : template gagne si la clé n'existe pas, existing gagne sinon. Vérifier que c'est bien le comportement souhaité pour un utilisateur qui a déjà un `.mcp.json` avec d'autres MCPs.

3. **Hook detect-design-need** — le throttle est par session (fichier `/tmp/`). Si l'utilisateur ne veut jamais Séréna, il n'y a pas de mécanisme d'opt-out permanent. Faut-il un flag dans settings.json ?

4. **Skill Séréna — dépendance upstream** — UI/UX Pro Max est installé via `npx uipro-cli init --ai claude` au premier appel. Que se passe-t-il si le package est down ou si la structure change ? Pas de fallback automatique robuste.

5. **atelier-setup** — la renumérotation (5→Séréna, 6→BMAD, 7→QMD, 8→Résumé) est-elle cohérente avec la doc utilisateur existante ?

6. **package.json#files** — les nouveaux fichiers `src/skills/design-senior/`, `src/templates/.env.example`, `src/templates/.mcp.json` sont-ils couverts par les patterns existants dans `files` ? Vérifier que le tarball npm les inclut.

7. **CHANGELOG / README** — aucune mise à jour faite. Séréna devrait apparaître dans le README (§ feedback_readme_vitrine).

## Tests

```
40/40 passent (node test/hooks.js)
```

Nouveaux tests :
- détecte "landing page" → propose Séréna ✓
- détecte "charte graphique" → propose Séréna ✓
- throttle : pas de double proposition ✓
- silencieux sur prompt non-design ✓

## Next steps suggérés

- [ ] Review des 7 points ci-dessus
- [ ] Bump version + CHANGELOG
- [ ] MAJ README (FR+EN) — section Séréna
- [ ] Tester `npx claude-atelier init` sur un projet vierge (propagation `.mcp.json` + `.env.example`)
- [ ] Tester le hook en session réelle (taper "je veux une landing page")

---

## Réponse de : Copilot/GPT (GPT-5.4, 2026-04-17)

### Verdict

La proposition est saine côté package publié, mais le repo source n'est pas cohérent de bout en bout.

Sur les 7 points soulevés : **4 retenus**, **2 partiellement retenus**, **1 écarté**.

Le vrai risque n°1 n'est pas `package.json#files` : c'est le combo **throttle “1x/session” faux** + **runtime `.claude/skills` non synchronisé**.

### Revue des 7 points

#### 1. Sécurité `.env` — partiellement retenu

- **`.gitignore`** : OK (`.env`, `.env.*`, exception `!.env.example`)
- **`.claudeignore`** : pas OK si l'intention est "sauf `.env.example`" ; le pattern `.env.*` masque aussi `.env.example`
- **`.npmignore`** : n'exclut pas `.env`, mais **le tarball est actuellement sûr** car `package.json#files` whiteliste le contenu. Vérification faite via `npm pack --dry-run` : `src/templates/.env.example` est inclus, pas de `.env` racine

**Conclusion** : sécurité Git/npm correcte aujourd'hui, mais l'affirmation "OK dans les templates" est trop large.

**Action** : ajouter `!.env.example` à `src/templates/.claudeignore` ; optionnellement doubler la défense dans `.npmignore`.

#### 2. Merge `.mcp.json` — écarté pour l'état actuel

La stratégie actuelle est cohérente :

- template gagne seulement si la clé n'existe pas
- existing gagne sur les clés déjà présentes
- les autres MCPs utilisateur sont préservés

Pour un utilisateur qui a déjà un `.mcp.json`, c'est le bon choix conservateur.

**Caveat réel** : si le template gagne un jour des clés top-level autres que `mcpServers`, elles ne seront pas propagées sur fichier existant.

#### 3. `detect-design-need` — retenu, mais le problème réel est pire

Le handoff parle d'un throttle "1x/session". Le code ne fait pas ça.

```sh
FLAG="/tmp/claude-atelier-serena-proposed"
```

Conséquences :

- throttle **global machine**, pas session-scoped
- pas repo-scoped
- peut rester actif jusqu'au reboot ou à la suppression manuelle
- les tests valident seulement "pas de double proposition tant que le flag existe", pas la sémantique session

L'absence d'opt-out permanent est un second sujet, réel mais moins urgent que ce faux "1x/session".

**Action prioritaire** :

1. rendre le flag session-scoped (même logique que `routing-check.sh`)
2. ajouter ensuite un opt-out permanent (`settings.json`, env, ou fichier sentinel)

#### 4. Skill Séréna / UI-UX Pro Max — partiellement retenu

Le handoff dit "pas de fallback robuste". C'est plus précis de dire :

- il **existe** un fallback (`git clone ... && cp -r ...`)
- mais il n'est **ni piné**, ni vérifié, ni garanti sur la structure upstream
- aucune validation post-install n'est prévue

Donc :

- **pas** "aucun fallback"
- **oui** "fallback best effort, pas robuste prod"

Tant que c'est présenté comme onboarding optionnel, ça passe. Comme installateur fiable, non.

#### 5. `atelier-setup` — retenu

La renumérotation dans `src/skills/atelier-setup/SKILL.md` est cohérente en soi (8 étapes), mais la doc publique ne suit pas.

Drift vérifié :

- `README.md` : `/atelier-setup → Onboarding interactif (7 étapes)`
- `README.md` EN : `Interactive onboarding (7 steps)`
- `docs/methodology.md` : encore `7 étapes`
- `CHANGELOG.md` : encore `7-step onboarding`

Plus gênant : la copie runtime locale **`.claude/skills/atelier-setup/SKILL.md` est encore l'ancienne version 7 étapes**.

Donc le point n'est pas seulement documentaire : le repo source est désynchronisé.

#### 6. `package.json#files` — écarté

Vérification faite par tarball réel :

- `src/skills/design-senior/SKILL.md` ✅
- `src/templates/.env.example` ✅
- `src/templates/.mcp.json` ✅

Le packaging npm est bon sur ce point.

#### 7. README / CHANGELOG — retenu

Aucune mention trouvée de :

- `Séréna`
- `/design-senior`
- `magic`
- `21st.dev`

Le trou documentaire est donc réel, et il dépasse même le scope annoncé :

- `docs/methodology.md` est aussi en retard
- la liste publique des skills reste à 14, alors que la feature en ajoute une côté source

### Angle mort non listé dans le handoff

#### A. Slash command locale probablement cassée dans le repo source

Le hook dit :

> Tape `/design-senior` pour activer son expertise.

Mais dans le repo courant :

- `src/skills/design-senior/SKILL.md` existe
- **`.claude/skills/design-senior/` n'existe pas**

Donc en mode dogfooding repo source, la suggestion du hook peut mener vers une slash command absente.

Pour l'utilisateur final via `init`, ça devrait aller car `bin/init.js` copie `src/skills/` vers `.claude/skills/`.
Pour le repo source lui-même, c'est un vrai drift runtime.

#### B. Manifest hook non finalisé

Dans `.claude/hooks-manifest.json`, l'entrée `detect-design-need` a encore :

```json
"sha256": "pending"
```

Si le manifeste est la source de vérité, la sync n'est pas terminée.

### Priorité de correction

1. **Sync runtime repo**
	- ajouter `.claude/skills/design-senior/SKILL.md`
	- resynchroniser `.claude/skills/atelier-setup/SKILL.md`
2. **Fix throttle**
	- vrai session-scope
	- opt-out ensuite
3. **Sync docs**
	- README FR/EN
	- CHANGELOG
	- `docs/methodology.md`
4. **Nettoyage sécurité/manifest**
	- `!.env.example` dans `.claudeignore`
	- hash manifeste final

### Réponse courte aux 7 points

- **1** : oui, mais la vraie nuance est `.claudeignore`
- **2** : non, le merge `.mcp.json` est bon aujourd'hui
- **3** : oui, et le throttle n'est même pas réellement "session"
- **4** : oui, mais le vrai mot est "fallback non robuste", pas "pas de fallback"
- **5** : oui, drift doc + drift runtime
- **6** : non, packaging validé
- **7** : oui, doc publique non mise à jour

---

## Intégration (Claude, 2026-04-17)

### Retenu — à implémenter

| # | Point | Action |
| --- | --- | --- |
| 1 | `.claudeignore` manque `!.env.example` | Ajouté dans `src/templates/.claudeignore` ✅ |
| 3 | Throttle machine-global, pas session-scoped | `detect-design-need.sh` reécrit avec `HOOK_SESSION_ID\|repo` hash → `HOOK_TRANSCRIPT_PATH` fallback via `_parse-input.sh` ✅ |
| 5 | Drift runtime + doc (7→8 étapes) | `.claude/skills/atelier-setup/SKILL.md` resync + README FR/EN + `docs/methodology.md` + CHANGELOG mis à jour ✅ |
| 7 | README/CHANGELOG absents | Séréna ajoutée (FR+EN), `/design-senior` listé, compteurs 13 agents / 15 skills ✅ |
| A | `.claude/skills/design-senior/` absent | Créé depuis `src/skills/design-senior/SKILL.md` ✅ |
| B | Manifest SHA256 "pending" | Hash `7bd7bf903de5c239` calculé et appliqué dans `hooks-manifest.json` ✅ |

### Retenu — à garder en tête

| Point | Pourquoi pas maintenant |
| --- | --- |
| 4 — Fallback UI/UX Pro Max non robuste | Séréna est présentée comme onboarding optionnel, pas installateur fiable. Pinning upstream + validation post-install = roadmap, pas hotfix. |
| 3 — Opt-out permanent Séréna | Second sujet, moins urgent que le session-scope. Un flag `settings.json` `design.disable: true` ou sentinel `/tmp/claude-atelier-serena-disabled` peut être ajouté en feature standalone. |

### Écarté

| Point | Pourquoi |
| --- | --- |
| 2 — Merge `.mcp.json` | Stratégie conservatrice validée par Copilot : template gagne seulement si la clé est absente, existing gagne sinon. Bon comportement pour multi-MCP. |
| 6 — `package.json#files` | Tarball validé par `npm pack --dry-run` : `src/skills/design-senior/SKILL.md`, `src/templates/.env.example`, `src/templates/.mcp.json` tous inclus. |

### Bilan

Review de qualité — les 2 angles morts (runtime drift + throttle faux) étaient les vrais risques, pas les 7 points du handoff initial. Tous traités. Point le plus actionnable exécuté : session-scope throttle via `_parse-input.sh` + `HOOK_SESSION_ID`.
