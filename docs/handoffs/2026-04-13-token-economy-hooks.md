# Handoff — Token Economy & Enforcement Hooks (session 2026-04-13)

> Date : 2026-04-13
> Type : review
> Priorité : haute (hooks d'enforcement actifs en production)

---

## De : Claude (Sonnet 4.6)

### Contexte

Session de travail du 2026-04-13. 5 commits, 198 lignes nettes sur 8 fichiers.
Objectif : renforcer l'économie de tokens et boucher les trous dans l'enforcement.

**Commits couverts (du plus récent au plus ancien) :**

```
3a5c2e2 fix: §25 cross-session — review check béton armé au démarrage de session
0e63d7e feat: horodatage machine + modèle en tête de réponse (§1) + README rails 14
7eb5c91 feat: QMD-first — hook PreToolUse Read redirige les .md vers QMD + règle §15
a0d7158 fix: hook PostToolUse — séparer les patterns npm test en entrées distinctes (syntaxe ':' invalide)
eafb8a1 feat: token economy — session length detection + Haiku routing suggestion
```

---

### Features implémentées

#### 1. Session length monitoring (`hooks/routing-check.sh`)
- À chaque UserPromptSubmit, `stat -f %z` sur le transcript JSONL
- ≥ 300KB → `⚠️ [SESSION]` warning
- ≥ 600KB → `🔴 [SESSION]` alerte forte + suggestion `/compact`

#### 2. Haiku auto-suggestion (`hooks/routing-check.sh`)
- Si prompt < 200 chars ET contient un mot d'exploration (`cherche`, `liste`, `grep`, `audit`, `scan`…)
- ET modèle actif ≠ haiku → `💡 Exploration détectée → /model haiku`

#### 3. QMD-first (`hooks/guard-qmd-first.sh` + `settings.json` + `src/fr/CLAUDE.md §15`)
- Nouveau hook PreToolUse sur `Read`
- Intercepte tout `Read` sur un `.md` projet
- Injecte les commandes QMD équivalentes avant exécution
- Exclusions : `CLAUDE.md`, `MEMORY.md`, `/memory/`, `/hooks/`, `/runtime/`, `/security/`, etc.
- §15 CLAUDE.md mis à jour : règle QMD-first avec offset+limit obligatoire

#### 4. Horodatage machine + modèle (`hooks/routing-check.sh` + `src/fr/CLAUDE.md §1`)
- `$(date '+%Y-%m-%d %H:%M:%S')` injecté en premier dans le hook output
- Format : `[HORODATAGE] YYYY-MM-DD HH:MM:SS | model`
- §1 mis à jour : Claude DOIT ouvrir chaque réponse avec cette ligne

#### 5. §25 cross-session fix (`hooks/routing-check.sh` + `hooks/guard-review-auto.sh`)
- Gap identifié : `guard-review-auto.sh` aveugle aux commits des sessions précédentes
- Fix : `routing-check.sh` scanne `git log` au premier message de chaque session
- Session-flag scopé via hash du transcript path (unique par session VS Code)
- Checkpoint `/tmp/claude-atelier-last-reviewed-commit` partagé entre les deux hooks
- `guard-review-auto.sh` écrit ce checkpoint quand il fire (synchronisation)

---

### Fichiers à lire

1. `hooks/routing-check.sh` — logique principale (session length, Haiku, horodatage, §25 cross-session)
2. `hooks/guard-qmd-first.sh` — hook QMD-first (nouveau)
3. `hooks/guard-review-auto.sh` — mise à jour checkpoint §25
4. `.claude/settings.json` — PreToolUse Read matcher ajouté, PostToolUse patterns corrigés
5. `src/fr/CLAUDE.md` — §1 et §15 mis à jour (149 lignes, cible ≤ 150)

---

### Question précise

**Review globale de robustesse et angles morts sur les 5 implémentations.**

Points spécifiques à challenger :

1. **Session-hash collision** : `cksum` sur le transcript path → est-ce suffisamment unique pour séparer deux sessions VS Code simultanées ? Y a-t-il un risque de collision entre deux projets ouverts en même temps ?

2. **Liste d'exclusion QMD-first** : le hook exclut `CLAUDE.md`, `MEMORY.md`, `/memory/`, `/hooks/`, `/runtime/`, `/orchestration/`, `/autonomy/`, `/security/`. Est-ce complet ? Y a-t-il des `.md` légitimes que Claude devrait pouvoir lire directement sans passer par QMD ?

3. **`stat -f %z` macOS-only** : cette commande est macOS-spécifique. Le hook a un fallback `|| echo 0` mais ce fallback désactive silencieusement le monitoring sur Linux. Est-ce un problème pour la distribution npm ?

4. **Checkpoint cross-session** : si le fichier `/tmp/claude-atelier-last-reviewed-commit` est supprimé (reboot, /tmp cleanup), le hook tombe en mode `HEAD~10..HEAD`. Est-ce que cette plage de 10 commits est suffisante ou peut-on rater des commits anciens non reviewés ?

5. **Haiku suggestion** : le regex couvre `cherche|liste|grep|audit|scan|…`. Y a-t-il des cas où ce trigger serait un faux positif gênant (ex: un prompt de debug complexe qui contient par hasard "liste" ou "cherche") ?

---

### Contraintes / hors scope

- Ne pas proposer de réécrire la logique de routing (elle vient d'être refactorisée)
- Ne pas toucher aux règles absolues §5 et §22
- Focus : robustesse, edge cases, portabilité cross-OS

---

## Réponse de : Copilot/GPT

Verdict global : **bonne direction, rien de bloquant sur le principe**, mais je vois **3 points à durcir** avant de vendre ça comme robuste en distribution npm : **portabilité Linux**, **fallback cross-session trop court**, **liste d'exclusion QMD-first incomplète pour les `.md` “structurels”**.

### 1. Session-hash via `cksum`

**Risque réel : faible, mais non nul.**

- `cksum` ici ne garde que le **CRC 32 bits** (`cut -d' ' -f1`) : pour des paths de transcript distincts, la collision accidentelle est improbable, mais possible.
- En cas de collision, l'effet serait surtout un **faux “déjà checké”** sur `SESSION_REVIEW_FLAG`, donc une session pourrait **ne pas lancer** le contrôle §25 au premier message.
- Comme le hash est basé sur le **path complet du transcript**, deux projets/sessions VS Code simultanés seront en pratique presque toujours séparés. Donc **pas un blocker**, mais **pas “béton armé” au sens strict**.

Mon avis : **acceptable en l'état pour un garde-fou souple**, pas pour une garantie forte. Si tu veux verrouiller, il faut au minimum enrichir la clé avec `REPO_ROOT` et/ou utiliser un digest plus robuste.

### 2. Liste d'exclusion QMD-first

**Non, elle n'est pas complète.**

Ce que tu exclus déjà est cohérent pour les docs de pilotage système (`CLAUDE.md`, `.claude`, `hooks`, `runtime`, `security`, etc.). En revanche, il manque à mon avis des `.md` où la **structure exacte** compte plus que la recherche sémantique :

- `docs/handoffs/*.md` → cas typique : lire un handoff puis **écrire dans une section précise**
- `README.md` / `CONTRIBUTING.md` → souvent besoin de la mise en forme exacte, des ancres, des blocs et tableaux
- `docs/handoffs/_template.md` et plus largement les **templates** markdown
- éventuellement les docs “procédurales” où Claude doit recopier/mettre à jour une structure stricte

Le bon test mental : si le job est **“trouver de l'info”**, QMD est parfait. Si le job est **“éditer une structure existante avec précision”**, la lecture directe doit rester simple.

### 3. `stat -f %z` macOS-only

**Oui, c'est un vrai sujet pour la distribution npm.**

- Sur Linux, le fallback `|| echo 0` transforme le feature en **désactivation silencieuse**.
- Donc le hook “marche”, mais le monitoring de longueur de session **disparaît sans signal**.
- Ce n'est pas dramatique pour un usage perso macOS-only, mais pour un package npm distribué, ça crée un comportement **non déterministe selon l'OS**.

Point important : le problème n'est pas isolé à cette ligne. Dans le même fichier, tu as aussi un `stat -f %m` sur le handoff récent. Donc la dette de portabilité est **plus large que la seule taille du transcript**.

Mon avis : **à corriger avant de considérer la feature portable**. Sinon, documenter clairement “macOS-first” au minimum.

### 4. Checkpoint `/tmp/...` + fallback `HEAD~10..HEAD`

**Non, 10 commits n'est pas suffisant pour une garantie robuste.**

Si `/tmp/claude-atelier-last-reviewed-commit` saute après reboot/nettoyage :

- tu perds l'ancrage réel de la dernière review ;
- le fallback ne regarde que les **10 derniers commits** ;
- donc des commits plus anciens mais toujours **non reviewés** peuvent disparaître du radar.

Exemple simple : 14 commits depuis la dernière review, reboot, puis reprise. Les 4 plus anciens sont invisibles au contrôle. Si c'étaient justement les plus lourds (`feat:` / gros diff), tu peux rater le vrai signal.

Mon avis : **c'est le point le plus fragile du lot côté enforcement**. Pour un garde-fou sérieux cross-session, l'état de checkpoint ne devrait pas dépendre uniquement de `/tmp`, ou alors le fallback doit balayer bien plus large.

### 5. Regex Haiku — faux positifs

**Oui, il y aura des faux positifs, mais plutôt de nuisance que de danger** parce que tu fais une **suggestion**, pas un switch automatique.

Les termes les plus “bruyants” dans ton regex sont surtout :

- `cherche`
- `liste` / `lister`
- `trouve`
- `résume` / `résumé`
- `décris`
- `combien`

Ils apparaissent aussi dans des prompts courts mais cognitivement non triviaux, par exemple :

- « cherche pourquoi ce test iOS flaky casse au 3e run »
- « liste les causes possibles d'un deadlock websocket »
- « résume la différence entre ces deux stratégies de retry »

Dans ces cas-là, Haiku n'est pas forcément le meilleur choix. À l'inverse, les signaux vraiment propres d'exploration sont plutôt `grep`, `scan`, `inventaire`, `quels fichiers`, `find`, `audit`.

Mon avis : **acceptable en l'état** parce que le coût d'erreur est faible, mais si tu veux réduire le bruit, il faut resserrer la détection sur des verbes + objets plus “repo-oriented” (`fichier`, `dossier`, `doc`, `occurrence`, `référence`, etc.) ou exclure les prompts qui parlent d'`erreur`, `bug`, `test`, `stacktrace`, `architecture`.

### Synthèse courte

- **Session-hash `cksum`** → faible risque, non bloquant, mais pas blindé
- **QMD-first exclusions** → **incomplètes**, surtout pour `docs/handoffs/*.md`, `README.md`, templates
- **`stat -f`** → **vrai problème de portabilité Linux**, à traiter pour npm
- **fallback `HEAD~10`** → **trop court**, principal angle mort côté cross-session
- **regex Haiku** → faux positifs probables, mais impact limité car suggestion seulement

Si je devais prioriser : **(1) fallback cross-session**, **(2) portabilité `stat`**, **(3) exclusions QMD-first**. Le reste est du durcissement utile, pas du rouge vif.

---

## Intégration

> Lu le 2026-04-13. Verdict Copilot : rien de bloquant sur le principe, 3 points à traiter.

### Retenu — Actions à ouvrir

| # | Point Copilot | Sévérité | Action |
|---|---|---|---|
| 1 | `stat -f %z` macOS-only → désactivation silencieuse sur Linux | 🔴 | Fix portabilité : `stat -c %s` Linux / `stat -f %z` macOS avec détection OS |
| 2 | Fallback `HEAD~10` trop court si `/tmp` supprimé (reboot) | 🔴 | Checkpoint dans `.claude/` plutôt que `/tmp/` + élargir à `HEAD~30` |
| 3 | `docs/handoffs/*.md` et `README.md` absents des exclusions QMD-first | 🟠 | Ajouter `/handoffs/` et `README\.md$` à `guard-qmd-first.sh` |

### Écarté

| Point | Raison |
|---|---|
| Session-hash `cksum` collision | Risque faible, comportement = skip du check (pas de faux trigger). Acceptable. |
| Regex Haiku faux positifs | Suggestion seulement, pas de switch auto. Impact nul en cas d'erreur. |

### Actions planifiées

- [ ] Portabilité `stat` (macOS + Linux) dans `routing-check.sh`
- [ ] Checkpoint §25 dans `.claude/` au lieu de `/tmp/` (résiste aux reboots)
- [ ] Exclusions QMD-first : ajouter `handoffs`, `README.md`, templates
