#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/betna"
COMPOSE=(docker compose -p betna-production --env-file .env.production -f compose.production.yml)

cd "$APP_DIR"
export GIT_TERMINAL_PROMPT=0

git fetch --prune origin main
git merge --ff-only origin/main

"${COMPOSE[@]}" build --pull api web migrate
"${COMPOSE[@]}" run --rm migrate
"${COMPOSE[@]}" up -d api

wait_for() {
  local name="$1"
  local url="$2"
  local service="${3:-$name}"
  local attempts=30
  for _ in $(seq 1 "$attempts"); do
    if curl --silent --fail --max-time 5 "$url" >/dev/null; then
      echo "$name is healthy"
      return 0
    fi
    sleep 2
  done
  echo "$name did not become healthy: $url" >&2
  "${COMPOSE[@]}" logs --no-color --tail=100 "$service" >&2 || true
  return 1
}

wait_for api http://127.0.0.1:4101/health/live
wait_for api-ready http://127.0.0.1:4101/health/ready api

"${COMPOSE[@]}" up -d web
wait_for web http://127.0.0.1:3101/api/health

"${COMPOSE[@]}" ps
