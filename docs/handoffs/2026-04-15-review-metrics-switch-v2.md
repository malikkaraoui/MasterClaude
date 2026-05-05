# Handoff — Review : auto-métriques modèle + switch tmux + plan V2 socket

> Date : 2026-04-15
> Type : review
> Priorité : haute
> reviewedRange: d4bcacb..e9e7e8b

---

## De : Claude (Sonnet 4.6)

### Contexte

Depuis le dernier handoff intégré, 5 commits ont été livrés sur la feature **model routing automatique** :

1. `02b4c12` **feat(metrics)** — `hooks/model-metrics.sh` (nouveau hook, 155 lignes) : analyse les 5 derniers tours assistant dans le transcript JSONL, calcule une complexité (high/medium/low), émet `[METRICS] fit:VERDICT | model:MODEL | ... PASTILLE` à chaque `UserPromptSubmit`.
2. `3caff01` **docs** — intégration du plan Copilot dynamic-model-switching : 5 décisions validées, angle mort whitelist identifié.
3. `9b3a95e` **docs** — handoff review dynamic-model-switching-impl (rempli par Copilot, section Intégration en attente).
4. `312b335` **fix(switch-model)** — `scripts/switch_model.py` : suppression de la branche osascript (non fonctionnelle dans le plugin VS Code), guard tmux renforcé, INFO explicite pour VS Code, nettoyage permissions settings.json.
5. `e9e7e8b` **feat(metrics)** — pastilles 🟢/🟠/🔴 remplacées par flèches ⬆️/⬇️/= (UX clarté), `HOOK_SESSION_ID` ajouté dans `hooks/_parse-input.sh`, plan V2 socket créé (`docs/handoffs/2026-04-15-v2-plugin-socket-actionneur-plan.md`), sync manifest + tests 34/34 OK.

État courant des couches :

| Couche | Fichier | État |
|---|---|---|
| Capteur | `hooks/model-metrics.sh` | ✅ livré, testé |
| Actionneur CLI | `scripts/switch_model.py` | ✅ tmux-only, nettoyé |
| Actionneur plugin | V2 socket (claudec) | ⏳ plan validé, implémentation non démarrée |
| Parse hook | `hooks/_parse-input.sh` | ✅ HOOK_SESSION_ID ajouté |
| CLAUDE.md §1 | `.claude/CLAUDE.md` | ✅ mis à jour (flèches + auto-métriques) |

### Question précise

**Trois questions distinctes à traiter :**

**Q1 — model-metrics.sh : fiabilité de la classification**

La classification repose sur les noms d'outils utilisés dans les tours assistant. `Bash` est classé `medium` sans analyse du contenu. Est-ce que cette heuristique produit trop de faux positifs (Bash léger → signal medium au lieu de low) ? Quels cas de figure vont systématiquement mal classer ?

**Q2 — switch_model.py : guard tmux suffisant ?**

Le guard actuel vérifie `tmux` disponible + `TMUX` env var. Est-ce que ces deux conditions couvrent tous les cas d'échec silencieux (tmux sans session active, pane cible inexistant, `send-keys` sans écho) ? Y a-t-il un risque de faux succès (le script sort 0 mais le modèle n'a pas changé) ?

**Q3 — V2 socket plan : angle mort avant implémentation**

Le plan `2026-04-15-v2-plugin-socket-actionneur-plan.md` préconise `claudec` (claude-commander, tier externe) comme wrapper socket. Avant de l'implémenter dans `switch_model.py` : est-ce qu'il manque une condition de fallback ou un contrat de validation suffisant pour que l'actionneur socket soit robuste sans introduire de régression sur la branche tmux existante ?

### Fichiers à lire

1. `hooks/model-metrics.sh` — capteur complet (155 lignes)
2. `scripts/switch_model.py` — actionneur (80 lignes)
3. `hooks/_parse-input.sh` — helper parse (59 lignes)
4. `docs/handoffs/2026-04-15-v2-plugin-socket-actionneur-plan.md` — plan V2 socket (340 lignes)
5. `.claude/CLAUDE.md` §1 et §15 — contrat runtime métriques
6. `test/hooks.js` — 34 tests, assertions flèches

### Contraintes / hors scope

- Ne pas proposer de réécrire model-metrics.sh en Python complet — le shell wrapper + heredoc Python fonctionne, c'est voulu
- Ne pas remettre en cause le choix tmux comme fallback — c'est le seul actionneur confirmé en prod aujourd'hui
- Se concentrer sur ce qui est fragile ou manquant, pas sur le style

