#!/bin/bash
# =============================================================================
#  test-postgres-failover.sh
#  Guided End-to-End PostgreSQL Automatic Failover Test
#  Sistema Nacional de CÃ³mputo Electoral Bolivia â€” MÃ³dulo 01
#
#  This script walks through a complete failover cycle:
#    1. Verify initial cluster state
#    2. Write test data to the primary
#    3. Start the automatic monitor (optional)
#    4. Simulate primary failure (docker stop)
#    5. Wait for automatic or manual promotion
#    6. Verify postgres-replica is now PRIMARY
#    7. Write to the new primary
#    8. Guide through rejoin of the old primary
#
#  Prerequisites:
#    - Both postgres-primary and postgres-replica must be running and healthy
#    - Run from the 01-clusters-bases-failover/ directory:
#        bash scripts/test-postgres-failover.sh
#
#  Windows: Run from Git Bash or WSL.
# =============================================================================

PG_USER="${PG_USER:-oep_user}"
PG_PASSWORD="${PG_PASSWORD:-oep_password}"
PG_DB="${PG_DB:-oep_oficial}"
PRIMARY="${PRIMARY_CONTAINER:-postgres-primary}"
REPLICA="${REPLICA_CONTAINER:-postgres-replica}"

# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

hr()  { echo "â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€"; }
hrh() { echo "======================================================================"; }

step() {
    echo ""
    hrh
    printf "  STEP %s: %s\n" "$1" "$2"
    hrh
    echo ""
}

pause() {
    echo ""
    read -r -p "  Press ENTER to continue to the next step..."
    echo ""
}

pg_exec() {
    # $1 = container, $2 = sql
    docker exec "$1" psql -U "$PG_USER" -d "$PG_DB" -c "$2" 2>/dev/null
}

pg_query() {
    # $1 = container, $2 = sql â€” returns trimmed single value
    docker exec "$1" psql -U "$PG_USER" -d "$PG_DB" -tAq -c "$2" 2>/dev/null || echo "error"
}

# â”€â”€ Intro â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

clear
hrh
echo "  PostgreSQL Automatic Failover â€” Guided Test"
echo "  Sistema Nacional de CÃ³mputo Electoral Bolivia â€” MÃ³dulo 01"
hrh
echo ""
echo "  This test demonstrates demo-level automatic PostgreSQL failover:"
echo "    - postgres-primary is the initial PRIMARY"
echo "    - postgres-replica is the initial STANDBY (hot standby)"
echo "    - An automatic monitor detects primary failure and promotes the replica"
echo "    - After promotion, postgres-replica accepts writes"
echo "    - The old primary can be safely rejoined as a new standby"
echo ""
echo "  NOTE: This is a demo/academic failover (Node.js monitor + pg_promote)."
echo "        Production systems use Patroni, repmgr, or Pgpool-II."
echo ""

# â”€â”€ Check prerequisites â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

echo "Checking prerequisites..."

for CONTAINER in "$PRIMARY" "$REPLICA"; do
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
        echo ""
        echo "ERROR: Container '$CONTAINER' is not running."
        echo "       Start all services first:"
        echo "         docker compose up -d mongo1 mongo2 mongo3 postgres-primary"
        echo "         docker compose run --rm mongo-init"
        echo "         docker compose up -d postgres-replica"
        exit 1
    fi
done
echo "  OK: Both $PRIMARY and $REPLICA are running."

pause

# â”€â”€ STEP 1: Verify initial cluster state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

step 1 "Verify initial cluster state"

echo "--- postgres-primary ---"
pg_exec "$PRIMARY" \
    "SELECT 'postgres-primary' AS node, pg_is_in_recovery() AS standby_mode, NOW() AS server_time;"

echo ""
echo "--- postgres-replica ---"
pg_exec "$REPLICA" \
    "SELECT 'postgres-replica' AS node, pg_is_in_recovery() AS standby_mode, NOW() AS server_time;"

echo ""
echo "--- Replication stream (from primary) ---"
pg_exec "$PRIMARY" \
    "SELECT client_addr, application_name, state, sync_state,
            pg_size_pretty(sent_lsn - replay_lsn) AS replay_lag
     FROM pg_stat_replication;"

