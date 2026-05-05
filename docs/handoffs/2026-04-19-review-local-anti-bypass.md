# Handoff — review-local + anti-bypass auto-review Claude

> Date : 2026-04-19
> Type : review
> Priorité : moyenne
> reviewedRange: 1da0a267676ab32fdeabb7a3b47600af3b366a4f..7c4a81571df0f0ca0ede7bd8e3f989c6512656cd

---

## De : Claude (Sonnet 4.6)

### Contexte

2 features livrées :

1. **`review-local`** (`bd8966f`) : nouvelle commande `npx claude-atelier review-local`. Appelle Ollama directement (`localhost:11434/api/chat`, streaming). Sélection interactive du modèle avec indice de qualité (haute/moyenne/basique). Injecte la réponse dans la section Réponse du handoff. Commit automatique via `spawnSync`. Options : `--model`, `--handoff`, `--auto-integrate`, `--list-models`.

2. **Anti-bypass auto-review** (même commit) : `test/validate-handoff.js` détecte si la section Réponse vient de Claude (pattern `claude|sonnet|opus|haiku|auto-review`). Si oui → reject avec message dédié.

### Question précise

(1) Le pattern `SELF_REVIEW_PATTERN = /\b(claude|sonnet|opus|haiku|auto-review|auto_review)\b/i` dans le validator est-il assez robuste ? Peut-il générer des faux positifs (nom de projet contenant "claude") ou des faux négatifs (auto-review déguisée) ? (2) La fonction `injectResponse()` dans `review-local.js` utilise un regex pour remplacer la section Réponse — ce regex peut-il rater ou corrompre le fichier si la section manque ou si le texte du handoff contient la chaîne "## Réponse de :" dans le corps du texte ? (3) Le commit automatique via `gitAdd` + `gitCommit` dans `review-local.js` — que se passe-t-il si le repo root détecté est incorrect (CWD ≠ repo) ?

### Fichiers à lire

```
bin/review-local.js             # commande complète (~375 lignes)
test/validate-handoff.js        # lignes 150-162 (anti-bypass rule)
```

### Contraintes

- Ollama doit tourner (`ollama serve`) — pas de fallback si absent
- Node.js ≥ 18 (fetch natif, ESM)
- Streaming via `res.body.getReader()` — pas de dépendance externe

---

## Réponse de : Ollama/deepseek-v3.1:671b-cloud

> Reviewé le 2026-04-19 par Ollama/deepseek-v3.1:671b-cloud (review automatique — haute qualité)

### Analyse des questions

**Question 1** : Le pattern anti-bypass est insuffisant. ❌ Il génère des faux positifs évidents (projets contenant "claude" ou "sonnet") et des faux négatifs (variations comme "Claude-3", "auto_reviewer"). Pattern trop naïf pour une protection sérieuse.

**Question 2** : Le regex d'injection est fragile. ⚠️ Il peut corrompre le fichier si la section cible est mal formée ou absente, ou si le texte du handoff contient la chaîne "## Réponse de :" dans le corps du texte. L'absence de validation préalable et de fallback safe représente un risque d'écrasement de contenu.

**Question 3** : Le commit automatique est risqué. ❌ Aucune vérification du CWD vs repo git réel. Risque de commits dans le mauvais dépôt ou erreur silencieuse si pas de repo git.

### Verdict global

Le code présente des failles dans la robustesse (regex injection, détection repo git). L'anti-bypass pattern est naïf mais acceptable en V1 pour le cas nominal. Les failles Q2 et Q3 sont les plus critiques.

### Actions prioritaires

- [ ] `injectResponse()` : remplacer le regex par un split sur `\n## ` pour cibler la section exacte
- [ ] `injectResponse()` : valider que la section cible existe avant écriture
- [ ] Détection repo git : ajouter `git rev-parse --show-toplevel` pour valider le CWD
- [ ] Pattern anti-bypass : documenter les limites V1, issue pour V2 (heuristique contextuelle)
- [ ] Tests : cas edge (handoff sans section Réponse, CWD hors repo)

---

## Intégration

> Intégré le 2026-04-19 après review Ollama/deepseek-v3.1:671b-cloud

### Points retenus

| # | Point Deepseek | Verdict | Action |
| --- | --- | --- | --- |
| 1 | Pattern anti-bypass naïf | ⚠️ Accepté V1 | Issue V2 : heuristique contextuelle |
| 2 | Regex injection fragile (faux positif si texte contient "## Réponse de :") | ❌ Bug critique | Fix immédiat dans `injectResponse()` : split sur `\n## ` |
| 3 | Commit auto sans check repo git | ❌ Risqué | Ajouter `git rev-parse --show-toplevel` avant commit |

### Actions concrètes

- [ ] `bin/review-local.js` : fix `injectResponse()` — split sur `\n## ` au lieu de regex
- [ ] `bin/review-local.js` : valider repo root avec `git rev-parse --show-toplevel`
- [ ] Issue V2 : pattern anti-bypass contextuel (contenu + auteur metadata)
