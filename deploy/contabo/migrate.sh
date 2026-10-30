#!/bin/sh
set -eu
node --conditions=production dist/db/migrate.js
node --conditions=production /app/deploy/contabo/configure-roles.mjs
