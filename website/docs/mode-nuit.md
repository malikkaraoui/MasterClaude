---
id: mode-nuit
title: Mode Nuit
---

Le mode nuit permet de laisser Claude travailler en autonomie complète pendant que vous dormez : commit → gate → push, sans intervention humaine.

---

## Principe

```
Soir : specs claires + pouls activé
         ↓
Claude travaille en acceptEdits
         ↓
Commits atomiques → gate pré-push → git push
         ↓
Matin : review du diff + log
```

---

## Pré-requis

- `.claudeignore` configuré
- `settings.json` avec `defaultMode: acceptEdits`
- `maxBudgetUsd` défini (obligatoire — sinon boucle infinie possible)
- `sudo` et `rm -rf` en `deny`
- Specs écrites dans `docs/specs.md`

---

## Lancer une session de nuit

```bash
claude --permission-mode acceptEdits \
  "Implementer selon docs/specs.md. \
   Ecrire les tests. \
   Committer chaque etape atomique. \
   Lancer bash scripts/pre-push-gate.sh apres chaque commit. \
   Si gate verte : git push. Si echec : stopper et noter dans todo."
```

---

## Format de specs

```markdown
# Objectif
<une phrase>

# Contexte
<fichiers concernés, contraintes, tests à passer>

# Critère de réussite
<conditions pour considérer la tâche faite>

# Hors scope
<ce qu'il ne faut PAS toucher>
```

:::warning Specs vagues = divergence garantie
Toujours inclure « Hors scope ». Sans ça, Claude interprète librement.
:::

---

## Le Pouls

Système de présence multi-agents intégré à claude-atelier.

```bash
npx claude-atelier pulse init    # initialise pouls.md pour l'agent courant
npx claude-atelier pulse update  # met à jour le heartbeat
npx claude-atelier pulse status  # état de tous les agents actifs
npx claude-atelier pulse list    # liste les agents avec leur dernière activité
```

Chaque agent maintient un fichier `pouls.md` — registre de présence horodaté. **Maestro** (`scripts/pulse-maestro.js`) supervise l'ensemble et détecte les agents silencieux.

### Comportements

| Situation | Action |
|---|---|
| Agent actif (heartbeat récent) | Pastille verte dans `pulse status` |
| Agent silencieux > seuil | Maestro signale l'absence |
| Session crashée | `pouls.md` stale → Maestro alerte |
| Reprise de session | `pulse update` remet l'agent en ligne |

:::info Pouls vs ancienne approche
Le pouls remplace le watchdog (tâche Claude desktop horaire). Il est natif au framework, multi-agents, et ne dépend pas de l'app desktop.
:::

---

## Protocole REPRISE

Déclencheurs reconnus :

- `REPRISE suite à la limite de quota`
- `relance suite a une erreur API Anthropic`
- `relance` (mot seul)

Comportement :
1. Ne pas demander d'explication
2. Lire le TodoWrite → tâches `[ ]` ou `[→]`
3. `git log -5` pour le contexte
4. Reprendre là où c'était arrêté
5. `[REPRISE] Relancé après <cause>. Reprise depuis : <tâche>`

---

## Review le matin

```bash
git log --oneline
git diff origin/main..HEAD
bash scripts/pre-push-gate.sh
git push  # si gate verte
```

---

## Quand ce mode est une mauvaise idée

- Décision architecturale ouverte
- Inconnues métier (Claude va improviser)
- Première session sur un projet inconnu (§0 vide)
- Refactor sur du code non documenté
