# Brief projet

> Géré par Peter via claude-atelier vault. Markdown vivant, pas document gravé.

## État court

- Projet : claude-atelier (framework Claude Code)
- Phase : Phase 2 — v0.23.11 livrée (Phases A+B+C vault livrées : index SHA256, graphe, query/path/explain, export multi-formats, watch daemon, cron, MCP) · next: Phase D vault add/route
- Objectif courant : Phase D — `vault add` (inbox intelligente) + `vault route` (classification automatique) + storytelling Peter à jour
- Prochaine action utile : Définir scope Phase D + bump version v0.23.12

## À lire en priorité

- docs/proposals/peter-vault-graphify-plus-plan.md — plan complet Peter
- .claude/CLAUDE.md §0 — contexte session courant
- vault/40-roadmap.md — prochaines phases Peter

## Décisions actives

- Stack Node.js pour hooks/scripts, Go uniquement pour ollama-proxy
- Peter = couche mémoire vivante (pas archive statique)
- Vault local-first, pas de cloud obligatoire
- Pre-push gate obligatoire avant tout push

## Risques / angles morts

- proxy tool_use mapping Go encore incomplet (bloquant pour Ollama bidirectionnel)
- Cache mtime Phase B : faux-négatifs possibles en cas d'écriture programmatique très rapide (< 1ms) — différé Phase C
- MCPs actifs (qmd + github) consomment fenêtre contexte (~70k)
