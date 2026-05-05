# claude-atelier — Méthodologie complète

> Ce document décrit la méthodologie de travail codifiée dans l'atelier.
> Ce n'est pas juste une config : c'est un framework de travail complet.

---

## 1. Token Routing — Ne pas brûler son budget

Le problème originel : Claude qui boucle toute la nuit en Opus et
consomme la totalité des tokens.

| Modèle | Usage | Coût relatif |
| --- | --- | --- |
| **Haiku 4.5** | Exploration, subagents, watchdog, lint, tests | 1× |
| **Sonnet 4.6** | Dev quotidien, features, bug fixes, implémentation | ~5× |
| **Opus 4.6** | Architecture, debug bloquant, décision irréversible | ~50× |

**Règles :**

- En début de session, Claude **signale le modèle actif** et recommande
  un switch si surdimensionné
- Subagents toujours en Haiku (`CLAUDE_CODE_SUBAGENT_MODEL: haiku`)
- Night-mode : Sonnet max, jamais Opus (sauf bug bloquant)
- Auto-montée `/effort high` sur champ lexical complexe, auto-descente
  quand la tâche est terminée
- Pas de changement plus d'une fois par message (anti-flapping)
- **Input tokens** : ne pas relire un fichier déjà lu dans la session
- **Edit ciblé** : jamais réécriture complète si > 20 lignes non modifiées
- **`/compress`** : compresse la prose de CLAUDE.md avant un night-mode long
  (~40-65% de réduction → économie permanente sur toute la session)

---

## 2. Permissions — Zéro friction, maximum sécurité

Le problème : Claude demande une permission bash toutes les 2 minutes,
bloquant le night-mode.

**Solution :** `Bash(*)` dans allow + deny list stricte.

```json
{
  "allow": ["Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "WebFetch(*)", ...],
  "deny": ["Bash(sudo:*)", "Bash(rm -rf /*:*)", "Bash(git push --force:*)", ...]
}
```

**Philosophie :** tout autoriser sauf ce qui est destructif ou irréversible.
Le watchdog Cowork compense en cliquant sur les éventuels prompts restants.

### Limitation fondamentale — Intentions vs Garanties

**Les règles CLAUDE.md sans hooks d'enforcement sont des intentions, pas des garanties.**

| Mécanisme | Fiabilité | Peut être bypassé ? |
| --- | --- | --- |
| Règle dans CLAUDE.md | Faible | Oui — contexte saturé, inattention |
| Hook `PreToolUse` / `PostToolUse` | Forte | Non — bloquant (exit 2) |
| Hook `UserPromptSubmit` | Forte | Non — injecté avant chaque traitement |
| Watchdog Cowork (externe) | Forte | Non — externe à Claude |
| Deny list settings.json | Absolue | Non — bloqué au niveau système |

**Règle de conception :** pour toute règle critique, préférer un hook ou
une deny list. CLAUDE.md sert de référence, pas de garde-fou.

### Matrice d'enforcement — vue complète

Tous les hooks sont dans `hooks/` et branchés dans `.claude/settings.json`.

| § | Règle | Enforcement | Statut |
| --- | --- | --- | --- |
| §2 | Français, direct, pas de preamble | Préférences Claude App (système) | **Rail** |
| §3 | Explore → Plan → Implement → Verify | `guard-review-auto.sh` → `/angle-mort` | **Rail** |
| §5 | Anti-hallucination | — | **Non automatisable** (jugement) |
| §6 | Anti-boucle (3+ échecs identiques) | `guard-anti-loop.sh` PostToolUse | **Rail** |
| §7 | Qualité du code | — | **Non automatisable** (jugement) |
| §8 | Anti-patterns | — | **Non automatisable** (jugement) |
| §11 | Tests obligatoires avant push | `guard-tests-before-push.sh` PreToolUse | **Rail** |
| §13 | Commits atomiques | — | Intention |
| §13 | Jamais signer (Co-Authored-By) | `guard-no-sign.sh` PreToolUse | **Rail** |
| §13 | Commits en français | `guard-commit-french.sh` PreToolUse | **Rail** |
| §15 | Routing modèle (Opus/Sonnet/Haiku) | `routing-check.sh` UserPromptSubmit | **Rail** |
| §15 | Diagnostic QMD/§0/handoff/gate | `routing-check.sh` throttle 30 min | **Rail** |
| §18 | Extended thinking auto-montée/descente | — | Intention (1 restante) |
| §22 | Secrets, push sans gate | Deny list settings.json | **Rail** |
| §24 | Pre-push gate | Deny list settings.json | **Rail** |
| §25 | Review auto si 100+ lignes | `guard-review-auto.sh` PostToolUse | **Rail** |

