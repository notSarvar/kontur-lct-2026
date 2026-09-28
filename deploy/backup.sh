#!/bin/sh
set -eu
umask 077
state_file="${KONTUR_DATA_DIR:-/opt/kontur/data}/state.json"
backup_dir="${KONTUR_BACKUP_DIR:-/opt/kontur/backups}"
test -f "$state_file" || exit 0
mkdir -p "$backup_dir"
stamp=$(date -u '+%Y%m%dT%H%M%SZ')
# The application replaces state.json atomically, so this reads one complete snapshot.
gzip -c "$state_file" > "$backup_dir/state-$stamp.json.gz"
find "$backup_dir" -maxdepth 1 -type f -name 'state-*.json.gz' -mtime +14 -delete
