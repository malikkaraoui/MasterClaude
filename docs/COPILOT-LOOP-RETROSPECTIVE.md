# Retrospective — Boucle autonome Claude ↔ Copilot

> Comment on est passé de "je copie-colle entre deux fenêtres" à "je pousse et je reviens au café"

---

## 1. Point de départ — Le problème

### Idée initiale

Utiliser GitHub Copilot comme reviewer externe pour casser les angles morts de Claude.
Copilot = GPT-4 côté OpenAI → second regard indépendant, gratuit dans l'abonnement GitHub.

### Le workflow manuel (avant)

```
Claude génère du code
  → Malik ouvre GitHub Copilot Chat
  → copie-colle le diff manuellement
  → Copilot répond dans sa fenêtre
  → Malik recopie les suggestions vers Claude
  → Claude intègre
```

**Problème fondamental** : tout repose sur Malik. Zéro valeur ajoutée de son côté — il est juste un presse-papiers humain entre deux LLMs.

### L'objectif

> "Je ne devrais plus intervenir jusqu'à ce que le push réussisse."
> — Malik, à mi-chemin

---

## 2. Première tentative — GitHub.com PR review

### Ce qu'on a essayé

Activer "Copilot code review" dans les settings GitHub (Settings > Copilot > Code review).
Ouvrir une PR → espérer que Copilot review automatiquement.

### Ce qu'on a découvert

Copilot review PR automatiquement **si et seulement si** la PR contient des fichiers de code (`.js`, `.ts`, `.py`, `.sh`...).
Il **refuse de reviewer** les PR qui ne contiennent que du `.md`.

**Conséquence immédiate** : le format de handoff devait changer.

---

## 3. Problème structurel — Le chicken-and-egg de la gate §25

### La gate

`pre-push-gate.sh` étape 6 : bloque tout `git push` si la dette §25 est dépassée
(300+ lignes ou 10+ commits depuis le dernier handoff intégré).

### Le paradoxe

```
Pour réinitialiser la dette → besoin d'un handoff Copilot intégré
Pour obtenir un handoff Copilot → besoin de pousser une branche
Pour pousser → gate §25 bloque
```

La gate avait été conçue pour du push direct vers main.
Elle n'avait pas anticipé le workflow "feature branch → PR → Copilot → merge".

### Solution

Rendre la gate **branch-aware** :

```bash
if [[ "${PUSH_TO_MAIN:-false}" != "true" ]]; then
    pass "Branche feature ($CURRENT_BRANCH) — §25 skip"
else
    # check dette...
fi
```

Le hook `pre-push` lit les refs poussées depuis stdin et exporte `PUSH_TO_MAIN=true` uniquement quand la destination est `main`/`master`. Sur toute branche feature : gate verte automatiquement.

---

## 4. Le format handoff — Du `.md` au `.json`

### Pourquoi `.md` ne marchait pas

Copilot ne reviewe que les fichiers de code. Un handoff `.md` = invisible pour Copilot.

### Solution : JSON + validate-handoff.js

Le handoff devient un `.json` dans `docs/handoffs/` :

```json
{
  "meta": { "subject": "...", "date": "2026-04-21", "type": "review",
            "reviewedRange": "sha-from..sha-to" },
  "from": { "model": "claude-sonnet-4-6", "question": "...", "filesToRead": ["..."] },
  "response": { "model": "github-copilot-pr-reviewer", "content": "..." },
  "integration": { "retained_implement": [...], "verdict": "..." }
}
```

**Double bénéfice** :
1. Les modifications de `validate-handoff.js` (fichier `.js`) déclenchent la review Copilot
2. Le JSON est structuré → parsable programmatiquement → automatisable

`validate-handoff.js` a été réécrit pour supporter les deux formats (`.md` legacy + `.json` nouveau), avec les mêmes règles anti-triche.

---

## 5. L'architecture de communication — GitHub comme boîte aux lettres

### Le problème fondamental des LLMs

Deux LLMs ne peuvent pas se parler directement. Copilot ne peut pas "appeler" Claude. Claude ne peut pas "appeler" Copilot en temps réel.

### La solution : le détour par GitHub

```
Claude pousse → GitHub héberge la PR → Copilot review automatiquement
                                      (déclenché par GitHub, pas par Claude)
         ↑                                      ↓
         └──── Claude lit via gh api ────────────┘
```

GitHub joue le rôle de **boîte aux lettres asynchrone** :
- Copilot dépose son review dans la PR (commentaires inline)
- Claude récupère ces commentaires via `gh api repos/{owner}/{repo}/pulls/{pr}/comments`
- Pas de copier-coller, pas d'intervention humaine

### L'astuce : `gh api` comme facteur

```bash
gh pr view 21 --json reviews | python3 -c "
  import json,sys
  rs=json.load(sys.stdin)['reviews']
  [print(r['author']['login'], r['commit']['oid'][:8]) for r in rs]
"
```

Cette commande dit : "Est-ce que Copilot a déposé une lettre (review) pour ce commit précis ?"

---

## 6. Le mécanisme de polling — `ScheduleWakeup`

### Pourquoi pas GitHub Actions ?

Option A (GitHub Actions) : webhook → action → appel API → réponse → commit.
- Coût supplémentaire
- Complexité infra
- En dehors du contexte local Claude Code

Option B (`ScheduleWakeup`) : Claude se réveille lui-même toutes les 5 minutes.
- **Gratuit** : inclus dans l'abonnement Claude Code Max (119€/mois)
- **Local** : tourne dans ce terminal, la réponse s'affiche ici
- **Simple** : une seule primitive, pas d'infra

### Comment ça marche

