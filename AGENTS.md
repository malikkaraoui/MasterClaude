---
name: AGENTS.md — Règles communes à tous les agents (MasterClaude)
loaded_by: tous les agents (Claude, Copilot, Gemini, Codex, sub-agents spawnés via Task)
prevails_over: les fichiers agent-spécifiques sur les règles communes
last_review: 2026-05-08
---

# AGENTS.md — Règles communes à tous les agents

> ⛔ **RÈGLE 1 — ANTI-HALLUCINATION ABSOLUE**
> Interdiction totale d'inventer, de mentir, d'halluciner.
> JAMAIS de fait, commande, API, option, chiffre, fichier, comportement non vérifié.
> Si je ne sais pas → « Je ne peux pas l'affirmer » + 2-3 hypothèses étiquetées + comment vérifier.
> Cette règle prime sur TOUT. Toujours. Sans exception. Même pour « illustrer ».
> Un faux exemple dans un schéma vaut un fait inventé dans une réponse.

---

## Hiérarchie des fichiers de configuration

- **AGENTS.md** (ce fichier) → règles universelles applicables à TOUS les agents
- **CLAUDE.md / GEMINI.md / `.github/copilot-instructions.md`** → delta propre à chaque agent
- **SOUL.md** → identité, persona et posture de MasterClaude (lue à chaque session)
- En cas de conflit AGENTS.md vs agent-spécifique → **AGENTS.md prime** sur toute règle commune. Exception : un delta agent-spécifique peut **ajouter** des contraintes plus strictes (jamais assouplir). Toute dérogation doit être listée explicitement dans le fichier delta.

---

## Flow de traitement

**Explore → Plan → Implement → Verify.**

- **Explore** : fichiers concernés uniquement (subagent `Explore` / modèle léger si large)
- **Plan** : impacts + dépendances avant d'écrire
- **Implement** : minimal viable — Edit ciblé, jamais réécriture complète si > 20 lignes non modifiées
- **Verify** : tests + gate pré-push

Mode rapide (< 2 fichiers, non critique) : Implement → Verify.

---

## Anti-hallucination — détail opérationnel

- Pour **illustrer une archi** (tableau, exemple, diagramme) : placeholders explicites (`<projet>`, `<pid>`, `N%`) ou vraies valeurs vérifiées (`ps`, `Read`, `Grep`).
- Pour **vérifier l'existence** d'un fichier/fonction/commande : `Glob`/`Grep`/`Read` AVANT de la mentionner.
- Pour **citer une source externe** : signaler explicitement si non lue (« à lire », « fourni par utilisateur »), ne pas paraphraser comme si.
- Pour **un comportement** : reproduit en local AVANT d'affirmer.
- Réflexe interdit : « ça rend l'exemple plus vivant » → faux + vivant = mensonge plus crédible.

---

## Gestion des erreurs

Une tentative corrective directe. Échec → changer d'approche, jamais itérer à l'identique. Produire hypothèses + points de rupture + stratégie alternative.

---

## Qualité du code

Prêt prod, pas sur-ingénié : validation d'inputs, erreurs propres, logs utiles, commentaires si non trivial. Plusieurs approches → recommander la plus robuste, 2 lignes de justification max.

---

## Anti-patterns

Refus : duplication, sur-ingénierie, optimisation prématurée, fonctions > 30 lignes sans raison, logique dispersée. Règle : logique réutilisée ≥ 2 fois → extraire.

**Vault-first** : toute question sur l'état du projet (livré ? testé ? actif ?) → lire `vault/30-discoveries.md` AVANT de répondre.

---

## Architecture

Template par défaut : `/core` · `/modules` · `/services` · `/utils` · `/tests`. Projets opinionnés (Next.js, Django…) → suivre la convention du framework.

---

## Tests

Obligatoires si logique métier, transformation, comportement critique. Couvrir nominal + edge cases + erreurs. `npm test` (ou équivalent) doit passer avant chaque push.

---

## Code Review

Déclenchement : après feature, audit global, blocage. RÈGLE 1 prime : jamais de critique inventée pour remplir une section.

---

## Git Workflow

Commits atomiques, messages en français, **jamais signer** (pas de trailer `Co-Authored-By`, `Signed-off-by`). Checkpoint avant action risquée. `git push` toujours précédé de la gate pré-push (`bash scripts/pre-push-gate.sh`). Merge final = `gh pr merge --rebase --delete-branch` — jamais squash.

---

## Cloud / CI-CD

Stateless, idempotent, secrets externalisés, IaC, fail fast, tests locaux avant déploiement.

---

## Sécurité (non négociable)

Jamais de clé/token en dur, `.gitignore` + `.claudeignore` obligatoires, `git push` interdit sans gate, pattern suspect → stopper.

---

## Sub-agents spawnés via Task

- Héritent ce fichier d'office (chargé au démarrage Claude Code).
- Skip écriture sur fichiers d'état globaux (`/tmp/masterclaude-*`) si le sub-agent est spawné en isolation (worktree ou Task isolée) — la variable de détection est posée par le hook `SessionStart` du projet parent.
- RÈGLE 1 = identique pour tous, sans dilution.
