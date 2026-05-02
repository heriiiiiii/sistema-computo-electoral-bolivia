const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

const PORT = parseIntEnv('PORT', 3000);
const DEFAULT_SAVE_DIR = path.join(os.homedir(), 'Desktop', 'ACTAS_COACH');
const SAVE_DIR = path.resolve(process.env.SAVE_DIR || process.env.ACTAS_SAVE_DIR || DEFAULT_SAVE_DIR);
const SMS_JSON = path.resolve(process.env.SMS_JSON_PATH || path.join(__dirname, 'sms.json'));
const AUTH_FILE = path.resolve(process.env.AUTHORIZED_NUMBERS_FILE || path.join(__dirname, 'authorized_numbers.json'));
const PENDING_PDF_JSON = path.resolve(path.join(__dirname, 'pending_rrv_uploads.json'));
const PENDING_SMS_JSON = path.resolve(path.join(__dirname, 'pending_rrv_sms.json'));

const RRV_BASE_URL = (process.env.RRV_BASE_URL || 'http://localhost:4001').replace(/\/+$/, '');
const RRV_PDF_ENDPOINT = process.env.RRV_PDF_ENDPOINT || '/api/rrv/actas/auto';
const RRV_SMS_ENDPOINT = process.env.RRV_SMS_ENDPOINT || '/api/rrv/sms';
const RRV_FORWARD_ENABLED = parseBoolEnv('RRV_FORWARD_ENABLED', true);
const RRV_FORWARD_TIMEOUT_MS = parseIntEnv('RRV_FORWARD_TIMEOUT_MS', 30000);

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureParentDir(filePath) {
  ensureDirectory(path.dirname(filePath));
}

ensureDirectory(SAVE_DIR);
ensureParentDir(SMS_JSON);
ensureParentDir(PENDING_PDF_JSON);
ensureParentDir(PENDING_SMS_JSON);

function normalizeNumber(num) {
  let n = String(num || '').replace(/\s+/g, '');
  if (!n) return '';
  if (n.startsWith('+')) return n;
  if (n.startsWith('591')) return `+${n}`;
  if (n.startsWith('0')) n = n.substring(1);
  return `+591${n}`;
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`No se pudo leer ${path.basename(filePath)}: ${error.message}`);
    return [];
  }
}

function writeJsonArray(filePath, data) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

let authorizedNumbers = [];
try {
  authorizedNumbers = readJsonArray(AUTH_FILE)
    .map(normalizeNumber)
    .filter(Boolean);
  console.log(`Numeros autorizados cargados: ${authorizedNumbers.length}`);
} catch (error) {
  console.warn(`No se pudo cargar authorized_numbers.json: ${error.message}`);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SAVE_DIR),
  filename: (req, file, cb) => {
    const ts = new Date()
      .toISOString()
      .replace('T', '_')
      .replace(/:/g, '-')
      .substring(0, 19);
    cb(null, `acta_${ts}.pdf`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function buildUrl(baseUrl, endpoint) {
  return new URL(endpoint, `${baseUrl}/`).toString();
}

function newQueueId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function serializeError(error) {
  if (!error) return null;
  if (typeof error === 'string') return error;
  return error.message || String(error);
}

function pendingCount(filePath) {
  return readJsonArray(filePath).filter((item) => (item.status || 'PENDING') === 'PENDING').length;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: text };
  }
}

function summarizeRrvActa(data) {
  return {
    success: data.success === true,
    actaId: data.actaId,
    codigoMesa: data.codigoMesa,
    estado: data.estado,
    requiereRevisionManual: data.requiereRevisionManual === true,
  };
}

function summarizeRrvSms(data) {
  return {
    success: data.success === true,
    smsId: data.smsId,
    estadoSms: data.estadoSms || data.estado,
  };
}

