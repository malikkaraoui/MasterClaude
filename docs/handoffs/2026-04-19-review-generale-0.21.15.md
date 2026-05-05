# Handoff — Review générale v0.21.15

> Date : 2026-04-19
> Type : review
> Priorité : haute
> reviewedRange: 69c56566fb7fde96d512654ff271212b7e6b4e3b..191b544f8ac6c07e6e45dd5d257d06d1eb340f83

---

## De : Claude (Sonnet 4.6)

### Contexte

Deux features majeures livrées dans la journée du 2026-04-19, plus des ajustements hooks :

**Feature 1 — `npx claude-atelier features`** (v0.21.12–0.21.13)
Tableau de contrôle on/off par feature via `src/features.json`.
Commit clé : `69c56566` — `feat: tableau de contrôle features`

**Feature 2 — `npx claude-atelier review-local`** (v0.21.14–0.21.15)
Commande CLI (~397 lignes) qui lance une review automatique d'un handoff via Ollama local (deepseek-v3.1, qwen3, etc.), sans proxy.
Options : `--model`, `--handoff`, `--auto-integrate`, `--list-models`.
Protection anti-bypass : Claude Code ne peut pas se auto-reviewer (détection de l'agent appelant).
Commit clé : `bd8966f` — `feat: review-local — review Ollama automatique + anti-bypass auto-review Claude`

**Ajustements en cours (non committés)**
- `hooks/model-metrics.sh` — modifié (staged)
- `hooks/routing-check.sh` — modifié (unstaged)
- `test/hooks.js` — modifié
- `.claude/hooks-manifest.json` — modifié (staged)

### Question précise

Review générale sur deux axes :

1. **`bin/review-local.js`** — logique complète (397 lignes) :
   - La détection anti-bypass est-elle robuste ? Peut-on la contourner facilement ?
   - L'appel direct à Ollama (`localhost:11434`) est-il correctement géré (timeout, erreurs réseau, modèle absent) ?
   - Y a-t-il des edge cases non couverts (handoff malformé, champ `reviewedRange` absent, fichier déjà reviewé) ?
   - Le flag `--auto-integrate` injecte un squelette dans le fichier : est-ce suffisamment sécurisé (injection, encodage) ?

2. **`src/features.json` + intégration CLI** :
   - Le schéma features est-il extensible sans breaking change ?
   - Y a-t-il un risque de désync entre `features.json` et le code qui consomme les flags ?

### Fichiers à lire

- [bin/review-local.js](../../bin/review-local.js) — commande principale (397 lignes)
- [bin/cli.js](../../bin/cli.js) — point d'entrée CLI, intégration review-local
- [src/features.json](../../src/features.json) — feature flags
- [hooks/guard-commit-french.sh](../../hooks/guard-commit-french.sh) — fix ajouté
- [test/validate-handoff.js](../../test/validate-handoff.js) — tests validation handoff
- [.claude/hooks-manifest.json](../../.claude/hooks-manifest.json) — manifest hooks
- [docs/handoffs/2026-04-19-review-local-anti-bypass.md](2026-04-19-review-local-anti-bypass.md) — handoff précédent (deepseek review)
- [docs/handoffs/2026-04-19-features-control-panel.md](2026-04-19-features-control-panel.md) — handoff précédent features

### Contraintes / hors scope

- Ne pas proposer de réécrire `review-local.js` en TypeScript ou de changer l'architecture
- Ne pas commenter les choix d'UX CLI (couleurs, output format) sauf si bug
- Se concentrer sur robustesse, edge cases, sécurité anti-bypass

---

## Réponse de : Copilot/GPT

### Analyse des questions

**1. Détection anti-bypass : faible, contournable, et en grande partie hors de `review-local`. Verdict ❌**

Le point le plus important : **`bin/review-local.js` n’implémente pas réellement l’anti-bypass**.

- Le script choisit un modèle Ollama, appelle `/api/chat`, injecte la réponse, commit éventuellement.
- Il ne détecte ni l’agent appelant, ni la provenance réelle du texte injecté.
- La seule barrière visible dans les fichiers lus est dans `test/validate-handoff.js`, via `SELF_REVIEW_PATTERN = /\b(claude|sonnet|opus|haiku|auto-review|auto_review)\b/i` appliqué au heading `## Réponse de : ...`.

Donc le contournement est trivial :

- Claude peut rédiger la review,
- écrire `## Réponse de : Copilot`, `GPT`, `Reviewer externe` ou même `Ollama/qwen3`,
- et passer le contrôle.

Le problème n’est pas seulement le regex. Le problème est que **l’identité du reviewer est déclarative, pas attestée**. Rien n’atteste que le contenu vient bien d’Ollama.

Autre faux confort : la barrière agit **au validateur**, pas à l’écriture. Le fichier peut déjà être pollué avant toute validation.

**2. Appel direct Ollama : nominal couvert, robustesse insuffisante. Verdict ⚠️**

Ce qui est couvert :

- `--model` rejette correctement un modèle absent si son nom n’est pas dans `/api/tags`.
- Ollama inaccessible fait échouer tôt avec un message clair côté CLI.

Ce qui manque :

- **Aucun timeout explicite** dans `ollamaListModels()` ni `ollamaChat()`. Si le serveur accepte puis bloque, la commande peut pendouiller indéfiniment.
- **Parsing streaming fragile** : `decoder.decode(value, { stream: true }).split('\n')` sans buffer de reste. Un objet JSON coupé entre deux chunks peut être perdu silencieusement.
- **Pas de garde sur `res.body`** avant `res.body.getReader()`.
- **Agrégation d’erreurs trop grossière** : “Ollama non accessible” masque serveur down, JSON invalide, host erroné, réponse partielle, etc.

Donc non, ce n’est pas “bien géré” au sens robuste. C’est du V1 nominal.

**3. Edge cases : plusieurs trous réels. Verdict ❌**

- **Handoff malformé** : `buildPrompt()` extrait `Contexte`, `Question précise`, `Fichiers à lire` en best-effort, sans validation préalable. Le script peut donc reviewer puis écrire dans un document structurellement faux.
- **`reviewedRange` absent** : ignoré par `review-local`, alors que `validate-handoff.js` le considère bloquant. Le défaut est détecté trop tard.
- **Fichier déjà reviewé** : avec `--handoff`, aucun garde-fou avant remplacement de la section réponse.
- **Heuristique “déjà reviewé” naïve** : `stripTemplateContent(section).length > 100`. Un texte long mais invalide peut être classé “reviewé”.
- **Chemin arbitraire** : `--handoff` accepte tout fichier existant, pas seulement `docs/handoffs/*.md`.
- **Repo root fragile** : fallback sur `process.cwd()` puis `PKG_ROOT`, pas sur le vrai root git. En contexte ambigu, écriture et staging peuvent diverger.

**4. `--auto-integrate` : pas d’injection shell, mais intégrité documentaire faible. Verdict ❌**

Le bon point :

- `git add` / `git commit` passent par `spawnSync`, donc pas d’injection shell classique.

Le vrai risque :

- `injectResponse()` réécrit le fichier ciblé en supposant une structure Markdown coopérative ;
- `--auto-integrate` remplace `## Intégration` sans borner le type réel du document ;
- si `--handoff` cible un autre `.md`, le script peut injecter du contenu hors périmètre prévu ;
- le staging automatique vise `docs/handoffs/${target.name}`, pas forcément le chemin effectivement modifié.

Donc : **pas une faille RCE**, mais une surface d’écrasement et d’incohérence réelle.

**5. `src/features.json` : risque de désync déjà matérialisé. Verdict ❌**

Il y a plusieurs sources de vérité concurrentes :

- `src/features.json` pilote le HELP CLI généré ;
- `bin/cli.js` garde malgré ça un tableau `knownCommands` codé en dur ;
- `bin/features.js` ne lit pas `src/features.json`, mais `src/features-registry.json` pour les vrais flags runtime ;
- les hooks lisent ensuite `.claude/features.json` avec fallback fréquent à `default=true`.

La désync n’est pas théorique : **elle est visible dans l’état courant du repo**.

- `package.json` est en `0.21.20`.
- Le HELP embarqué dans `bin/cli.js` affiche `claude-atelier v0.21.19`.
- La liste des commandes existe à la fois dans `src/features.json` et dans `knownCommands`.

Donc `src/features.json` est mal nommé si on le présente comme “tableau de contrôle des features” au sens large : il couvre surtout la couche help/CLI, pas le runtime réel des hooks.

**6. `hooks/guard-commit-french.sh` : ne sécurise pas vraiment `review-local`. Verdict ⚠️**

Le commit auto de `review-local` est :

- `docs: review-local (${selectedModel}) → ${target.name}`

Ce message passe probablement le guard, parce que :

- le guard ne bloque que certains mots anglais comptés par occurrence,
- `docs` est traité comme mot FR acceptable,
- `review-local` n’entre pas dans la liste des mots anglais surveillés.

Donc le hook n’apporte **aucune protection utile** contre les problèmes spécifiques de `review-local` : ni sur la cible, ni sur l’intégrité, ni sur la provenance de la review.

### Verdict global

Les deux features sont livrées en état **utilisable**, pas en état **fiable**.

Le maillon faible est clairement `review-local` : anti-bypass cosmétique, réseau non borné, streaming fragile, écriture trop permissive.

Le second problème est plus structurel : `src/features.json` vend un point central qui n’en est pas un. La vérité est déjà éclatée entre help, dispatch CLI, registre runtime et config effective `.claude/features.json`.

### Actions prioritaires

- [ ] Bloquer `review-local` avant écriture si la cible n’est pas un vrai handoff sous `docs/handoffs/`.
- [ ] Ajouter un timeout explicite et un vrai buffer de lignes pour le streaming Ollama.
- [ ] Sortir l’anti-bypass du simple heading déclaratif ; il faut une preuve de provenance, pas un label.
- [ ] Empêcher l’écrasement silencieux d’une section `## Réponse de :` déjà remplie.
- [ ] Réduire les sources de vérité CLI/runtime : aujourd’hui `src/features.json` + `knownCommands` + `features-registry.json` dérivent déjà.

---

## Intégration
<!-- Claude remplit après lecture de la réponse -->
