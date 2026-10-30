#!/bin/bash
set -euo pipefail
work=/tmp/hudumika-backup
mkdir -p "$work"
pg_dump --format=custom --file="$work/database.dump"
pg_dumpall --globals-only > "$work/roles.sql"
if ! restic cat config >/dev/null 2>&1; then
  restic init
fi
restic backup "$work" /snapshot/uploads /snapshot/production.env --host contabo --tag hudumika
restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune --host contabo --tag hudumika
restic check