```
/copilot-loop (après git push + gh pr create)
  → ScheduleWakeup(300s, prompt="Loop PR #N tentative 1/12")
    → réveil → check Copilot review
    → pas encore → ScheduleWakeup(300s, tentative 2/12)
      → réveil → Copilot a reviewé !
      → lire commentaires → créer JSON handoff → appliquer fixes
      → valider → git push → CI verte → gh pr merge
      → LOOP TERMINÉ ✅
```

**Filets de sécurité** :
- Max 12 tentatives (1h) → notification utilisateur si timeout
- Jamais merger si CI rouge
- Jamais merger si handoff invalide (`validate-handoff.js` exit 1)
- Jamais merger si commentaires bloquants non traités

### La subtilité du prompt de réveil

Le prompt ScheduleWakeup doit être **auto-suffisant** : Claude à son réveil n'a pas le contexte de la conversation précédente. Il faut embarquer dans le prompt :
- Le numéro de PR
- Le nom de la branche
- Le SHA du commit reviewé
- Le numéro de tentative
- Les commandes à exécuter
- Les conditions de merge

---

## 7. Les bugs trouvés par Copilot (et intégrés)

### PR #20 — 6 bugs

| Bug | Fichier | Fix |
|-----|---------|-----|
| `typeof f` manquant avant filter | `validate-handoff.js` | Guard `typeof f === 'string'` |
| `errors.length === 0` au lieu de variables locales | `validate-handoff.js` | Variables `okFrom`/`okTo` locales |
| `xargs -d` non compatible macOS | `handoff-debt.sh` | Approche bash array |
| Wording gate message confus | `pre-push-gate.sh` | Message plus clair |
| `doctor.js` fail sur feature branch | `test/doctor.js` | Détection branche + `PUSH_TO_MAIN` |
| `response.model` sans guard typeof | `validate-handoff.js` | Guard `typeof response.model === 'string'` |

### PR #21 — 3 bugs

| Bug | Fichier | Fix |
|-----|---------|-----|
| Repo hard-codé `malikkaraoui/claude-atelier` | `copilot-loop/SKILL.md` | `REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)` |
| Mention `gate §25` incorrecte (`gh pr merge` = côté GitHub, pas local) | `copilot-loop/SKILL.md` | Supprimé du texte descriptif |
| Champs handoff incomplets documentés à l'étape 2.b | `copilot-loop/SKILL.md` | Documenter les champs minimum requis par `validate-handoff.js` |

---

## 8. Le rail de développement final

```
┌─────────────────────────────────────────────────────────────┐
│  RAIL DE DEV CLAUDE-ATELIER (post PR #21)                   │
│                                                             │
│  1. Coder la feature                                        │
│  2. git push (branche feature)                              │
│     → gate : secrets + lint + build + tests + §25 SKIP      │
│  3. gh pr create                                            │
│  4. /copilot-loop                                           │
│     ↓ (5 min)                                               │
│  5. Copilot review automatique (déclenché par GitHub)       │
│  6. Claude lit → handoff JSON → fixes → validate → push     │
│  7. CI verte → gh pr merge → git checkout main && git pull  │
│                                                             │
│  ← zéro intervention utilisateur entre 4 et 7 →            │
└─────────────────────────────────────────────────────────────┘
```

### Ce qui bloque encore

- Copilot ne review que les fichiers de code (pas `.md` seul)
  → Solution : toute PR utile modifie `.js`/`.sh` → Copilot s'active
- La validation de `validate-handoff.js` repose désormais sur une vérification d'ancestralité (`merge-base --is-ancestor`) plutôt que sur l'ancien check `firstIntegrated == toSha` — ce point ne fait plus partie des blocages actuels.

---

## 9. Quel modèle Copilot utilise ?

### Ce qu'on sait

GitHub Copilot PR reviewer signe ses reviews en tant que `copilot-pull-request-reviewer[bot]`. L'API GitHub ne retourne pas le nom du modèle sous-jacent dans les métadonnées de review.

### Ce qu'on ne sait pas (encore)

GitHub ne publie pas quelle version exacte de quel modèle alimente le reviewer.
Les paramètres d'organisation GitHub permettent de sélectionner le modèle Copilot dans certains contextes (Chat, Inline), mais **pas encore pour les PR reviews automatiques** via l'API publique.

### Ce qu'on peut faire

1. **Forcer l'identification** : demander dans le template de PR review que Copilot indique son modèle dans sa réponse. Ajouter dans `.github/copilot-instructions.md` :

```markdown
Quand tu fais une review de PR, commence TOUJOURS par une ligne :
`> Reviewer: GitHub Copilot [model: {ton nom de modèle exact}]`
```

2. **Monitorer** : vérifier `r['body']` de chaque review pour extraire la ligne model.

3. **Si qualité insuffisante** : GitHub propose depuis 2025 de choisir le modèle dans les settings Copilot Enterprise (GPT-4o, Claude Sonnet...). Si l'abonnement le permet, configurer via Settings → Copilot → Models.

---

## 10. Conclusion — Ce qu'on a construit

Un **rail de CI inter-LLM** où :

- **Claude** code, génère le handoff, applique les fixes, décide du merge
- **Copilot** (OpenAI) review indépendamment, détecte les bugs que Claude rate
- **GitHub** joue le rôle de boîte aux lettres asynchrone
- **`ScheduleWakeup`** joue le rôle de facteur
- **L'utilisateur** donne le signal de départ et revient au résultat

Le coût total : 0€ de plus (inclus dans les abonnements existants).
La valeur : un second cerveau sur chaque feature, sans friction, sans copier-coller.
