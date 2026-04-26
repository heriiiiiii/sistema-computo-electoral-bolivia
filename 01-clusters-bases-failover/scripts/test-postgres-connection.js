// =============================================================================
//  test-postgres-connection.js
//  PostgreSQL Connection Test — Sistema Nacional de Cómputo Electoral Bolivia
//
//  Connects to both primary and replica, shows:
//    - PostgreSQL version
//    - Whether each node is primary or replica
//    - Replication lag (on replica)
//    - Row counts for key tables
//
//  Usage:
//    cd scripts && npm install
//    node test-postgres-connection.js
// =============================================================================

const { Client } = require("pg");

const PG_PRIMARY_URL =
  process.env.POSTGRES_PRIMARY_URL ||
  "postgresql://oep_user:oep_password@localhost:5432/oep_oficial";

const PG_REPLICA_URL =
  process.env.POSTGRES_REPLICA_URL ||
  "postgresql://oep_user:oep_password@localhost:5433/oep_oficial";

const TABLES = [
  "departamentos", "provincias", "municipios",
  "recintos", "mesas",
  "partidos", "candidatos",
  "csv_importaciones",
  "actas_oficiales", "resultados_oficiales",
  "validaciones_oficiales", "auditoria_oficial",
  "revisiones_oficiales", "comparaciones_rrv_oficial",
  "inconsistencias", "cluster_status",
];

async function testConnection(url, label) {
  console.log(`\n── ${label} ──────────────────────────────────────`);
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });

  try {
    await client.connect();
    console.log("[OK]  Connected.");

    const ver = await client.query("SELECT version()");
    console.log("      Version: " + ver.rows[0].version.split(",")[0]);

    const rec = await client.query("SELECT pg_is_in_recovery() AS is_replica");
    const isReplica = rec.rows[0].is_replica;
    console.log("      Role   : " + (isReplica ? "REPLICA (standby)" : "PRIMARY (writable)"));

    if (isReplica) {
      const lag = await client.query(
        `SELECT COALESCE(
           ROUND(EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000),
           0
         ) AS lag_ms`
      );
      console.log("      Replication lag: " + lag.rows[0].lag_ms + "ms");
    } else {
      const repStat = await client.query(
        "SELECT COUNT(*) AS replicas FROM pg_stat_replication"
      );
      console.log("      Active replicas: " + repStat.rows[0].replicas);
    }

    // Table row counts
    console.log("\n      Table row counts:");
    for (const table of TABLES) {
      try {
        const res = await client.query(`SELECT COUNT(*) AS n FROM ${table}`);
        const n = res.rows[0].n.toString().padStart(5);
        console.log(`        ${table.padEnd(30)} ${n} row(s)`);
      } catch (e) {
        console.log(`        ${table.padEnd(30)} [ERROR: ${e.message}]`);
      }
    }
  } catch (err) {
    console.error("[ERROR] " + err.message);
    console.error("        Check that the container is running: docker compose ps");
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  console.log("=================================================");
  console.log(" OEP — PostgreSQL Connection Test");
  console.log("=================================================");

  await testConnection(PG_PRIMARY_URL, "postgres-primary (port 5432)");
  await testConnection(PG_REPLICA_URL, "postgres-replica  (port 5433)");

  console.log("\n=================================================");
  console.log(" Done.");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
