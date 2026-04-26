# PostgreSQL Streaming Replication & Automatic Failover

## Sistema Nacional de Cómputo Electoral Bolivia — Módulo 01

---

## Overview

The `postgres-primary` and `postgres-replica` containers use **PostgreSQL 16 streaming replication (WAL-based)** with a **demo-level automatic failover monitor**.

| Container | Port (host) | Role | Description |
|---|---|---|---|
| `postgres-primary` | 5432 | PRIMARY | Accepts all reads and writes |
| `postgres-replica` | 5433 | STANDBY | Hot standby, read-only, streams WAL from primary |
| `postgres-failover-monitor` | — | MONITOR | Detects primary failure, promotes replica automatically |

---

## How Streaming Replication Works

```
postgres-primary (port 5432)
        │  WAL stream (physical replication — continuous)
        ▼
postgres-replica (port 5433) — hot standby, read-only
```

1. `postgres-primary` runs with `wal_level=replica` and `max_wal_senders=5`.
2. The `replicator` user (created in `00-create-replication-user.sql`) holds the `REPLICATION` privilege.
3. On first start, `postgres-replica` runs `replica-setup.sh` which executes `pg_basebackup` from the primary.
4. After the base backup, `standby.signal` and `postgresql.auto.conf` (with `primary_conninfo`) are written.
5. The replica starts and streams WAL changes continuously.
6. **The replica also runs with `wal_level=replica` and `max_wal_senders=5`** — so after promotion it can accept a new standby without reconfiguration.

---

## Verify Replication is Active

### From the primary

```bash
docker exec postgres-primary psql -U oep_user -d oep_oficial \
  -c "SELECT client_addr, application_name, state, sent_lsn, replay_lsn
      FROM pg_stat_replication;"
```

Expected: one row with `state = streaming`.

### From the replica

```bash
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery() AS in_standby_mode,
             now() - pg_last_xact_replay_timestamp() AS replication_lag;"
```

Expected: `in_standby_mode = true` and lag near 0.

---

## PostgreSQL Router — Stable Endpoint (HAProxy)

`postgres-router` is an HAProxy service that provides a **single stable connection endpoint** for all backend services. It automatically routes traffic to the current writable primary.

```
Backend → postgres-router:5432 (HAProxy)
             │
             ├─ postgres-primary:5432  (active — normal operation)
             └─ postgres-replica:5432  (backup — used when primary is down)
```

### Start the router

```bash
docker compose up -d postgres-router
```

### Connection strings

```env
# Inside Docker network (use in NestJS, backend services)
POSTGRES_ROUTER_URL=postgresql://oep_user:oep_password@postgres-router:5432/oep_oficial

# From host (use for testing, pgAdmin, test scripts)
POSTGRES_ROUTER_HOST_URL=postgresql://oep_user:oep_password@localhost:5434/oep_oficial
```

### Test the router

```bash
cd scripts && npm install
node test-postgres-router.js
```

### HAProxy stats dashboard

```
http://localhost:8404/stats
```

Real-time view of server health, connection counts, and failover state.

### How HAProxy routes traffic

| Condition | Routing | Writes |
|---|---|---|
| postgres-primary UP | → postgres-primary (active server) | ✓ |
| postgres-primary DOWN | → postgres-replica (backup server, ~6s to switch) | ✗ until promoted |
| postgres-replica promoted | → postgres-replica (writable primary) | ✓ |

**Health check:** TCP connect every 3 seconds. After 2 consecutive failures (~6s), the server is marked DOWN and the backup takes over.

**Limitation:** HAProxy's TCP health check verifies connectivity only — it does NOT check `pg_is_in_recovery()`. Role detection is handled by the `postgres-failover-monitor`. If both servers are UP, HAProxy always routes to `postgres-primary` (by `balance first` + active/backup ordering), which is correct normal behavior.

---

## Automatic Failover Monitor

`scripts/postgres-failover-monitor.js` implements a **demo-level automatic failover** using a Node.js state machine.

### What it does

