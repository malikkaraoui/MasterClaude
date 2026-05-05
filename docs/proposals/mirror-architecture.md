# MIRROR — Architecture du Système de Mémoire Synthétique

> Créé : 2026-05-02  
> Statut : Design validé — implémentation à venir  
> Source : session de design Malik + Claude + `vault-obsidian-etat-art.md` (02.05.2026)

---

## Concept central

MIRROR est un système de mémoire à 3 niveaux, maintenu par 2 agents distincts, avec des flux d'information bidirectionnels tracés. Il repose sur le modèle du **cerveau réel** : les consolidations se font dans les moments de calme (la nuit), pas en continu.

**MIRROR n'est pas Graphify ni Obsidian.** Il est la couche d'orchestration *au-dessus* : il décide quoi router, quoi remonter, quoi consolider. Graphify indexe. Mirror orchestre.

---

## Les 3 niveaux

### Niveau 1 — Cerveau Synthétique
**Emplacement :** `~/Documents/cerveau/`

```
cerveau/
├── inbox/              ← dépôts manuels bruts (multimédia, URLs, notes rapides)
├── media/              ← audio, images, PDF (traités par Graphify/Whisper)
├── cerveau.md          ← connaissance structurée (synthèse, maintenue par Mirror)
├── learnings.md        ← ce qui remonte des projets (via pending-up)
├── links.md            ← URLs externes + résumés
└── graphify-out/       ← graphe Graphify (graph.json + obsidian/ export)
    ├── graph.json
    ├── graph.html
    └── obsidian/       ← 1 .md par nœud, wikilinks, Dataview
```

**Agent responsable :** Mirror (qwen2.5:3b via Ollama)  
**Moteur d'indexation :** Graphify (`uv tool install graphifyy`) — pipeline detect→extract→build→cluster→export  
**Contenus acceptés :** texte, audio (Whisper), image, PDF, URLs externes  
**Interface Claude :** MCP `graphify-vault` → `query_graph()`, `get_node()`, `shortest_path()` (<100ms)  
**Interface humaine :** Obsidian (plugin Claudian sidebar) → vault lisible, graphe navigable

---

### Niveau 2 — Routeur / Digestion
**Emplacement :** `~/Documents/ATELIER PROJETS/_mirror/`

```
_mirror/
├── projects-index.md    ← répertoire des projets actifs (domaine, tags, phase)
├── routing-rules.md     ← règles domaine → projet (évolutives, apprises via flow.log)
├── pending-upstream.md  ← ce qui attend de remonter vers le cerveau (agrégé)
└── flow.log             ← journal append-only de tous les mouvements inter-niveaux
```

**Agent responsable :** Mirror (même LLM)  
**Rôle :** router cerveau→projets + surveiller ce qui mérite de remonter + apprendre des patterns  
**Persistance :** pattern Cyrus flat JSON / Markdown → lecture rapide, pas de base de données

---

### Niveau 3 — Vault Projet
**Emplacement :** `~/Documents/ATELIER PROJETS/<Projet>/vault/`

```
vault/
├── context.md       ← injecté par Mirror depuis le cerveau (lecture par Claude)
├── discoveries.md   ← écrit par Claude (learnings, décisions, patterns découverts)
└── pending-up.md    ← Claude tague ce qui mérite de remonter (frontière contractuelle)
```

**Agent responsable :** Claude (écriture) + Mirror (injection context.md)  
**Rôle :** pont entre connaissance globale et travail courant

---

## Les 2 agents et leurs responsabilités

| Responsabilité | Mirror (Ollama) | Claude |
|---|---|---|
| Niveau 1 — indexer via Graphify | ✅ | ✗ |
| Niveau 1 — maintenir cerveau.md | ✅ | ✗ |
| Niveau 2 — router + surveiller | ✅ | ✗ |
| Niveau 2 — apprendre du flow.log | ✅ | ✗ |
| Niveau 3 — injecter context.md | ✅ | ✗ |
| Niveau 3 — lire context.md | ✗ | ✅ |
| Niveau 3 — écrire discoveries.md | ✗ | ✅ |
| Niveau 3 — écrire pending-up.md | ✗ | ✅ |
| Décider la remontée ↑ | ✅ (lit pending-up) | ✗ |
| Apprendre des patterns via flow.log | ✅ | ✅ (résumé au SessionStart) |