**Bilan : 11 rails / 16 règles.** Les 4 non automatisables (§5, §7, §8,
§13 atomique) relèvent du jugement du modèle. 1 intention restante (§18
extended thinking) — pas de pattern de détection fiable trouvé.

---

## 3. Git Workflow — Discipline sans cérémonie

| Règle | Pourquoi |
| --- | --- |
| Commits atomiques | Un commit = une chose. Reviewable, revertable. |
| Messages en français | Langue du projet. |
| **Jamais signer** (pas de `Co-Authored-By`) | Propreté, vitesse. |
| Committer régulièrement | Le watchdog détecte l'inactivité via `git log`. |
| **Jamais `git push` sans gate** | 5 checks : secrets → fichiers sensibles → lint → build → tests. |
| **Jamais `--no-verify`** | Si la gate bloque, corriger le problème, pas le contourner. |
| Push précédé de tests | Tests locaux avant déploiement. |
| Checkpoint avant action risquée | `git stash` ou branch avant refactor. |

---

## 4. Night-Mode — Autonomie supervisée

Le problème : Claude crash à 22h34, personne ne s'en rend compte,
8 heures perdues.

**Architecture :**

```text
Claude Code (VSCode)          Watchdog Cowork (Haiku)
acceptEdits mode              Tâche planifiée horaire
commits atomiques             git log → delta > 15 min ?
ne push jamais                Screenshot VSCode → diagnostic
                              CAS A: bouton Allow → auto-clic
                              CAS B: spinner → silence
                              CAS C: figé → iMessage alerte
                              CAS D: fermé → iMessage alerte
```

**Pré-requis non négociables :**

- `.claudeignore` configuré
- `git push` en deny
- `maxBudgetUsd` défini (disjoncteur)
- Watchdog 🐶 configuré dans l'app Claude desktop
- Specs écrites avant de lancer

---

## 5. Review Inter-LLM — Claude ↔ Copilot

Le problème : un seul LLM ne voit pas ses propres angles morts.

**Pipeline :**

```text
/review-copilot → handoff .md → Copilot répond dans le fichier
→ /integrate-review → trier (retenu/à garder/écarté) → actions
```

**Déclenchement automatique (§25) :**

- Feature terminée
- Bug fix critique
- 100+ lignes modifiées
- 3+ tentatives échouées (boucle)

**Filet de sécurité :** tâche planifiée Cowork « Review Reminder »
vérifie toutes les heures si > 100 lignes et pas de handoff récent
→ iMessage.

---

## 6. Sécurité — Parano par défaut

| Couche | Protection |
| --- | --- |
| `.gitignore` | Fichiers sensibles exclus du tracking |
| `.claudeignore` | Fichiers sensibles invisibles pour Claude |
| `settings.json` deny list | Commandes destructives bloquées |
| Pre-push gate (5 étapes) | Dernière ligne de défense avant push |
| Patterns regex | Détection secrets (sk-, AKIA, ghp_, AIza...) |
| Procédure d'urgence | Révoquer → filter-branch → force push → notifier |

---

## 7. Multi-Stack — Un atelier, plusieurs langages

L'atelier s'adapte au projet via des satellites par stack, chargés
conditionnellement selon §0 :

| Stack | Fichier | Contenu |
| --- | --- | --- |
| JavaScript/TypeScript | `stacks/javascript.md` | Fonctions pures, typage strict, ESM |
| Python | `stacks/python.md` | PEP8, ruff, uv, dataclasses |
| Java | `stacks/java.md` | Optional, records, SLF4J, JUnit 5 |
| React + Vite | `stacks/react-vite.md` | Composants, hooks, Zustand |
| Firebase | `stacks/firebase.md` | Règles, Functions, Emulator |
| Docker | `stacks/docker.md` | Multi-stage, non-root, healthchecks |
| Ollama | `stacks/ollama.md` | Modelfile, VRAM, quantization |
| iOS / tvOS + Xcode | `stacks/ios-xcode.md` | SwiftUI, MVVM, xcodebuild, Makefile V4 |

### Context7 dynamique — charger la bonne doc, pas toute la doc

Le satellite `context7-mapping.md` ajoute une deuxième couche : le **contexte dynamique**.

Le principe : croiser `§0` (**Phase + Stack**) pour déterminer si Context7 doit charger :

- **aucune doc** (brainstorming)
- **une doc ciblée** (documentation, maintenance)
- **toute la stack active** (implémentation, review/test)
- **uniquement l'infra** (release/production)