async function forwardPdfToRrv(localFilePath, originalName) {
  if (!RRV_FORWARD_ENABLED) {
    return { status: 'DISABLED', forwarded: false, rrv: null };
  }

  if (!fs.existsSync(localFilePath)) {
    throw new Error(`PDF local no encontrado: ${localFilePath}`);
  }

  const form = new FormData();
  const fileBuffer = fs.readFileSync(localFilePath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });

  form.append('archivo', blob, originalName || path.basename(localFilePath));
  form.append('sourceTipo', 'APP_MOVIL');
  form.append('fuente', 'APP_MOVIL');
  form.append('canal', 'APP_MOVIL_PDF');
  form.append('moduloOrigen', '05-app-movil-sms');
  form.append(
    'descripcion',
    'Acta recibida desde app movil y reenviada al flujo rapido RRV.'
  );

  const url = buildUrl(RRV_BASE_URL, RRV_PDF_ENDPOINT);
  const response = await fetchWithTimeout(
    url,
    { method: 'POST', body: form },
    RRV_FORWARD_TIMEOUT_MS
  );
  const data = await readResponseBody(response);

  if (!response.ok || data.success === false) {
    const detail = data.message || data.codigoError || data.raw || response.statusText;
    throw new Error(`RRV PDF HTTP ${response.status}: ${detail}`);
  }

  return { status: 'SENT', forwarded: true, rrv: data };
}

async function forwardSmsToRrv(payload) {
  if (!RRV_FORWARD_ENABLED) {
    return { status: 'DISABLED', forwarded: false, rrv: null };
  }

  const url = buildUrl(RRV_BASE_URL, RRV_SMS_ENDPOINT);
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    RRV_FORWARD_TIMEOUT_MS
  );
  const data = await readResponseBody(response);

  if (response.ok && data.success !== false) {
    return { status: 'SENT', forwarded: true, rrv: data };
  }

  if (response.status >= 400 && response.status < 500) {
    return {
      status: 'REJECTED',
      forwarded: true,
      rrv: data,
      httpStatus: response.status,
    };
  }

  const detail = data.message || data.codigoError || data.raw || response.statusText;
  throw new Error(`RRV SMS HTTP ${response.status}: ${detail}`);
}

function enqueuePdf(file, error) {
  const queue = readJsonArray(PENDING_PDF_JSON);
  const item = {
    id: newQueueId('PDF'),
    type: 'PDF',
    localFilePath: file.path,
    originalName: file.originalname || file.filename,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: serializeError(error),
    status: 'PENDING',
  };

  queue.push(item);
  writeJsonArray(PENDING_PDF_JSON, queue);
  return item;
}

function enqueueSms(payload, error) {
  const queue = readJsonArray(PENDING_SMS_JSON);
  const item = {
    id: newQueueId('SMS'),
    type: 'SMS',
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: serializeError(error),
    status: 'PENDING',
  };

  queue.push(item);
  writeJsonArray(PENDING_SMS_JSON, queue);
  return item;
}

function parseSmsBody(bodyText) {
  const parts = String(bodyText || '').trim().split(';');
  const fields = {};

  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    fields[part.substring(0, idx).trim().toUpperCase()] = part.substring(idx + 1).trim();
  }

  const required = ['MESA', 'RECINTO', 'P1', 'P2', 'P3', 'P4', 'BLANCOS', 'NULOS'];
  for (const key of required) {
    if (!fields[key] && fields[key] !== '0') {
      return { ok: false, error: `Campo faltante: ${key}` };
    }
  }

  const numericMap = {
    p1: 'P1',
    p2: 'P2',
    p3: 'P3',
    p4: 'P4',
    blancos: 'BLANCOS',
    nulos: 'NULOS',
  };

  const data = {
    mesa: fields.MESA,
    recinto: fields.RECINTO,
    token: fields.TOKEN,
  };

  for (const [target, source] of Object.entries(numericMap)) {
    const value = fields[source];
    if (!/^\d+$/.test(value)) {
      return { ok: false, error: `${source} debe ser entero >= 0` };
    }
    data[target] = Number.parseInt(value, 10);
  }

  return { ok: true, data, fields };
}

function validateFields(data) {
  const numeros = ['p1', 'p2', 'p3', 'p4', 'blancos', 'nulos'];

  for (const campo of numeros) {
    if (!Number.isInteger(data[campo]) || data[campo] < 0) {
      return { ok: false, error: `${campo.toUpperCase()} debe ser entero >= 0` };
    }

    if (data[campo] > 5000) {
      return { ok: false, error: `${campo.toUpperCase()} supera el maximo permitido (5000)` };
    }
  }

  return { ok: true };
}