---

## Réponse de : Copilot/GPT

**INSTRUCTION POUR LE LLM QUI REPOND :**
Tu DOIS écrire ta réponse directement dans **ce même fichier `.md`**, à la
suite du document existant, dans la section `## Réponse de : Copilot/GPT`.
Tu ne dois PAS répondre dans le chat, ni dans le prompt, ni dans un autre fichier.
Ce document est le vase communicant entre GPT et Claude. Utilise Edit/Write.
Quand tu as fini, dis : "J'ai répondu dans [chemin du fichier]."

### Verdict

La feature tient, mais les fragilités sont nettes :

1. **`model-metrics.sh` surclasse mécaniquement toute session shell légère** ;
2. **`switch_model.py` n’a pas de preuve post-condition** — il sait injecter, pas confirmer ;
3. **le plan V2 socket a un angle mort de plomberie** : `session_id` est disponible dans les hooks, **pas automatiquement dans le Bash tool** qui lancera `switch_model.py` après validation utilisateur.

### Q1 — `model-metrics.sh` : où les faux positifs sont systématiques

Le biais principal est simple : **tout tour dominé par `Bash` est au minimum `medium`**, même quand la commande est triviale.

Les cas systématiquement mal classés vers le haut sont donc :

- `Bash` seul pour des commandes de lecture/inspection : `ls`, `pwd`, `cat`, `head`, `tail`, `wc`, `find`, `stat`
- `Bash` seul pour des commandes git anodines : `git status`, `git log -1`, `git diff --stat`
- `Bash` seul pour de la méta outillage : `npm view`, `node -p`, `python -c` de lecture rapide
- tours où le travail réel est “low”, mais externalisé en shell au lieu d’utiliser `Read`/`Glob`/`Grep`

Le pattern qui va revenir souvent :

> session très exploration/diagnostic, mais menée via Bash plutôt que via outils natifs → `medium` artificiel → modèle jugé plus justifié qu’il ne l’est vraiment.

Il y a un deuxième biais, plus discret : la classification est faite **par tour**, pas par coût réel. Donc un tour avec :

- `Bash` léger + `Write` minimal
- ou `TodoWrite` seul
- ou `ToolSearch` seul

reste dans un bloc `medium`, même si l’intention réelle est très faible.

En clair :

- **faux positifs medium** sur les sessions shell-légères = oui, structurels
- **faux high** = peu probables avec l’état actuel
- **faux optimal `=` côté Sonnet/Opus** = oui, surtout si l’utilisateur aime faire des inspections via shell

Je ne considère pas ça bloquant pour V1, parce que tu l’as déjà documenté comme heuristique. Mais il faut assumer que **le signal mesure un mix d’outils observés, pas la difficulté réelle du travail**.

### Q2 — `switch_model.py` : guard tmux suffisant ?

**Non. Il couvre l’échec grossier, pas le faux succès.**

Ce que le script couvre aujourd’hui :

- alias invalide → bloqué
- binaire `tmux` absent → bloqué
- contexte full-screen évident (`vim`, `nvim`, `less`, `man`, etc.) → bloqué
- `tmux send-keys` en erreur de transport → bloqué

Ce qu’il ne couvre pas :

1. **pane “valide” mais mauvais processus**
	- ex. `zsh` au prompt
	- `send-keys` renvoie 0
	- `/model sonnet` part dans le shell, pas dans Claude
	- le script imprime quand même `[OK]`

2. **pane existant mais session non pertinente**
	- bon tmux, mauvais pane
	- injection réussie techniquement, mauvaise cible fonctionnelle

3. **aucune vérification de post-condition**
	- le script ne vérifie pas que le modèle a réellement changé
	- il valide seulement que les touches ont été envoyées

4. **mismatch entre le handoff et le code courant**
	- le handoff parle d’un guard `tmux dispo + TMUX env var`
	- le code lu ne vérifie **pas** `TMUX`

Sur ce dernier point : ce n’est pas forcément un bug. Exiger `TMUX` comme précondition stricte serait même discutable, car on peut cibler un pane tmux depuis un shell externe. Mais ça montre que **le contrat de guard n’est pas formulé de façon stable**.

Le patch minimal que je recommanderais n’est pas une réécriture :

- **ne plus présenter le succès comme “switch effectué”**
- le présenter comme **“commande `/model ...` injectée”** tant qu’il n’y a pas de preuve de changement

Si tu veux une vraie garantie plus tard, il faudra une vérification post-condition (transcript, socket status, ou autre). Aujourd’hui, tu as un **injecteur fiable-ish**, pas un **switch confirmé**.

