# Spec — Pulse & Maestro
> Date : 2026-04-28 · Auteur : Malik Karaoui · Statut : **draft**  
> Feature : `pulse` · Cible : v0.23.0 · Branche : `feat/pulse-maestro`

---

## 1. Vision & périmètre

### Ce que c'est
Un système de **présence multi-agents** entièrement fichier (`pouls.md`), sans infrastructure supplémentaire, intégré au cycle de vie Claude Code via hooks Start/Stop.

Chaque agent déclare son état, son rôle et son intensité de travail. Le **Maestro** (hook Start) lit `§0.Phase` et ajuste dynamiquement le pouls — exactement comme le système de routing modèle ajuste Haiku/Sonnet/Opus.

### Ce que ce n'est pas (V1)
- Pas de daemon, pas de serveur, pas de base de données
- Pas d'échange de tokens crypto (out of scope V1, architecture prévue)
- Pas de push réseau entre agents (le fichier `pouls.md` est local ou partagé via Git)

### Compatibilité agents
| Agent | Mécanisme |
|-------|-----------|
| Claude Code | Hook Stop (écriture auto) + Hook Start (Maestro) |
| Ollama local | CLI one-shot `claude-atelier pulse update` |
| Ollama cloud | CLI one-shot `claude-atelier pulse update` |
| Agent tiers (GPT, Copilot…) | CLI one-shot `claude-atelier pulse update` |

---

## 2. Format `pouls.md`

Un fichier par agent, stocké à la racine du repo ou dans `.claude/agents/<id>/pouls.md`.

```yaml
---
schema: pouls/1.0
agent:
  id: claude-code/malik-local          # unique, format: provider/instance
  name: Claude Code — Malik
  role: dev                            # secretary | dev | marketing | cyber | ops
  provider: claude                     # claude | ollama | openai | other

status: idle                           # off | idle | low | medium | high | critical
lastPulse: "2026-04-28T13:35:35Z"     # ISO 8601 UTC
ttl: 300                              # secondes avant péremption (staleness)

phase: "Phase 2 — proxy tool_use mapping"  # copié de §0 au moment de l'écriture
intensity:
  current: 0.2                        # 0.0..1.0 calculé par Maestro
  ceiling: 0.8                        # plafond défini par le rôle

lang: fr                              # fr | en — défini à l'init
---

## État courant

Travail proxy tool_use. Disponible pour reviews Go/Node.
```

### Niveaux de pouls (bilingue)

| Status | FR | EN | Intensité |
|--------|----|----|-----------|
| `off` | éteint | off | 0.0 |
| `idle` | repos | idle | 0.1–0.2 |
| `low` | faible | low | 0.2–0.4 |
| `medium` | modéré | moderate | 0.4–0.6 |
| `high` | élevé | high | 0.6–0.8 |
| `critical` | critique | critical | 0.8–1.0 |

### Templates de rôle (`src/profiles/roles/`)

| Rôle | TTL | Ceiling | Pattern |
|------|-----|---------|---------|
| `secretary` | 600s | 0.3 | toujours actif, faible intensité |
| `dev` | 300s | 0.8 | bursts intenses, repos entre sprints |
| `marketing` | 900s | 0.6 | heures ouvrées, modéré |
| `cyber` | 120s | 1.0 | on-call, peut monter critique |
| `ops` | 180s | 0.7 | continu, modéré-élevé |

---

## 3. Maestro — Hook Start (`hooks/start-maestro.sh`)

### Responsabilités
1. Lire `§0.Phase` et `§0.Stack` depuis `.claude/CLAUDE.md`
2. Détecter un changement de phase (comparer avec `lastPhase` en cache)
3. Calculer l'intensité de l'agent courant selon son rôle + la phase courante
4. Mettre à jour uniquement le `pouls.md` de l'agent courant
5. Injecter la pastille `💓` dans l'entête §1 (via env var lue par le hook horodatage)
6. Si changement de phase → afficher recommandation de nouvelle session

### Sémantique retenue

Pulse mesure la **présence réelle par agent**.

Conséquence : Maestro ne doit jamais rafraîchir indistinctement tous les
`pouls.md`. Les agents non courants sont lus pour calculer `actifs/total`,
mais leur `lastPulse` reste intact. Sinon, le start hook ferait croire que
des agents inactifs sont présents.

