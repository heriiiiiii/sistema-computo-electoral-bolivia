'use strict';

/**
 * CSV Automation Script — Official Count Flow
 *
 * Load order (as defined in PLAN_OFICIAL.md):
 *   1. DistribucionTerritorial.csv  → POST /api/oficial/catalogos/territorio
 *   2. RecintosElectorales.csv      → POST /api/oficial/catalogos/recintos
 *   3. ActasImpresas.csv            → POST /api/oficial/catalogos/mesas
 *   4. Transcripciones.csv          → POST /api/oficial/actas/bulk
 *
 * Does NOT write to the database directly.
 * All data goes through the backend validation layer.
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4000/api';
const CSV_DIR = process.env.CSV_DIR || path.join(__dirname, '../cvs');
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '200');
const USUARIO = process.env.USUARIO_CARGA || 'automation';
const IP = process.env.IP_ORIGEN || '127.0.0.1';

// ── Helpers ────────────────────────────────────────────────────────────────────

function readCsv(filename) {
  const fullPath = path.join(CSV_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`CSV file not found: ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath);
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    encoding: 'latin1',
  });
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function post(endpoint, data) {
  const url = `${BASE_URL}/${endpoint}`;
  const res = await axios.post(url, data, { timeout: 120000 });
  return res.data;
}

async function waitForBackend(maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await axios.get(`${BASE_URL}/oficial/resumen`, { timeout: 3000 });
      return;
    } catch {
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Backend not reachable after waiting');
}

function n(v) {
  const parsed = Number(String(v || '').trim().replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}

function s(v) {
  return String(v || '').trim();
}

// ── Step 1: Territorio ─────────────────────────────────────────────────────────

async function loadTerritorio() {
  console.log('\n[1/4] Loading DistribucionTerritorial.csv...');
  const rows = readCsv('Recursos Practica 4 - DistribucionTerritorial.csv');
  console.log(`      ${rows.length} rows read`);

  const chunks = chunk(rows, CHUNK_SIZE);
  let totalInsertadas = 0;
  let totalErrores = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await post('oficial/catalogos/territorio', { rows: chunks[i] });
      if (res.success) {
        totalInsertadas += res.data.insertadas || 0;
        totalErrores += (res.data.errores || []).length;
        process.stdout.write(`      chunk ${i + 1}/${chunks.length}: ${res.data.insertadas} inserted\n`);
      } else {
        console.error(`      chunk ${i + 1} error:`, res.message);
      }
    } catch (e) {
      console.error(`      chunk ${i + 1} request failed:`, e.message);
      totalErrores += chunks[i].length;
    }
  }

  console.log(`   -> Territorio: ${totalInsertadas} inserted, ${totalErrores} errors`);
}

// ── Step 2: Recintos ───────────────────────────────────────────────────────────

async function loadRecintos() {
  console.log('\n[2/4] Loading RecintosElectorales.csv...');
  const rows = readCsv('Recursos Practica 4 - RecintosElectorales.csv');
  console.log(`      ${rows.length} rows read`);

  const chunks = chunk(rows, CHUNK_SIZE);
  let totalInsertados = 0;
  let totalErrores = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await post('oficial/catalogos/recintos', { rows: chunks[i] });
      if (res.success) {
        totalInsertados += res.data.insertados || 0;
        totalErrores += (res.data.errores || []).length;
        process.stdout.write(`      chunk ${i + 1}/${chunks.length}: ${res.data.insertados} inserted\n`);
      } else {
        console.error(`      chunk ${i + 1} error:`, res.message);
      }
    } catch (e) {
      console.error(`      chunk ${i + 1} request failed:`, e.message);
      totalErrores += chunks[i].length;
    }
  }

  console.log(`   -> Recintos: ${totalInsertados} inserted, ${totalErrores} errors`);
}

// ── Step 3: Mesas ──────────────────────────────────────────────────────────────

async function loadMesas() {
  console.log('\n[3/4] Loading ActasImpresas.csv (mesas)...');
  const rows = readCsv('Recursos Practica 4 - ActasImpresas.csv');
  console.log(`      ${rows.length} rows read`);

  const chunks = chunk(rows, CHUNK_SIZE);
  let totalInsertadas = 0;
  let totalErrores = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await post('oficial/catalogos/mesas', { rows: chunks[i] });
      if (res.success) {
        totalInsertadas += res.data.insertadas || 0;
        totalErrores += (res.data.errores || []).length;
        process.stdout.write(`      chunk ${i + 1}/${chunks.length}: ${res.data.insertadas} inserted\n`);
      } else {
        console.error(`      chunk ${i + 1} error:`, res.message);
      }
    } catch (e) {
      console.error(`      chunk ${i + 1} request failed:`, e.message);
      totalErrores += chunks[i].length;
    }
  }

  console.log(`   -> Mesas: ${totalInsertadas} inserted, ${totalErrores} errors`);
}

// ── Step 4: Transcripciones (actas oficiales) ──────────────────────────────────

async function loadTranscripciones() {
  console.log('\n[4/4] Loading Transcripciones.csv (actas oficiales)...');
  const rawRows = readCsv('Recursos Practica 4 - Transcripciones.csv');
  console.log(`      ${rawRows.length} rows read`);

  // Normalize each row to the bulk actas payload format
  const normalizedRows = rawRows.map(r => ({
    codigoRecinto: s(r.CodigoRecinto),
    nroMesa: n(r.NroMesa),
    codigoActaCsv: s(r.CodigoActa),
    votantesHabilitados: n(r.VotantesHabilitados),
    papeletasAnfora: n(r.PapeletasAnfora),
    // CSV header has typo "PapeltasNoUtilizadas"
    papeletasNoUtilizadas: n(r.PapeltasNoUtilizadas || r.PapeletasNoUtilizadas),
    p1: n(r.P1), p2: n(r.P2), p3: n(r.P3), p4: n(r.P4),
    votosValidos: n(r.VotosValidos),
    votosBlancos: n(r.VotosBlancos),
    votosNulos: n(r.VotosNulos),
    observaciones: s(r.Observaciones),
    aperturaHora: n(r.AperturaHora), aperturaMinutos: n(r.AperturaMinutos),
    cierreHora: n(r.CierreHora), cierreMinutos: n(r.CierreMinutos),
  })).filter(r => r.codigoRecinto && r.nroMesa > 0);

  console.log(`      ${normalizedRows.length} valid rows after filter`);

  const chunks = chunk(normalizedRows, CHUNK_SIZE);
  let totalValidadas = 0;
  let totalObservadas = 0;
  let totalErrores = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await post('oficial/actas/bulk', {
        rows: chunks[i],
        franja: 'PRESIDENTE',
        usuarioCarga: USUARIO,
        ipOrigen: IP,
      });
      if (res.success) {
        totalValidadas += res.data.validadas || 0;
        totalObservadas += res.data.observadas || 0;
        totalErrores += res.data.erroresCriticos || 0;
        process.stdout.write(
          `      chunk ${i + 1}/${chunks.length}: ${res.data.validadas} ok, ` +
          `${res.data.observadas} observed, ${res.data.erroresCriticos} failed\n`
        );
      } else {
        console.error(`      chunk ${i + 1} error:`, res.message);
        totalErrores += chunks[i].length;
      }
    } catch (e) {
      console.error(`      chunk ${i + 1} request failed:`, e.message);
      totalErrores += chunks[i].length;
    }
  }

  console.log(`   -> Actas: ${totalValidadas} validated, ${totalObservadas} observed, ${totalErrores} critical errors`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log(' Official Count CSV Automation');
  console.log(`  Backend : ${BASE_URL}`);
  console.log(`  CSV dir : ${CSV_DIR}`);
  console.log(`  Chunk   : ${CHUNK_SIZE} rows`);
  console.log('='.repeat(60));

  console.log('\nWaiting for backend to be ready...');
  try {
    await waitForBackend(90000);
    console.log(' Backend is up.');
  } catch (e) {
    console.error('Backend not available:', e.message);
    process.exit(1);
  }

  const t0 = Date.now();
  try {
    await loadTerritorio();
    await loadRecintos();
    await loadMesas();
    await loadTranscripciones();
  } catch (e) {
    console.error('\nFatal error:', e.message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(` Done in ${elapsed}s`);
  console.log(`  Verify: GET ${BASE_URL}/oficial/resumen`);
  console.log('='.repeat(60));
}

main();
