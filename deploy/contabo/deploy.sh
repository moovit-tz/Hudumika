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
# Staff console host (docs/STAFF_CONSOLE.md): when ADMIN_DOMAIN is set, admin-api
# is built, released, health-checked and rolled back with api and gateway.
admin_domain="$(python3 deploy/contabo/init.py --print-admin-domain)"
compose=(docker compose --env-file .env.production -f deploy/contabo/compose.yaml)
app_services=(api gateway)
if [[ -n "$admin_domain" ]]; then
  compose+=(--profile admin)
  app_services=(api admin-api gateway)
fi
"${compose[@]}" config --quiet
mkdir -p deploy/contabo/.state
old_api_container="$("${compose[@]}" ps -q api)"
old_web_container="$("${compose[@]}" ps -q gateway)"
old_admin_container=""
[[ -n "$admin_domain" ]] && old_admin_container="$("${compose[@]}" ps -q admin-api)"
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
    # admin-api runs the api image, so the same rollback tag restores it; one
    # that did not exist before this deploy is stopped instead.
    if [[ -n "$old_admin_container" ]]; then
      "${compose[@]}" -f deploy/contabo/rollback.yaml up -d --no-build admin-api || true
    elif [[ -n "$admin_domain" ]]; then
      "${compose[@]}" stop admin-api || true
    fi
  fi
  exit "$code"
}
trap rollback ERR
"${compose[@]}" up -d --wait "${app_services[@]}"
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors "https://$domain/health"
echo
if [[ -n "$admin_domain" ]]; then
  # The public host must refuse staff routes, and admin-api must refuse customer routes.
  public_staff="$(curl --silent --output /dev/null --write-out '%{http_code}' "https://$domain/v1/staff/me")"
  [[ "$public_staff" == 404 ]] || { echo "The public API answered /v1/staff/me with $public_staff; expected 404. Check API_SURFACE." >&2; false; }
  "${compose[@]}" exec -T admin-api node -e 'fetch("http://127.0.0.1:3001/v1/customers").then(r=>process.exit(r.status===404?0:1)).catch(()=>process.exit(1))'     || { echo 'admin-api served a customer route; expected API_SURFACE=admin.' >&2; false; }
  echo "Staff console released on https://$admin_domain (reachable only from ADMIN_ALLOWED_CIDRS)."
fi
bash deploy/contabo/install-backup-timer.sh
trap - ERR
echo 'Deployment, HTTPS, backup and isolated database restore checks passed. Complete the business acceptance checks in README.md.'
