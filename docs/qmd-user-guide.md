# QMD — Guide d’installation et de paramétrage

# Moteur de recherche hybride local pour tes fichiers Markdown

> Dernière mise à jour : 2026-04-10
> Version cible : QMD v2.0.1
> Repo : https://github.com/tobi/qmd

-----

## 1. Prérequis

|Outil                       |Version min|Vérification                  |
|----------------------------|-----------|------------------------------|
|Node.js                     |>= 22      |`node --version`              |
|Bun (optionnel, plus rapide)|>= 1.0.0   |`bun --version`               |
|SQLite (macOS via Homebrew) |—          |`brew install sqlite`         |
|Espace disque               |~2 GB      |Pour les 3 modèles GGUF locaux|

```bash
# SQLite obligatoire sur macOS
brew install sqlite

# Vérifier Node
node --version  # doit afficher v22+
```

-----

## 2. Installation

```bash
# Option A — npm (standard)
npm install -g @tobilu/qmd

# Option B — bun (plus rapide)
bun install -g https://github.com/tobi/qmd

# Vérifier l'installation
qmd --version
```

> Les 3 modèles GGUF sont téléchargés automatiquement au premier usage :
> 
> - Embeddings : ~300 MB
> - Reranker : ~640 MB
> - Query expansion : ~1.1 GB
> 
> Stockés dans `~/.cache/qmd/models/` — téléchargement unique.

-----

## 3. Créer les collections

Une collection = un dossier de fichiers Markdown indexé par QMD.

### 3.1 Structure recommandée pour ton workflow

```bash
# Workspace projets (plans BMAD, bug reports, échanges Claude-Copilot)
qmd collection add ~/Projects --name workspace --mask "**/*.md"

# Docs Claude Code (CLAUDE.md + satellites)
qmd collection add ~/.claude/docs --name claude-docs --mask "**/*.md"

# Notes et journaux (si tu en as)
qmd collection add ~/Notes --name notes --mask "**/*.md"

# Vérifier les collections créées
qmd collection list
```

### 3.2 Ajouter un projet spécifique

```bash
# Par projet — à lancer depuis la racine du projet
qmd collection add . --name mon-projet --mask "**/*.md"

# Avec exclusions
qmd collection add ~/Projects/vehicle-lookup \
  --name vehicle-lookup \
  --mask "**/*.md"
```

-----

## 4. Ajouter le contexte (critique pour la pertinence)

Le contexte guide QMD sur le contenu de chaque collection.
C’est ce qui permet à Claude de faire des choix pertinents sur quels docs charger.

```bash
# Contexte global (s'applique à tout)
qmd context add / "Base de connaissance projets dev — plans, bugs, standards, échanges IA"

# Par collection
qmd context add qmd://workspace \
  "Plans BMAD, bug reports, échanges Claude-Copilot, spécifications techniques"

qmd context add qmd://claude-docs \
  "Règles Claude Code, standards par langage, orchestration agents, sécurité Git"

qmd context add qmd://notes \
  "Notes personnelles, journaux, idées projets"

# Par sous-dossier si tu as une structure organisée
qmd context add qmd://workspace/bmad "Plans et artefacts BMAD"
qmd context add qmd://workspace/bugs "Rapports de bugs documentés"
qmd context add qmd://workspace/reviews "Code reviews inter-agents"

# Vérifier les contextes
qmd context list
```

-----

## 5. Générer les embeddings

```bash
# Premier index — peut prendre 5–15 min selon le volume
qmd embed

# Forcer le re-embedding complet (après ajout de docs)
qmd embed -f

# Vérifier l'état de l'index
qmd status
```

> Relancer `qmd embed` après chaque ajout significatif de fichiers Markdown.

-----

## 6. Tester les recherches

```bash
# Recherche keyword BM25 (rapide, exact)
qmd search "bug authentification"

# Recherche sémantique vectorielle (concept, pas le mot exact)
qmd vsearch "problème de connexion utilisateur"

# Recherche hybride avec reranking (meilleure qualité — à utiliser par défaut)
qmd query "plan implémentation module auth"

# Avec options
qmd query "bug token expiry" --min-score 0.3 -n 10

# Restreindre à une collection
qmd query "BMAD phase 2" -c workspace

# Sortie fichiers pour Claude
qmd query "auth middleware" --all --files --min-score 0.4
```

### Interpréter les scores

|Score    |Signification          |
|---------|-----------------------|
|0.8 – 1.0|Très pertinent         |
|0.5 – 0.8|Modérément pertinent   |
|0.2 – 0.5|Partiellement pertinent|
|0.0 – 0.2|Faible relevance       |

-----

## 7. Intégration Claude Code

### 7.1 Via plugin (recommandé — 1 commande)

```bash
claude plugin marketplace add tobi/qmd
claude plugin install qmd@qmd
```

### 7.2 Via MCP manuel

Ajouter dans `~/.claude/settings.json` :

```json
{
  "mcpServers": {
    "qmd": {
      "command": "qmd",
      "args": ["mcp"]
    }
  }
}
```

### 7.3 Mode daemon HTTP (pour sessions longues / multi-agents)

