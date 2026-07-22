#!/bin/sh
set -eu

: "${VPS_HOST:?Set VPS_HOST, for example user@example-host}"
VPS_DIR=${VPS_DIR:-/opt/xinchao-dynamic-mind}
REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

echo "Deploying $REPO_DIR to $VPS_HOST:$VPS_DIR"

ssh "$VPS_HOST" "mkdir -p '$VPS_DIR'"
rsync -avz \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='state' \
  --exclude='memory-data' \
  "$REPO_DIR/" "$VPS_HOST:$VPS_DIR/"

ssh "$VPS_HOST" "set -eu
  cd '$VPS_DIR'
  mkdir -p state memory-data
  chmod 0700 state memory-data
  if [ ! -f .env ]; then
    cp .env.example .env
    chmod 0600 .env
    echo 'Created .env. Configure it and replace SERVICE_TOKEN before deployment.' >&2
    exit 2
  fi
  if grep -q '^SERVICE_TOKEN=<redacted>$' .env; then
    echo 'Refusing to deploy with the example SERVICE_TOKEN.' >&2
    exit 2
  fi
  sudo -n docker compose up -d --build
  sudo -n docker compose ps
"