function guardarEnJson(registro) {
  const lista = readJsonArray(SMS_JSON);
  lista.push(registro);
  writeJsonArray(SMS_JSON, lista);
}

function buildRrvSmsPayload(registro) {
  const contenidoOriginal = registro.body;

  return {
    fuente: 'APP_MOVIL_SMS',
    canal: 'SMS_APP_MOVIL',
    moduloOrigen: '05-app-movil-sms',
    smsId: registro.id,
    numeroOrigen: registro.from,
    telefonoRemitente: registro.from,
    contenidoOriginal,
    mensaje: contenidoOriginal,
    fechaRecepcion: registro.receivedAt,
    timestampMovil: registro.timestampMovil,
    autorizadoServidorPc: true,
    datos: {
      codigoMesa: registro.mesa,
      codigoRecinto: registro.recinto,
      votos: {
        P1: registro.p1,
        P2: registro.p2,
        P3: registro.p3,
        P4: registro.p4,
        BLANCOS: registro.blancos,
        NULOS: registro.nulos,
      },
    },
  };
}

async function retryPendingPdfs() {
  const queue = readJsonArray(PENDING_PDF_JSON);
  const pendingBefore = queue.filter((item) => (item.status || 'PENDING') === 'PENDING').length;
  let sent = 0;
  let failed = 0;

  for (const item of queue) {
    if ((item.status || 'PENDING') !== 'PENDING') continue;

    item.attempts = Number(item.attempts || 0) + 1;
    item.lastAttemptAt = new Date().toISOString();

    try {
      const result = await forwardPdfToRrv(item.localFilePath, item.originalName);
      if (result.status === 'SENT') {
        item.status = 'SENT';
        item.lastError = null;
        item.rrv = summarizeRrvActa(result.rrv || {});
        sent++;
      } else {
        item.lastError = 'RRV forwarding disabled';
        failed++;
      }
    } catch (error) {
      item.lastError = serializeError(error);
      failed++;
    }
  }

  writeJsonArray(PENDING_PDF_JSON, queue);
  return { pendingBefore, sent, failed };
}

async function retryPendingSms() {
  const queue = readJsonArray(PENDING_SMS_JSON);
  const pendingBefore = queue.filter((item) => (item.status || 'PENDING') === 'PENDING').length;
  let sent = 0;
  let failed = 0;

  for (const item of queue) {
    if ((item.status || 'PENDING') !== 'PENDING') continue;

    item.attempts = Number(item.attempts || 0) + 1;
    item.lastAttemptAt = new Date().toISOString();

    try {
      const result = await forwardSmsToRrv(item.payload);
      if (result.status === 'SENT') {
        item.status = 'SENT';
        item.lastError = null;
        item.rrv = summarizeRrvSms(result.rrv || {});
        sent++;
      } else if (result.status === 'REJECTED') {
        item.status = 'FAILED';
        item.lastError = `RRV rejected SMS with HTTP ${result.httpStatus}`;
        item.rrv = summarizeRrvSms(result.rrv || {});
        failed++;
      } else {
        item.lastError = 'RRV forwarding disabled';
        failed++;
      }
    } catch (error) {
      item.lastError = serializeError(error);
      failed++;
    }
  }

  writeJsonArray(PENDING_SMS_JSON, queue);
  return { pendingBefore, sent, failed };
}