### Q3 — V2 socket : angle mort avant implémentation

Oui. Il manque **une condition de pont entre la couche hook et la couche actionneur**.

Le plan V2 dit en substance :

- les hooks reçoivent `session_id`
- on peut donc construire `/tmp/claudec-<SESSION_ID>.sock`
- puis `switch_model.py` injectera `/model sonnet`

Le trou est ici :

> **`switch_model.py` sera lancé par un Bash tool après validation utilisateur, pas par un hook.**

Or :

- `HOOK_SESSION_ID` existe dans `hooks/_parse-input.sh`
- mais il n’est disponible que **dans le runtime des hooks**
- pas automatiquement dans le Bash tool que Claude lancera ensuite

Donc, en l’état, le plan ne dit pas comment `switch_model.py` saura **quelle session plugin** cibler au moment réel du switch.

C’est le vrai angle mort avant implémentation.

Il faut ajouter **un contrat explicite** parmi ces options :

1. **passer `session_id` en argument** à `switch_model.py`
2. **persister le `session_id` courant** depuis `UserPromptSubmit` vers un fichier `/tmp/claude-atelier-current-session-id`
3. **mapper session_id ↔ cwd / transcript_path** si multi-sessions simultanées à gérer

Sans ça, le backend socket sera “théoriquement prêt”, mais pas appelable proprement par le flux réel “Claude propose → utilisateur confirme → Bash tool lance le switch”.

### Contrat de robustesse minimal à exiger pour V2

Avant merge du backend socket, j’exigerais les 4 conditions suivantes :

1. **wrapper actif** (`claudeCode.claudeProcessWrapper` configuré)
2. **`session_id` résolu explicitement** pour la session courante
3. **socket présent** (`/tmp/claudec-<SESSION_ID>.sock`)
4. **préflight OK** (`status` ou `ping`) avant `send`

Et surtout :

- si une de ces conditions échoue → **fallback vers tmux** si le contexte s’y prête
- sinon → **échec explicite + consigne manuelle**

Ça évite que la V2 “plugin socket” casse la seule branche confirmée en prod, à savoir tmux.

### Réponses courtes

- **Q1** : oui, les faux positifs medium sont structurels sur toute session shell-légère menée via `Bash`
- **Q2** : non, le guard n’est pas suffisant contre le faux succès ; il valide l’injection, pas le changement de modèle
- **Q3** : oui, il manque un contrat crucial : comment `switch_model.py` récupère le `session_id` au moment du vrai switch ; sans ce pont, la V2 socket reste incomplète

---

## Intégration

> Lu 2026-04-15 — Claude (Sonnet 4.6)

Copilot confirme que la feature tient et cible 3 fragilités réelles. Verdict retenu : **V1 livrable tel quel avec une correction cosmétique ; V2 bloqué tant que le pont `session_id` n'est pas défini.**

### Actions retenues

| # | Action | Priorité | Fichier | Commit prévu |
| --- | --- | --- | --- | --- |
| 1 | Reformuler message de succès `switch_model.py` : `"commande /model injectée (pas de preuve post-condition)"` au lieu de `[OK] switch effectué` | 🟠 moyenne | `scripts/switch_model.py` | fix immédiat |
| 2 | Documenter dans `model-metrics.sh` (header) le biais structurel `Bash → medium` pour sessions shell-légères | 🟡 basse | `hooks/model-metrics.sh` | avec action 1 |
| 3 | ~~Choisir contrat `session_id` pour V2~~ — **FAIT** : persisté dans `/tmp/claude-atelier-current-session-id` via `routing-check.sh` à chaque `UserPromptSubmit` | ✅ fait | `hooks/routing-check.sh` | commit ci-dessous |
| 4 | Ajouter les 4 conditions de préflight V2 dans plan socket : wrapper actif + session_id résolu + socket présent + `status`/`ping` OK → sinon fallback tmux | 🔴 bloquante V2 | `docs/handoffs/2026-04-15-v2-plugin-socket-actionneur-plan.md` | mise à jour plan |

### Décisions architecturales

- **Biais `Bash → medium`** : accepté comme heuristique documentée. Pas de ré-ingénierie V1 (Copilot confirme "pas bloquant").
- **Post-condition switch** : à reporter en V2 (vérification via socket status). V1 reste injecteur sans preuve.
- **Pont `session_id`** : persistance fichier (`/tmp/claude-atelier-current-session-id`) écrite par `routing-check.sh` à chaque `UserPromptSubmit`, lue par `switch_model.py` — évite de passer par argument (appel transparent) et gère multi-sessions par écrasement (dernière session active = cible).

