#!/bin/bash
# Creates one database per microservice inside a single PostgreSQL cluster.
# Postgres automatically executes scripts placed in
# /docker-entrypoint-initdb.d/ on the FIRST boot of a fresh volume.

set -euo pipefail

create_db() {
  local dbname="$1"
  echo "[init] creating database: $dbname"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    SELECT 'CREATE DATABASE "$dbname"'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$dbname')\gexec
EOSQL
}

# Merchant + Charge/Refund model:
#   merchant   — merchant-service (renamed from account)
#   wallet     — wallet-service
#   transaction — transaction-service
# The legacy auth/account DBs are no longer created.
create_db "${POSTGRES_DB_MERCHANT:-merchant}"
create_db "${POSTGRES_DB_WALLET:-wallet}"
create_db "${POSTGRES_DB_TRANSACTION:-transaction}"

echo "[init] all databases created"
