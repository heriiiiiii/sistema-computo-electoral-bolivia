#!/bin/bash
set -e

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PRIMARY_HOST="${PRIMARY_HOST:-postgres-primary}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPLICATION_USER="${REPLICATION_USER:-replicator}"
REPLICATION_PASSWORD="${REPLICATION_PASSWORD:-replicator_password}"

echo "[REPLICA] PostgreSQL Replica Setup Script"
echo "[REPLICA] Primary: $PRIMARY_HOST:$PRIMARY_PORT"
echo "[REPLICA] PGDATA : $PGDATA"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[REPLICA] Data directory is empty. Starting pg_basebackup..."

    until pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -q; do
        echo "[REPLICA] Waiting for primary..."
        sleep 3
    done

    echo "[REPLICA] Primary ready. Waiting 10 seconds..."
    sleep 10

    PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup \
        -h "$PRIMARY_HOST" \
        -p "$PRIMARY_PORT" \
        -U "$REPLICATION_USER" \
        -D "$PGDATA" \
        -Fp \
        -Xs \
        -P \
        --checkpoint=fast

    touch "$PGDATA/standby.signal"

    cat >> "$PGDATA/postgresql.auto.conf" << STANDBY_CONF
primary_conninfo = 'host=$PRIMARY_HOST port=$PRIMARY_PORT user=$REPLICATION_USER password=$REPLICATION_PASSWORD application_name=replica1 sslmode=prefer'
recovery_target_timeline = 'latest'
STANDBY_CONF

    chown -R postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"

    echo "[REPLICA] Standby configured."
else
    echo "[REPLICA] Data directory already initialized."
fi

echo "[REPLICA] Starting PostgreSQL..."
exec /usr/local/bin/gosu postgres postgres \
    -c hot_standby=on \
    -c wal_level=replica \
    -c max_wal_senders=5 \
    -c max_replication_slots=5 \
    -c wal_keep_size=128 \
    -c listen_addresses='*' \
    -c hba_file=/etc/postgresql/pg_hba.conf \
    -c log_replication_commands=on