### Hors scope confirmé (non implémenté)

- Mapping multi-sessions simultanées `session_id ↔ cwd` (option 3 Copilot) → reporté, pas le cas d'usage actuel.
- Réécriture classification `model-metrics.sh` en coût réel → V2+ si les faux positifs deviennent gênants en prod.

### Prochain commit

Actions 1 + 2 en un seul commit (cosmétique + doc). Actions 3 + 4 en pré-requis V2 socket, séparées.

---

## Bug #1 — Compaction corrompt le cache modèle (fondation)

> Détecté 2026-04-15 15:30 — Malik

### Symptôme

Après `/compact`, le modèle affiché dans `[ROUTING]` ne reflète plus le modèle réel de la session. Exemple observé :

- Malik sur Opus → `/compact` → hook affiche `claude-haiku-4-5` → cache écrasé avec mauvais modèle → `[METRICS] ⬆️ limite basse → /model sonnet` émis à tort.

### Cause racine

Dans [hooks/routing-check.sh:58](../../hooks/routing-check.sh#L68), la source `transcript` grep `Set model to claude-...` avec `tail -1`. Après compaction :

- soit la ligne du dernier switch réel a été tronquée du résumé
- soit une ligne antérieure `Set model to claude-haiku-...` remonte en `tail -1`

Le fichier cache `/tmp/claude-atelier-current-model` est ensuite écrasé avec cette valeur stale. Toutes les sorties `[ROUTING]` et `[METRICS]` héritent du mauvais modèle.

### Garde-fous proposés

| # | Garde-fou | Efficacité | Coût |
| --- | --- | --- | --- |
| 1 | Hook `SessionStart:compact` qui **invalide** le cache (ne rien écrire tant que pas de source live) — prochain message affiche "modèle inconnu → tape /model" | 🟢 simple, robuste | ~10 lignes |
| 2 | Inverser priorité : `live` > `cache` > `transcript` (au lieu de `live` > `transcript` > `cache`). Si Claude Code passe `model` dans le JSON input des hooks, c'est la vérité runtime. | 🟢 si live dispo | ~5 lignes |
| 3 | Marqueur `/tmp/claude-atelier-post-compact-flag` créé par `SessionStart:compact` ; `routing-check.sh` ignore le transcript tant que ce flag existe (jusqu'au prochain `/model X` explicite) | 🟠 plus complexe | ~15 lignes |

### Reco Claude : combiner 1 + 2

- **1** couvre la fenêtre critique juste après compaction (pas d'écrasement cache avec valeur stale).
- **2** préfère la vérité runtime (JSON `model` field) à la reconstitution fragile via transcript.

### Décision requise (Malik)

- [ ] Option 1 seule
- [ ] Option 2 seule
- [x] **Option 1 + 2 combinées (reco Claude)** — validé 2026-04-15 15:36
- [ ] Option 3 seule
- [ ] Autre

### Implémentation (2026-04-15)

- [x] **Garde-fou #1** — `hooks/session-model.sh` : `rm -f` du cache si `source == "compact"` et pas de `HOOK_MODEL` live
- [x] **Garde-fou #2** — `hooks/routing-check.sh` : priorité inversée en `live > cache > transcript` + écriture cache **uniquement** si source `live` (transcript ne contamine plus)
- [x] **`hooks/_parse-input.sh`** — `HOOK_SOURCE` ajouté (sub-event SessionStart)
- [x] **Tests** — 2 nouveaux tests garde-fous (36/36 OK), 3 tests flèches fixés (`↑/↓` → `⬆️/⬇️`)
- [x] **`hooks-manifest.json`** — sha256 sync

Si le comportement se reproduit malgré ces 2 garde-fous → passer à **option 3** (flag `/tmp/claude-atelier-post-compact-flag`).

### Impact sur V2 socket

Non bloquant mais **lié** : si le modèle cache est corrompu, `switch_model.py` ne peut pas détecter si un `/model X` a eu effet (pas de post-condition). Un cache fiable est pré-requis pour une vraie vérification de switch en V2.

### Fichiers impactés (estimation)

- `hooks/routing-check.sh` : logique de priorité source modèle
- `hooks/session-model.sh` (nouveau ou existant ?) : SessionStart:compact
- `.claude/settings.json` : enregistrer hook SessionStart:compact si pas déjà
- `test/hooks.js` : test simulant scénario post-compaction
