#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
KEY_FILE=${1:-/tmp/model-api-key.txt}
cd "$ROOT"

if [ ! -s "$KEY_FILE" ]; then
  echo "Model API key file is missing or empty" >&2
  exit 1
fi

key=$(tr -d '\r\n' < "$KEY_FILE")
if [ -z "$key" ]; then
  echo "Model API key is empty" >&2
  exit 1
fi

umask 077
if [ ! -f .env ]; then cp .env.example .env; fi

replace_env() {
  name=$1
  value=$2
  if grep -q "^${name}=" .env; then
    sed -i "s#^${name}=.*#${name}=${value}#" .env
  else
    printf '%s\n' "${name}=${value}" >> .env
  fi
}

replace_env MODEL_API_KEY "$key"
replace_env MODEL_ENABLED true
chmod 0600 .env
rm -f "$KEY_FILE"

echo "Model key configured. Review MODEL_BASE_URL and MODEL_NAME before leaving shadow mode."
