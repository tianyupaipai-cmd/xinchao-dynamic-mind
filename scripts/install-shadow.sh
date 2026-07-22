#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
umask 077

if [ ! -f .env ]; then
  cp .env.example .env
fi

if grep -q '^SERVICE_TOKEN=<redacted>' .env; then
  token=$(openssl rand -hex 32)
  sed -i "s#^SERVICE_TOKEN=.*#SERVICE_TOKEN=$token#" .env
fi

mkdir -p state
chmod 0700 state
chmod 0600 .env

sudo -n docker compose build
sudo -n docker compose up -d