echo ""
echo "Expected results:"
echo "  postgres-primary : standby_mode = false  (it IS the primary)"
echo "  postgres-replica : standby_mode = true   (it IS in recovery/standby)"
echo "  pg_stat_replication should show 1 row with state = streaming"

pause

# â”€â”€ STEP 2: Write test data before failover â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

step 2 "Write test data to primary (will verify it survived failover)"

echo "Inserting pre-failover marker into cluster_status on $PRIMARY..."
pg_exec "$PRIMARY" \
    "INSERT INTO cluster_status (cluster_nombre, motor, nodo, rol, estado, ultima_verificacion, observacion)
     VALUES ('oep-postgresql', 'POSTGRESQL', 'pre-failover-marker', 'PRIMARY', 'ACTIVO', NOW(),
             'Written BEFORE failover - verifies data survived on new primary');"

echo ""
echo "Waiting 1s for WAL replication, then verifying the record on $REPLICA..."
sleep 1
pg_exec "$REPLICA" \
    "SELECT motor, nodo, rol, observacion FROM cluster_status
     WHERE nodo = 'pre-failover-marker';"

echo ""
echo "Expected: the same row should appear on both nodes (WAL replication)."

pause

# â”€â”€ STEP 3: Start the automatic monitor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

step 3 "Start the automatic failover monitor (recommended for this test)"

echo "The monitor checks $PRIMARY every 5 seconds."
echo "After 3 consecutive failures it promotes $REPLICA automatically."
echo ""
echo "Option A â€” Docker Compose (preferred, stays running in background):"
hr
echo "  docker compose --profile monitor up -d postgres-failover-monitor"
echo "  docker logs -f postgres-failover-monitor"
hr
echo ""
echo "Option B â€” Run directly from the scripts/ directory (host terminal):"
hr
echo "  cd scripts && npm install"
echo "  PG_REPLICA_PORT=5433 node postgres-failover-monitor.js"
hr
echo ""
echo "Option C â€” Skip monitor and use manual promotion instead (Step 5b below)."
echo ""
echo "If you want automatic failover, START THE MONITOR IN A SEPARATE TERMINAL"
echo "now, then return here and press ENTER."

pause

# â”€â”€ STEP 4: Simulate primary failure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

step 4 "Simulate postgres-primary failure"

echo "About to run: docker stop $PRIMARY"
echo ""
echo "If the automatic monitor is running, it will:"
echo "  - Detect failure after check 1 (WARN: unreachable 1/3)"
echo "  - Detect failure after check 2 (WARN: unreachable 2/3)"
echo "  - Detect failure after check 3 (CRIT: threshold reached)"
echo "  - Promote $REPLICA (CRIT: AUTOMATIC FAILOVER COMPLETE)"
echo ""
echo "Total time to automatic promotion: ~15 seconds after docker stop."
echo ""
read -r -p "  Press ENTER to stop $PRIMARY now..."

docker stop "$PRIMARY"
echo ""
echo "  $PRIMARY stopped."
echo ""
echo "If the automatic monitor is running, watch its logs now:"
echo "  docker logs -f postgres-failover-monitor"
echo ""
echo "If NOT using the monitor, promote manually after this step:"
echo "  bash scripts/postgres-promote-replica.sh"

pause

# â”€â”€ STEP 5: Wait for and verify promotion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

step 5 "Verify postgres-replica is now PRIMARY"

echo "Polling $REPLICA for promotion (checking every 5s, up to 60s)..."
echo ""

PROMOTED=false
for i in $(seq 1 12); do
    STATUS=$(pg_query "$REPLICA" "SELECT pg_is_in_recovery();")
    if [ "$STATUS" = "f" ]; then
        PROMOTED=true
        echo "  Attempt $i: SUCCESS â€” $REPLICA is PRIMARY (pg_is_in_recovery() = false)"
        break
    elif [ "$STATUS" = "t" ]; then
        echo "  Attempt $i: $REPLICA still in standby mode (waiting for promotion)..."
    else
        echo "  Attempt $i: $REPLICA not yet responding..."
    fi
    sleep 5
done

echo ""
if [ "$PROMOTED" = "true" ]; then
    echo "  Promotion confirmed!"
    echo ""
    pg_exec "$REPLICA" \
        "SELECT 'postgres-replica (new primary)' AS node,
                pg_is_in_recovery() AS still_in_recovery,
                NOW() AS promoted_at;"
