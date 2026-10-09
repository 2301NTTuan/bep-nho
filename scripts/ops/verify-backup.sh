#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_FILE:?BACKUP_FILE must point to a custom-format dump}"
: "${VERIFY_ADMIN_DATABASE_URL:?VERIFY_ADMIN_DATABASE_URL must point to a PostgreSQL maintenance database}"

for command_name in createdb dropdb pg_restore psql; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "$command_name is required." >&2
    exit 1
  }
done
[[ -f "$BACKUP_FILE" ]] || {
  echo "Backup file does not exist: $BACKUP_FILE" >&2
  exit 1
}

admin_url=$VERIFY_ADMIN_DATABASE_URL
admin_base=${admin_url%%\?*}
admin_query=''
if [[ "$admin_url" == *\?* ]]; then
  admin_query="?${admin_url#*\?}"
fi
database_name="bep_nho_restore_verify_$(date -u +%Y%m%d%H%M%S)_$$"
target_url="${admin_base%/*}/${database_name}${admin_query}"

cleanup() {
  dropdb --if-exists --force --maintenance-db="$admin_url" "$database_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

createdb --maintenance-db="$admin_url" "$database_name"
RESTORE_DATABASE_URL="$target_url" BACKUP_FILE="$BACKUP_FILE" \
  "$(dirname "$0")/restore-postgres.sh"

psql "$target_url" -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT count(*) AS applied_migrations FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
SELECT
  to_regclass('public.users') IS NOT NULL AS users_exists,
  to_regclass('public.recipes') IS NOT NULL AS recipes_exists,
  to_regclass('public.cook_sessions') IS NOT NULL AS cook_sessions_exists,
  to_regclass('public.taste_profiles') IS NOT NULL AS taste_profiles_exists,
  to_regclass('public.personalized_recipe_versions') IS NOT NULL AS personalized_versions_exists;
SELECT
  (SELECT count(*) FROM recipes) AS recipes,
  (SELECT count(*) FROM recipe_versions) AS recipe_versions,
  (SELECT count(*) FROM users) AS users;
SQL

echo "Backup restore verification passed in disposable database: $database_name"
