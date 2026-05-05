# Claude Code — Dynamic Model Switching

> **Concept** : permettre à Claude de proposer (et exécuter) un changement de modèle en cours de session, sans redémarrage, basé sur des métriques observées.

---

## 1. Architecture du système de modèles

### Ordre de priorité (plus fort → plus faible)

| Priorité | Méthode | Scope |
|----------|---------|-------|
| 1 | `/model <alias>` en session (REPL) | Session uniquement |
| 2 | `claude --model <alias>` au démarrage | Session uniquement |
| 3 | `ANTHROPIC_MODEL=<alias>` (env var) | Toutes sessions héritant du shell |
| 4 | `~/.claude/settings.json` → `"model"` | Global (défaut) |
| 5 | `.claude/settings.json` (projet) | Projet uniquement |

### Isolation entre fenêtres VS Code

Chaque fenêtre VS Code = une instance Claude Code = une session distincte.  
Un `/model` dans la fenêtre A n'a **aucun impact** sur la fenêtre B.

---

## 2. Pourquoi `/model` ne peut pas être appelé par Claude lui-même

`/model` est une **commande REPL** interceptée côté client avant d'atteindre le LLM.

```
Tu tapes "/model sonnet"
        ↓
Client Claude Code (process Node.js)
        ↓ intercepte — ne passe PAS au LLM
Modifie l'état interne de la session
        ↓
Prochains tokens → envoyés à Sonnet
```

Claude voit uniquement ce qui transite par le contexte LLM. Les slash commands ne transitent jamais par ce canal.

---

## 3. Le vrai vecteur : injection stdin/tmux

Claude **peut** exécuter du bash. Donc il peut lancer un script Python qui injecte `/model <alias>` directement dans le REPL via tmux ou stdin, **sans redémarrage de session**.

```
Claude détecte : "tâches simples, Opus = overkill"
        ↓
Propose le switch → tu dis oui
        ↓
Claude exécute : python switch_model.py sonnet
        ↓
Le script injecte "/model sonnet\n" dans le REPL via tmux
        ↓
Claude Code reçoit la commande → switch immédiat, même session
```

---

## 4. Implémentation

### 4.1 Via tmux (recommandé — le plus propre)

```python
# switch_model.py
import subprocess
import sys

VALID_MODELS = ["opus", "sonnet", "haiku", "opusplan"]

def switch_model(model: str, pane: str = "claude-session") -> bool:
    """
    Injecte /model <model> dans le pane tmux cible.
    
    Args:
        model: alias du modèle (opus, sonnet, haiku, opusplan)
        pane: nom ou ID du pane tmux (ex: "0:0.0" ou "claude-session")
    
    Returns:
        True si succès, False sinon
    """
    if model not in VALID_MODELS:
        print(f"[ERROR] Modèle '{model}' invalide. Valides : {VALID_MODELS}")
        return False

    result = subprocess.run(
        ["tmux", "send-keys", "-t", pane, f"/model {model}", "Enter"],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"[ERROR] tmux send-keys failed : {result.stderr}")
        return False

    print(f"[OK] Switch → {model} injecté dans pane '{pane}'")
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python switch_model.py <model> [pane]")
        print(f"Modèles valides : {VALID_MODELS}")
        sys.exit(1)

    model = sys.argv[1]
    pane = sys.argv[2] if len(sys.argv) > 2 else "claude-session"
    
    success = switch_model(model, pane)
    sys.exit(0 if success else 1)
```

**Identifier ton pane tmux :**
```bash
tmux list-panes -a        # voir tous les panes et leurs IDs
tmux rename-window "claude-session"  # renommer pour ciblage facile
```

---

### 4.2 Via `expect` (fallback sans tmux)

```bash
#!/bin/bash
# switch_model.sh <model>
MODEL=$1

expect -c "
  set timeout 5
  send_tty \"/model $MODEL\r\"
  expect \"> \"
"
```

---

### 4.3 Intégration dans CLAUDE.md (hook de décision)

Ajoute ce bloc dans ton `CLAUDE.md` pour que Claude sache quand et comment proposer un switch :

