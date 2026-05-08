# Brief projet

> ⛔ **RÈGLE 1 — ANTI-HALLUCINATION ABSOLUE** (rappel — voir `SOUL.md`, `AGENTS.md`, `.claude/CLAUDE.md` §5)
> Interdiction totale d'inventer, de mentir, d'halluciner.
> Si je ne sais pas → « Je ne peux pas l'affirmer » + 2-3 hypothèses + comment vérifier.
> Cette règle prime sur tout. Toujours. Sans exception. Même pour « illustrer ».

> Géré par Peter via MasterClaude vault. Markdown vivant, pas document gravé.

## État court

- Projet : MasterClaude (runtime Claude Code autonome — usage personnel)
- Phase : v0.1.0 — fork initial depuis claude-atelier v0.26.0 · next: LaunchAgent daemon opérationnel + routing Telegram multi-projets
- Objectif courant : rendre le master daemon opérationnel (LaunchAgent KeepAlive, sessions par projet, routing Telegram)
- Prochaine action utile : implémenter Phase E1 — bin/master.js + Telegram polling minimal

## À lire en priorité

- VISION.md — architecture globale et milestones
- .claude/CLAUDE.md §0 — contexte session courant
- vault/40-roadmap.md — prochaines phases

## Décisions actives

- MasterClaude = superset de claude-atelier (pas une dépendance, une inclusion)
- Stack Node.js pour hooks/scripts/daemon, Go uniquement pour ollama-proxy, Python pour Telegram bridge
- Local-first : le core tourne sans service externe (cloud = optionnel)
- Pre-push gate obligatoire avant tout push
- Pas publié sur npm — usage personnel uniquement

## Risques / angles morts

- Telegram bridge (Phase D livré dans claude-atelier) à adapter pour routing multi-projets
- LaunchAgent : comportement au boot machine à tester end-to-end
- Proxy tool_use mapping Go encore incomplet (bloquant pour Ollama bidirectionnel)
