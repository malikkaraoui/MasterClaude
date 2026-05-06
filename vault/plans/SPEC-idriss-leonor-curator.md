---
kind: spec
version: 1
date: 2026-05-06
auteurs: [Malik (validation), Claude Opus 4.7 (rédaction)]
chantiers: [5-idriss, 6-leonor, 4-curator]
statut: prêt à implémenter
---

# SPEC — Idriss 🌙 + Léonor 🔭 + Curator skills

## Décisions validées (verrouillées)

- **Plafond skills curator** = 30 (serré, force l'élagage)
- **TTL inactivité** skill = 15 jours sans déclenchement → flag candidat archive
- **Étape fusion** : avant archive, Ollama propose si 2-3 skills inactifs partagent une posture transversale → fusion en skill plus puissant
- **Idriss** = 2 modèles Ollama (1 cloud + 1 local) + Sonnet 4.6 en synthèse
- **Léonor** = vendredi 22:00 (préparer la semaine suivante)

---

## Idriss 🌙 — Bilan quotidien (21:05)

### Schedule
- **launchd plist** : `~/Library/LaunchAgents/com.masterclaude.idriss.plist`
- **Heure** : 21:05 quotidien (5 min après ingestion Obsidian de 21:00)
- **Kill switch** : si `/tmp/idriss-disabled` existe → skip silencieux

### Fichiers à créer
- `/Users/malik/MasterClaude/bin/idriss/run.py` (orchestrateur Python)
- `/Users/malik/MasterClaude/bin/idriss/run.sh` (wrapper shell : active venv, appelle Python, exit code propre)
- `/Users/malik/MasterClaude/bin/.shared-venv/` (venv partagé Idriss + Léonor : `httpx`, `anthropic`, `python-dotenv`, `pyyaml`)
- `/Users/malik/MasterClaude/bin/idriss/templates/prompt-question.txt` (les 3 questions)
- `~/Library/LaunchAgents/com.masterclaude.idriss.plist`

### Inputs (lecture seule, pas d'écriture)
1. **Notes Obsidian modifiées aujourd'hui** :
   ```bash
   find /Users/malik/Vault/Malik -name "*.md" -newermt "today 00:00" -not -path "*/.obsidian/*"
   ```
2. **Sessions Claude du jour** :
   - Cible long terme : SessionDB Go FTS5 (chantier 2 — quand prêt)
   - Fallback actuel : `/Users/malik/MasterClaude/vault/handoffs/*.json` modifiés aujourd'hui
3. **Commits git du jour, tous repos `/Users/malik/`** :
   ```bash
   for repo in /Users/malik/*/; do
     [ -d "$repo/.git" ] || continue
     (cd "$repo" && git log --since="today 00:00" --oneline 2>/dev/null | head -20)
   done
   ```

### Pipeline (4 étapes, séquentiel)
1. **Compose résumé brut** (max ~3000 tokens) avec sections : « Notes du jour », « Sessions Claude », « Commits ».
2. **Fan-out 2 modèles Ollama** en parallèle :
   - **DeepSeek-v4-flash:cloud** via Ollama Cloud (modèle distant, voir env `OLLAMA_CLOUD_API_KEY`)
   - **Qwen3.5:4b** local (`http://localhost:11434/api/generate`)
   - Chacun reçoit : résumé brut + 3 questions :
     a. Quelle conviction retiens-tu de cette journée ?
     b. Quel red-flag vois-tu (incohérence, dette qui grossit, idée abandonnée sans raison) ?
     c. Quelle expérience tenter demain ?
3. **Synthèse Sonnet 4.6** : `anthropic.messages.create(model="claude-sonnet-4-6", ...)` reçoit résumé brut + les 2 réponses Ollama. Système prompt : « Confronte les 2 IA, garde l'utile, vire la flatterie. Format Markdown court, brut, actionnable. »
4. **Écrit le bilan** dans `/Users/malik/Vault/Malik/journal/YYYY-MM-DD-bilan.md` (frontmatter YAML : date, source: idriss, version: 1, models utilisés). Si fichier existe déjà → écrit `YYYY-MM-DD-bilan-bis.md` (jamais d'écrasement).

### Logs
- `/Users/malik/MasterClaude/logs/idriss/YYYY-MM-DD.log` (1 fichier/jour)
- Niveau INFO par défaut, DEBUG si env `IDRISS_DEBUG=1`
- Pas de rotation auto (Léonor du vendredi peut nettoyer logs > 30 jours)

### Gestion d'erreurs (degraded modes)
- **Ollama Cloud down** → continue avec Qwen local seulement (logguer « degraded mode: cloud-only »)
- **Qwen local down** → continue avec DeepSeek cloud seulement
- **Les deux down** → échec partiel : bilan écrit avec mention `⚠ Idriss en panne, voir logs`, pas d'appel Sonnet
- **Sonnet API down** → écrit le brut + les 2 réponses Ollama en l'état (Malik fera la synthèse au matin)
- **Tout down** → exit 1, launchd retentera le lendemain

### Critères d'arrêt « ça marche »
1. `launchctl load com.masterclaude.idriss.plist` ne renvoie pas d'erreur
2. Lancer manuellement `bin/idriss/run.sh --dry-run` (mode test, pas d'écriture) → produit logs cohérents
3. Lancer `bin/idriss/run.sh --once` (vraie exécution one-shot) → bilan présent dans `vault/journal/` + log propre
4. Test end-to-end avec un vault Malik mocké (fixtures `test/fixtures/idriss/`) → bilan généré, structure attendue

---

## Léonor 🔭 — Stratège hebdomadaire (vendredi 22:00)

### Schedule
- **launchd plist** : `~/Library/LaunchAgents/com.masterclaude.leonor.plist`
- **Heure** : vendredi 22:00 (`StartCalendarInterval` : Weekday=5, Hour=22, Minute=0)
- **Kill switch** : `/tmp/leonor-disabled` → skip

### Fichiers à créer
- `/Users/malik/MasterClaude/bin/leonor/run.py`
- `/Users/malik/MasterClaude/bin/leonor/run.sh`
- `~/Library/LaunchAgents/com.masterclaude.leonor.plist`
- (réutilise venv partagé Idriss)

### Inputs
1. **Tout le vault Malik** (récursif `.md`, sans filtre date)
2. **Tous les `CLAUDE.md` projets** : `/Users/malik/*/CLAUDE.md` + `/Users/malik/*/.claude/CLAUDE.md`
3. **Bilans Idriss de la semaine** : `/Users/malik/Vault/Malik/journal/YYYY-MM-DD-bilan.md` du lundi au vendredi

### Pipeline
1. **Compose résumé hebdo** (~10–15k tokens — Sonnet 4.6 a 1M context, on peut être généreux)
2. **Sonnet 4.6 direct** avec le résumé + UNE question :
   > Sur ces 7 derniers jours, qu'est-ce qui se cherche entre les projets ? Quelle idée du projet A bénéficierait au projet B ? Quel chantier dort que personne ne réveille ?
3. **Sortie attendue** : 3 propositions concrètes pour la semaine + 1 chantier à enterrer + un paragraphe « Questions ouvertes »
4. **Sanity-check optionnel Ollama** (Qwen local) : « ces propositions sont-elles réalistes vu les contraintes du vault ? » → ajout en bas de la note

### Output
- `/Users/malik/Vault/Malik/strategie/YYYY-Wnn-leonor.md` (numéro de semaine ISO)
- Frontmatter : week, source: leonor, version: 1

### Logs
- `/Users/malik/MasterClaude/logs/leonor/YYYY-Wnn.log`

### Critères d'arrêt
1. plist load OK
2. `bin/leonor/run.sh --dry-run` produit la note attendue sans écriture
3. Lecture par Malik le samedi matin = utile et actionnable

---

## Curator skills (chantier 4 — pas dans cette session)

### Règles
- Plafond strict : **30** skills max dans `~/.claude/skills/`
- TTL : 15 jours sans déclenchement → candidat archive
- Tracking déclenchements : table SQLite `~/.claude/skills-usage.db` (ou append-log JSONL)

### Étape fusion (avant archive)
Quand 2-3 skills sont candidats archive simultanés :
1. Curator extrait leurs descriptions (frontmatter + premier paragraphe)
2. Demande à Qwen local : « ces skills partagent-ils une posture transversale ? Si oui, propose un skill fusionné qui hérite des deux/trois en élargissant la portée. »
3. **Si fusion plausible** : génère un skill candidat dans `~/.claude/skills-pending-merge/` + notification Telegram (`Idriss a vu une fusion possible : merge X+Y → Z. /accept, /reject`)
4. **Sinon** : archive simple dans `~/.claude/skills-archived/YYYY-MM-DD/`

### Schedule
- Pas de cron dédié — Léonor le déclenche en fin de pipeline le vendredi
- Commande manuelle : `bin/curator/run.py --dry-run`

---

## Variables d'environnement (`.env` à la racine MasterClaude)

```dotenv
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_HOST=http://localhost:11434
OLLAMA_CLOUD_API_KEY=...        # à récupérer chez Ollama Cloud
MASTERCLAUDE_VAULT=/Users/malik/Vault/Malik
MASTERCLAUDE_HOME=/Users/malik/MasterClaude
IDRISS_MODEL_CLOUD=deepseek-v4-flash:cloud
IDRISS_MODEL_LOCAL=qwen3.5:4b
IDRISS_SYNTH_MODEL=claude-sonnet-4-6
LEONOR_SYNTH_MODEL=claude-sonnet-4-6
```

`.gitignore` doit déjà couvrir `.env`. Vérifier avant commit.

---

## Pré-requis avant lancement production

1. ☐ SessionDB Go portée (chantier 2) — sinon Idriss reste sur fallback handoffs JSON (acceptable v1)
2. ☐ Anthropic API key valide dans `.env`
3. ☐ Ollama Cloud configuré (ou skip DeepSeek pour v1)
4. ☐ `launchctl load` testé en dry-run avant production
5. ☐ Pre-push gate (§24 CLAUDE.md) passe sur le commit Idriss

---

## Ordre de livraison strict

1. **Idriss** en premier (utilité immédiate quotidienne, feedback rapide)
2. **Léonor** une fois Idriss stable 7 jours consécutifs (validé par Malik)
3. **Curator** en dernier, greffé sur Léonor

### Séquence §25 CLAUDE.md (auto, sans demander)

À la fin de l'implémentation Idriss (ou Léonor) — chaque agent = sa propre PR :

1. Branche : `git checkout -b feat/idriss-daily-review` (ou `feat/leonor-weekly-strategist`)
2. Commits atomiques FR (plist, run.py, run.sh, templates, tests, venv)
3. Gate pré-push : `bash scripts/pre-push-gate.sh`
4. `/review-copilot` → handoff JSON
5. `git push -u origin feat/idriss-daily-review`
6. `gh pr create --draft --base main --title "feat(idriss): bilan quotidien 21:05 (Ollama+Sonnet)" --body "<résumé>"`
7. `gh pr ready` (draft → ready_for_review)
8. `/copilot-loop` ou subscribe_pr_activity
9. Attendre verdict Copilot
10. Fixes éventuels → push → re-review
11. Approbation → `gh pr merge --squash --delete-branch` + `git checkout main && git pull`
12. Reporter à Malik : URL PR mergée + SHA main

**Verrou humain** : Copilot demande > 50 lignes de changement ou questionne l'archi (ex: choix Ollama Cloud vs autre) → STOP, demande Malik.

---

## Contraintes globales

- **Pas de sudo, jamais**
- **Idempotent** : relancer 10 fois sans casser, sans doublon
- **Logs propres**, pas de spam
- **Tests unitaires obligatoires** : mock Anthropic API + mock Ollama HTTP
- **Pré-push gate** doit passer avant tout commit poussé
- **Anti-hallucination** : si une API/endpoint Ollama Cloud n'est pas certaine → demander à Malik avant de coder
- **Commits atomiques**, messages FR, pas de signing (cf. §13 CLAUDE.md)
- **Pas de Curator** dans la session de livraison Idriss/Léonor