async function checkRrvReachable() {
  if (!RRV_FORWARD_ENABLED) return false;

  try {
    const response = await fetchWithTimeout(
      buildUrl(RRV_BASE_URL, '/api/rrv/health'),
      { method: 'GET' },
      Math.min(RRV_FORWARD_TIMEOUT_MS, 1500)
    );
    return response.ok;
  } catch (_) {
    return false;
  }
}

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Sin archivo' });

  const hora = new Date().toLocaleTimeString('es-BO');
  console.log(
    `[${hora}] PDF recibido: ${req.file.filename} (${(req.file.size / 1024).toFixed(1)} KB)`
  );

  const responsePayload = {
    ok: true,
    success: true,
    archivo: req.file.filename,
    savedLocal: true,
  };

  if (!RRV_FORWARD_ENABLED) {
    return res.json({
      ...responsePayload,
      forwardedToRrv: false,
      rrvSyncStatus: 'DISABLED',
    });
  }

  try {
    const forwarded = await forwardPdfToRrv(req.file.path, req.file.originalname || req.file.filename);

    return res.json({
      ...responsePayload,
      forwardedToRrv: true,
      rrvSyncStatus: 'SENT',
      rrv: summarizeRrvActa(forwarded.rrv || {}),
    });
  } catch (error) {
    const pending = enqueuePdf(req.file, error);
    console.warn(`[${hora}] PDF pendiente de sincronizacion RRV: ${serializeError(error)}`);

    return res.json({
      ...responsePayload,
      forwardedToRrv: false,
      rrvSyncStatus: 'PENDING',
      pendingId: pending.id,
      warning: 'PDF saved locally but RRV forwarding is pending',
    });
  }
});

app.post('/sms/incoming', async (req, res) => {
  const from = req.body.from || req.body.From || req.body.numeroOrigen || req.body.telefonoRemitente || '';
  const body = req.body.body || req.body.Body || req.body.message || req.body.Message || req.body.mensaje || '';
  const hora = new Date().toLocaleTimeString('es-BO');

  const fromNorm = normalizeNumber(from);
  if (!authorizedNumbers.includes(fromNorm)) {
    console.log(`[${hora}] SMS rechazado - numero no autorizado: ${from}`);
    return res.status(200).json({ ok: false, error: 'Numero no autorizado' });
  }

  const parsed = parseSmsBody(body);
  if (!parsed.ok) {
    console.log(`[${hora}] SMS rechazado - formato invalido: ${parsed.error}`);
    return res.status(200).json({ ok: false, error: parsed.error });
  }

  const validation = validateFields(parsed.data);
  if (!validation.ok) {
    console.log(`[${hora}] SMS rechazado - incoherencia: ${validation.error}`);
    return res.status(200).json({ ok: false, error: validation.error });
  }

  const now = new Date().toISOString();
  const registro = {
    id: newQueueId('SMS-PC'),
    from: fromNorm,
    recivedAt: now,
    receivedAt: now,
    timestampMovil: req.body.timestampMovil || now,
    body,
    mesa: parsed.data.mesa,
    recinto: parsed.data.recinto,
    p1: parsed.data.p1,
    p2: parsed.data.p2,
    p3: parsed.data.p3,
    p4: parsed.data.p4,
    blancos: parsed.data.blancos,
    nulos: parsed.data.nulos,
  };

  guardarEnJson(registro);

  console.log(`[${hora}] SMS registrado: Mesa=${parsed.data.mesa} Recinto=${parsed.data.recinto} de ${fromNorm}`);

  const payload = buildRrvSmsPayload(registro);
  const baseResponse = {
    ok: true,
    success: true,
    savedLocal: true,
    mesa: parsed.data.mesa,
    smsId: registro.id,
  };

  if (!RRV_FORWARD_ENABLED) {
    return res.status(200).json({
      ...baseResponse,
      rrvSyncStatus: 'DISABLED',
      forwardedToRrv: false,
    });
  }

  try {
    const forwarded = await forwardSmsToRrv(payload);

    if (forwarded.status === 'REJECTED') {
      return res.status(200).json({
        ...baseResponse,
        rrvSyncStatus: 'REJECTED',
        forwardedToRrv: true,
        warning: 'RRV rechazo el registro SMS',
        rrv: summarizeRrvSms(forwarded.rrv || {}),
      });
    }

    return res.status(200).json({
      ...baseResponse,
      rrvSyncStatus: 'SENT',
      forwardedToRrv: true,
      rrv: summarizeRrvSms(forwarded.rrv || {}),
    });
  } catch (error) {
    const pending = enqueueSms(payload, error);
    console.warn(`[${hora}] SMS pendiente de sincronizacion RRV: ${serializeError(error)}`);

    return res.status(200).json({
      ...baseResponse,
      rrvSyncStatus: 'PENDING',
      forwardedToRrv: false,
      pendingId: pending.id,
      warning: 'SMS registered locally but RRV sync is pending',
    });
  }
});

