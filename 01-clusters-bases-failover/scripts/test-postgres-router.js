'use strict';

/**
 * test-postgres-router.js
 * PostgreSQL Router Connectivity and Routing Test
 * Sistema Nacional de Cómputo Electoral Bolivia — Módulo 01
 *
 * Connects through postgres-router (HAProxy) and verifies:
 *   1. The router accepts connections
 *   2. The backend node is a writable PRIMARY (pg_is_in_recovery = false)
 *   3. Read queries work
 *   4. Write queries work (INSERT into cluster_status)
 *
 * Usage (from host):
 *   cd scripts && npm install
 *   node test-postgres-router.js
 *
 * Environment variables:
 *   PG_ROUTER_HOST  — default: localhost
 *   PG_ROUTER_PORT  — default: 5434  (host-mapped port)
 *   PG_USER         — default: oep_user
 *   PG_PASSWORD     — default: oep_password
 *   PG_DB           — default: oep_oficial
 *
 * Inside Docker (from another container on oep-network):
 *   PG_ROUTER_HOST=postgres-router PG_ROUTER_PORT=5432 node test-postgres-router.js
 */

const { Client } = require('pg');

const CONFIG = {
  host: process.env.PG_ROUTER_HOST || 'localhost',
  port: parseInt(process.env.PG_ROUTER_PORT || '5434'),
  user: process.env.PG_USER || 'oep_user',
  password: process.env.PG_PASSWORD || 'oep_password',
  database: process.env.PG_DB || 'oep_oficial',
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
};

function line(char = '─', width = 65) { return char.repeat(width); }
function section(title) { console.log('\n' + line() + '\n  ' + title + '\n' + line()); }

async function run() {
  console.log('\n' + line('═'));
  console.log('  PostgreSQL Router Test');
  console.log('  Sistema Nacional de Cómputo Electoral Bolivia — Módulo 01');
  console.log(line('═'));
  console.log('');
  console.log(`  Router endpoint : ${CONFIG.host}:${CONFIG.port}`);
  console.log(`  Inside Docker   : postgres-router:5432`);
  console.log(`  HAProxy stats   : http://localhost:8404/stats`);
  console.log('');

  const client = new Client(CONFIG);

  try {
    // ── 1. Connect ────────────────────────────────────────────────────────────
    section('Step 1 — Connect to postgres-router');
    await client.connect();
    console.log('  OK: Connection established through postgres-router');

    // ── 2. Identify backend node and recovery state ───────────────────────────
    section('Step 2 — Identify backend node and primary/standby state');
    const nodeResult = await client.query(
      `SELECT
         inet_server_addr()     AS backend_ip,
         inet_server_port()     AS backend_port,
         pg_is_in_recovery()    AS in_recovery,
         pg_postmaster_start_time() AS started_at,
         version()              AS pg_version`
    );
    const node = nodeResult.rows[0];

    console.log(`  Backend IP   : ${node.backend_ip || 'container-internal'}`);
    console.log(`  Backend port : ${node.backend_port}`);
    console.log(`  pg_is_in_recovery(): ${node.in_recovery}`);
    console.log(`  Server started: ${new Date(node.started_at).toISOString()}`);
    console.log(`  PG version   : ${node.pg_version.split(',')[0]}`);

    if (node.in_recovery) {
      console.log('');
      console.log('  WARNING: Router is currently pointing to a STANDBY node.');
      console.log('  This may happen during the ~15s promotion window after a failover.');
      console.log('  Possible causes:');
      console.log('    - postgres-primary is down and postgres-replica has NOT yet been promoted');
      console.log('    - The failover monitor is still running its promotion sequence');
      console.log('  Action:');
      console.log('    - Wait ~15s and retry this script');
      console.log('    - Check monitor logs: docker logs postgres-failover-monitor');
      console.log('    - Promote manually: bash scripts/postgres-promote-replica.sh');
    } else {
      console.log('');
      console.log('  OK: Router is pointing to a WRITABLE PRIMARY (pg_is_in_recovery = false).');
    }

    // ── 3. Read test ──────────────────────────────────────────────────────────
    section('Step 3 — Read test');
    const readResult = await client.query(
      `SELECT
         (SELECT count(*) FROM mesas)       AS mesas,
         (SELECT count(*) FROM partidos)    AS partidos,
         (SELECT count(*) FROM departamentos) AS departamentos`
    );
    const counts = readResult.rows[0];
    console.log(`  mesas        : ${counts.mesas} rows`);
    console.log(`  partidos     : ${counts.partidos} rows`);
    console.log(`  departamentos: ${counts.departamentos} rows`);
    console.log('  OK: Read queries work through the router');

    // ── 4. Write test ─────────────────────────────────────────────────────────
    section('Step 4 — Write test');

    if (node.in_recovery) {
      console.log('  SKIPPED: Cannot run write test — backend is in standby mode.');
      console.log('           Writes fail on standby. Retry after promotion.');
    } else {
      const ts = new Date().toISOString();
      await client.query(
        `INSERT INTO cluster_status (cluster_nombre, motor, nodo, rol, estado, ultima_verificacion, observacion)
         VALUES ('oep-postgresql', 'POSTGRESQL', 'router-test', 'PRIMARY', 'ACTIVO', NOW(), $1)`,
        [`Written via postgres-router at ${ts}`]
      );
      const verifyResult = await client.query(
        `SELECT nodo, observacion FROM cluster_status WHERE nodo = 'router-test' ORDER BY id DESC LIMIT 1`
      );
      console.log(`  OK: Write succeeded.`);
      console.log(`  Record: ${JSON.stringify(verifyResult.rows[0])}`);
    }

    // ── 5. Replication status (if primary) ───────────────────────────────────
    if (!node.in_recovery) {
      section('Step 5 — Replication status (standbys connected)');
      const replResult = await client.query(
        `SELECT application_name, client_addr, state, sync_state,
                pg_size_pretty(sent_lsn - replay_lsn) AS replay_lag
         FROM pg_stat_replication`
      );
      if (replResult.rows.length === 0) {
        console.log('  No standbys connected (postgres-replica may not be running).');
      } else {
        replResult.rows.forEach(r => {
          console.log(`  Standby: ${r.application_name} | ${r.client_addr} | ${r.state} | lag: ${r.replay_lag}`);
        });
        console.log('  OK: Replication stream active');
      }
    }

    await client.end();

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n' + line('═'));
    console.log('  RESULT: ' + (node.in_recovery ? 'PARTIAL — router connected but pointing to standby' : 'PASS — router connected to writable primary'));
    console.log('');
    console.log('  Connection string for backends:');
    console.log('    postgresql://oep_user:oep_password@postgres-router:5432/oep_oficial  (Docker)');
    console.log('    postgresql://oep_user:oep_password@localhost:5434/oep_oficial        (host)');
    console.log('');
    console.log('  HAProxy stats: http://localhost:8404/stats');
    console.log(line('═'));
    process.exit(node.in_recovery ? 1 : 0);

  } catch (err) {
    try { await client.end(); } catch (_) {}

    console.error('');
    console.error(line('═'));
    console.error('  FAIL: ' + err.message);
    console.error('');
    console.error('  Troubleshooting:');
    console.error('    docker compose ps postgres-router');
    console.error('    docker logs postgres-router');
    console.error('    http://localhost:8404/stats');
    console.error('');
    console.error('  Start postgres-router:');
    console.error('    docker compose up -d postgres-router');
    console.error(line('═'));
    process.exit(1);
  }
}

run();