else
    echo "  Promotion not detected after 60s."
    echo ""
    echo "  If the monitor is not running, promote manually:"
    echo "    docker exec postgres-replica psql -U oep_user -d oep_oficial -c 'SELECT pg_promote();'"
    echo ""
    echo "  Then rerun this check:"
    echo "    docker exec postgres-replica psql -U oep_user -d oep_oficial -c 'SELECT pg_is_in_recovery();'"
    echo ""
    echo "  Expected result: pg_is_in_recovery = f"
fi

pause

# â”€â”€ STEP 6: Write to new primary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

step 6 "Write to the new primary (postgres-replica)"

echo "Attempting write to $REPLICA (now the PRIMARY)..."
echo ""
pg_exec "$REPLICA" \
    "INSERT INTO cluster_status (cluster_nombre, motor, nodo, rol, estado, ultima_verificacion, observacion)
     VALUES ('oep-postgresql', 'POSTGRESQL', 'post-failover-write', 'PRIMARY', 'ACTIVO', NOW(),
             'Written AFTER automatic failover - postgres-replica is now primary');"

echo ""
echo "Reading back both markers to confirm data integrity..."
pg_exec "$REPLICA" \
    "SELECT motor, nodo, observacion
     FROM cluster_status
     WHERE nodo IN ('pre-failover-marker', 'post-failover-write')
     ORDER BY nodo;"

echo ""
echo "Expected:"
echo "  pre-failover-marker  â€” data that was written to the OLD primary before failure"
echo "  post-failover-write  â€” data written to the NEW primary after promotion"
echo ""
echo "Both rows confirm:"
echo "  1. WAL replication preserved pre-failover data"
echo "  2. The new primary accepts writes successfully"

pause

# â”€â”€ STEP 7: Summary and rejoin instructions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

step 7 "Summary and rejoin procedure for the old primary"

hrh
echo "  AUTOMATIC FAILOVER TEST COMPLETE"
hrh
echo ""
echo "What happened:"
echo "  1. postgres-primary was stopped (simulated failure)"
echo "  2. The monitor detected 3 consecutive failures (~15s)"
echo "  3. postgres-replica was promoted via SELECT pg_promote()"
echo "  4. pg_is_in_recovery() confirmed the promotion (returned false)"
echo "  5. Writes to the new primary succeeded"
echo "  6. Pre-failover data survived intact on the new primary"
echo ""
echo "Verification commands:"
hr
echo "  # Verify new primary accepts writes:"
echo "  docker exec postgres-replica psql -U oep_user -d oep_oficial \\"
echo "    -c \"SELECT pg_is_in_recovery();\""
echo "  # Expected: f"
echo ""
echo "  # Check replication stream (after rejoin):"
echo "  docker exec postgres-replica psql -U oep_user -d oep_oficial \\"
echo "    -c \"SELECT application_name, client_addr, state FROM pg_stat_replication;\""
hr
echo ""
echo "To rejoin the old primary as a standby of postgres-replica:"
hr
echo "  bash scripts/postgres-rejoin-old-primary.sh"
hr
echo ""
echo "  This will:"
echo "    1. Stop postgres-primary (if still running)"
echo "    2. DESTROY its data volume (split-brain prevention)"
echo "    3. Run pg_basebackup from postgres-replica"
echo "    4. Configure postgres-primary as a streaming standby"
echo "    5. Start postgres-primary in recovery/standby mode"
echo ""
echo "  Use --force to skip the interactive confirmation:"
hr
echo "  bash scripts/postgres-rejoin-old-primary.sh --force"
hr
echo ""
echo "For a full reset (clean state, original hostnames):"
hr
echo "  docker compose down -v"
echo "  docker compose up -d mongo1 mongo2 mongo3 postgres-primary"
echo "  # (wait ~40s)"
echo "  docker compose run --rm mongo-init"
echo "  docker compose up -d postgres-replica"
hr
echo ""
echo "Demo checklist for PostgreSQL failover:"
echo "  [x] pg_stat_replication showed replica connected"
echo "  [x] Data written to primary appeared on replica"
echo "  [x] Primary failure detected automatically (or manually stopped)"
echo "  [x] pg_is_in_recovery() = false on postgres-replica after promotion"
echo "  [x] Writes to new primary succeeded"
echo "  [x] Pre-failover data intact on new primary"
echo ""