app.post('/api/rrv/sms', async (req, res) => {
  const hora = new Date().toLocaleTimeString('es-BO');
  const payload = {
    ...(req.body || {}),
    fuente: req.body?.fuente || 'SMS_FORWARDER',
    canal: req.body?.canal || 'RRV_SMS',
    moduloOrigen: req.body?.moduloOrigen || '05-app-movil-sms/servidor-pc',
  };

  console.log(`[${hora}] SMS recibido por alias /api/rrv/sms; reenviando a RRV`);

  if (!RRV_FORWARD_ENABLED) {
    return res.status(503).json({
      success: false,
      message: 'Could not save SMS',
      error: 'RRV forwarding disabled in servidor-pc',
    });
  }

  try {
    const forwarded = await forwardSmsToRrv(payload);

    if (forwarded.status === 'SENT') {
      return res.status(200).json(forwarded.rrv);
    }

    return res.status(502).json({
      success: false,
      message: 'Could not save SMS',
      error: `RRV rejected SMS with HTTP ${forwarded.httpStatus || 'unknown'}`,
      rrv: forwarded.rrv || null,
    });
  } catch (error) {
    const pending = enqueueSms(payload, error);
    console.warn(`[${hora}] SMS alias pendiente de sincronizacion RRV: ${serializeError(error)}`);

    return res.status(502).json({
      success: false,
      message: 'Could not save SMS',
      error: serializeError(error),
      pendingId: pending.id,
    });
  }
});

app.get('/sms/data', (req, res) => {
  try {
    const lista = readJsonArray(SMS_JSON);
    res.json({ ok: true, total: lista.length, data: lista });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/sync/status', (req, res) => {
  res.json({
    ok: true,
    pending: {
      pdfs: pendingCount(PENDING_PDF_JSON),
      sms: pendingCount(PENDING_SMS_JSON),
    },
  });
});

app.post('/sync/pending', async (req, res) => {
  const pdfs = await retryPendingPdfs();
  const sms = await retryPendingSms();

  res.json({
    ok: true,
    pdfsPendingBefore: pdfs.pendingBefore,
    pdfsSent: pdfs.sent,
    pdfsFailed: pdfs.failed,
    smsPendingBefore: sms.pendingBefore,
    smsSent: sms.sent,
    smsFailed: sms.failed,
  });
});

app.get('/health', async (req, res) => {
  const reachable = await checkRrvReachable();

  res.json({
    ok: true,
    directorio: SAVE_DIR,
    saveDir: SAVE_DIR,
    smsJson: SMS_JSON,
    timestamp: new Date().toISOString(),
    rrv: {
      baseUrl: RRV_BASE_URL,
      forwardEnabled: RRV_FORWARD_ENABLED,
      reachable,
    },
    pending: {
      pdfs: pendingCount(PENDING_PDF_JSON),
      sms: pendingCount(PENDING_SMS_JSON),
    },
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('=========================================');
  console.log('  Servidor ACTAS_COACH iniciado');
  console.log('=========================================');
  console.log(`  Puerto       : ${PORT}`);
  console.log(`  PDFs         : ${SAVE_DIR}`);
  console.log(`  SMS JSON     : ${SMS_JSON}`);
  console.log(`  Nums auth    : ${authorizedNumbers.length}`);
  console.log(`  RRV base URL : ${RRV_BASE_URL}`);
  console.log(`  RRV forward  : ${RRV_FORWARD_ENABLED ? 'enabled' : 'disabled'}`);
  console.log(`  Pending PDFs : ${pendingCount(PENDING_PDF_JSON)}`);
  console.log(`  Pending SMS  : ${pendingCount(PENDING_SMS_JSON)}`);
  console.log('=========================================');
  console.log('  POST /upload        <- PDFs');
  console.log('  POST /sms/incoming  <- datos SMS');
  console.log('  POST /api/rrv/sms   <- webhook SMS Forwarder hacia Mongo RRV');
  console.log('  GET  /sms/data      <- ver registros');
  console.log('  GET  /sync/status   <- pendientes RRV');
  console.log('  POST /sync/pending  <- reenviar pendientes');
  console.log('  GET  /health        <- salud servidor');
  console.log('=========================================');
  console.log('');
});
