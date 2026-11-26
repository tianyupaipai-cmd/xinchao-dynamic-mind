#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

read_env() {
  sed -n "s/^${1}=//p" .env | tr -d '\r' | tail -n 1
}

MODEL_BASE_URL=$(read_env MODEL_BASE_URL)
MODEL_API_KEY=$(read_env MODEL_API_KEY)
MODEL_NAME=$(read_env MODEL_NAME)

: "${MODEL_BASE_URL:?MODEL_BASE_URL is required}"
: "${MODEL_API_KEY:?MODEL_API_KEY is required}"
: "${MODEL_NAME:?MODEL_NAME is required}"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT INT TERM

payload=$(printf '{"model":"%s","messages":[{"role":"user","content":"Return only this JSON object: {\\"ok\\":true}"}],"response_format":{"type":"json_object"},"max_tokens":32}' "$MODEL_NAME")
code=$(curl -sS -o "$tmp" -w '%{http_code}' \
  "${MODEL_BASE_URL%/}/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $MODEL_API_KEY" \
  --data "$payload")

if [ "$code" != 200 ]; then
  echo "Model smoke test failed with HTTP $code" >&2
  exit 1
fi

if ! grep -q '"choices"' "$tmp"; then
  echo "Model response did not contain choices" >&2
  exit 1
fi

echo "MODEL_SMOKE_OK model=$MODEL_NAME"
