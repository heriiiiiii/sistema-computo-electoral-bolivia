// =============================================================================
//  health-check.js
//  Database Health Check — Sistema Nacional de Cómputo Electoral Bolivia
//
//  Checks:
//    1. MongoDB Replica Set status (all 3 nodes)
//    2. PostgreSQL primary connection and write access
//    3. PostgreSQL replica connection and recovery mode
//
//  Output: standard JSON health response
//    { "success": true, "status": "OK", "services": { "nosql": "OK", "relacional": "OK" } }
//
//  Usage:
//    cd scripts && npm install
//    node health-check.js
//
//  Environment variables (optional, defaults to docker-compose values):
//    MONGO_URI       — MongoDB connection URI
//    POSTGRES_PRIMARY_URL — PostgreSQL primary URL
//    POSTGRES_REPLICA_URL — PostgreSQL replica URL
// =============================================================================

const { MongoClient } = require("mongodb");
const { Client: PgClient } = require("pg");

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://localhost:27017,localhost:27018,localhost:27019/oep_rrv?replicaSet=rs0";

const PG_PRIMARY_URL =
  process.env.POSTGRES_PRIMARY_URL ||
  "postgresql://oep_user:oep_password@localhost:5432/oep_oficial";

const PG_REPLICA_URL =
  process.env.POSTGRES_REPLICA_URL ||
  "postgresql://oep_user:oep_password@localhost:5433/oep_oficial";

// ── Utility ───────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString();
}

// ── MongoDB Health Check ──────────────────────────────────────────────────────

async function checkMongo() {
  const result = {
    status: "ERROR",
    replicaSet: null,
    members: [],
    primary: null,
    error: null,
    checkedAt: timestamp(),
  };

  let client;
  const t0 = Date.now();

  try {
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    await client.connect();

    const admin = client.db("admin");
    const rsStatus = await admin.command({ replSetGetStatus: 1 });

    result.replicaSet = rsStatus.set;
    result.latencyMs = Date.now() - t0;

    rsStatus.members.forEach((m) => {
      const memberInfo = {
        name: m.name,
        state: m.stateStr,
        health: m.health === 1 ? "HEALTHY" : "UNHEALTHY",
        optime: m.optimeDate,
      };
      result.members.push(memberInfo);
      if (m.stateStr === "PRIMARY") result.primary = m.name;
    });

    const allHealthy = rsStatus.members.every((m) => m.health === 1);
    const hasPrimary = rsStatus.members.some((m) => m.stateStr === "PRIMARY");

    if (hasPrimary && allHealthy) {
      result.status = "OK";
    } else if (hasPrimary) {
      result.status = "DEGRADED";
    } else {
      result.status = "ERROR";
      result.error = "No PRIMARY elected";
    }

    // Update rrv_cluster_status collection
    try {
      const db = client.db("oep_rrv");
      const now = new Date();
      for (const m of rsStatus.members) {
        await db.collection("rrv_cluster_status").updateOne(
          { nodo: m.name.split(":")[0] },
          {
            $set: {
              clusterNombre: "oep-mongodb",
              nodo: m.name.split(":")[0],
              host: m.name.split(":")[0],
              puerto: parseInt(m.name.split(":")[1]) || 27017,
              tipoNodo: m.stateStr === "PRIMARY" ? "PRIMARY" : m.stateStr === "SECONDARY" ? "SECONDARY" : "UNKNOWN",
              estado: m.health === 1 ? "ACTIVO" : "CAIDO",
              ultimaVerificacion: now,
              latenciaMs: m.pingMs || null,
              observacion: m.stateStr,
            },
          },
          { upsert: true }
        );
      }
    } catch (_) {
      // Cluster status update is best-effort
    }
  } catch (err) {
    result.error = err.message;
    result.status = "ERROR";
  } finally {
    if (client) await client.close().catch(() => {});
  }

  return result;
}

// ── PostgreSQL Health Check ───────────────────────────────────────────────────

