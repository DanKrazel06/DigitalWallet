#!/bin/bash
# Crée une base par microservice dans un seul cluster PostgreSQL.
# Postgres exécute automatiquement les scripts placés dans
# /docker-entrypoint-initdb.d/ au premier démarrage du conteneur.

set -euo pipefail

create_db() {
  local dbname="$1"
  echo "[init] creating database: $dbname"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    SELECT 'CREATE DATABASE "$dbname"'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$dbname')\gexec
EOSQL
}

create_db "${POSTGRES_DB_AUTH:-auth}"
create_db "${POSTGRES_DB_ACCOUNT:-account}"
create_db "${POSTGRES_DB_WALLET:-wallet}"
create_db "${POSTGRES_DB_TRANSACTION:-transaction}"

echo "[init] all databases created"
