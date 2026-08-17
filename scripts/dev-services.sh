#!/usr/bin/env bash
#
# Local Postgres + Redis without Docker.
#
# This machine has no container runtime, so the services in docker-compose.yml
# are run directly from userspace binaries instead:
#
#   Postgres 17.2  ~/.local/pgsql      data in ~/.local/pgdata   port 5432
#   Redis 7.4.2    ~/.local/bin        data in ~/.local/run      port 6379
#
# Redis stands in for the Valkey in docker-compose.yml; they are
# protocol-compatible and BullMQ cannot tell them apart.
#
# Usage: ./scripts/dev-services.sh {start|stop|status|logs}

set -euo pipefail

PG_BIN="$HOME/.local/pgsql/bin"
PGDATA="$HOME/.local/pgdata"
REDIS_BIN="$HOME/.local/bin"
RUN_DIR="$HOME/.local/run"

mkdir -p "$RUN_DIR"

start() {
  if "$PG_BIN/pg_isready" -h localhost -p 5432 >/dev/null 2>&1; then
    echo "postgres  already running"
  else
    "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$RUN_DIR/postgres.log" -o "-p 5432" -w start >/dev/null
    echo "postgres  started"
  fi

  if "$REDIS_BIN/redis-cli" ping >/dev/null 2>&1; then
    echo "redis     already running"
  else
    "$REDIS_BIN/redis-server" --port 6379 --daemonize yes \
      --dir "$RUN_DIR" --logfile "$RUN_DIR/redis.log"
    echo "redis     started"
  fi
}

stop() {
  "$PG_BIN/pg_ctl" -D "$PGDATA" -w stop >/dev/null 2>&1 && echo "postgres  stopped" \
    || echo "postgres  not running"
  "$REDIS_BIN/redis-cli" shutdown nosave >/dev/null 2>&1 && echo "redis     stopped" \
    || echo "redis     not running"
}

status() {
  "$PG_BIN/pg_isready" -h localhost -p 5432 || true
  printf 'redis: '
  "$REDIS_BIN/redis-cli" ping 2>/dev/null || echo "no response"
}

case "${1:-}" in
  start)  start ;;
  stop)   stop ;;
  status) status ;;
  logs)   tail -n 40 "$RUN_DIR/postgres.log" "$RUN_DIR/redis.log" ;;
  *)      echo "Usage: $0 {start|stop|status|logs}" >&2; exit 1 ;;
esac
