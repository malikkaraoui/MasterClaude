# Diagnostics — Checklist au démarrage

> À exécuter dans Terminal au boot d'une nouvelle session Claude. Valide que l'infra daemon est OK.

## Avant de répondre à la 1ère question Telegram

```bash
# 1. Master daemon vivant ?
ps aux | grep -E '[b]in/master.js'
# Expected: node bin/master.js process

# 2. Parachute (Go daemon) vivant ?
ps aux | grep -E '[c]c-parachute|[p]arachute'
# Expected: parachute binary running

# 3. Ollama disponible ?
curl -s http://127.0.0.1:11434/api/tags | jq .
# Expected: { "models": [ { "name": "qwen3.5:latest", ... } ] }

# 4. Session signal file vivant ?
cat /tmp/masterclaude-real-claude-active
# Expected: ts:shellPID:parentPID (ou None si aucune session master active)

# 5. Telegram inbox monitor tourne ?
pgrep -f 'tail -f /tmp/tg-inbox.jsonl'
# Expected: process ID (le Monitor tool)

# 6. Vault accessible ?
ls -la /Users/malik/Vault/Malik/ | head -5
# Expected: files/dirs listing

# 7. Project registry chargé ?
cat ~/.claude-atelier/projects.json
# Expected: { "projects": [...], "active": "..." } ou {}

# 8. Windows registry existant ?
cat /tmp/masterclaude-windows.json 2>/dev/null
# Expected: { "windows": [...] } ou empty

# 9. Parachute health ?
cc-parachute health
# Expected: all components green (Ollama up, proxy up)

# 10. Claude executable ?
which claude
# Expected: /usr/local/bin/claude (ou ~/.claude/local/claude)
```

## Red Flags — Si ça échoue

| Check | Issue | Fix |
| --- | --- | --- |
| Master daemon dead | Singleton lock stale or crash | `rm /tmp/masterclaude-master.lock && npm run master:start` |
| Parachute dead | Go binary missing or launchd error | `npm run parachute:rebuild && launchctl restart com.masterclaude.parachute` |
| Ollama offline | Connection refused | `ollama serve` in separate terminal |
| Monitor not running | /compact killed it OR never started | `tail -f /tmp/tg-inbox.jsonl &` (in new pane) |
| Vault missing | Wrong path or vault moved | Verify `/Users/malik/Vault/Malik/` exists |
| No project.json | Sessions will be global | Create ~/.claude-atelier/projects.json or `/register newname /path` |

## Smoke Test — Confirm System Responsive

**In Terminal (this session)** :

```bash
# 1. Write a test message to inbox
echo '{"id":"test-'"$(date +%s)"'","sender":"test","text":"@claude test","type":"text","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' >> /tmp/tg-inbox.jsonl

# 2. Check that master read it (should be gone from inbox within 10s)
sleep 2
wc -l /tmp/tg-inbox.jsonl

# 3. Check if response was written
ls -ltr /tmp/tg-responses/

# 4. Read response (should be "test" response)
cat /tmp/tg-responses/*.jsonl | tail -1 | jq .
```

**Expected result** : /tmp/tg-responses/{chatId}.jsonl contains a valid JSON response from Claude or Ollama.

## Context State Check

```bash
# Check if you're in a spawned Claude session (vs master daemon)
cat /tmp/masterclaude-real-claude-active 2>/dev/null || echo "Global (no project active)"

# Check active project
grep -o '"active":"[^"]*' ~/.claude-atelier/projects.json || echo "No project"

# Check context saturation
# (Only if already in Claude session; master doesn't track this)
# This value is computed by getCtxPct() in master.js — no way to query directly
# Ask Malik via Telegram: "getCtxPct ?" → he'll respond with %
```

## Session Lifecycle State

```bash
# 1. Is this Claude session spawned by master or is this the master daemon itself?
ps -f | grep -E '(bin/master|Monitor)' | grep -v grep

# If grep returns nothing → you're in a spawned Claude session (good!)
# If grep returns bin/master.js → you ARE the master daemon (this shouldn't happen; error)

# 2. If spawned session: what's in the window registry?
cat /tmp/masterclaude-windows.json | jq '.windows[] | {windowId, project, status, lastOutput: (.lastOutput[:50]+"...")}'

# 3. What's the last message from inbox?
tail -1 /tmp/tg-inbox.jsonl | jq '.text'

# 4. Any pending responses?
ls -la /tmp/tg-responses/ | tail -5
```

## Vault Content Check

```bash
# Is vault context being injected at spawn?
# (Only visible in parachute logs or system prompt during spawn)

# Check if handoff exists (means last session migrated)
ls -la /tmp/masterclaude-handoff-* 2>/dev/null || echo "No migration in progress"

# Check parachute store (handoffs)
ls -la ~/.parachute/handoffs/ 2>/dev/null || echo "Store not initialized"

# Check recent alerts (if health checker fired)
tail -20 /tmp/parachute-alerts.jsonl 2>/dev/null || echo "No alerts"
```

## Recovery Playbook

### Case 1: Monitor died (bridge silenced)

```bash
# Symptom: "Toujours en cours…" repeated, no response after 10 min

# Fix 1 (immediate, in this session)
tail -f /tmp/tg-inbox.jsonl &

# Fix 2 (guard-monitor-bridge should auto-fix on next UserPromptSubmit)
# Just submit another prompt to trigger the guard
```

### Case 2: Context saturation detected

```bash
# Symptom: getCtxPct() > 60%, master asked "/compact OUI/NON"

# Action: answer "/compact" (compact current session)
# If you say NON 3 times: master triggers migration automatically

# After /compact: monitor master.js logs
tail -f ~/Library/Logs/claude-atelier/master.log | grep compact
```

### Case 3: Master daemon crashed

```bash
# Symptom: no new Telegram messages received; inbox grows indefinitely

# Check
ps aux | grep '[b]in/master.js'

# If no process:
npm run master:stop 2>/dev/null || true
rm /tmp/masterclaude-master.lock 2>/dev/null || true
npm run master:start

# Verify
sleep 5
ps aux | grep '[b]in/master.js'
```

### Case 4: Parachute crashed

```bash
# Symptom: cc-parachute health returns connection refused

# Check
ps aux | grep '[p]arachute'

# Restart via launchd
launchctl restart com.masterclaude.parachute

# Verify
sleep 3
cc-parachute health
```

### Case 5: Session zombie detected

```bash
# Symptom: cc-parachute sessions list shows session with "down" status >60s

# Action: parachute watchdog auto-kills and removes
# Manual recovery (shouldn't be needed):
cc-parachute sessions restart <project-key>
```

## Performance Baseline

- **Master polling latency** : inbox → response ~500ms (Ollama simple) to 5s (Claude wake)
- **Session spawn latency** : osascript Terminal.app open ~2s + claude startup ~3-5s = ~7s total
- **Parachute health check** : every 30s; 3s timeout per component
- **Monitor tail-f** : real-time (< 100ms latency)

---

**If diagnostics fail** : capture full output + vault state + latest 50 lines `/tmp/parachute-alerts.jsonl` + send to Malik via Telegram with context.
