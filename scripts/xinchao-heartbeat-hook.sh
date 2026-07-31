#!/bin/sh

# Claude Code UserPromptSubmit hook for Xinchao.
# It intentionally discards the submitted prompt and sends only opaque IDs.

set -u

jq_bin=$(command -v jq 2>/dev/null || true)
curl_bin=$(command -v curl 2>/dev/null || true)
uuid_bin=$(command -v uuidgen 2>/dev/null || true)
if [ -z "$jq_bin" ] || [ -z "$curl_bin" ]; then
  exit 0
fi

session_id=$("$jq_bin" -r '
  if (.session_id | type) == "string" and (.session_id | length) > 0
  then .session_id[0:120]
  else "claude-code"
  end
' 2>/dev/null) || exit 0

token=${XINCHAO_SERVICE_TOKEN:-}
if [ -z "$token" ] && [ -n "${XINCHAO_SERVICE_TOKEN_FILE:-}" ]; then
  token=$(tr -d '\r\n' < "$XINCHAO_SERVICE_TOKEN_FILE" 2>/dev/null || true)
fi
if [ -z "$token" ]; then
  exit 0
fi

heartbeat_url=${XINCHAO_HEARTBEAT_URL:-https://xinchao.guchuan.men/v1/heartbeat}
case "$heartbeat_url" in
  https://*|http://127.0.0.1:*|http://localhost:*) ;;
  *) exit 0 ;;
esac

min_interval=${XINCHAO_HEARTBEAT_MIN_INTERVAL_SECONDS:-0}
case "$min_interval" in
  ''|*[!0-9]*) min_interval=0 ;;
esac

runtime_root=${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}
state_dir="$runtime_root/xinchao-heartbeat"
session_key=$(printf '%s' "$session_id" | cksum | awk '{print $1}')
stamp_file="$state_dir/$session_key.stamp"
now=$(date +%s)
if [ "$min_interval" -gt 0 ] && [ -r "$stamp_file" ]; then
  previous=$(cat "$stamp_file" 2>/dev/null || printf '0')
  case "$previous" in
    ''|*[!0-9]*) previous=0 ;;
  esac
  if [ $((now - previous)) -lt "$min_interval" ]; then
    exit 0
  fi
fi

if [ -n "$uuid_bin" ]; then
  event_id="heartbeat-$("$uuid_bin" | tr '[:upper:]' '[:lower:]')"
else
  event_id="heartbeat-$now-$$"
fi
payload=$("$jq_bin" -cn \
  --arg session_id "$session_id" \
  --arg event_id "$event_id" \
  '{session_id: $session_id, event_id: $event_id}')

mkdir -p "$state_dir" 2>/dev/null || true
printf '%s\n' "$now" > "$stamp_file" 2>/dev/null || true

# Detach the network request so prompt submission is never delayed by the
# public tunnel. No hook input or prompt text is present in this command.
nohup "$curl_bin" -fsS --max-time 8 \
  -X POST \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  --data "$payload" \
  "$heartbeat_url" </dev/null >/dev/null 2>&1 &

# Heartbeat failure must never block or add text to the conversation.
exit 0