### Logique de détection de changement de phase

```
cache: /tmp/claude-atelier-last-phase
lecture §0 → phase_courante
si phase_courante ≠ cache → changement détecté
  → écrire cache avec phase_courante
  → logger: "⚡ Phase changée : <ancien> → <nouveau>"
  → afficher: "💡 Nouvelle phase détectée → /compact recommandé + nouvelle session"
sinon → continuer normalement
```

### Calcul d'intensité par phase

Le Maestro mappe la phase actuelle à un profil d'intensité :

| Phase | Agents attendus | Intensity boost |
|-------|----------------|-----------------|
| Archi / conception | ops, dev | +0.3 sur dev |
| Implémentation active | dev | +0.4 sur dev |
| Review / QA | secretary, dev | dev modéré, secretary actif |
| Deploy / release | ops, cyber | ops +0.3, cyber +0.2 |
| Repos / freeze | tous | -0.3 global |

### Format de sortie §1 (pastille pouls)

Ajouté à l'entête obligatoire, après les autres indicateurs :

```
[2026-04-28 13:48:24 | claude-sonnet-4-6] 🟢 M | 🦙❌ | 🔌❌ | 💓élevé·3/5
```

- `💓élevé·3/5` = niveau FR + agents actifs / total détectés
- `💓high·3/5` = niveau EN (si `lang: en` dans `atelier-config`)
- Le compte `3/5` = fichiers `pouls.md` non expirés / total lisible

---

## 4. Hook Stop (`hooks/stop-pulse.sh`)

Déclenché à chaque fin de session Claude Code.

