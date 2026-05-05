# Inter-LLM Handoffs

> Convention for structured exchanges between Claude Code and Copilot/GPT.

## Purpose

When one LLM (Claude or Copilot) reaches a milestone, gets stuck, or
needs a second opinion, it generates a **handoff document** in this
folder. The user copies the relevant section to the other LLM, gets a
response, and pastes it back.

## File naming

```text
docs/handoffs/YYYY-MM-DD-<subject>.md
```

Examples:
- `2026-04-12-review-p4.md`
- `2026-04-13-debug-auth-loop.md`
- `2026-04-15-architecture-decision.md`

## Workflow

```text
1. LLM-A generates a handoff (fills "From" section)
2. User copies the "From" block to LLM-B
3. LLM-B responds
4. User pastes LLM-B's response in the "Response" section
5. User shows the file to LLM-A (or LLM-A reads it via QMD/Read)
6. LLM-A integrates the feedback
```

## Template

See `_template.md` in this directory.

## QMD integration

If QMD is configured, these files are automatically indexed and
searchable:

```bash
qmd query "review P4 angles morts" -c workspace --files
```

Both Claude (via MCP) and Copilot (via workspace context) can find
them without manual pointing.

## Rules

- **One handoff per file** (not appended to a mega-file)
- **Structured format** (use the template — both LLMs parse it better)
- **Date in filename** (chronological, easy to find)
- **Keep it short** : context + question + files. Not a novel.
- **Response section left empty** until the other LLM responds
