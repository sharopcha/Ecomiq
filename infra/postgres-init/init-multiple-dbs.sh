#!/bin/sh
# postgres:16-alpine has no /bin/bash (Alpine ships only /bin/sh/ash) — the
# bash shebang here made docker-entrypoint.sh fail with "bad interpreter:
# Permission denied" on every fresh volume, silently skipping database
# creation (identity_db/catalog_db/inventory_db never existed; only the
# default POSTGRES_USER-named db did). Reproduced live: a fresh
# `docker compose down -v && up -d` left `psql -U ecomiq -l` showing no
# app databases, and every *-migrate service failed with
# "3D000 invalid_catalog_name". Script below is plain POSIX, no bash-isms.
# Creates one database per name in $POSTGRES_MULTIPLE_DATABASES (comma-separated).
# Runs automatically on first container start (mounted into /docker-entrypoint-initdb.d).
set -e

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
  echo "Creating databases: $POSTGRES_MULTIPLE_DATABASES"
  for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
      SELECT 'CREATE DATABASE $db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
      GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
    # citext extension is used by app_user.email / store.slug (case-insensitive uniqueness)
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" -c "CREATE EXTENSION IF NOT EXISTS citext;"
  done
fi