Ce n'est pas juste du confort. C'est une discipline d'ingénierie :

- moins de bruit contextuel
- moins de tokens d'entrée brûlés inutilement
- moins de réponses polluées par des libs hors sujet
- plus de stabilité quand la session change de phase

Le nom marketing peut claquer. Le mécanisme, lui, reste simple : **la bonne doc, au bon moment**.

---

## 8. Orchestration — Le bon agent au bon moment

| Mode | Quand | Comment |
| --- | --- | --- |
| **Fork (subagent)** | Tâche isolée, exploration | Contexte propre, résultat → parent |
| **Teammate (Agent Teams)** | Coordination temps réel | Peer-to-peer, mailbox partagée |
| **Worktree** | Refactor risqué > 3 fichiers | Branche git isolée |
| **BMAD (optionnel)** | Gros projet, cycle complet | 6 agents spécialisés, 4 phases |

**Règles de spawn :**

- Prompt court et ciblé (le subagent ne voit pas la conversation parent)
- 5-6 tâches max par agent
- Fichiers distincts par agent (zéro overlap)
- Nettoyer dès terminé (coût idle)

### 3 patterns de puissance

| Pattern | Principe | Effet |
| --- | --- | --- |
| **Parallel Audit Storm** | 4 agents Haiku lancés en un seul message (secrets + lint + refs + tests) | Audit complet en 3 min au lieu de 15 |
| **Background Copilot Review** | Agent background écrit le handoff pendant que tu continues à coder | Zero interruption du flow dev |
| **Multi-Session CLI** | 2-3 terminaux Claude indépendants (dev + tests continus + lint watcher) | CI locale temps réel, feedback loop permanent |

Détails complets + scénarios + prompts → `src/fr/orchestration/parallelization.md`

---

## 9. Slash Commands — Les portes d'entrée

```text
/atelier-help       → Oracle : état du projet + commandes disponibles
/atelier-setup      → Onboarding interactif (8 étapes)
/design-senior      → Séréna : chef designer senior, design-first (MCP magic 21st.dev)
/review-copilot     → Handoff review pour Copilot/GPT
/handoff-debt       → Dette §25 live + génération d'un draft de handoff
/integrate-review   → Ferme la boucle (lit réponse, trie, checklist)
/angle-mort         → Review anti-complaisance avant release
/audit-safe         → Audit sécurité (5 checks)
/night-launch       → Prépare le night-mode (8 prérequis)
/atelier-doctor     → Diagnostic santé (27+ checks)
/token-routing      → Configure Haiku/Sonnet/Opus
/bmad-init          → Installe BMAD (optionnel, gros projets)
/qmd-init           → Installe QMD (optionnel, ≥ 5 fichiers .md)
/compress           → Compresse CLAUDE.md pour réduire les tokens input
/ios-setup          → Configure le workflow iOS/tvOS : VS Code + Xcode + Makefile V4
/freebox-init       → Bootstrap Freebox : app_token LCD + session HMAC-SHA1 + NAT
```

---

## 10. Le Théâtre d'atelier — Mise en scène contextuelle

L'atelier n'est pas une doc avec du texte cosplay. C'est un système
de **rôles contextuels** qui rend les rituels de travail tangibles.

### Les 5 figures

| Figure | Rôle | Commandes | Ton |
| --- | --- | --- | --- |
| **Le Maître d'atelier** | Accueil, orientation, setup | `/atelier-help` `/atelier-setup` | Calme, structurant |
| **L'Inspecteur** | Audit, review, angle mort | `/audit-safe` `/angle-mort` `/atelier-doctor` | Sec, lucide, implacable |
| **Le Veilleur de nuit** | Night mode, watchdog, budget | `/night-launch` | Bas, posé, protecteur |
| **Le Greffier** | Handoffs, traces, intégration | `/review-copilot` `/integrate-review` | Méthodique, factuel |
| **L'Intendant** | Coût, routing, compression | `/token-routing` `/compress` | Nerveux, anti-gaspillage |

### La règle

Les figures ne sont pas des personnages permanents. Ce sont des
**masques fonctionnels** qui apparaissent uniquement sur les moments
de bascule : fin de feature, audit, night-mode, handoff, 100+ lignes.

Format : **1 phrase d'entrée + 1 image mentale + action concrète**.
Jamais l'inverse. Jamais plus de 3 lignes. Si la mise en scène
ralentit l'action → la supprimer.

Détails complets → `src/fr/runtime/theatre.md`