```markdown
## Model Switch Policy

Tu surveilles les métriques suivantes pour évaluer si le modèle actuel est adapté :

### Métriques → recommandations

| Situation observée | Action suggérée |
|-------------------|-----------------|
| Tâches des 5 derniers tours = edits simples, CSS, config | Proposer → sonnet |
| Tâches des 5 derniers tours = debug complexe, archi, refacto multi-fichiers | Proposer → opus |
| Tokens/tour faibles (<2k), aucun raisonnement multi-étapes | Proposer → sonnet ou haiku |
| Planification + implémentation imbriquées | Proposer → opusplan |

### Règle d'interaction

1. Tu **proposes** le switch avec justification en 1 ligne
2. Tu **attends** confirmation explicite de l'utilisateur
3. Si confirmé : `python ~/.claude/scripts/switch_model.py <model> <pane>`
4. Tu **confirmes** le switch effectué

### Format de proposition

> "Les 4 derniers tours étaient des modifications CSS et renommages. 
> On est sur Opus — c'est surdimensionné. Je peux passer sur Sonnet. OK ?"
```

---

## 5. Métriques à surveiller

```python
# metrics_tracker.py — à intégrer dans un hook ou session CLAUDE.md

TASK_COMPLEXITY = {
    "low": [
        "rename", "css", "comment", "typo", "format",
        "import", "lint", "config", "env", "readme"
    ],
    "high": [
        "refactor", "architecture", "debug", "algorithm",
        "security", "performance", "multi-file", "design"
    ]
}

def evaluate_model_fit(recent_tasks: list[str], current_model: str) -> dict:
    """
    Analyse les N dernières tâches et retourne une recommandation.
    
    Args:
        recent_tasks: liste de descriptions courtes des dernières actions
        current_model: modèle actuellement actif
    
    Returns:
        {"recommended": str, "reason": str, "switch": bool}
    """
    low_count = sum(
        1 for task in recent_tasks
        if any(kw in task.lower() for kw in TASK_COMPLEXITY["low"])
    )
    high_count = len(recent_tasks) - low_count
    ratio_low = low_count / len(recent_tasks) if recent_tasks else 0

    if current_model == "opus" and ratio_low >= 0.8:
        return {
            "recommended": "sonnet",
            "reason": f"{low_count}/{len(recent_tasks)} tâches simples — Opus surdimensionné",
            "switch": True
        }

    if current_model == "sonnet" and high_count >= len(recent_tasks) * 0.7:
        return {
            "recommended": "opus",
            "reason": f"{high_count}/{len(recent_tasks)} tâches complexes — Sonnet insuffisant",
            "switch": True
        }

    return {
        "recommended": current_model,
        "reason": "Modèle actuel adapté",
        "switch": False
    }
```

---

## 6. Ce qui est partagé vs isolé entre fenêtres

| Élément | Partagé entre fenêtres ? | Notes |
|---------|--------------------------|-------|
| `/model` en session | ❌ Non | Isolé par session |
| `--model` au démarrage | ❌ Non | Isolé par session |
| `ANTHROPIC_MODEL` env var | ⚠️ Dépend | Si même shell parent → oui |
| `~/.claude/settings.json` | ✅ Oui | Lu au démarrage de chaque session |
| `.claude/settings.json` (projet) | ✅ Oui (même projet) | Partagé entre toutes les fenêtres du projet |
| Injection tmux via script | ❌ Non | Ciblé par pane ID → précis |

---

## 7. Next Steps

- [ ] **Identifier le setup terminal** : tu utilises tmux ? VS Code terminal intégré ?
- [ ] **Tester l'injection tmux** : `tmux send-keys -t <pane> "/model sonnet" Enter` en manuel d'abord
- [ ] **Créer `~/.claude/scripts/switch_model.py`** avec le code section 4.1
- [ ] **Nommer tes panes tmux** pour ciblage fiable
- [ ] **Ajouter la Model Switch Policy** dans ton `CLAUDE.md`
- [ ] **Définir les seuils** de décision adaptés à ton projet (section 5)
- [ ] **Tester le flux complet** : Claude propose → tu confirmes → switch effectif → `/status` pour valider

---

## Références

- [Claude Code model config (officiel)](https://support.claude.com/en/articles/11940350-claude-code-model-configuration)
- [Claude Code docs — model aliases](https://code.claude.com/docs/en/model-config)
- `/status` — affiche le modèle actif en session
- `/model` — switch interactif (toi uniquement, ou injection tmux)
