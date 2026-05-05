---
name: copilot-loop
description: "Loop autonome PR → Copilot review → handoff JSON → fixes → merge. Lance le polling automatique après un git push sur une branche feature. Zéro intervention utilisateur."
figure: La Bise
---

# Copilot Loop

> 🌬️ La Bise surveille la boîte aux lettres GitHub.
> Quand Copilot répond, elle lit, intègre, corrige et ferme la boucle.
> Sans un mot de l'utilisateur.

Loop autonome complet : PR feature → Copilot review automatique → handoff JSON → fixes → merge cible.

## Quand utiliser

Lancer immédiatement après `git push` sur une branche feature + `gh pr create`.
**Aussi déclenché automatiquement par `/review-copilot` — pas besoin d'appel manuel.**
Le loop tourne en arrière-plan via `ScheduleWakeup`.

> ⚠️ **Limitation** : `ScheduleWakeup` est **session-scoped** — si la session Claude se ferme (tab fermé, timeout), le réveil est perdu. Pour une utilisation **mode nuit / autonome**, utiliser `CronCreate` à la place (jobs persistants inter-sessions). Le skill `/night-launch` bascule automatiquement sur `CronCreate`.

## Procédure

### Étape 1 — Lire la configuration features

```bash
# Lire les paramètres depuis features.json (global ou projet)
FEATURES_FILE="${HOME}/.claude/features.json"
[[ -f ".claude/features.json" ]] && FEATURES_FILE=".claude/features.json"

python3 -c "
import json, os
f = '$FEATURES_FILE'
data = json.load(open(f)) if os.path.exists(f) else {}
params = data.get('params', {})
print('AUTO_MERGE=' + str(data.get('auto_merge_after_review', False)).lower())
print('TARGET_BRANCH=' + params.get('merge_target_branch', 'main'))
print('POLL_SEC=' + str(params.get('copilot_loop_poll_sec', 300)))
print('MAX_ATTEMPTS=' + str(params.get('copilot_loop_max_attempts', 12)))
" 2>/dev/null || echo -e "AUTO_MERGE=false\nTARGET_BRANCH=main\nPOLL_SEC=300\nMAX_ATTEMPTS=12"
```

### Étape 2 — Collecter le contexte de départ

```bash
PR_NUM=$(gh pr view --json number -q .number)
CURRENT_SHA=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
LAST_HANDOFF=$(ls -t docs/handoffs/202*.json 2>/dev/null | grep -v _template | head -1 || echo "")
```

### Étape 3 — Activer le loop via ScheduleWakeup

Appeler `ScheduleWakeup` avec :
- `delaySeconds: <copilot_loop_poll_sec>` (défaut 300)
- `reason: "Polling Copilot review PR #N (tentative 1/<max_attempts>)"`
- `prompt` : le prompt de réveil ci-dessous (auto-suffisant)

**Prompt de réveil (template)** — remplacer les variables :

```
Loop Copilot PR #[PR_NUM] branche [BRANCH] — tentative [X]/[MAX_ATTEMPTS].
Repo: [REPO].
Config: AUTO_MERGE=[auto_merge_after_review], TARGET=[merge_target_branch], POLL=[poll_sec]s.

1. Vérifier la review Copilot (via MCP GitHub si disponible, sinon fallback bash) :
   — MCP (préféré) : appeler `get_pull_request(owner, repo, pullNumber)` → lire `.reviews[]`
   — Fallback bash : gh pr view [PR_NUM] --json reviews -q '.reviews[] | select(.author.login | test("copilot")) | .commit.oid[:8]'

2. Si Copilot a reviewé le commit [CURRENT_SHA][:8] :
   a. Lire les commentaires inline (via MCP si disponible, sinon fallback) :
      — MCP (préféré) : appeler `get_pull_request_files` ou `gh api repos/[REPO]/pulls/[PR_NUM]/comments`
      — Fallback bash : gh api repos/[REPO]/pulls/[PR_NUM]/comments
   b. Créer docs/handoffs/[DATE]-[SLUG].json à partir de _template.json.
      Champs minimum requis par validate-handoff.js :
      - meta.date (YYYY-MM-DD), meta.type, meta.reviewedRange (sha..sha valides dans git)
      - from.question (≥ 50 chars), from.filesToRead (≥ 1 fichier réel)
      - response.model = "github-copilot-pr-reviewer"
      - response.content = résumé structuré des commentaires (≥ 100 chars)
      - integration.retained_implement, integration.verdict (total ≥ 100 chars)
   c. Appliquer les fixes suggérés dans le code
   d. Valider le handoff : node test/validate-handoff.js [HANDOFF_FILE]
   e. Si valide :
      git add [HANDOFF_FILE] [fichiers modifiés]
      git commit -m "fix: appliquer review Copilot #[PR_NUM]"
      git push
   f. Vérifier CI : gh pr view [PR_NUM] --json statusCheckRollup
   g. Si CI verte ET handoff valide :
      - Si AUTO_MERGE=true :
          gh pr merge [PR_NUM] --merge --delete-branch
          git checkout [TARGET_BRANCH] && git pull
          LOOP TERMINÉ ✅ — notifier l'utilisateur
      - Si AUTO_MERGE=false :
          "PR #[PR_NUM] prête à merger — CI verte, handoff valide. Merger dans [TARGET_BRANCH] ?"

3. Si Copilot n'a pas encore reviewé ce commit :
   - Si tentative < [MAX_ATTEMPTS] → ScheduleWakeup [POLL_SEC]s (tentative X+1/[MAX_ATTEMPTS])
   - Si tentative = [MAX_ATTEMPTS] → "Copilot n'a pas reviewé après [MAX_ATTEMPTS*POLL_SEC/60]min — merger manuellement ?"

Filets de sécurité :
- Ne jamais merger si CI échoue
- Ne jamais merger si handoff invalide (node test/validate-handoff.js retourne exit 1)
- Ne jamais merger si Copilot a des commentaires bloquants non traités
- Stopper après [MAX_ATTEMPTS] tentatives
```

### Étape 4 — Confirmer à l'utilisateur

"Loop Copilot activé sur PR #[N] — je surveille toutes les [POLL_SEC]s (max [MAX_ATTEMPTS] tentatives).
[Si AUTO_MERGE=true] Je mergerai automatiquement dans `[TARGET_BRANCH]` quand : Copilot reviewé ✓ + Handoff valide ✓ + CI verte ✓
[Si AUTO_MERGE=false] Je te notifierai quand la PR sera prête — merge manuel requis.
Je notifie au merge ou si timeout."

## Règles

- Toujours lire `features.json` en étape 1 — jamais hardcoder `main` ou les délais
- Toujours valider le handoff avant de merger (exit code 0 de validate-handoff.js)
- Toujours vérifier CI verte avant de merger
- `auto_merge_after_review = false` par défaut — opt-in explicite
- Un seul loop actif par PR à la fois
- Ne pas re-committer si le handoff n'a pas changé (éviter les commits vides)
