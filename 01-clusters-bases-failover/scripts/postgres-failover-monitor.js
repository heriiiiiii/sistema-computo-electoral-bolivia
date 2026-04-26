'use strict';

/**
 * postgres-failover-monitor.js
 * Automatic PostgreSQL Failover Monitor
 * Sistema Nacional de Cómputo Electoral Bolivia — Módulo 01
 *
 * Checks postgres-primary every CHECK_INTERVAL_MS milliseconds.
 * After FAILURE_THRESHOLD consecutive failures it promotes postgres-replica
 * via SELECT pg_promote(). Stays running in observation mode after promotion.
 *
 * State machine:
 *   MONITORING → (3 failures) → FAILOVER_PENDING → PROMOTING → PROMOTED
 *                                    ↑ recovery ↓
 *                                  MONITORING
 *
 * Run inside Docker (profile monitor):
 *   docker compose --profile monitor up -d postgres-failover-monitor
 *   docker logs -f postgres-failover-monitor
 *
 * Run from host:
 *   PG_REPLICA_PORT=5433 node postgres-failover-monitor.js
 */

const { Client } = require('pg');

const CONFIG = {
  primary: {
    host: process.env.PG_PRIMARY_HOST || 'localhost',
    port: parseInt(process.env.PG_PRIMARY_PORT || '5432'),
    user: process.env.PG_USER || 'oep_user',
    password: process.env.PG_PASSWORD || 'oep_password',
    database: process.env.PG_DB || 'oep_oficial',
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
  },
  replica: {
    host: process.env.PG_REPLICA_HOST || 'localhost',
    port: parseInt(process.env.PG_REPLICA_PORT || '5433'),
    user: process.env.PG_USER || 'oep_user',
    password: process.env.PG_PASSWORD || 'oep_password',
    database: process.env.PG_DB || 'oep_oficial',
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
  },
  checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || '5000'),
  failureThreshold: parseInt(process.env.FAILURE_THRESHOLD || '3'),
};

const STATES = {
  MONITORING: 'MONITORING',
  FAILOVER_PENDING: 'FAILOVER_PENDING',
  PROMOTING: 'PROMOTING',
  PROMOTED: 'PROMOTED',
};

let currentState = STATES.MONITORING;
let consecutiveFailures = 0;
let promotionTimestamp = null;
let checkCount = 0;

// ── Logging ───────────────────────────────────────────────────────────────────

function log(level, message, data) {
  const ts = new Date().toISOString();
  const tag = { INFO: 'INFO ', WARN: 'WARN ', ERROR: 'ERROR', CRIT: 'CRIT ' }[level] || 'INFO ';
  const suffix = data ? ' ' + JSON.stringify(data) : '';
  console.log(`${ts} [${tag}] [${currentState}] ${message}${suffix}`);
}

// ── Node check ────────────────────────────────────────────────────────────────

async function checkNode(config) {
  const client = new Client(config);
  try {
    await client.connect();
    const result = await client.query(
      'SELECT pg_is_in_recovery() AS in_recovery, version() AS pg_version'
    );
    await client.end();
    return {
      ok: true,
      inRecovery: result.rows[0].in_recovery,
      version: result.rows[0].pg_version.split(' ').slice(0, 2).join(' '),
    };
  } catch (err) {
    try { await client.end(); } catch (_) {}
    return { ok: false, error: err.message };
  }
}

// ── Promotion ─────────────────────────────────────────────────────────────────

async function promoteReplica() {
  const client = new Client(CONFIG.replica);
  try {
    await client.connect();
    log('CRIT', 'Calling SELECT pg_promote() on postgres-replica...');
    await client.query('SELECT pg_promote()');
    await client.end();

    // Give PostgreSQL a moment to remove standby.signal and become writable
    await new Promise(r => setTimeout(r, 2000));

    // Verify promotion succeeded
    const verify = await checkNode(CONFIG.replica);
    if (!verify.ok) {
      log('ERROR', 'Could not reconnect to replica after pg_promote() call');
      return false;
    }
    if (verify.inRecovery) {
      log('ERROR', 'pg_promote() was called but pg_is_in_recovery() is still true — promotion failed');
      return false;
    }
    return true;
  } catch (err) {
    try { await client.end(); } catch (_) {}
    log('ERROR', 'pg_promote() call threw an exception', { error: err.message });
    return false;
  }
}

// ── Main check loop ───────────────────────────────────────────────────────────

