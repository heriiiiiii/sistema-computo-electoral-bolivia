# Defense Explanation — Module 01: Clusters, Databases, and Fault Tolerance

## Sistema Nacional de Cómputo Electoral Bolivia

---

## What This Module Does

Module 01 provides the complete **database infrastructure** for a distributed electoral counting system designed for Bolivia. It implements two separate, fault-tolerant database clusters:

1. **MongoDB Replica Set** — for the preliminary quick count (RRV/TREP pipeline)
2. **PostgreSQL Primary/Replica** — for the official electoral count pipeline

---

## Why Two Different Databases?

The system has two fundamentally different requirements:

| Requirement | RRV (Quick Count) | Official Count |
|---|---|---|
| Data structure | Semi-structured (OCR, SMS, images) | Structured, relational |
| Consistency model | Eventual consistency | Strong consistency |
| Priority | Low latency, high availability | Accuracy, auditability |
| Database choice | MongoDB (NoSQL) | PostgreSQL (Relational) |

**MongoDB** is ideal for the quick count because the data arriving from OCR, mobile apps, and SMS is unpredictable and inconsistent. The flexible document model lets us store an image's OCR output — including all its errors — without forcing it into rigid columns.

**PostgreSQL** is ideal for the official count because it enforces referential integrity, supports foreign key constraints, transactions, and provides the audit trail required for legally binding results.

---

## MongoDB Replica Set Architecture

```
        ┌─────────────────────────────────────────┐
        │           MongoDB Replica Set (rs0)      │
        │                                          │
        │  mongo1:27017 ── PRIMARY   (writes here) │
        │  mongo2:27017 ── SECONDARY (hot standby) │
        │  mongo3:27017 ── SECONDARY (hot standby) │
        └─────────────────────────────────────────┘
```

**How replication works:**
- All writes go to the PRIMARY (mongo1 initially).
- The PRIMARY replicates the operations log (oplog) to both SECONDARY nodes.
- If the PRIMARY fails, the remaining nodes hold an election. The node with the most up-to-date oplog wins.
- The election takes approximately 10–15 seconds.
- After election, the system resumes normal operation automatically.

**Fault tolerance:**
- With 3 nodes, the cluster can lose 1 node and maintain a majority quorum (2 of 3).
- Losing 2 nodes would result in no PRIMARY being elected (no quorum).

---

## PostgreSQL Streaming Replication Architecture

```
        ┌──────────────────────────────────────────┐
        │  postgres-primary:5432  (writes + reads)  │
        │       │  WAL stream (physical replication) │
        │       ▼                                   │
        │  postgres-replica:5433  (read-only standby)│
        └──────────────────────────────────────────┘
```

**How replication works:**
- The primary writes all changes to the Write-Ahead Log (WAL).
- The replica connects to the primary using the `replicator` user and streams WAL segments continuously.
- The replica replays the WAL, keeping its data synchronized.
- The replica is in **hot standby** mode: it is online and accepts read-only queries.

**Automatic failover procedure (demo monitor):**

The system includes a Node.js failover monitor (`scripts/postgres-failover-monitor.js`) that implements a state machine:

```
MONITORING → (3 consecutive primary failures) → FAILOVER_PENDING
           → (threshold reached, replica reachable) → PROMOTING
           → (pg_promote() confirmed) → PROMOTED (observation mode)
```

1. Monitor checks `postgres-primary` every 5 seconds.
2. After 3 consecutive failures (~15 seconds), it verifies `postgres-replica` is reachable.
3. Confirms the replica is in recovery mode: `SELECT pg_is_in_recovery()` → `true`.
4. Promotes the replica: `SELECT pg_promote()`.
5. Verifies promotion: `SELECT pg_is_in_recovery()` → `false` (writable).
6. Enters observation mode — **never promotes again** (re-promotion guard).

Start the monitor:
```bash
docker compose --profile monitor up -d postgres-failover-monitor
```

**Manual failover (fallback procedure):**
1. Detect that the primary is down.
2. Run: `bash scripts/postgres-promote-replica.sh`
3. The replica removes its `standby.signal` file and becomes writable.
4. Update application connection strings to point to the promoted replica.

---

## Database Schema Design Decisions

### Why are votes stored as rows, not columns?

In `resultados_oficiales`, each party's votes are a separate row:

```sql
-- Correct — flexible, supports any number of parties
SELECT partido_id, cantidad_votos FROM resultados_oficiales
WHERE acta_oficial_id = 1 AND franja = 'PRESIDENTE';

-- Wrong — hardcoded, breaks with more parties
SELECT p1_votos, p2_votos, p3_votos, p4_votos FROM actas_oficiales WHERE ...;
```

This design follows normalization principles and makes aggregation queries much simpler.

### Why is the vote consistency rule not enforced by the database?

```
votosValidos = P1 + P2 + P3 + P4
totalVotos   = votosValidos + votosBlancos + votosNulos
```

This rule is intentionally **not** a database CHECK constraint because:
- OCR can extract incorrect values from images. The database must store the original extracted values for forensic purposes.
- Silently correcting or rejecting OCR data would destroy evidence.
- Instead, the backend validation marks inconsistent records as `SOSPECHOSA` or `PENDIENTE_REVISION`.

### Why are vote fields nullable in `actas_oficiales`?

Official actas go through a lifecycle:

```
IMPORTADA → (backend validates) → VALIDADA → (supervisor approves) → OFICIALIZADA
```

During `IMPORTADA` state, the votes may not yet be assigned (base structure loaded first). The nullable fields allow Stage 1 (structure) and Stage 2 (results) imports to happen independently.

---

## Idempotency

