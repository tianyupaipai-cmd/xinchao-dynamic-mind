#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

read_env() {
  sed -n "s/^${1}=//p" .env | tr -d '\r' | tail -n 1
}

BARK_SERVER=$(read_env BARK_SERVER)
BARK_KEY=$(read_env BARK_KEY)
BARK_TITLE=$(read_env BARK_TITLE)
BARK_GROUP=$(read_env BARK_GROUP)
BARK_ICON=$(read_env BARK_ICON)
BARK_SOUND=$(read_env BARK_SOUND)
BARK_LEVEL=$(read_env BARK_LEVEL)

: "${BARK_SERVER:?BARK_SERVER is required}"
: "${BARK_KEY:?BARK_KEY is required}"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT INT TERM

payload=$(printf '{"title":"%s","body":"心潮通知通道已连接。","group":"%s","icon":"%s","sound":"%s","level":"%s"}' "$BARK_TITLE" "$BARK_GROUP" "$BARK_ICON" "$BARK_SOUND" "$BARK_LEVEL")
code=$(curl -sS -o "$tmp" -w '%{http_code}' \
  "${BARK_SERVER%/}/${BARK_KEY}" \
  -H 'Content-Type: application/json' \
  --data "$payload")

if [ "$code" != 200 ]; then
  echo "Bark smoke test failed with HTTP $code" >&2
  exit 1
fi

if ! grep -Eq '"code"[[:space:]]*:[[:space:]]*200' "$tmp"; then
  echo "Bark response did not report code 200" >&2
  exit 1
fi

echo "BARK_SMOKE_OK title=$BARK_TITLE group=$BARK_GROUP"
