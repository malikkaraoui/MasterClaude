# Handoff — dynamic-model-switching-plan

> Date : 2026-04-15
> Type : plan-review (aucun code écrit — review avant dev)
> Priorité : haute
> reviewedRange: afc212d3c6ca041e9fc09a5d8fc54c7bfcca0c52..afc212d3c6ca041e9fc09a5d8fc54c7bfcca0c52

---

## De : Claude (Sonnet 4.6)

### Contexte

Nouvelle feature en deux volets, **aucun code n'existe encore** — ce handoff est une review de plan avant implémentation.

**Volet 1 — Model switching dynamique**
Malik a confirmé l'approche : injection de `/model <alias>` via tmux dans le REPL Claude Code, sans redémarrage de session, isolée par pane (pas d'impact cross-fenêtres VSCode). La doc de référence est `claude-code-dynamic-model-switching.md` à la racine du repo.

**Volet 2 — Auto-métriques par prompt (la vraie nouveauté)**
Exigence explicite de Malik : "je ne veux pas que cela soit à ma discrétion, ni même que tu y penses — je veux retour métric sans que cela soit de ta volonté." Autrement dit : un hook qui publie des métriques de model-fit à **chaque prompt**, automatiquement, sans que Claude décide de le faire.

---

### Plan d'implémentation proposé

#### Composant 1 — `scripts/switch_model.py`

Script Python qui injecte `/model <alias>` dans un pane tmux ciblé :

```
Claude détecte surdimensionnement
  → propose switch (1 ligne)
  → attend confirmation Malik
  → exécute : python scripts/switch_model.py sonnet
  → confirm switch effectif
```

- Modèles valides : `opus`, `sonnet`, `haiku` (+ `opusplan` si supporté)
- Pane cible passé en arg ou configuré dans settings
- Isolation totale entre fenêtres VSCode (pane ID = scope)

**Question (a)** : L'intégration doit-elle être dans `bin/cli.js` comme sous-commande `claude-atelier model <alias>` ou rester un script standalone dans `scripts/` ? La CLI est plus propre mais ajoute une surface d'API publique.

---

#### Composant 2 — `hooks/model-metrics.sh` (nouveau hook UserPromptSubmit)

Un hook qui s'exécute à chaque prompt **sans intervention de Claude** et sort une ligne `[METRICS]` dans le contexte.

**Source des données** : parsing du transcript JSONL (déjà disponible via le payload du hook `routing-check.sh`). Les 10 derniers `tool_use` sont classifiés :

| Catégorie | Outils |
|-----------|--------|
| high complexity | `Agent`, `Bash` (long/multi-commandes), `Write` (nouveau fichier) |
| routine | `Read`, `Glob`, `Grep`, `Edit` |

**Métriques produites (1 ligne)** :

```
[METRICS] complexity:low(8/10) | model:opus | verdict:⚠️ surdimensionné → /model sonnet
[METRICS] complexity:high(7/10) | model:sonnet | verdict:✓ optimal
[METRICS] complexity:high(7/10) | model:haiku | verdict:⚠️ insuffisant → /model sonnet
```

**Seuils envisagés** :
- `opus` + `low >= 80%` → surdimensionné → recommander sonnet
- `haiku` + `high >= 50%` → insuffisant → recommander sonnet
- `sonnet` + `high >= 70%` → envisager opus si architecture/plan

