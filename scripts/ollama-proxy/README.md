# ollama-proxy

Proxy HTTP local qui traduit l'API Anthropic Messages (`/v1/messages`) vers Ollama (`/api/chat`).

Permet d'utiliser Claude Code, claude-atelier ou tout client Anthropic avec un LLM local via Ollama.

---

## Prérequis

- [Ollama](https://ollama.com) installé et en cours d'exécution (`ollama serve`)
- Go 1.21+ (`go version`)
- Un modèle Ollama tiré (`ollama pull llama3.2:3b`)

---

## Lancement

```bash
cd scripts/ollama-proxy
go run main.go
```

Le proxy écoute sur `http://localhost:4000`.

Pour pointer Claude Code vers le proxy :

```bash
export ANTHROPIC_BASE_URL=http://localhost:4000
claude
```

Ou dans `.env.local` :

```
ANTHROPIC_BASE_URL=http://localhost:4000
```

---

## Configuration (`config.json`)

| Clé | Valeur par défaut | Description |
|-----|-------------------|-------------|
| `ollama_url` | `http://localhost:11434` | URL du serveur Ollama |
| `port` | `4000` | Port d'écoute du proxy |
| `presets[].name` | — | Nom du preset (utilisé pour matcher le modèle demandé) |
| `presets[].model` | — | Tag Ollama exact à utiliser |
| `presets[].max_ram_gb` | — | RAM max pour ce preset (0 = illimité / dernier recours) |

### Presets par défaut

| Preset | Modèle | RAM recommandée |
|--------|--------|----------------|
| `light` | `llama3.2:3b` | < 8 GB |
| `standard` | `mistral` | 8–16 GB |
| `heavy` | `llama3.1:70b` | > 16 GB |

Pour changer de modèle, modifier `config.json` ou passer `PORT=4001 go run main.go`.

---

## Routes

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/health` | Healthcheck (`{"status":"ok"}`) |
| `POST` | `/v1/messages` | Anthropic Messages API |

---

## Mode dégradé (MVP)

Les fonctionnalités suivantes **ne sont pas supportées** et retournent `501` :

- `tools` (tool_use / tool_result)
- Streaming (`"stream": true` est ignoré — réponse bufferisée)

---

## Healthcheck

```bash
curl http://localhost:4000/health
# {"status":"ok","proxy":"ollama","version":"0.1.0"}
```

---

## Tirer un modèle manquant

```bash
ollama pull llama3.2:3b
ollama pull mistral
ollama pull llama3.1:70b
```

`ollama list` pour voir les modèles disponibles localement.