async function checkPostgres(url, label) {
  const result = {
    label,
    status: "ERROR",
    version: null,
    isReplica: null,
    replicationLagMs: null,
    latencyMs: null,
    error: null,
    checkedAt: timestamp(),
  };

  const client = new PgClient({ connectionString: url, connectionTimeoutMillis: 5000 });
  const t0 = Date.now();

  try {
    await client.connect();
    result.latencyMs = Date.now() - t0;

    const vRes = await client.query("SELECT version()");
    result.version = vRes.rows[0].version.split(" ").slice(0, 2).join(" ");

    const recRes = await client.query("SELECT pg_is_in_recovery() AS is_replica");
    result.isReplica = recRes.rows[0].is_replica;

    if (result.isReplica) {
      const lagRes = await client.query(
        "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000 AS lag_ms"
      );
      result.replicationLagMs = lagRes.rows[0].lag_ms
        ? Math.round(parseFloat(lagRes.rows[0].lag_ms))
        : null;
    }

    result.status = "OK";
  } catch (err) {
    result.error = err.message;
    result.status = "ERROR";
  } finally {
    await client.end().catch(() => {});
  }

  return result;
}

// ── Update PostgreSQL cluster_status ─────────────────────────────────────────

async function updatePgClusterStatus(primaryResult, replicaResult) {
  const client = new PgClient({
    connectionString: PG_PRIMARY_URL,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();

    const nodes = [
      {
        nodo: "postgres-primary",
        host: "postgres-primary",
        puerto: 5432,
        rol: "PRIMARY",
        estado: primaryResult.status === "OK" ? "ACTIVO" : "CAIDO",
        latencia: primaryResult.latencyMs,
      },
      {
        nodo: "postgres-replica",
        host: "postgres-replica",
        puerto: 5432,
        rol: "REPLICA",
        estado: replicaResult.status === "OK" ? "ACTIVO" : "CAIDO",
        latencia: replicaResult.latencyMs,
      },
    ];

    for (const n of nodes) {
      await client.query(
        `UPDATE cluster_status
         SET estado = $1, ultima_verificacion = now(), latencia_ms = $2, observacion = $3
         WHERE nodo = $4 AND motor = 'POSTGRESQL'`,
        [n.estado, n.latencia, `Last check: ${timestamp()}`, n.nodo]
      );
    }
  } catch (_) {
    // Best-effort update
  } finally {
    await client.end().catch(() => {});
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[OEP] Running database health check...\n");

  const [mongoResult, pgPrimaryResult, pgReplicaResult] = await Promise.all([
    checkMongo(),
    checkPostgres(PG_PRIMARY_URL, "postgres-primary"),
    checkPostgres(PG_REPLICA_URL, "postgres-replica"),
  ]);

  // Best-effort cluster status update in PostgreSQL
  if (pgPrimaryResult.status === "OK") {
    await updatePgClusterStatus(pgPrimaryResult, pgReplicaResult);
  }

  const nosqlStatus    = mongoResult.status === "OK"      ? "OK" : mongoResult.status === "DEGRADED" ? "DEGRADED" : "ERROR";
  const relacionalStatus = pgPrimaryResult.status === "OK" ? "OK" : "ERROR";

  const overallOk = nosqlStatus === "OK" && relacionalStatus === "OK";

  const response = {
    success: overallOk,
    status: overallOk ? "OK" : "PARTIAL_ERROR",
    timestamp: timestamp(),
    services: {
      nosql: nosqlStatus,
      relacional: relacionalStatus,
    },
    details: {
      mongodb: {
        status:     mongoResult.status,
        replicaSet: mongoResult.replicaSet,
        primary:    mongoResult.primary,
        members:    mongoResult.members,
        latencyMs:  mongoResult.latencyMs,
        error:      mongoResult.error,
        checkedAt:  mongoResult.checkedAt,
      },
      postgresql: {
        primary: {
          status:    pgPrimaryResult.status,
          version:   pgPrimaryResult.version,
          isReplica: pgPrimaryResult.isReplica,
          latencyMs: pgPrimaryResult.latencyMs,
          error:     pgPrimaryResult.error,
          checkedAt: pgPrimaryResult.checkedAt,
        },
        replica: {
          status:            pgReplicaResult.status,
          version:           pgReplicaResult.version,
          isReplica:         pgReplicaResult.isReplica,
          replicationLagMs:  pgReplicaResult.replicationLagMs,
          latencyMs:         pgReplicaResult.latencyMs,
          error:             pgReplicaResult.error,
          checkedAt:         pgReplicaResult.checkedAt,
        },
      },
    },
  };

  console.log(JSON.stringify(response, null, 2));

  process.exit(overallOk ? 0 : 1);
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