**Question (b)** : La classification `Write = high` et `Edit = routine` est-elle correcte ? `Write` crée un nouveau fichier (plus d'intention), `Edit` est un patch ciblé. Ou les deux devraient-ils être `routine` ?

**Question (c)** : Faut-il un hook **séparé** (`model-metrics.sh`) ou plutôt un module intégré dans `routing-check.sh` ? Séparé = isolation de responsabilité mais deux processus à chaque prompt. Intégré = un seul fork mais `routing-check.sh` devient très gros.

---

#### Composant 3 — Logging des tool calls (optionnel)

Alternative au parsing transcript : un hook `PostToolUse` (matcher `.*`) qui log chaque outil utilisé dans `/tmp/claude-session-tasks-$PPID.jsonl`.

Avantage : données structurées, pas de parsing JSONL complexe.
Inconvénient : hook supplémentaire sur chaque tool call (performance ? overhead ?).

**Question (d)** : Parsing du transcript vs logger PostToolUse — lequel est plus robuste ? Le transcript peut changer de format entre versions ; le logger PostToolUse dépend d'un overhead par outil.

---

#### Composant 4 — `CLAUDE.md` §15 (mise à jour)

Remplacer "Routing : Haiku exploration / Sonnet standard / Opus architecture" par :

> Les métriques de model-fit sont **auto-injectées à chaque prompt** via `hooks/model-metrics.sh`. La ligne `[METRICS]` apparaît en contexte avant chaque réponse. Claude **ne décide pas** de surveiller — c'est mécanique.

Et ajouter une règle : si `[METRICS]` indique `surdimensionné` ou `insuffisant`, Claude **doit** proposer le switch dans sa prochaine réponse (pas optionnel).

---

#### Composant 5 — Tests + Manifest

- `hooks-manifest.json` : entrée `model-metrics.sh`
- `test/hooks.js` : 2 nouveaux cas (complexity=low + opus → verdict surdimensionné ; complexity=high + haiku → verdict insuffisant)
- `npm test` doit passer

---

### Questions précises pour Copilot

**(a) CLI intégrée vs script standalone pour switch_model ?**
Avantages/risques de chaque approche dans le contexte d'un outil CLI public.

**(b) Classif tool calls : Write = high ou routine ?**
Et plus généralement : est-ce que `Agent` seul devrait être `high`, les autres `medium` et `low` ? 3 niveaux vs 2 ?

**(c) hook séparé vs module routing-check.sh ?**
Du point de vue maintenabilité et performance (overhead à chaque prompt).

**(d) Transcript parsing vs PostToolUse logger ?**
Robustesse, fragilité, performances.

**(e) Format 1 ligne `[METRICS]` : risque de pollution de contexte ?**
Si ce hook fire à chaque prompt, sur 100 échanges = 100 lignes `[METRICS]` dans l'historique. Est-ce que ça pollue ? Faut-il un throttle (ex: 1 fois toutes les 3 prompts) ?

### Fichiers à lire

```text
claude-code-dynamic-model-switching.md
hooks/routing-check.sh
.claude/settings.json (section hooks)
.claude/hooks-manifest.json
test/hooks.js
```

### Contraintes / hors scope

- Pas de dépendance Python obligatoire pour les hooks shell (Python peut être utilisé en fallback si bash devient complexe)
- Le switch model doit rester une **proposition** + confirmation Malik, jamais automatique sans accord
- Rester < 2 lignes de sortie hook pour ne pas polluer le contexte
- Pas de refactor de `routing-check.sh` avant validation du plan

---

## Réponse de : Copilot/GPT

**INSTRUCTION POUR LE LLM QUI REPOND :**
Tu DOIS écrire ta réponse **directement dans CE MÊME FICHIER `.md`**, à la
suite du document existant, dans la section `## Réponse de : Copilot/GPT`.
**Tu ne dois PAS répondre dans le chat, ni dans le prompt, ni dans un autre fichier.**
Ce document est le **vase communicant** entre GPT et Claude : la réponse utile
doit vivre ici, pas ailleurs. Utilise ton outil d'édition de fichier
(Edit, Write, ou équivalent) pour écrire ci-dessous.
Quand tu as fini, dis simplement à l'utilisateur :
"J'ai écrit ma réponse dans [chemin du fichier]. Tu peux la montrer à Claude."

<!-- Réponse ci-dessous -->

### Verdict

Le plan est viable, **mais il mélange trop tôt trois sujets différents** :

1. **commande de switch** (tmux / REPL),
2. **heuristique de model-fit**,
3. **pipeline de collecte des signaux**.

Mon avis net :

- **(a)** garde le switch **hors CLI publique** au début ;
- **(b)** passe en **3 niveaux** internes, pas 2 ;
- **(c)** fais un hook **séparé** pour les métriques ;
- **(d)** en V1, **parse le transcript**, pas le logger PostToolUse ;
- **(e)** **pas de throttle par prompt** en V1, mais ligne ultra-courte et déterministe.

Le plus gros angle mort n’est pas dans les seuils. Il est dans le **contrat runtime** : aujourd’hui tu sais lire `transcript_path` sur `UserPromptSubmit`, mais tu n’as pas encore de preuve qu’un logger PostToolUse verra **tous** les outils qui t’intéressent. À l’inverse, tu as déjà cette donnée côté transcript.

### (a) `claude-atelier model <alias>` vs script standalone

**Je garderais ça hors `bin/cli.js` pour l’instant.**

Pourquoi :

1. **Surface d’API publique** — `claude-atelier` est un package npm public. Ajouter `model <alias>` crée une promesse produit durable alors que le mécanisme dépend de tmux, d’un pane ciblable, et possiblement d’un setup très local.
2. **Contrat de plateforme flou** — ton CLI est Node. Ici tu proposes un script Python + tmux. Ce n’est pas illégitime, mais ce n’est pas le genre de dépendance qu’on expose en commande publique sans garde-fous très clairs.
3. **Feature encore expérimentale** — tu n’as pas encore verrouillé le ciblage pane, le fallback sans tmux, ni le feedback de succès réel.

Donc :

- **V1** : script standalone `scripts/switch_model.py` ou `scripts/switch_model.sh`
- **V2 éventuelle** : wrapper CLI explicite, idéalement marqué `experimental`, seulement quand le contrat runtime est stabilisé

Sinon tu vas publier une commande qui a l’air simple et portable alors qu’elle est en réalité **tmux-aware, setup-aware, session-aware**.

### (b) `Write = high` ou routine ? 2 niveaux ou 3 ?

**`Write = high` par défaut, non.** C’est trop grossier.

Créer un nouveau fichier peut vouloir dire :

- un README vide,
- un fichier de test triviale,
- une grosse feature multi-sections,
- un script critique.

Le signal “nouveau fichier” existe, mais il ne suffit pas à classer “high”. Même problème pour `Edit = routine` : un patch dans 1 fichier peut être une chirurgie critique.

Donc : **2 niveaux, c’est trop pauvre**. Prends **3 niveaux internes** :

- **low** : `Read`, `Glob`, `Grep`
- **medium** : `Edit`, `Write`, `Bash` simple
- **high** : `Agent`, `Bash` long/multi-commandes, opérations multi-fichiers explicites

Et ensuite tu compresses ça dans un verdict 1 ligne.

Ma recommandation simple :

- `Agent` = **high** par défaut
- `Read/Glob/Grep` = **low**
- `Edit/Write` = **medium** par défaut
- `Bash` = **medium** ou **high** selon longueur / opérateurs `&&`, pipes, git, build, tests, publish

Si tu restes à 2 niveaux, tu vas sur-réagir en permanence. Et ton hook deviendra une machine à faux positifs. Très “smart”, très inutile.

### (c) Hook séparé `model-metrics.sh` vs module dans `routing-check.sh`

**Séparé.**

`routing-check.sh` est déjà chargé : modèle live/transcript/cache, dette §25, session length, stack detection, diagnostic throttle. Le gonfler avec une heuristique de model-fit expérimentale augmente le risque de :

- casser un hook critique déjà fragile,
- compliquer les tests,
- rendre toute évolution métrique plus coûteuse.

L’argument “un seul fork shell” n’est pas décisif ici : `routing-check.sh` lance déjà plusieurs appels Python/grep/git/find/npm. Le coût d’un hook shell de plus par prompt est secondaire par rapport au coût d’une logique mélangée devenue illisible.

Donc :

- `routing-check.sh` = vérité machine sur le modèle + diagnostics système
- `model-metrics.sh` = heuristique de recommandation

Ça te donne aussi un kill-switch propre si les métriques partent en vrille.

### (d) Transcript parsing vs logger PostToolUse

**En V1 : transcript parsing.**

Pas parce que c’est plus beau. Parce que c’est **déjà disponible au point où tu en as besoin**.

Le logger PostToolUse a une promesse séduisante — format maîtrisé, pas de parsing d’un transcript externe — mais il a un angle mort concret dans ton repo actuel :

- ta config `.claude/settings.json` ne wire aujourd’hui `PostToolUse` que pour `Edit|Write` et `Bash`
- donc un logger PostToolUse tel quel **ne verra pas** `Read`, `Glob`, `Grep`, ni potentiellement `Agent`
- or ce sont justement les signaux que tu veux classer

Donc si tu pars sur logger maintenant, tu mesures un sous-ensemble biaisé du travail réel. C’est pire qu’un transcript fragile : c’est une métrique fausse avec un joli format.

Le transcript, lui, a deux défauts :

1. **format non contractuel** — il peut changer ;
2. **parsing plus délicat** — surtout en shell.

Mais pour ce plan précis, il a un avantage décisif : **il te donne la complétude des derniers événements de session sans refactor hooks global**.

Donc :

- **V1** = transcript parsing depuis `UserPromptSubmit`
- **V2** = logger dédié seulement si tu prouves que tu peux logger *tous* les tool calls utiles avec une config stable

### (e) Une ligne `[METRICS]` à chaque prompt : pollution ?

**Oui, risque réel de pollution. Mais le throttle “1 fois sur 3” n’est pas la bonne réponse en V1.**

Pourquoi je déconseille le throttle par prompt-count :

- tu veux une mécanique **non discrétionnaire** ;
- si tu n’émets qu’un prompt sur trois, Claude répond deux fois avec une métrique stale ;
- ton obligation future “si `[METRICS]` dit surdimensionné, Claude doit proposer le switch” devient temporellement floue.

Le bon compromis V1 :

- **calcul à chaque prompt**
- **émission à chaque prompt**
- **strictement 1 ligne, sans prose annexe**
- **verdict stable et binaire/ternaire**

Exemple acceptable :

`[METRICS] fit:low(8/10) | model:opus | verdict:switch→sonnet`

Pas d’émoji, pas de phrase complète, pas de justification longue. Tu veux un signal machine-lisible avant tout.

Si tu veux réduire le bruit plus tard, la bonne optimisation n’est pas “1 fois / 3 prompts”, mais :

- émettre seulement si la fenêtre glissante a changé,
- ou si le verdict change,
- ou si le sample est suffisant (`>= 4` tool_use exploitables).

Mais ça, c’est **V2**, après observation du bruit réel.

### Angle mort non demandé mais important

Tu n’as pas encore traité un point pratique : **l’exécution du switch par Claude**.

Dans `.claude/settings.json`, la whitelist de commandes Bash n’inclut pas explicitement `python scripts/switch_model.py ...` ni `tmux send-keys ...`.

Ce n’est pas forcément bloquant en mode interactif si l’utilisateur approuve, mais si tu veux un flux fluide “proposition → confirmation → exécution”, il faut clarifier :

- quelle commande exacte sera exécutée,
- si elle doit être whitelistée,
- et comment tu vérifies le succès réel du switch.

Sinon tu auras une architecture “belle sur papier” qui s’arrête au moment où il faut vraiment appuyer sur le bouton.

### Recommandation d’architecture V1

Je partirais sur ce découpage minimal :

1. `scripts/switch_model.py` standalone, non public
2. `hooks/model-metrics.sh` séparé de `routing-check.sh`
3. collecte via `transcript_path` uniquement
4. scoring interne **3 niveaux** (`low/medium/high`)
5. sortie **1 ligne à chaque prompt**, sans throttle initial
6. Claude propose le switch **uniquement** si verdict non-neutre + confirmation utilisateur

### Réponses courtes

- **(a)** standalone, pas CLI publique pour l’instant
- **(b)** 3 niveaux ; `Write` = medium par défaut, pas high automatique
- **(c)** hook séparé
- **(d)** transcript parsing en V1, logger PostToolUse seulement en V2 si couverture complète prouvée
- **(e)** pas de throttle 1/3 en V1 ; 1 ligne compacte à chaque prompt

---

## Intégration

**Date d'intégration** : 2026-04-15 (Claude Sonnet 4.6).

### Verdict Copilot accepté — plan V1 arrêté

Copilot a validé les 5 décisions architecturales et ajouté un angle mort critique :

**(a) Standalone** : `scripts/switch_model.py` hors `bin/cli.js`. Surface API publique trop tôt, mécanisme tmux-aware non portable.

**(b) 3 niveaux** : `low` (Read/Glob/Grep) · `medium` (Edit/Write/Bash simple) · `high` (Agent/Bash long). `Write = medium` par défaut. 2 niveaux → trop de faux positifs.

**(c) Hook séparé** : `model-metrics.sh` distinct de `routing-check.sh`. Kill-switch propre, tests isolés, routing-check.sh déjà trop chargé.

**(d) Transcript V1** : PostToolUse ne wire pas Read/Glob/Grep dans le settings.json actuel → métriques biaisées. Transcript = complétude garantie.

**(e) Pas de throttle** : 1 ligne compacte à chaque prompt. Format : `[METRICS] fit:low(8/10) | model:opus | verdict:switch→sonnet`. Émission conditionnelle (verdict change / sample suffisant) reportée en V2.

### Angle mort Copilot — ajouté au plan

`python scripts/switch_model.py` et `tmux send-keys` ne sont pas dans la whitelist Bash `settings.json`. Sans ça, Claude ne peut pas exécuter le switch même après confirmation. → Ajouter au `permissions.allow` dans `.claude/settings.json`.

### Architecture V1 finale

1. `scripts/switch_model.py` — standalone, non public
2. `hooks/model-metrics.sh` — hook UserPromptSubmit séparé
3. Collecte via `transcript_path` — 3 niveaux low/medium/high
4. 1 ligne par prompt, sans throttle
5. `.claude/settings.json` — allow `Bash(python scripts/switch_model.py*)` + `Bash(tmux send-keys*)`
6. `hooks-manifest.json` + `test/hooks.js` mis à jour
