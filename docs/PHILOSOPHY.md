# Philosophy — claude-atelier

> Pourquoi ce package existe, et ce qu'il refuse d'être.

## Ce que c'est

**claude-atelier est un atelier opinionated pour Claude Code.** Pas un framework. Pas une lib. Pas un agent custom. Un set de configurations markdown + scripts shell + hooks + CLI installer, conçu pour qu'un dev sérieux puisse — en une commande — passer d'un Claude Code générique à un environnement où :

- chaque réponse est horodatée et signée par le modèle réel
- chaque push passe par une gate de sécurité 5 étapes
- chaque stack (JS, Python, Java, React-Vite, Firebase, Docker, Ollama, iOS-Xcode, Freebox) a ses standards écrits et incarnés par une figure mémorisable
- chaque hook est testable et tracé
- chaque commit est en français, sans signature LLM

## Ce que ce n'est pas

- **Pas une réimplémentation de Claude Code.** Si tu cherches un client custom, regarde [claw-code](https://github.com/ultraworkers/claw-code) (Rust) ou [opencode](https://github.com/opencodeagent/opencode). Nous, on configure le client officiel.
- **Pas un framework d'agents.** Pas de DSL maison, pas de runtime, pas d'orchestrateur. Juste des règles en markdown que Claude Code charge.
- **Pas un système plugins.** Le mécanisme de plugins de Claude Code suffit. On l'utilise (skills, hooks, MCPs), on n'en réinvente pas un.

## Les 5 partis pris

### 1. Markdown comme source de vérité

Les règles vivent dans `.claude/CLAUDE.md` et `.claude/{stacks,security,...}/*.md`. Le code shell/JS exécute ce que dit le markdown — jamais l'inverse. Si une règle existe dans un script mais pas dans un `.md`, c'est un bug : la règle est implicite et invisible.

**Conséquence opérationnelle :** `npm run lint` vérifie que les références markdown pointent sur des fichiers réels. La doc ne peut pas mentir au code.

### 2. Bilingue, FR-first

L'auteur réfléchit en français. Les règles sont écrites en français. Le README, les agents stacks, les commits, les messages d'erreur des hooks — tout en français. La traduction EN existe pour la diffusion npm, pas comme langue de travail.

**Conséquence opérationnelle :** un hook (`guard-commit-french.sh`) bloque les commits messages purement anglais.

### 3. Sécurité non négociable

Trois règles dont aucun gain de productivité ne justifie l'entorse :

- **§5 Anti-hallucination** : si Claude n'est pas sûr, il dit qu'il n'est pas sûr.
- **§22 Secrets** : aucune clé en dur, jamais. `.gitignore` + `.claudeignore` obligatoires.
- **§24 Pre-push gate** : `bash scripts/pre-push-gate.sh` avant chaque push. Pas de `--no-verify`.

Le reste (qualité de code, conventions, optimisation tokens) sert ces trois.

### 4. Théâtre mémorisable

Les standards par stack sont incarnés par des figures avec une voix. Pascal le docker boutch. Marcel le vieux Java. Nicolas & Fazia le couple React+Vite. Nael le tatillon TypeScript. Quand Claude Code charge une stack, il charge aussi un personnage — ce qui rend les règles plus mémorisables qu'une doc plate. Ce n'est pas du gimmick : un dev qui se souvient de Pascal se souvient des règles Docker.

### 5. Token-conscient par défaut

Le contexte Claude Code est précieux. L'atelier optimise activement :

- compact à **~60% de fenêtre** (pas attendre 75-98%)
- routing modèle par tâche (Haiku exploration, Sonnet dev, Opus archi)
- MCPs chargés à la demande, purgés en fin de session
- todos persistants hors flux messages (survivent aux compactions)
- **≤ 25 mots entre tool calls, ≤ 100 mots pour une réponse finale**

Une session bien configurée fait 10× plus avec le même budget qu'une session par défaut.

## Le vrai bottleneck a changé

Ce n'est plus la vitesse de frappe. Ce n'est même plus la vitesse de génération de code (Claude Code en produit plus qu'un humain ne peut relire). Le bottleneck, en 2026, c'est :

- **la clarté architecturale** — savoir ce qui mérite d'exister
- **la décomposition des tâches** — savoir quoi paralléliser, quoi séquencer
- **le jugement** — savoir quand pousser back, quand laisser passer
- **la confiance** — savoir si le système qu'on a configuré est fiable

claude-atelier ne remplace aucun de ces quatre. Il enlève le bruit autour, pour que le dev puisse se concentrer dessus.

## Court — pour le README

claude-atelier est un atelier de configurations pour Claude Code, en français, opinionated, sécurisé par défaut, théâtralisé pour être mémorisable, et optimisé pour ne pas brûler le contexte.

Le code est l'évidence. La philosophie est ce qui décide ce qui rentre et ce qui n'entre pas.
