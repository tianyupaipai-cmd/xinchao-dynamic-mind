#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
KEY_FILE=${1:-/tmp/bark-key.txt}
cd "$ROOT"

if [ ! -s "$KEY_FILE" ]; then
  echo "Bark key file is missing or empty" >&2
  exit 1
fi

raw=$(tr -d '\r\n' < "$KEY_FILE")
case "$raw" in
  https://api.day.app/*)
    key=${raw#https://api.day.app/}
    key=${key%%/*}
    key=${key%%\?*}
    ;;
  *) key=$raw ;;
esac

case "$key" in
  ''|*[!A-Za-z0-9_-]*) echo "Bark key format was not recognized" >&2; exit 1 ;;
esac

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

replace_env BARK_KEY "$key"
replace_env BARK_ENABLED true
chmod 0600 .env
rm -f "$KEY_FILE"

sudo -n docker compose build
sudo -n docker compose up -d
