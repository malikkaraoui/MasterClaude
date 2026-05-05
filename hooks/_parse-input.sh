#!/bin/bash
# Helper partagé — parse le JSON stdin des hooks Claude Code
# Usage: source "$(dirname "$0")/_parse-input.sh"
# Fournit: $HOOK_COMMAND, $HOOK_EXIT_CODE, $HOOK_FILE_PATH, $HOOK_MODEL, $HOOK_PROMPT, $HOOK_SESSION_ID, $HOOK_TRANSCRIPT_PATH, $HOOK_SOURCE
# shellcheck disable=SC2034
# (variables consumées par les scripts qui sourcent — shellcheck ne les voit pas)

if [ -z "${_HOOK_INPUT+x}" ]; then
    _HOOK_INPUT=$(cat)
fi

# Parse avec python3 (fiable, gère les guillemets échappés)
HOOK_COMMAND=$(echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except: pass
" 2>/dev/null)

HOOK_EXIT_CODE=$(echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    r = d.get('tool_response', {})
    print(r.get('exitCode', r.get('exit_code', 0)))
except: print(0)
" 2>/dev/null)

HOOK_FILE_PATH=$(echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except: pass
" 2>/dev/null)

HOOK_MODEL=$(echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('model', ''))
except: pass
" 2>/dev/null)

HOOK_PROMPT=$(echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('prompt', ''))
except: pass
" 2>/dev/null)

HOOK_SESSION_ID=$(echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('session_id', ''))
except: pass
" 2>/dev/null)

HOOK_TRANSCRIPT_PATH=$(echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('transcript_path', ''))
except: pass
" 2>/dev/null)

# SessionStart sub-event : startup | resume | compact | clear
HOOK_SOURCE=$(echo "$_HOOK_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('source', ''))
except: pass
" 2>/dev/null)
