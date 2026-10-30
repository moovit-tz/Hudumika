#!/bin/bash
set -euo pipefail
target=/tmp/restore-verification
checkdb="hudumika_restore_check_$(date +%s)_$RANDOM"
case "$checkdb" in hudumika_restore_check_*) ;; *) exit 1 ;; esac
cleanup() { dropdb --if-exists "$checkdb" >/dev/null 2>&1 || true; }
trap cleanup EXIT
restic restore latest --host contabo --tag hudumika --include /tmp/hudumika-backup/database.dump --target "$target"
createdb --template template0 "$checkdb"
pg_restore --exit-on-error --no-owner --dbname "$checkdb" "$target/tmp/hudumika-backup/database.dump"
psql --set ON_ERROR_STOP=1 --dbname "$checkdb" --command 'SELECT count(*) AS restored_migrations FROM _migrations;'
echo 'Encrypted backup downloaded and restored into an isolated database; production data was not overwritten.'