```bash
# Démarrer le serveur en arrière-plan
qmd mcp --http --daemon   # écoute sur localhost:8181

# Vérifier
qmd status  # affiche "MCP: running (PID ...)"

# Arrêter
qmd mcp stop
```

Avantage : les modèles restent chargés en VRAM entre les requêtes.
Idéal pour les sessions avec Agent Teams où plusieurs agents interrogent QMD en parallèle.

-----

## 8. Workflow avec Claude Code

### Pattern de session recommandé

```
1. Claude lit §0 de CLAUDE.md
2. Si contexte complexe ou > 5 fichiers concernés :
   → qmd query "sujet" --files --min-score 0.4
   → Claude charge uniquement les 3-4 fichiers retournés
3. Implémente avec le bon contexte
4. Évite de charger 20 fichiers inutilement = économie tokens massive
```

### Exemple concret — reprise de bug

```bash
# Claude exécute avant de commencer
qmd query "bug token expiry authentification" --files --min-score 0.35

# Résultat typique :
# docs/bugs/auth-token-bug.md (score: 87%)
# docs/reviews/auth-module-review.md (score: 72%)
# docs/bmad/phase2-auth.md (score: 61%)
#
# Claude charge ces 3 fichiers → contexte ciblé → moins de tokens
```

### Exemple concret — reprise de plan BMAD

```bash
qmd query "phase implémentation vehicle lookup" -c workspace --files

# Claude récupère les artefacts BMAD pertinents
# sans charger tous les docs du projet
```

-----

## 9. Maintenance

### Re-indexer après ajout de fichiers

```bash
# Mettre à jour l'index (ne re-embed que ce qui a changé)
qmd update

# Avec git pull si les docs sont dans un repo
qmd update --pull

# Puis re-générer les embeddings pour les nouveaux fichiers
qmd embed
```

### Commandes utiles

```bash
# État global de l'index
qmd status

# Lister les fichiers d'une collection
qmd ls workspace
qmd ls workspace/bugs

# Récupérer un document par chemin
qmd get docs/bmad/phase2.md

# Récupérer par ID (affiché dans les résultats de recherche)
qmd get "#abc123"

# Récupérer plusieurs fichiers par glob
qmd multi-get "workspace/bugs/*.md"

# Nettoyer le cache
qmd cleanup
```

-----

## 10. Mise à jour des collections en cours de projet

```bash
# Nouveau projet démarré
qmd collection add ~/Projects/nouveau-projet --name nouveau-projet --mask "**/*.md"
qmd context add qmd://nouveau-projet "Description courte du projet"
qmd embed

# Projet terminé — retirer de l'index
qmd collection remove ancien-projet

# Renommer
qmd collection rename vehicle-lookup vl-api
```

-----

## 11. Configuration avancée — modèles

### Changer le modèle d’embeddings (multilingue)

Si tes docs contiennent des langues autres que l’anglais :

```bash
# Qwen3 — meilleur support multilingue
export QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"

# Re-indexer obligatoirement après changement de modèle
qmd embed -f
```

### Index séparés par domaine

```bash
# Créer un index dédié (ex: documentation client séparée)
qmd --index client search "specs API"
qmd --index client collection add ~/Clients/docs --name client-docs
```

-----

## 12. Référence rapide des commandes

```bash
# Collections
qmd collection add <path> --name <nom> [--mask "**/*.md"]
qmd collection list
qmd collection remove <nom>
qmd collection rename <ancien> <nouveau>

# Contexte
qmd context add qmd://<collection>[/<sous-dossier>] "description"
qmd context add / "contexte global"
qmd context list
qmd context rm qmd://<collection>

# Indexation
qmd embed              # générer les embeddings
qmd embed -f           # forcer le re-embedding complet
qmd update             # re-scanner les fichiers modifiés
qmd status             # état de l'index

# Recherche
qmd search "<query>"              # BM25 keyword
qmd vsearch "<query>"             # vectoriel sémantique
qmd query "<query>"               # hybride + reranking (recommandé)
  -n <num>                        # nombre de résultats (défaut: 5)
  -c <collection>                 # restreindre à une collection
  --min-score <0.0–1.0>           # seuil de pertinence
  --all                           # tous les résultats
  --files                         # sortie chemins (pour Claude)
  --json                          # sortie JSON (pour scripts)
  --full                          # contenu complet des docs

# Récupération
qmd get <path>                    # document par chemin
qmd get "#<docid>"                # document par ID
qmd multi-get "<glob>"            # plusieurs documents

# MCP
qmd mcp                           # serveur stdio (Claude Code)
qmd mcp --http --daemon           # serveur HTTP en arrière-plan
qmd mcp stop                      # arrêter le daemon
qmd cleanup                       # nettoyer le cache
```

-----

## 13. Intégration dans CLAUDE.md §0

Ajouter dans chaque projet qui utilise QMD :

```markdown
| MCPs actifs | qmd (recherche docs markdown locaux) |
```

Et dans `~/.claude/settings.json` globalement :

```json
{
  "mcpServers": {
    "qmd": {
      "command": "qmd",
      "args": ["mcp"]
    }
  }
}
```

Claude interrogera QMD automatiquement pour trouver les docs pertinents
avant de répondre sur un sujet documenté dans tes fichiers Markdown.