1. Trouver tous les `pouls.md` de l'agent courant (`agent.id` = `claude-code/<hostname>`)
2. Mettre à jour `status`, `lastPulse`, `phase` (depuis §0 courant)
3. Calculer `intensity.current` selon durée session + tokens consommés (heuristique simple)
4. Écrire fichier sans créer de commit (l'utilisateur commite quand il veut)

---

## 5. CLI — Commande `pulse`

### Commandes

```bash
# Statut de tous les agents détectés
claude-atelier pulse status

# Initialiser pouls.md pour l'agent courant
claude-atelier pulse init [--role dev|secretary|marketing|cyber|ops]

# Mise à jour manuelle (agents non-Claude Code)
claude-atelier pulse update [--status high] [--phase "Phase 2"]

# Lister les agents avec filtre
claude-atelier pulse list [--expired] [--role dev]
```

### Sortie `pulse status`

```
💓 Agents actifs — Phase 2 · proxy tool_use mapping
──────────────────────────────────────────────────────────────────
  claude-code/malik-local   dev        💓élevé    0.7/0.8  ✓ il y a 4min
  ollama/llama3-local       ops        💓repos    0.1/0.5  ✓ il y a 12min
  copilot/reviewer          secrétaire 💓faible   0.2/0.3  ✗ EXPIRÉ (17min)
──────────────────────────────────────────────────────────────────
  3 agents · 2 actifs · 1 expiré
```

### Flags communs
| Flag | Description |
|------|-------------|
| `--json` | Sortie JSON brute (pipes, scripts) |
| `--expired` | Afficher uniquement les agents expirés |
| `--lang fr\|en` | Override langue (défaut : `atelier-config`) |
| `--global` | Chercher dans `~/.claude/` en plus du projet |

---

## 6. Init flow — Question langue

À l'installation (`claude-atelier init`), une question est posée **avant** toute installation :

```
? Langue préférée / Preferred language: (Use arrow keys)
❯ Français (fr)
  English (en)
```

La réponse est stockée dans `.claude/atelier-config.json` :

```json
{
  "lang": "fr",
  "pulse": {
    "enabled": true,
    "defaultRole": "dev"
  }
}
```

Si `lang` déjà présent dans `atelier-config.json` → skip la question au `update`.

---

## 7. Feature flag `pulse`

### `src/features.json` — ajout de commande

```json
{
  "name": "pulse",
  "description": "Système de présence multi-agents avec pouls par rôle et Maestro §0 watcher",
  "flags": [
    "--role <secretary|dev|marketing|cyber|ops>",
    "--json",
    "--expired",
    "--lang <fr|en>"
  ]
}
```

### `src/features-registry.json` — feature toggle

```json
{
  "pulse": {
    "enabled": true,
    "description": "Heartbeat multi-agents (pouls.md) + Maestro §0 watcher",
    "since": "0.23.0"
  }
}
```

Commande pour activer/désactiver :
```bash
claude-atelier features --off pulse   # désactiver
claude-atelier features --on pulse    # réactiver
```

---

## 8. README / `--help` — Entrées à ajouter

### Section `Commands` dans `--help`
```
  pulse             Gestion du pouls multi-agents (statut, init, mise à jour)
```

### Section `Highlights` dans `--help`
```
  • Système de présence multi-agents (pouls.md) avec Maestro §0 watcher
```

### README `Features` table
```
| `pulse` | Heartbeat multi-agents · `pouls.md` par agent · Maestro §0 watcher · FR/EN |
```

---

## 9. Fichiers à créer / modifier

### Créer
| Fichier | Rôle |
|---------|------|
| `hooks/start-maestro.sh` | Hook Start : §0 watcher, calcul intensité, pastille §1 |
| `hooks/stop-pulse.sh` | Hook Stop : mise à jour `pouls.md` agent courant |
| `bin/pulse.js` | Implémentation commande `claude-atelier pulse` |
| `src/profiles/roles/dev.yaml` | Template rôle dev |
| `src/profiles/roles/secretary.yaml` | Template rôle secrétaire |
| `src/profiles/roles/marketing.yaml` | Template rôle marketing |
| `src/profiles/roles/cyber.yaml` | Template rôle cyber |
| `src/profiles/roles/ops.yaml` | Template rôle ops |
| `src/fr/pulse/` | Strings FR pour la feature pulse |
| `src/en/pulse/` | Strings EN pour la feature pulse |

### Modifier
| Fichier | Changement |
|---------|-----------|
| `bin/cli.js` | Ajouter commande `pulse` + routing vers `bin/pulse.js` |
| `src/features.json` | Ajouter entrée `pulse` dans `commands[]` + `highlights[]` |
| `src/features-registry.json` | Ajouter feature flag `pulse` |
| `bin/init.js` | Ajouter question langue si absent de `atelier-config` |
| `.claude/CLAUDE.md` §1 | Documenter format pastille `💓` dans l'entête |
| `hooks/session-model.sh` | Lire pastille pouls depuis env et l'inclure dans §1 |

---

## 10. Séquence d'implémentation recommandée

```
1. [archi]  src/profiles/roles/*.yaml — templates de rôle
2. [archi]  src/features-registry.json + src/features.json — feature flag
3. [core]   hooks/stop-pulse.sh — écriture pouls.md fin de session
4. [core]   hooks/start-maestro.sh — §0 watcher + pastille §1
5. [cli]    bin/pulse.js — commande pulse status/init/update/list
6. [cli]    bin/cli.js — routing + knownCommands + HELP update
7. [init]   bin/init.js — question langue
8. [i18n]   src/fr/pulse/ + src/en/pulse/ — strings bilingues
9. [test]   test/ — tests unitaires pour parse pouls.md + calcul TTL
10. [docs]  README — section pulse + table features
```

---

## 11. Contrat d'interface (stable)

- `pouls.md` DOIT avoir le champ `schema: pouls/1.0` — version explicite pour migrations futures
- `agent.id` DOIT être unique par agent sur le projet (format `provider/instance`)
- `ttl` en secondes, toujours positif
- `lang` dans `atelier-config.json` fait foi — les `pouls.md` héritent
- La pastille `💓` est **opt-out** via `features --off pulse`, jamais opt-in obligatoire
- Le hook Maestro NE fait PAS de commit automatique — il écrit les fichiers, l'utilisateur commite

---

## 12. Tests à couvrir

| Cas | Fichier |
|-----|---------|
| Parse `pouls.md` valide | `test/pulse/parse.test.js` |
| TTL expiré vs actif | `test/pulse/ttl.test.js` |
| Calcul intensité par rôle | `test/pulse/intensity.test.js` |
| Détection changement de phase §0 | `test/pulse/maestro.test.js` |
| Sortie `pulse status` JSON | `test/pulse/cli-status.test.js` |
| Affichage bilingue FR/EN | `test/pulse/i18n.test.js` |