The system is designed to handle retries and duplicate submissions without corrupting data.

**MongoDB idempotency:**
```javascript
// Use upsert with unique actaId — safe to call multiple times
db.rrv_actas.updateOne(
  { actaId: "ACTA-001" },
  { $set: { ...data }, $setOnInsert: { createdAt: now } },
  { upsert: true }
);
```

**PostgreSQL idempotency:**
```sql
-- Use ON CONFLICT DO NOTHING for seed data
INSERT INTO mesas (codigo_mesa, ...) VALUES ('10101001001', ...)
ON CONFLICT (codigo_mesa) DO NOTHING;
```

**Why this matters:**
In an electoral system with unstable connectivity, the mobile app may retry sending an acta multiple times. Without idempotency, this would create duplicate vote counts. With unique indexes and upsert logic, retries are harmless.

---

## Fraud Prevention Principles

1. **Duplicate actas are kept, not overwritten.** If a second acta arrives for the same voting table, both are stored. A conflict flag is set. Human review is required to determine which is valid.

2. **SMS tokens are NOT used.** Security is based on authorized phone numbers registered in `sms_numeros_autorizados`. An SMS from an unregistered number is rejected and logged.

3. **Suspicious records are preserved.** When OCR produces inconsistent data (e.g., P1+P2+P3+P4 ≠ votosValidos), the original OCR values are stored as-is and the record is marked `SOSPECHOSA`. The system never silently corrects data.

4. **Audit trail is immutable.** Every action on an official acta is recorded in `auditoria_oficial` with the previous and new values (JSONB), the user, their role, timestamp, and IP address.

---

## Event Sourcing

The `rrv_eventos` collection implements a basic event sourcing pattern. Every significant action produces an event:

```
ACTA_RECIBIDA → OCR_PROCESADO → ACTA_VALIDADA → (published to dashboard)
                              → INCONSISTENCIA_DETECTADA → (requires human review)
                              → DUPLICADO_DETECTADO → (both kept for audit)
```

This allows the system to reconstruct its history, replay events for debugging, and provide a full audit trail for electoral oversight bodies.

---

## PostgreSQL Router Architecture

The system includes `postgres-router`, an HAProxy service that provides a **stable, single connection endpoint** for backend services:

```
NestJS Backend → postgres-router:5432 (HAProxy)
                     │
                     ├─► postgres-primary:5432  (active — normal)
                     └─► postgres-replica:5432  (backup — after failover)
```

Backend teams use `POSTGRES_ROUTER_URL` instead of connecting directly to `postgres-primary`. This means **application connection strings never need to change after a failover**.

HAProxy uses TCP health checks (connection every 3s) to detect which server is available. When `postgres-primary` fails the health check twice (~6s), HAProxy activates `postgres-replica`. When the `postgres-failover-monitor` promotes the replica (~15s total), writes through the router succeed automatically.

**Real-time monitoring:** `http://localhost:8404/stats` shows server status, active connections, and failover state — useful for the demo.

---

## Automatic vs Production Failover

The system implements **demo-level automatic failover**, which is appropriate for a university distributed systems project. Here is the comparison:

| Feature | This implementation | Production (Patroni/repmgr) |
|---|---|---|
| Primary failure detection | Node.js monitor, 5s heartbeat | Patroni DCS-based consensus |
| Promotion mechanism | `SELECT pg_promote()` via `pg` library | Patroni REST API + pg_ctl |
| Stable endpoint | HAProxy (`postgres-router:5432`) | HAProxy + VIP, automatic reconfiguration |
| Connection redirect | HAProxy routes automatically (~6s + 15s) | Instant via VIP on leader change |
| Re-promotion guard | `pg_is_in_recovery()` check at startup | Distributed lock (etcd/Consul) |
| Old primary rejoin | Script: `postgres-rejoin-old-primary.sh` | Patroni auto-reinit |
| Multiple replicas | Not supported | Supported |

The demo monitor correctly demonstrates: periodic heartbeat, consecutive-failure threshold, `pg_promote()`, post-promotion verification, and observation mode without re-promotion. These are the same fundamental concepts used in production tools — the difference is operational robustness and automation depth.

## Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| Connection redirect during ~15s window | During the window between primary failure and promotion, writes fail (router routes to standby before promotion) | Patroni with instant leader election |
| No connection pooler (PgBouncer) | Each NestJS instance holds its own connections | Acceptable for classroom; add PgBouncer for production |
| MongoDB election time ~10-15s | Brief write unavailability | NestJS MongoDB driver retries automatically |
| No PITR (Point-in-Time Recovery) | Cannot roll back to specific timestamp | Add WAL archiving for production use |
| Single replica only | Only 1 standby available for promotion | Multiple standbys with Patroni |
| Hostname reversal after failover | postgres-primary becomes standby | Use `docker compose down -v` for clean reset |

---

## Summary

This module demonstrates:
- **Fault-tolerant NoSQL** via MongoDB Replica Set with automatic primary election
- **Fault-tolerant relational DB** via PostgreSQL streaming replication with demo-level automatic failover
- **Stable connection endpoint** via HAProxy (`postgres-router`) — backend never changes connection string after failover
- **Automatic failover monitor** — Node.js state machine detecting failure and calling `pg_promote()` within ~15 seconds
- **Split-brain prevention** — the rejoin script destroys the old primary's data before rebuilding from the new primary
- **Complete electoral schema** supporting real Bolivian acta structure
- **Data integrity** through idempotency, duplicate detection, and suspicious record preservation
- **Full auditability** through event sourcing, audit trails, and revision tracking
- **Clean integration contracts** for all other team modules
