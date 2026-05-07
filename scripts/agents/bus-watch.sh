#!/usr/bin/env bash
# Dashboard bus agents — lance dans un terminal dédié
# Usage : bash scripts/agents/bus-watch.sh

BUS="/tmp/claude-bus"

while true; do
    clear
    echo "═══════════════════════════════════════"
    echo "  BUS AGENTS — $(date '+%H:%M:%S')"
    echo "═══════════════════════════════════════"

    shopt -s nullglob
    for inbox in "$BUS"/*-inbox.jsonl; do
        [[ -f "$inbox" ]] || continue
        agent=$(basename "$inbox" "-inbox.jsonl")
        outbox="$BUS/${agent}-outbox.jsonl"
        inbox_count=$(grep -c . "$inbox" 2>/dev/null || echo 0)
        outbox_count=$(grep -c . "$outbox" 2>/dev/null || echo 0)
        running=$(pgrep -f "dispatch.sh $agent" >/dev/null 2>&1 && echo "⚡ actif" || echo "💤 idle")

        echo ""
        echo "  [$agent] $running"
        echo "  inbox: $inbox_count tâches | outbox: $outbox_count réponses"
        echo "  Dernière réponse:"
        tail -1 "$outbox" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('    task=' + str(d.get('task','?')) + ' status=' + str(d.get('status','?')))
    print('    ' + str(d.get('result',''))[:120])
except:
    print('    ' + sys.stdin.read()[:120])
" 2>/dev/null || echo "    (vide)"
    done

    echo ""
    echo "═══════════════════════════════════════"
    echo "  Ctrl+C pour quitter"
    sleep 3
done
