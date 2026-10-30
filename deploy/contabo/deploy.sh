#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo so the backup timer can be installed.' >&2; exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
command -v docker >/dev/null || { echo 'Install Docker Engine and its Compose plugin first.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Install Python 3 first.' >&2; exit 1; }
for dependency in curl flock systemctl; do
  command -v "$dependency" >/dev/null || { echo "Install $dependency first." >&2; exit 1; }
done
install -d -m 750 /run/hudumika
exec 9>/run/hudumika/backup.lock
flock -n 9 || { echo 'A deployment or backup is already running.' >&2; exit 1; }
docker compose version >/dev/null
systemctl enable docker >/dev/null
python3 deploy/contabo/init.py --check
domain="$(python3 deploy/contabo/init.py --print-domain)"
compose=(docker compose --env-file .env.production -f deploy/contabo/compose.yaml)
"${compose[@]}" config --quiet
mkdir -p deploy/contabo/.state
old_api_container="$("${compose[@]}" ps -q api)"
old_web_container="$("${compose[@]}" ps -q gateway)"
if [[ -n "$old_api_container" && -n "$old_web_container" ]]; then
  docker tag "$(docker inspect --format '{{.Image}}' "$old_api_container")" hudumika-api:rollback
  docker tag "$(docker inspect --format '{{.Image}}' "$old_web_container")" hudumika-web:rollback
fi
"${compose[@]}" build --pull api gateway backup
"${compose[@]}" up -d --wait db redis clamav
"${compose[@]}" run --rm --no-deps storage-init
# A failed backup or migration stops rollout before replacing the app.
"${compose[@]}" run --rm --no-deps backup
"${compose[@]}" run --rm --no-deps migrate
"${compose[@]}" run --rm --no-deps preflight
"${compose[@]}" run --rm --no-deps backup
"${compose[@]}" run --rm --no-deps restore-check
rollback() {
  code=$?
  if [[ -n "$old_api_container" && -n "$old_web_container" ]]; then
    echo 'Deployment failed; restoring previous application images. Schema changes are retained.' >&2
    "${compose[@]}" -f deploy/contabo/rollback.yaml up -d --no-build api gateway || true
  fi
  exit "$code"
}
trap rollback ERR
"${compose[@]}" up -d --wait api gateway
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors "https://$domain/health"
echo
bash deploy/contabo/install-backup-timer.sh
trap - ERR
echo 'Deployment, HTTPS, backup and isolated database restore checks passed. Complete the business acceptance checks in README.md.'
