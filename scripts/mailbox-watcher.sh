#!/usr/bin/env bash
# Surveille vault/10-mailbox.md — répond automatiquement sur Telegram via Claude CLI
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAILBOX="$SCRIPT_DIR/../vault/10-mailbox.md"
LOCKFILE="/tmp/mailbox-watcher.lock"
LASTLINE_FILE="/tmp/mailbox-watcher-lastline"

# Évite les doublons de process (+ vérification identité pour PID recyclés)
if [[ -f "$LOCKFILE" ]]; then
  LOCK_PID=$(cat "$LOCKFILE" 2>/dev/null || echo "")
  if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null \
     && ps -p "$LOCK_PID" -o comm= 2>/dev/null | grep -q "bash"; then
    echo "Watcher déjà actif (PID $LOCK_PID)" >&2
    exit 1
  fi
fi
echo $$ > "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

# Initialiser la position connue
wc -l < "$MAILBOX" > "$LASTLINE_FILE"

echo "[mailbox-watcher] démarré (PID $$) — surveillance de $MAILBOX"

while true; do
  sleep 3

  CURRENT=$(wc -l < "$MAILBOX")
  LAST=$(cat "$LASTLINE_FILE")

  if [[ "$CURRENT" -le "$LAST" ]]; then
    continue
  fi

  # Nouvelles lignes détectées
  NEW_CONTENT=$(tail -n +"$((LAST + 1))" "$MAILBOX")
  echo "$CURRENT" > "$LASTLINE_FILE"

  # Vérifier qu'il s'agit d'un message "nouveau" entrant (pas un outbound Claude)
  if ! echo "$NEW_CONTENT" | grep -q "Statut : nouveau"; then
    continue
  fi

  # Extraire le résumé (|| true : évite arrêt du watcher si grep ne trouve rien)
  MESSAGE=$(echo "$NEW_CONTENT" | grep "Résumé :" | sed 's/.*Résumé : //' | head -1 || true)
  if [[ -z "$MESSAGE" ]]; then
    continue
  fi

  echo "[mailbox-watcher] Nouveau message : $MESSAGE"

  # Générer réponse via Claude CLI
  RESPONSE=$(claude --print --output-format text -p "Malik t'a envoyé ce message via Telegram : \"$MESSAGE\". Réponds-lui directement, en français, de façon concise (max 2 phrases). Commence par \"Claude :\"." 2>/dev/null || echo "")

  if [[ -z "$RESPONSE" ]]; then
    echo "[mailbox-watcher] Pas de réponse Claude, skip"
    continue
  fi

  # Envoyer sur Telegram (sans double-préfixe si Claude a déjà mis "Claude :")
  bash "$SCRIPT_DIR/claude-notify.sh" "$RESPONSE" 2>/dev/null && \
    echo "[mailbox-watcher] Réponse envoyée" || \
    echo "[mailbox-watcher] Erreur envoi"
done