---

## Flux bidirectionnels

### Flux descendant (CASCADE) — cerveau → projets
```
cerveau/inbox/ ou cerveau.md modifié
  → Mirror détecte (inotify one-shot)
  → Graphify update (incrémental, cache SHA256, <10s)
  → routing-rules.md → vault/<projet>/context.md mis à jour
  → flow.log : entrée CASCADE
```

### Flux montant (BUBBLE) — projets → cerveau
```
Claude écrit vault/pending-up.md
  → flag différé (traitement nuit)
  → Mirror lit pending-up.md (passe nocturne)
  → décide souverainement si intégration cerveau/learnings.md
  → Graphify update si intégré
  → flow.log : entrée BUBBLE
  → pending-up.md archivé + vidé
```

---

## Déclencheurs (pas de watcher continu)

| Événement | Mécanisme | Délai |
|---|---|---|
| Fichier ajouté/modifié dans `cerveau/` | inotifywait one-shot (ou launchd macOS) | quasi-immédiat (index partiel léger) |
| Claude écrit `pending-up.md` | flag → traitement différé | différé (nuit) |
| Cron nuit (02:00) | passe de consolidation complète | planifié |

---

## Traçabilité — couche obligatoire (first-class)

**Fichier :** `_mirror/flow.log` — append-only, jamais modifié, jamais tronqué  
**Inspiré de :** Cyrus Agents Activity Timeline (thought/action/tool_result horodatés)

### Format d'une entrée
```
[2026-05-02 02:31:14] CASCADE  cerveau/pattern-x.md → ProjetX/vault/context.md
                               raison: "tag #ProjetX détecté"  agent: mirror  hash: a3f9
[2026-05-02 02:31:20] BUBBLE   ProjetX/vault/pending-up.md:L8 → cerveau/learnings.md
                               raison: "pattern jugé réutilisable"  agent: mirror  hash: b12c
[2026-05-02 09:15:44] WRITE    ProjetX/vault/discoveries.md  agent: claude  status: pending-up
[2026-05-02 02:31:55] SKIP     ProjetY/vault/pending-up.md:L3  
                               raison: "déjà dans cerveau (hash b12c)"  agent: mirror
```

### Utilité du flow.log
- **Debug** : trace complète de chaque mouvement dans les premiers temps
- **Mirror auto-apprend** : relit le log → détecte patterns récurrents → affine `routing-rules.md`
- **Claude SessionStart** : lit résumé flow récent → sait ce qui a changé depuis sa dernière session
- **Détection de dérives** : si le même contenu remonte/descend en boucle → signal d'anomalie

---

## Passe de consolidation nocturne (02:00)

Modèle : cerveau humain = consolidation mémoire pendant le sommeil.

Ordre d'exécution :
1. Mirror lit `cerveau/inbox/` → extrait, intègre via Graphify, nettoie inbox
2. Mirror lit tous les `vault/*/pending-up.md` → décide remontées
3. Mirror route le nouveau contenu cerveau → vaults des projets actifs (context.md)
4. `graphify update` global (incrémental, cache SHA256)
5. Mirror écrit `flow.log` (chaque mouvement avec raison + hash)
6. Mirror auto-analyse `flow.log` → met à jour `routing-rules.md` si pattern détecté

---

## Contrat d'interface entre agents

`pending-up.md` est la **frontière contractuelle** entre Claude et Mirror :
- Claude y écrit ce qu'il juge digne de remonter (contenu + raison explicite)
- Mirror lit, décide souverainement, n'intègre pas en doublon (check hash)
- Après traitement : Mirror archive dans `flow.log` + vide `pending-up.md`
- Claude *ne modifie jamais* `context.md` (domaine exclusif de Mirror)

