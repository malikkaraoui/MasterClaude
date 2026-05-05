---
id: installation
title: Installation
---

## Démarrage rapide

```bash
npx claude-atelier init
```

Une commande. Claude Code est configuré avec 15 rails d'enforcement dans `.claude/`.

---

## Options

| Option | Description |
|---|---|
| `npx claude-atelier init` | Installation projet (`./.claude/`) |
| `npx claude-atelier init --global` | Installation globale (`~/.claude/`) |
| `npx claude-atelier init --lang en` | Version anglaise |
| `npx claude-atelier init --dry-run` | Aperçu sans écriture |

---

## Ce qui est installé

```
.claude/
├── CLAUDE.md              ← Runtime core (§0–§25)
├── settings.json          ← Permissions, hooks, budget
├── hooks/                 ← 15 scripts d'enforcement
├── autonomy/              ← Mode nuit, pouls, loop
├── orchestration/         ← Fork, Teammate, Worktree
├── runtime/               ← Todo, extended thinking, théâtre
├── security/              ← Gate, secrets, emergency
├── ecosystem/             ← Hooks, skills, agents, QMD
└── skills/                ← 20 slash commands
.claudeignore              ← Patterns sensibles exclus
.gitignore                 ← Template si absent
scripts/
└── pre-push-gate.sh       ← Gate pré-push (5 étapes)
```

---

## Auto-découverte §0

Après l'installation, `/atelier-setup` auto-détecte le contexte du projet et propose une validation :

```
[AUTO] Projet : mon-app
[AUTO] Stack  : Node.js
[AUTO] Repo   : https://github.com/moi/mon-app

Valide ou corrige avant écriture dans §0. Tape [OK] pour valider.
```

Sources utilisées : `package.json`, `go.mod`, `Cargo.toml`, `git remote get-url origin`, QMD si disponible.
Seuls les champs non détectables sont demandés manuellement.

---

## Mise à jour

```bash
npx claude-atelier update
# ou pour la version globale
npx claude-atelier update --global
```

:::info Préservation lors des mises à jour
- `CLAUDE.md` : seul le §0 (contexte projet) est préservé, le reste est mis à jour
- `settings.json` : vos valeurs custom gagnent, les nouvelles clés sont ajoutées
- **Hooks** : toujours régénérés avec les chemins corrects de la machine courante
:::

---

## Vérification

```bash
npx claude-atelier doctor
```

Vérifie que tous les hooks sont en place, que `settings.json` est valide et que la gate pré-push fonctionne.

---

## Désinstallation

```bash
rm -rf .claude/ .claudeignore scripts/pre-push-gate.sh
```
