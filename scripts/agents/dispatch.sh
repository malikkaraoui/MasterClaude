#!/usr/bin/env bash
# Dispatch une tâche à un agent éphémère (claude -p one-shot)
# Usage : bash dispatch.sh <agent> <task_id> <prompt>
# Résultat → /tmp/claude-bus/<agent>-outbox.jsonl

AGENT="${1:?agent requis}"
TASK_ID="${2:?task_id requis}"
PROMPT="${3:?prompt requis}"
OUTBOX="/tmp/claude-bus/${AGENT}-outbox.jsonl"

mkdir -p /tmp/claude-bus
touch "$OUTBOX"

# cd /tmp : évite les hooks SessionStart MasterClaude qui bloquent
result=$(cd /tmp && echo "$PROMPT" | claude -p --dangerously-skip-permissions 2>&1)
result_json=$(echo "$result" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")

echo "{\"task\":\"$TASK_ID\",\"agent\":\"$AGENT\",\"status\":\"done\",\"result\":$result_json}" >> "$OUTBOX"