---

## Stack technique (depuis vault-obsidian-etat-art.md)

| Composant | Rôle dans MIRROR | Installation |
|---|---|---|
| **Graphify** | Moteur d'indexation cerveau (detect→extract→graph→export) | `uv tool install graphifyy` |
| **Ollama qwen2.5:3b** | Agent Mirror — décisions routing + consolidation | déjà en place |
| **Obsidian** | Interface humaine du cerveau (vault navigable) | Application desktop |
| **Claudian** | Claude Code sidebar dans Obsidian | Plugin Obsidian community |
| **Smart Connections** | Embeddings sémantiques offline (Ollama) | Plugin Obsidian community |
| **MCP graphify-vault** | Interface Claude→cerveau (<100ms) | `graphify serve graph.json` |

### Configuration MCP dans claude-atelier
```json
// .claude/settings.json
{
  "mcpServers": {
    "graphify-vault": {
      "command": "graphify",
      "args": ["serve", "~/Documents/cerveau/graphify-out/graph.json"],
      "env": {}
    }
  }
}
```

---

## Vue d'ensemble complète

```
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 1 — CERVEAU SYNTHÉTIQUE  ~/Documents/cerveau/           │
│                                                                  │
│  inbox/ → Graphify (Whisper/AST/Claude subagents) → graph.json  │
│  → Obsidian vault (wikilinks + Dataview) ← interface humaine    │
│  → MCP graphify-vault ← interface Claude                        │
│                                                                  │
│  Agent : MIRROR (qwen2.5:3b)                                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │  CASCADE ↓  /  BUBBLE ↑  (tracé flow.log)
┌──────────────────────▼──────────────────────────────────────────┐
│  NIVEAU 2 — ROUTEUR  ~/Documents/ATELIER PROJETS/_mirror/       │
│                                                                  │
│  projects-index.md + routing-rules.md (auto-apprises)           │
│  flow.log (append-only, toutes décisions tracées)               │
│                                                                  │
│  Agent : MIRROR (même LLM)                                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │  push ↓  /  bubble ↑
┌──────────────────────▼──────────────────────────────────────────┐
│  NIVEAU 3 — VAULT PROJET  ~/Documents/ATELIER PROJETS/<X>/vault/│
│                                                                  │
│  context.md (injecté par Mirror) ← Claude lit                   │
│  discoveries.md ← Claude écrit                                  │
│  pending-up.md  ← Claude écrit, Mirror consomme (nuit)          │
│                                                                  │
│  Agent : CLAUDE (écriture) + MIRROR (injection)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Décisions ouvertes

- [ ] Structure exacte de `cerveau.md` (sections, format frontmatter YAML)
- [ ] Format de `routing-rules.md` (YAML ? Markdown structuré ?)
- [ ] Mécanisme launchd exact pour trigger inotify sur macOS
- [ ] Résumé flow.log pour Claude au SessionStart : généré par Mirror (nuit) ou lu directement ?
- [ ] Gestion des médias (audio/vidéo) : Whisper local via Graphify ou preprocessing séparé ?
- [ ] Obsidian : Master-Vault unique (`~/Obsidian/Master-Vault/`) ou cerveau = vault directement ?

---

## Liens et références

- [vault-obsidian-etat-art.md](../vault-obsidian-etat-art.md) — état de l'art Obsidian+LLM, analyse Graphify/Cyrus/Superpowers
- [Graphify](https://github.com/safishamsi/graphify) — moteur d'indexation
- [Claudian](https://github.com/YishenTu/claudian) — Claude Code sidebar Obsidian
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) — embeddings sémantiques offline
- [Cyrus Agents](https://github.com/cyrusagents/cyrus) — pattern Activity Timeline (inspiration flow.log)
