#!/bin/sh
# Turns the staff console site on only when ADMIN_DOMAIN is configured, so the
# gateway starts the same way with or without the admin host.
set -eu
site=/etc/caddy/admin-site.caddy
if [ -n "${ADMIN_DOMAIN:-}" ]; then
  [ -n "${ADMIN_ALLOWED_CIDRS:-}" ] || { echo 'ADMIN_ALLOWED_CIDRS is required when ADMIN_DOMAIN is set.' >&2; exit 1; }
  cp /etc/caddy/admin-console.Caddyfile "$site"
else
  : > "$site"
fi
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
