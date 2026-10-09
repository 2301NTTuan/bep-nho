#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify the PostgreSQL source}"

pg_dump_bin=${PG_DUMP_BIN:-pg_dump}
psql_bin=${PSQL_BIN:-psql}

command -v "$pg_dump_bin" >/dev/null 2>&1 || {
  echo "$pg_dump_bin is required." >&2
  exit 1
}
command -v "$psql_bin" >/dev/null 2>&1 || {
  echo "$psql_bin is required for the client/server compatibility check." >&2
  exit 1
}

backup_dir=${BACKUP_DIR:-"$(pwd)/backups"}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="${backup_dir%/}/bep-nho-${timestamp}.dump"
source_url=${DATABASE_URL%%\?*}

client_major=$("$pg_dump_bin" --version | sed -E 's/.* ([0-9]+)(\..*)?$/\1/')
server_version_num=$("$psql_bin" "$source_url" -v ON_ERROR_STOP=1 -Atqc 'SHOW server_version_num;')
server_major=$((server_version_num / 10000))
if [[ "$client_major" != "$server_major" && "${ALLOW_PG_MAJOR_MISMATCH:-}" != "I_UNDERSTAND_COMPATIBILITY_RISK" ]]; then
  echo "Refusing backup with pg_dump major $client_major against PostgreSQL major $server_major." >&2
  echo "Use matching PostgreSQL client tools, or explicitly acknowledge the compatibility risk." >&2
  exit 1
fi

umask 077
mkdir -p -- "$backup_dir"
if [[ -e "$backup_path" ]]; then
  echo "Refusing to overwrite existing backup: $backup_path" >&2
  exit 1
fi

"$pg_dump_bin" \
  --dbname="$source_url" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$backup_path"

size=$(du -h -- "$backup_path" | awk '{print $1}')
echo "Backup created: $backup_path"
echo "Backup size: $size"
