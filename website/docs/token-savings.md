---
sidebar_position: 9
title: Token Savings
description: Concrete cost reduction numbers with claude-atelier's built-in strategies
---

# 💰 Token Savings

claude-atelier is designed from the ground up to cut Claude API costs. Here are the concrete numbers.

## Summary

> **Up to 90% cost reduction** compared to an unstructured Claude Code setup.

| Technique | Savings | Mechanism |
|-----------|---------|-----------|
| Model routing (Haiku/Sonnet vs always-Opus) | **~80%** | `routing-check.sh` auto-routes by task type |
| `/compact` context compression | **60–80%** per session | Built-in hook, triggered after explore + feature |
| Conditional stack loading | **~30%** | §10 loads only the relevant stack docs |
| QMD-first (search before Read) | **~20%** | `mcp__qmd__query` replaces `Read` on `.md` files |
| `maxBudgetUsd` hard cap | **100% runaway prevention** | Session killed if budget exceeded |

---

## Model Routing

The biggest lever. Claude Opus costs ~15× more than Haiku per token.

```
Haiku   →  exploration, search, lint, quick lookups
Sonnet  →  standard dev, bug fixes, features
Opus    →  architecture, migrations, complex decisions
```

`routing-check.sh` injects the current model into every message. CLAUDE.md §15 enforces routing rules. Result: **~80% cost reduction** on a typical session vs always-Opus.

```bash
# What gets routed to Haiku (cheapest)
- Codebase exploration
- File search / grep
- Running tests
- Commit messages

# What stays on Sonnet (standard)
- Feature implementation
- Bug fixes
- Code review

# What escalates to Opus (most expensive)
- Architecture decisions
- Database schema design
- Multi-file migrations
```

---

## `/compact` — Context Compression

Context window fills up fast. Each message on a 200k-token context costs proportionally more.

`/compact` compresses prior conversation by **60–80%** while preserving semantic continuity.

**When to run:**
- After an explore phase
- After each completed feature
- Before switching tasks
- When the session hook warns about context size

The session hook (`routing-check.sh`) automatically alerts at 2MB+ context.

---

## Conditional Stack Loading

CLAUDE.md §10 loads stack-specific standards only when relevant (defined in §0).

```
Full load (all stacks):  ~8,000 tokens on every message
Conditional load:        ~1,500 tokens — only the active stack
```

**~30% reduction** on sessions involving multiple stack references.

---

## QMD-First Search

Instead of `Read` (loads full file into context), `mcp__qmd__query` returns only the relevant snippets.

```
Read on a 500-line .md file:   ~2,000 tokens
QMD query (same file):         ~200 tokens
```

**~20% reduction** on sessions with heavy documentation lookup.

---

## `maxBudgetUsd` Hard Cap

Set in `.claude/settings.json`:

```json
{
  "maxBudgetUsd": 5.00
}
```

Prevents runaway autonomous sessions from burning unlimited budget. Essential for night mode and long-running loops.

---

## Combined Effect

On a typical 2-hour dev session:

| Setup | Estimated cost |
|-------|---------------|
| Claude Code, no framework, always-Opus | ~$8–12 |
| claude-atelier with routing + compact + QMD | ~$0.80–1.50 |
| **Reduction** | **~85–90%** |

---

## Quick Setup

```bash
npx claude-atelier init
```

All savings mechanisms are enabled by default after init.