1. Checks `postgres-primary` every 5 seconds (configurable).
2. After **3 consecutive failures** (configurable), it checks whether `postgres-replica` is reachable.
3. Verifies the replica is in recovery mode: `SELECT pg_is_in_recovery()` → must be `true`.
4. Promotes the replica: `SELECT pg_promote()`.
5. Verifies promotion succeeded: `SELECT pg_is_in_recovery()` → must return `false`.
6. Enters **observation mode** — monitors the new primary, but **never promotes again**.

### State machine

```
MONITORING ──(3 consecutive failures)──► FAILOVER_PENDING
                                                │
                              (primary recovers)│
                                    ◄───────────┘
                                                │
                              (threshold reached)
                                                ▼
                                          PROMOTING
                                                │
                              (pg_promote OK)   │
                                                ▼
                                          PROMOTED  (observation mode — no re-promotion)
```

### Start the monitor (Docker Compose — preferred)

```bash
# Start
docker compose --profile monitor up -d postgres-failover-monitor

# Watch logs
docker logs -f postgres-failover-monitor

# Stop
docker compose --profile monitor stop postgres-failover-monitor
```

### Start the monitor manually (from host)

```bash
cd scripts && npm install

# Default — connects to localhost:5432 (primary) and localhost:5433 (replica)
PG_REPLICA_PORT=5433 node postgres-failover-monitor.js
```

### Environment variables for the monitor

| Variable | Default | Description |
|---|---|---|
| `PG_PRIMARY_HOST` | `localhost` | Primary host |
| `PG_PRIMARY_PORT` | `5432` | Primary port |
| `PG_REPLICA_HOST` | `localhost` | Replica host |
| `PG_REPLICA_PORT` | `5433` | Replica port (use 5432 inside Docker) |
| `PG_USER` | `oep_user` | PostgreSQL user |
| `PG_PASSWORD` | `oep_password` | PostgreSQL password |
| `PG_DB` | `oep_oficial` | Database name |
| `CHECK_INTERVAL_MS` | `5000` | Check interval in milliseconds |
| `FAILURE_THRESHOLD` | `3` | Consecutive failures before promotion |

---

## Manual Failover (Fallback)

If the monitor is not running, use the manual promotion script:

```bash
bash scripts/postgres-promote-replica.sh
```

Or directly with psql:

```bash
# 1. Promote
docker exec postgres-replica psql -U oep_user -c "SELECT pg_promote();"

# 2. Verify (must return f = false)
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery();"
```

---

## After Failover: What Changed

After promotion, `postgres-replica` is the new PRIMARY:

```
postgres-replica (port 5433) ← NEW PRIMARY  (accepts reads + writes)
postgres-primary (port 5432) ← STALE        (must be re-initialized before restart)
```

**Application connection strings must be updated:**

```env
# Before failover
POSTGRES_PRIMARY_URL=postgresql://oep_user:oep_password@postgres-primary:5432/oep_oficial

# After failover (inside Docker network)
POSTGRES_PRIMARY_URL=postgresql://oep_user:oep_password@postgres-replica:5432/oep_oficial

# After failover (from host)
POSTGRES_PRIMARY_URL_HOST=postgresql://oep_user:oep_password@localhost:5433/oep_oficial
```

---

## Split-Brain: Why You Must NOT Restart the Old Primary Directly

After a failover, the old `postgres-primary` has a **diverged WAL timeline**. If you simply run `docker start postgres-primary`, it may believe it is still the primary and start accepting writes. This creates **split-brain**: two nodes independently accepting writes with no replication between them. The data divergence is unrecoverable without manual intervention.

**The safe rule: never restart the old primary as-is after a failover.**

The correct procedure is to fully re-initialize the old primary from the new primary using `pg_basebackup`.

---

## Rejoin Old Primary as Standby (Safe Procedure)

```bash
bash scripts/postgres-rejoin-old-primary.sh
```

With `--force` to skip interactive confirmation:

```bash
bash scripts/postgres-rejoin-old-primary.sh --force
```

### What the script does

