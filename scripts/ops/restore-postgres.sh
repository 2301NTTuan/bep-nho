#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_FILE:?BACKUP_FILE must point to a custom-format dump}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL must explicitly identify an empty disposable target}"

pg_restore_bin=${PG_RESTORE_BIN:-pg_restore}
psql_bin=${PSQL_BIN:-psql}

command -v "$pg_restore_bin" >/dev/null 2>&1 || {
  echo "$pg_restore_bin is required." >&2
  exit 1
}
command -v "$psql_bin" >/dev/null 2>&1 || {
  echo "$psql_bin is required." >&2
  exit 1
}
[[ -f "$BACKUP_FILE" ]] || {
  echo "Backup file does not exist: $BACKUP_FILE" >&2
  exit 1
}

target_url=${RESTORE_DATABASE_URL%%\?*}
source_url=${DATABASE_URL:-}
source_url=${source_url%%\?*}

if [[ -n "$source_url" && "$target_url" == "$source_url" && "${ALLOW_SOURCE_RESTORE:-}" != "I_UNDERSTAND_DATA_LOSS" ]]; then
  echo "Refusing to restore into DATABASE_URL. Use a disposable target." >&2
  exit 1
fi

target_db=${target_url%%\?*}
target_db=${target_db##*/}
if [[ "$target_db" == "bep_nho" && "${ALLOW_SOURCE_RESTORE:-}" != "I_UNDERSTAND_DATA_LOSS" ]]; then
  echo "Refusing target database named bep_nho without the explicit destructive override." >&2
  exit 1
fi

client_major=$("$pg_restore_bin" --version | sed -E 's/.* ([0-9]+)(\..*)?$/\1/')
server_version_num=$("$psql_bin" "$target_url" -v ON_ERROR_STOP=1 -Atqc 'SHOW server_version_num;')
server_major=$((server_version_num / 10000))
if [[ "$client_major" != "$server_major" && "${ALLOW_PG_MAJOR_MISMATCH:-}" != "I_UNDERSTAND_COMPATIBILITY_RISK" ]]; then
  echo "Refusing restore with pg_restore major $client_major against PostgreSQL major $server_major." >&2
  echo "Use matching PostgreSQL client tools, or explicitly acknowledge the compatibility risk." >&2
  exit 1
fi

existing_tables=$("$psql_bin" "$target_url" -v ON_ERROR_STOP=1 -Atqc \
  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';")
if [[ "$existing_tables" != "0" && "${ALLOW_NONEMPTY_TARGET:-}" != "I_UNDERSTAND_EXISTING_OBJECTS" ]]; then
  echo "Target is not empty (${existing_tables} public tables); restore refused." >&2
  exit 1
fi

"$pg_restore_bin" \
  --dbname="$target_url" \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  "$BACKUP_FILE"

echo "Restore completed into explicit target database: $target_db"