async function runCheck() {
  checkCount++;

  // ── Observation mode after promotion ──
  if (currentState === STATES.PROMOTED) {
    if (checkCount % 12 === 0) {
      // Log observation status roughly every minute (12 × 5s)
      const status = await checkNode(CONFIG.replica);
      if (status.ok) {
        log('INFO', 'Observation mode — new primary is UP and writable', {
          host: `${CONFIG.replica.host}:${CONFIG.replica.port}`,
          inRecovery: status.inRecovery,
          promotedAt: promotionTimestamp,
        });
      } else {
        log('WARN', 'Observation mode — new primary appears DOWN', { error: status.error });
      }
    }
    return;
  }

  // ── Check primary ──
  const primary = await checkNode(CONFIG.primary);

  if (primary.ok) {
    if (consecutiveFailures > 0) {
      log('INFO', 'postgres-primary recovered after failures', {
        failuresBeforeRecovery: consecutiveFailures,
      });
    }
    consecutiveFailures = 0;
    if (currentState === STATES.FAILOVER_PENDING) {
      currentState = STATES.MONITORING;
      log('INFO', 'Primary recovered — returning to MONITORING');
    }
    if (checkCount % 6 === 0) {
      // Heartbeat every ~30s
      log('INFO', 'postgres-primary is UP', {
        inRecovery: primary.inRecovery,
        host: `${CONFIG.primary.host}:${CONFIG.primary.port}`,
      });
    }
    return;
  }

  // ── Primary failed ──
  consecutiveFailures++;
  currentState = STATES.FAILOVER_PENDING;
  log('WARN', `postgres-primary unreachable (${consecutiveFailures}/${CONFIG.failureThreshold})`, {
    error: primary.error,
  });

  if (consecutiveFailures < CONFIG.failureThreshold) {
    return;
  }

  // ── Failure threshold reached — attempt failover ──
  log('CRIT', `Threshold reached after ${consecutiveFailures} consecutive failures. Checking replica...`);

  const replica = await checkNode(CONFIG.replica);
  if (!replica.ok) {
    log('ERROR', 'postgres-replica is ALSO unreachable — cannot promote automatically', {
      error: replica.error,
      action: 'Manual intervention required',
    });
    return;
  }

  if (!replica.inRecovery) {
    log('WARN', 'postgres-replica is already a PRIMARY (pg_is_in_recovery() = false). Entering observation mode.', {
      note: 'A previous failover already occurred. Re-promotion blocked.',
    });
    currentState = STATES.PROMOTED;
    promotionTimestamp = 'before-monitor-start';
    return;
  }

  // ── Promote ──
  currentState = STATES.PROMOTING;
  log('CRIT', 'Starting automatic promotion of postgres-replica to PRIMARY...');

  const promoted = await promoteReplica();

  if (promoted) {
    currentState = STATES.PROMOTED;
    promotionTimestamp = new Date().toISOString();
    consecutiveFailures = 0;
    log('CRIT', '═══════════════════════════════════════════════════');
    log('CRIT', '  AUTOMATIC FAILOVER COMPLETE');
    log('CRIT', `  New PRIMARY: ${CONFIG.replica.host}:${CONFIG.replica.port}`);
    log('CRIT', `  Promoted at: ${promotionTimestamp}`);
    log('CRIT', '  Next step: update application connection strings');
    log('CRIT', '  Run: bash scripts/postgres-rejoin-old-primary.sh');
    log('CRIT', '═══════════════════════════════════════════════════');
  } else {
    currentState = STATES.FAILOVER_PENDING;
    log('ERROR', 'Automatic promotion failed. Will retry on next check cycle.');
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function main() {
  log('INFO', 'PostgreSQL Failover Monitor starting', {
    primary: `${CONFIG.primary.host}:${CONFIG.primary.port}`,
    replica: `${CONFIG.replica.host}:${CONFIG.replica.port}`,
    checkIntervalMs: CONFIG.checkIntervalMs,
    failureThreshold: CONFIG.failureThreshold,
  });

  // Check if a previous failover already occurred before this monitor started
  const initialReplica = await checkNode(CONFIG.replica);
  if (initialReplica.ok && !initialReplica.inRecovery) {
    currentState = STATES.PROMOTED;
    promotionTimestamp = 'before-monitor-start';
    log('WARN', 'postgres-replica is already PRIMARY on startup. Entering observation mode without re-promoting.', {
      note: 'If this is unexpected, check logs and verify cluster state manually.',
    });
  } else {
    log('INFO', 'Initial state — monitoring postgres-primary every ' + CONFIG.checkIntervalMs + 'ms');
  }

  const tick = async () => {
    try {
      await runCheck();
    } catch (err) {
      log('ERROR', 'Unexpected error in monitor loop', { error: err.message });
    }
    setTimeout(tick, CONFIG.checkIntervalMs);
  };

  await tick();
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