| Step | Action | Why |
|---|---|---|
| 1 | Stop `postgres-primary` container | Prevent it from writing independently |
| 2 | **Destroy** `postgres_primary_data` volume | Eliminate diverged WAL state — split-brain prevention |
| 3 | Run `pg_basebackup` from `postgres-replica` | Copy exact data from new primary |
| 4 | Write `standby.signal` | Tells PostgreSQL to start in recovery/standby mode |
| 5 | Write `primary_conninfo → postgres-replica` | Points new standby to stream WAL from new primary |
| 6 | Start `postgres-primary` container | Starts as hot standby of `postgres-replica` |
| 7 | Verify `pg_is_in_recovery() = true` | Confirms standby mode |

### Verify the rejoin

```bash
# Confirm old primary is now in standby mode
docker exec postgres-primary psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery();"
# Expected: t

# Confirm replication stream visible on new primary
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT application_name, client_addr, state, sync_state
      FROM pg_stat_replication;"
# Expected: 1 row with state = streaming
```

> **Note**: After rejoin, hostnames are reversed — `postgres-primary` is the standby and `postgres-replica` is the primary. This is expected. For a clean topology reset: `docker compose down -v` and restart from scratch.

---

## Guided Test Script

The guided test script walks through the entire failover cycle:

```bash
bash scripts/test-postgres-failover.sh
```

It covers:
1. Verify initial cluster state
2. Write pre-failover test data
3. Start the automatic monitor (optional)
4. Simulate primary failure (`docker stop postgres-primary`)
5. Verify automatic promotion
6. Write to new primary
7. Rejoin instructions

---

## Read/Write Split for NestJS

| Operation | Connection String |
|---|---|
| Writes | `POSTGRES_PRIMARY_URL` → port 5432 |
| Heavy reads (optional) | `POSTGRES_REPLICA_URL` → port 5433 |

```typescript
// Write connection (TypeORM)
TypeOrmModule.forRoot({
  type: 'postgres',
  url: process.env.POSTGRES_PRIMARY_URL,
  entities: [...],
  synchronize: false,
})
```

---

## Known Limitations (Demo vs Production)

| Limitation | Demo (this setup) | Production solution |
|---|---|---|
| Write unavailability window | ~6s (HAProxy detects) + ~15s (monitor promotes) = ~21s | Patroni: instant leader election, ~5s total |
| HAProxy no role detection | Routes by availability, not pg_is_in_recovery() | Patroni REST API + HAProxy active checks |
| Single replica | Only 1 standby available | Multiple standbys with cascading |
| Monitor as single point | Monitor process can fail (Docker restart policy handles this) | Patroni cluster consensus via etcd/Consul |
| Hostname reversal after failover | postgres-primary becomes standby after rejoin | DNS-based service names or VIP |
| No PITR (Point-in-Time Recovery) | Cannot roll back to specific time | WAL archiving to S3/GCS |
| Manual rejoin for old primary | Requires running rejoin script | Patroni auto-reinit |
| No PgBouncer | Direct connections from each NestJS instance | PgBouncer connection pool |

---

## Resetting the Cluster

To reset to a clean state (loses all data):

```bash
docker compose down -v
docker compose up -d mongo1 mongo2 mongo3 postgres-primary
# wait ~40s
docker compose run --rm mongo-init
docker compose up -d postgres-replica
```

---

## Reference — All Failover Commands

```bash
# ── Router ─────────────────────────────────────────────────────────────────────
# Start HAProxy router (always-on, no profile needed)
docker compose up -d postgres-router

# Test router (from host)
cd scripts && npm install && node test-postgres-router.js

# HAProxy stats dashboard
# http://localhost:8404/stats

# ── Automatic monitor ──────────────────────────────────────────────────────────
# Start automatic failover monitor
docker compose --profile monitor up -d postgres-failover-monitor
docker logs -f postgres-failover-monitor

# ── Manual promotion (fallback) ────────────────────────────────────────────────
bash scripts/postgres-promote-replica.sh

# Verify new primary
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery();"

# ── Rejoin old primary as standby ──────────────────────────────────────────────
bash scripts/postgres-rejoin-old-primary.sh --force

# ── Guided end-to-end test ─────────────────────────────────────────────────────
bash scripts/test-postgres-failover.sh

# ── Full reset ─────────────────────────────────────────────────────────────────
docker compose down -v
```
