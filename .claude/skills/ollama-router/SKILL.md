---
name: ollama-router
description: "Setup automatique Ollama de bout en bout : détecte → installe si absent → lance si éteint → détecte RAM → choisit preset → pull modèles manquants (+ nomic-embed-text) → configure proxy → écrit .env.local → healthcheck. Zéro question inutile."
figure: Jeffrey
---

# Ollama Router

> Jeffrey 🦙 sort de sa poche un câble, le branche, et attend le premier signal.
> Quand Ollama répond, il hoche la tête : « Local first. Always. »
>
> *"Un LLM local non connecté est juste du silicium dormant."*

Configure le proxy Anthropic → Ollama pour utiliser un LLM local avec Claude Code.

## Procédure

### Étape 1 — Détecter, installer et lancer Ollama

**Automatiser de bout en bout — ne rien demander à l'utilisateur si on peut agir.**

1. Vérifier si Ollama est installé : `which ollama`
2. Si **pas installé** (macOS) : `brew install ollama` — si brew absent, `curl -fsSL https://ollama.com/install.sh | sh`
3. Si **installé mais pas lancé** (`curl -s --max-time 3 http://localhost:11434/api/tags` échoue) : lancer `ollama serve &>/dev/null &` puis `sleep 2` et revérifier
4. Si toujours pas de réponse après lancement → « Ollama ne démarre pas. Vérifier les logs : `ollama serve` en foreground. »

### Étape 2 — Lister les modèles disponibles

```bash
ollama list
```

**Si aucun modèle LLM n'est installé** → passer directement à l'étape 3 (détection RAM + pull auto).
**Si des modèles existent** → les lister et proposer le choix :

> « Modèles disponibles : `mistral`, `llama3.1:8b`, `qwen3:8b`. Lequel utiliser pour le proxy ?
> (ou Enter pour le preset auto basé sur ta RAM) »

Si l'utilisateur choisit un modèle → l'utiliser. Sinon → preset auto (étape 3).

### Étape 3 — Détecter la RAM et choisir le preset automatiquement

**Détection auto de la RAM :**

```bash
# macOS
sysctl -n hw.memsize | awk '{print int($1/1073741824)}'
# Linux
grep MemTotal /proc/meminfo | awk '{print int($2/1048576)}'
```

Preset selon la RAM :
- < 8 GB → `llama3.2:3b` (léger, rapide)
- 8–16 GB → `mistral` (bon compromis)
- \> 16 GB → `llama3.1:70b` (lourd, plus capable)

Annoncer le choix : « RAM détectée : X GB → preset `standard` (`mistral`). »

### Étape 4 — Pull automatique des modèles manquants

Vérifier `ollama list` et **pull automatiquement** ce qui manque, sans demander :

1. **Le modèle LLM choisi** (étape 2 ou 3) → `ollama pull <modèle>`
2. **`nomic-embed-text`** → requis pour la mémoire 3 niveaux en mode FULL

Si le pull prend longtemps (> 10 GB), annoncer : « Pull en cours de `llama3.1:70b` (~40 GB) — ça peut prendre 30-60 min. »

**Si aucun modèle n'était installé au départ**, tout est transparent : détection RAM → pull preset → pull embeddings → tout est prêt.

### Étape 5 — Vérifier et installer Go si absent

```bash
go version
```

Si Go absent : `brew install go` (macOS) ou `curl -fsSL https://go.dev/dl/go1.26.linux-amd64.tar.gz | sudo tar -C /usr/local -xzf -` (Linux).

### Étape 6 — Mettre à jour config.json et lancer le proxy

1. Écrire le modèle choisi dans `scripts/ollama-proxy/config.json` (champ `"model"`)
2. **Lancer le proxy automatiquement** en background :

```bash
cd scripts/ollama-proxy && go run main.go &>/tmp/ollama-proxy.log &
sleep 3
```

3. Vérifier les logs : `head -10 /tmp/ollama-proxy.log`
4. Si le port 4000 est occupé : `PORT=4001 go run main.go &>/tmp/ollama-proxy.log &`

### Étape 7 — Écrire ANTHROPIC_BASE_URL

Vérifier si `.env.local` existe à la racine. Ajouter ou mettre à jour la ligne :

```bash
ANTHROPIC_BASE_URL=http://localhost:4000
```

Si le fichier n'existe pas, le créer. Si la ligne existe déjà, signaler qu'elle est déjà configurée.

> **Comportement** : si `.env.local` existe déjà, seule la ligne `ANTHROPIC_BASE_URL` est ajoutée ou mise à jour — le reste du fichier est préservé tel quel. Aucune autre variable n'est touchée.

> **Note** : ne jamais écrire `.env.local` dans `.claude/` — il va à la racine du projet.

### Étape 8 — Healthcheck automatique

**Ne pas attendre de confirmation** — tester directement :

```bash
curl -s --max-time 3 http://localhost:4000/health
```

Réponse attendue : `{"status":"ok","proxy":"ollama","version":"0.1.0"}`

Si le healthcheck échoue :
- Vérifier que `go run main.go` tourne : `lsof -i :4000`
- Si le port est libre, rappeler la commande de lancement
- Si le port est occupé par autre chose, proposer `PORT=4001` + adapter `ANTHROPIC_BASE_URL`

### Étape 9 — Confirmer

```
Jeffrey 🦙 : « Proxy opérationnel. ANTHROPIC_BASE_URL pointe vers localhost:4000.
Lance `claude` — les messages seront routés vers <modèle>. Local first. Always. »
```

Rappeler les capacités :
> **v0.2.0** : tool_use / tool_result supportés — le proxy traduit les tools Anthropic → Ollama bidirectionnellement.
> Si le LLM local ne supporte pas les tools (modèle trop petit), les appels tools échoueront silencieusement.

## Règles

- **Automatiser TOUT** : détecter, installer, lancer, configurer — l'utilisateur exprime le besoin, Jeffrey branche
- Installer Ollama si absent, Go si absent, lancer si éteint, pull les modèles si manquants — zéro question
- Lancer le proxy en background automatiquement (`go run main.go &`)
- Écrire `.env.local` automatiquement
- Ne jamais modifier les fichiers Go sans instruction explicite
- `.env.local` à la racine uniquement, jamais dans `.claude/`
- **Ordre de détection complet** : Ollama → Go → modèles → proxy → .env.local → healthcheck — tout dans un seul flow
