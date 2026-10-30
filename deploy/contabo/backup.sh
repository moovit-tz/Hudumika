#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
install -d -m 750 /run/hudumika
exec 9>/run/hudumika/backup.lock
flock -n 9 || { echo 'A backup is already running.'; exit 0; }
docker compose --env-file .env.production -f deploy/contabo/compose.yaml run --rm --no-deps backup
