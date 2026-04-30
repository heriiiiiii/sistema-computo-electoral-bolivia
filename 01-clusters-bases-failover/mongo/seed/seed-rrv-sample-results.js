// =============================================================================
//  seed-rrv-sample-results.js
//  RRV Preliminary Results, SMS, Events and Logs
//  Sistema Nacional de Cómputo Electoral Bolivia
//
//  Creates:
//    - 5 rrv_sms records (2 valid, 1 suspicious, 1 invalid, 1 duplicate)
//    - 4 rrv_resultados_preliminares (OCR + SMS sources)
//    - 8 rrv_eventos
//    - 6 rrv_logs
//
//  Run via:
//    mongosh "mongodb://localhost:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-results.js
//
//  IDEMPOTENT: upserts on unique IDs.
// =============================================================================

print("=================================================");
print(" OEP — Seeding SMS, Resultados, Eventos, Logs");
print("=================================================");

use("oep_rrv");

const now = new Date();

// ─────────────────────────────────────────────────────────────────────────────
//  SMS Records
// ─────────────────────────────────────────────────────────────────────────────

print("\n[INFO] Inserting rrv_sms records...");

const smsRecords = [

  // SMS 1: VALIDO — authorized number, correct format, consistent votes
  {
    smsId: "SMS-001",
    codigoMesa: "10101001001",
    codigoRecinto: "10101001",
    numeroOrigen: "+59172100001",
    contenidoOriginal: "MESA:10101001001;RECINTO:10101001;P1:143;P2:87;P3:31;P4:10;BLANCOS:7;NULOS:3",
    datosInterpretados: {
      votosPartidos: [
        { partidoCodigo: "P1", cantidadVotos: 143 },
        { partidoCodigo: "P2", cantidadVotos: 87 },
        { partidoCodigo: "P3", cantidadVotos: 31 },
        { partidoCodigo: "P4", cantidadVotos: 10 },
      ],
      // 143+87+31+10 = 271 ✓ (close to OCR 275, minor difference to be flagged)
      votosValidos: 271,
      votosBlancos: 7,
      votosNulos: 3,
      totalVotos: 281, // 271+7+3
    },
    seguridad: {
      numeroAutorizado: true,
      formatoValido: true,
      numeroAsociadoMesa: true,
      numeroAsociadoRecinto: true,
    },
    source: {
      tipo: "SMS",
      canal: "RRV_SMS",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/sms",
      descripcion: "Datos recibidos desde modulo SMS o simulacion SMS",
      generadoPor: null,
      fechaRegistro: null,
    },
    estado: "VALIDO",
    errores: [],
    fechaRecepcion: new Date("2025-10-19T18:40:00Z"),
    procesadoEnFlujoRRV: true,
    resultadoPreliminarId: "RESULT-SMS-001",
    createdAt: new Date("2025-10-19T18:40:00Z"),
    updatedAt: new Date("2025-10-19T18:41:00Z"),
  },

  // SMS 2: VALIDO — authorized number, different mesa
  {
    smsId: "SMS-002",
    codigoMesa: "10101001002",
    codigoRecinto: "10101001",
    numeroOrigen: "+59172100002",
    contenidoOriginal: "MESA:10101001002;RECINTO:10101001;P1:378;P2:238;P3:84;P4:21;BLANCOS:8;NULOS:5",
    datosInterpretados: {
      votosPartidos: [
        { partidoCodigo: "P1", cantidadVotos: 378 },
        { partidoCodigo: "P2", cantidadVotos: 238 },
        { partidoCodigo: "P3", cantidadVotos: 84 },
        { partidoCodigo: "P4", cantidadVotos: 21 },
      ],
      // 378+238+84+21 = 721 ✓
      votosValidos: 721,
      votosBlancos: 8,
      votosNulos: 5,
      totalVotos: 734, // 721+8+5
    },
    seguridad: {
      numeroAutorizado: true,
      formatoValido: true,
      numeroAsociadoMesa: true,
      numeroAsociadoRecinto: true,
    },
    source: {
      tipo: "SMS",
      canal: "RRV_SMS",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/sms",
      descripcion: "Datos recibidos desde modulo SMS o simulacion SMS",
      generadoPor: null,
      fechaRegistro: null,
    },
    estado: "VALIDO",
    errores: [],
    fechaRecepcion: new Date("2025-10-19T19:15:00Z"),
    procesadoEnFlujoRRV: true,
    resultadoPreliminarId: "RESULT-SMS-002",
    createdAt: new Date("2025-10-19T19:15:00Z"),
    updatedAt: new Date("2025-10-19T19:16:00Z"),
  },

  // SMS 3: SOSPECHOSO — authorized number but vote sum inconsistency
  {
    smsId: "SMS-003",
    codigoMesa: "10101001003",
    codigoRecinto: "10101001",
    numeroOrigen: "+59172100003",
    contenidoOriginal: "MESA:10101001003;RECINTO:10101001;P1:120;P2:90;P3:30;P4:10;BLANCOS:5;NULOS:3",
    datosInterpretados: {
      votosPartidos: [
        { partidoCodigo: "P1", cantidadVotos: 120 },
        { partidoCodigo: "P2", cantidadVotos: 90 },
        { partidoCodigo: "P3", cantidadVotos: 30 },
        { partidoCodigo: "P4", cantidadVotos: 10 },
      ],
      // 120+90+30+10 = 250, but SMS also reports BLANCOS+NULOS+suma ≠ expected total from papeletas
      votosValidos: 250,
      votosBlancos: 5,
      votosNulos: 3,
      totalVotos: 258,
    },
    seguridad: {
      numeroAutorizado: true,
      formatoValido: true,
      numeroAsociadoMesa: true,
      numeroAsociadoRecinto: true,
    },
    source: {
      tipo: "SMS",
      canal: "RRV_SMS",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/sms",
      descripcion: "Datos recibidos desde modulo SMS o simulacion SMS",
      generadoPor: null,
      fechaRegistro: null,
    },
    // SMS result differs from OCR result for same mesa → inconsistency detected
    estado: "SOSPECHOSO",
    errores: ["INCONSISTENCIA_CON_OCR: SMS votosValidos=250, OCR votosValidos=255. Diferencia: 5."],
    fechaRecepcion: new Date("2025-10-19T19:00:00Z"),
    procesadoEnFlujoRRV: true,
    resultadoPreliminarId: "RESULT-SMS-003",
    createdAt: new Date("2025-10-19T19:00:00Z"),
    updatedAt: new Date("2025-10-19T19:01:30Z"),
  },

  // SMS 4: INVALIDO — unauthorized phone number (not in sms_numeros_autorizados)
  {
    smsId: "SMS-004",
    codigoMesa: "10101001001",
    codigoRecinto: "10101001",
    numeroOrigen: "+59171999999",
    contenidoOriginal: "MESA:10101001001;RECINTO:10101001;P1:200;P2:50;P3:10;P4:5;BLANCOS:2;NULOS:1",
    datosInterpretados: null,
    seguridad: {
      numeroAutorizado: false,
      formatoValido: true,
      numeroAsociadoMesa: false,
      numeroAsociadoRecinto: false,
    },
    source: {
      tipo: "SMS",
      canal: "RRV_SMS",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/sms",
      descripcion: "Datos recibidos desde modulo SMS o simulacion SMS",
      generadoPor: "+59171999999",
      fechaRegistro: null,
    },
    estado: "INVALIDO",
    errores: ["SMS_NUMERO_NO_AUTORIZADO: Número +59171999999 no está en la lista de números autorizados."],
    fechaRecepcion: new Date("2025-10-19T18:50:00Z"),
    procesadoEnFlujoRRV: false,
    resultadoPreliminarId: null,
    createdAt: new Date("2025-10-19T18:50:00Z"),
    updatedAt: new Date("2025-10-19T18:50:05Z"),
  },

  // SMS 5: DUPLICADO — second SMS from same authorized number for same mesa
  {
    smsId: "SMS-005",
    codigoMesa: "10101001001",
    codigoRecinto: "10101001",
    numeroOrigen: "+59172100001",
    contenidoOriginal: "MESA:10101001001;RECINTO:10101001;P1:145;P2:89;P3:32;P4:10;BLANCOS:6;NULOS:3",
    datosInterpretados: {
      votosPartidos: [
        { partidoCodigo: "P1", cantidadVotos: 145 },
        { partidoCodigo: "P2", cantidadVotos: 89 },
        { partidoCodigo: "P3", cantidadVotos: 32 },
        { partidoCodigo: "P4", cantidadVotos: 10 },
      ],
      votosValidos: 276,
      votosBlancos: 6,
      votosNulos: 3,
      totalVotos: 285,
    },
    seguridad: {
      numeroAutorizado: true,
      formatoValido: true,
      numeroAsociadoMesa: true,
      numeroAsociadoRecinto: true,
    },
    source: {
      tipo: "SMS",
      canal: "RRV_SMS",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/sms",
      descripcion: "Datos recibidos desde modulo SMS o simulacion SMS",
      generadoPor: null,
      fechaRegistro: null,
    },
    // This is the second SMS for mesa 10101001001 from the same authorized number.
    // System keeps both records for audit. Does NOT overwrite SMS-001.
    estado: "DUPLICADO",
    errores: ["DUPLICADO_SMS: Ya existe un resultado registrado para esta mesa (smsId: SMS-001). Ambos registros se conservan."],
    fechaRecepcion: new Date("2025-10-19T19:05:00Z"),
    procesadoEnFlujoRRV: false,
    resultadoPreliminarId: null,
    createdAt: new Date("2025-10-19T19:05:00Z"),
    updatedAt: new Date("2025-10-19T19:05:10Z"),
  },
];

let smsInserted = 0;
smsRecords.forEach(function (sms) {
  const r = db.rrv_sms.updateOne(
    { smsId: sms.smsId },
    { $set: { ...sms, updatedAt: now } },
    { upsert: true }
  );
  if (r.upsertedCount > 0) { smsInserted++; print("[INSERT] " + sms.smsId + " | " + sms.codigoMesa + " → " + sms.estado); }
  else print("[SKIP]   " + sms.smsId);
});
print("[DONE] SMS inserted: " + smsInserted);

// ─────────────────────────────────────────────────────────────────────────────
//  Preliminary Results
// ─────────────────────────────────────────────────────────────────────────────

print("\n[INFO] Inserting rrv_resultados_preliminares records...");

const resultados = [
  // From OCR — acta 001
  {
    resultadoId: "RESULT-OCR-001",
    codigoMesa: "10101001001",
    numeroMesa: 1,
    codigoRecinto: "10101001",
    codigoTerritorial: "10101",
    fuente: "OCR",
    franja: "PRESIDENTE",
    votosPartidos: [
      { partidoCodigo: "P1", partidoNombre: "Partido 1", cantidadVotos: 145 },
      { partidoCodigo: "P2", partidoNombre: "Partido 2", cantidadVotos: 88 },
      { partidoCodigo: "P3", partidoNombre: "Partido 3", cantidadVotos: 32 },
      { partidoCodigo: "P4", partidoNombre: "Partido 4", cantidadVotos: 10 },
    ],
    votosValidos: 275, votosBlancos: 7, votosNulos: 3, totalVotos: 285,
    estado: "PUBLICADO",
    actaId: "ACTA-RRV-001",
    smsId: null,
    validacion: {
      esValido: true, esSospechoso: false,
      errores: [],
    },
    fechaRegistro: new Date("2025-10-19T18:34:05Z"),
    createdAt: new Date("2025-10-19T18:34:05Z"),
    updatedAt: new Date("2025-10-19T18:35:00Z"),
  },
  // From SMS — mesa 001 (slight difference from OCR — comparison will flag this)
  {
    resultadoId: "RESULT-SMS-001",
    codigoMesa: "10101001001",
    numeroMesa: 1,
    codigoRecinto: "10101001",
    codigoTerritorial: "10101",
    fuente: "SMS",
    franja: "PRESIDENTE",
    votosPartidos: [
      { partidoCodigo: "P1", cantidadVotos: 143 },
      { partidoCodigo: "P2", cantidadVotos: 87 },
      { partidoCodigo: "P3", cantidadVotos: 31 },
      { partidoCodigo: "P4", cantidadVotos: 10 },
    ],
    // SMS result: 271, OCR result: 275 — minor difference, both kept for comparison
    votosValidos: 271, votosBlancos: 7, votosNulos: 3, totalVotos: 281,
    estado: "VALIDO",
    actaId: null,
    smsId: "SMS-001",
    validacion: {
      esValido: true, esSospechoso: false,
      errores: [],
    },
    fechaRegistro: new Date("2025-10-19T18:41:00Z"),
    createdAt: new Date("2025-10-19T18:41:00Z"),
    updatedAt: new Date("2025-10-19T18:41:30Z"),
  },
  // From OCR — acta 002 (valid)
  {
    resultadoId: "RESULT-OCR-002",
    codigoMesa: "10101001002",
    numeroMesa: 2,
    codigoRecinto: "10101001",
    codigoTerritorial: "10101",
    fuente: "OCR",
    franja: "PRESIDENTE",
    votosPartidos: [
      { partidoCodigo: "P1", cantidadVotos: 380 },
      { partidoCodigo: "P2", cantidadVotos: 240 },
      { partidoCodigo: "P3", cantidadVotos: 85 },
      { partidoCodigo: "P4", cantidadVotos: 22 },
    ],
    votosValidos: 727, votosBlancos: 9, votosNulos: 5, totalVotos: 741,
    estado: "VALIDO",
    actaId: "ACTA-RRV-002",
    smsId: null,
    validacion: { esValido: true, esSospechoso: false, errores: [] },
    fechaRegistro: new Date("2025-10-19T19:12:00Z"),
    createdAt: new Date("2025-10-19T19:12:00Z"),
    updatedAt: new Date("2025-10-19T19:13:00Z"),
  },
  // From OCR — acta 003 SOSPECHOSO (votosValidos extracted as 255 but sum = 250)
  {
    resultadoId: "RESULT-OCR-003",
    codigoMesa: "10101001003",
    numeroMesa: 3,
    codigoRecinto: "10101001",
    codigoTerritorial: "10101",
    fuente: "OCR",
    franja: "PRESIDENTE",
    votosPartidos: [
      { partidoCodigo: "P1", cantidadVotos: 120 },
      { partidoCodigo: "P2", cantidadVotos: 90 },
      { partidoCodigo: "P3", cantidadVotos: 30 },
      { partidoCodigo: "P4", cantidadVotos: 10 },
    ],
    // Original OCR value preserved — system must NOT correct
    votosValidos: 255,
    votosBlancos: 5,
    votosNulos: 3,
    totalVotos: 263,
    estado: "SOSPECHOSO",
    actaId: "ACTA-RRV-003",
    smsId: null,
    validacion: {
      esValido: false,
      esSospechoso: true,
      errores: [
        { codigo: "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS", descripcion: "Suma partidos=250 ≠ votosValidos=255", severidad: "ERROR" },
      ],
    },
    fechaRegistro: new Date("2025-10-19T18:57:15Z"),
    createdAt: new Date("2025-10-19T18:57:15Z"),
    updatedAt: new Date("2025-10-19T18:57:20Z"),
  },
];

let resultInserted = 0;
resultados.forEach(function (r) {
  const res = db.rrv_resultados_preliminares.updateOne(
    { resultadoId: r.resultadoId },
    { $set: { ...r, updatedAt: now } },
    { upsert: true }
  );
  if (res.upsertedCount > 0) { resultInserted++; print("[INSERT] " + r.resultadoId + " | " + r.fuente + " | " + r.estado); }
  else print("[SKIP]   " + r.resultadoId);
});
print("[DONE] Resultados inserted: " + resultInserted);

// ─────────────────────────────────────────────────────────────────────────────
//  Events (Event Sourcing)
// ─────────────────────────────────────────────────────────────────────────────

print("\n[INFO] Inserting rrv_eventos records...");

const eventos = [
  { eventId: "EVT-001", tipoEvento: "ACTA_RECIBIDA",      actaId: "ACTA-RRV-001", smsId: null, resultadoId: null, codigoMesa: "10101001001", codigoRecinto: "10101001", payload: { fuente: "APP_MOVIL", tamanioMb: 1.24 }, fechaEvento: new Date("2025-10-19T18:32:14Z"), origen: "RECEPCION", source: { tipo: "RECEPCION", canal: "RRV_EVENTO", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/actas", descripcion: "Acta recibida correctamente en el flujo rapido RRV", generadoPor: "USR-JM-001", fechaRegistro: new Date("2025-10-19T18:32:14Z") }, procesado: true, intentos: 1, createdAt: new Date("2025-10-19T18:32:14Z"), updatedAt: new Date("2025-10-19T18:32:14Z") },
  { eventId: "EVT-002", tipoEvento: "OCR_PROCESADO",       actaId: "ACTA-RRV-001", smsId: null, resultadoId: null, codigoMesa: "10101001001", codigoRecinto: "10101001", payload: { confianza: 0.94, errores: 0 }, fechaEvento: new Date("2025-10-19T18:34:02Z"), origen: "OCR", source: { tipo: "OCR", canal: "RRV_EVENTO", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/actas/{actaId}/procesar-ocr", descripcion: "OCR procesado para acta RRV", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T18:34:02Z") }, procesado: true, intentos: 1, createdAt: new Date("2025-10-19T18:34:02Z"), updatedAt: new Date("2025-10-19T18:34:02Z") },
  { eventId: "EVT-003", tipoEvento: "ACTA_VALIDADA",       actaId: "ACTA-RRV-001", smsId: null, resultadoId: "RESULT-OCR-001", codigoMesa: "10101001001", codigoRecinto: "10101001", payload: { estadoFinal: "PUBLICADA" }, fechaEvento: new Date("2025-10-19T18:34:05Z"), origen: "VALIDACION", source: { tipo: "VALIDACION", canal: "RRV_EVENTO", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/actas/{actaId}/validar", descripcion: "Acta validada con estado VALIDADA/PUBLICADA", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T18:34:05Z") }, procesado: true, intentos: 1, createdAt: new Date("2025-10-19T18:34:05Z"), updatedAt: new Date("2025-10-19T18:34:05Z") },
  { eventId: "EVT-004", tipoEvento: "SMS_RECIBIDO",        actaId: null, smsId: "SMS-001", resultadoId: null, codigoMesa: "10101001001", codigoRecinto: "10101001", payload: { numeroOrigen: "+59172100001" }, fechaEvento: new Date("2025-10-19T18:40:00Z"), origen: "SMS", source: { tipo: "SMS", canal: "RRV_EVENTO", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/sms", descripcion: "SMS recibido desde modulo SMS", generadoPor: "+59172100001", fechaRegistro: new Date("2025-10-19T18:40:00Z") }, procesado: true, intentos: 1, createdAt: new Date("2025-10-19T18:40:00Z"), updatedAt: new Date("2025-10-19T18:40:00Z") },
  { eventId: "EVT-005", tipoEvento: "SMS_RECHAZADO",       actaId: null, smsId: "SMS-004", resultadoId: null, codigoMesa: "10101001001", codigoRecinto: "10101001", payload: { motivo: "SMS_NUMERO_NO_AUTORIZADO", numeroOrigen: "+59171999999" }, fechaEvento: new Date("2025-10-19T18:50:00Z"), origen: "SMS", source: { tipo: "SMS", canal: "RRV_EVENTO", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/sms", descripcion: "SMS rechazado por numero no autorizado", generadoPor: "+59171999999", fechaRegistro: new Date("2025-10-19T18:50:00Z") }, procesado: true, intentos: 1, createdAt: new Date("2025-10-19T18:50:00Z"), updatedAt: new Date("2025-10-19T18:50:00Z") },
  { eventId: "EVT-006", tipoEvento: "ACTA_RECHAZADA",      actaId: "ACTA-RRV-004", smsId: null, resultadoId: null, codigoMesa: "10101001004", codigoRecinto: "10101001", payload: { motivo: "IMAGEN_ILEGIBLE" }, fechaEvento: new Date("2025-10-19T19:23:35Z"), origen: "VALIDACION", source: { tipo: "VALIDACION", canal: "RRV_EVENTO", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/actas/{actaId}/validar", descripcion: "Acta rechazada por imagen ilegible", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T19:23:35Z") }, procesado: true, intentos: 1, createdAt: new Date("2025-10-19T19:23:35Z"), updatedAt: new Date("2025-10-19T19:23:35Z") },
  { eventId: "EVT-007", tipoEvento: "INCONSISTENCIA_DETECTADA", actaId: "ACTA-RRV-003", smsId: "SMS-003", resultadoId: "RESULT-OCR-003", codigoMesa: "10101001003", codigoRecinto: "10101001", payload: { ocrValidos: 255, smsValidos: 250, diferencia: 5 }, fechaEvento: new Date("2025-10-19T19:01:30Z"), origen: "VALIDACION", source: { tipo: "VALIDACION", canal: "RRV_EVENTO", modulo: "02-flujo-rapido-rrv", endpoint: null, descripcion: "Inconsistencia detectada entre OCR y SMS para misma mesa", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T19:01:30Z") }, procesado: true, intentos: 1, createdAt: new Date("2025-10-19T19:01:30Z"), updatedAt: new Date("2025-10-19T19:01:30Z") },
  { eventId: "EVT-008", tipoEvento: "DUPLICADO_DETECTADO", actaId: null, smsId: "SMS-005", resultadoId: null, codigoMesa: "10101001001", codigoRecinto: "10101001", payload: { smsIdOriginal: "SMS-001", nuevoSmsId: "SMS-005" }, fechaEvento: new Date("2025-10-19T19:05:10Z"), origen: "VALIDACION", source: { tipo: "DUPLICADO", canal: "RRV_EVENTO", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/sms", descripcion: "SMS duplicado detectado para la misma mesa", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T19:05:10Z") }, procesado: true, intentos: 1, createdAt: new Date("2025-10-19T19:05:10Z"), updatedAt: new Date("2025-10-19T19:05:10Z") },
];

let evtInserted = 0;
eventos.forEach(function (e) {
  const r = db.rrv_eventos.updateOne(
    { eventId: e.eventId },
    { $set: { ...e, updatedAt: now } },
    { upsert: true }
  );
  if (r.upsertedCount > 0) { evtInserted++; print("[INSERT] " + e.eventId + " → " + e.tipoEvento); }
  else print("[SKIP]   " + e.eventId);
});
print("[DONE] Eventos inserted: " + evtInserted);

// ─────────────────────────────────────────────────────────────────────────────
//  Logs
// ─────────────────────────────────────────────────────────────────────────────

print("\n[INFO] Inserting rrv_logs records...");

const logs = [
  { logId: "LOG-001", actaId: "ACTA-RRV-001", smsId: null, codigoMesa: "10101001001", tipo: "SISTEMA", severidad: "INFO", mensaje: "Acta recibida y publicada exitosamente.", detalle: "fuente: APP_MOVIL | confianza OCR: 94%", modulo: "RECEPCION", fechaHora: new Date("2025-10-19T18:35:00Z"), datosReferencia: { actaId: "ACTA-RRV-001" }, source: { tipo: "SISTEMA", canal: "RRV_LOG", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/actas", descripcion: "Acta recibida y publicada exitosamente.", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T18:35:00Z") }, createdAt: new Date("2025-10-19T18:35:00Z") },
  { logId: "LOG-002", actaId: null, smsId: "SMS-004", codigoMesa: "10101001001", tipo: "SMS_NUMERO_NO_AUTORIZADO", severidad: "WARNING", mensaje: "SMS rechazado por número no autorizado.", detalle: "numeroOrigen: +59171999999 no está registrado en sms_numeros_autorizados.", modulo: "SMS", fechaHora: new Date("2025-10-19T18:50:05Z"), datosReferencia: { smsId: "SMS-004", numeroOrigen: "+59171999999" }, source: { tipo: "SMS", canal: "RRV_LOG", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/sms", descripcion: "SMS rechazado por numero no autorizado.", generadoPor: "+59171999999", fechaRegistro: new Date("2025-10-19T18:50:05Z") }, createdAt: new Date("2025-10-19T18:50:05Z") },
  { logId: "LOG-003", actaId: "ACTA-RRV-003", smsId: null, codigoMesa: "10101001003", tipo: "ERROR_OCR", severidad: "ERROR", mensaje: "Suma de votos por partido no coincide con votosValidos extraído por OCR.", detalle: "P1+P2+P3+P4=250, votosValidos=255. Diferencia=5. Acta marcada SOSPECHOSA.", modulo: "OCR", fechaHora: new Date("2025-10-19T18:57:20Z"), datosReferencia: { actaId: "ACTA-RRV-003", sumaPartidos: 250, votosValidosOCR: 255 }, source: { tipo: "OCR", canal: "RRV_LOG", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/actas/{actaId}/procesar-ocr", descripcion: "Suma de votos por partido no coincide con votosValidos extraido por OCR.", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T18:57:20Z") }, createdAt: new Date("2025-10-19T18:57:20Z") },
  { logId: "LOG-004", actaId: "ACTA-RRV-004", smsId: null, codigoMesa: "10101001004", tipo: "ERROR_IMAGEN", severidad: "CRITICAL", mensaje: "Imagen ilegible. No se puede procesar acta.", detalle: "Calidad de imagen: 22%. Todos los campos OCR vacíos. Acta RECHAZADA.", modulo: "OCR", fechaHora: new Date("2025-10-19T19:23:40Z"), datosReferencia: { actaId: "ACTA-RRV-004", calidad: 0.22 }, source: { tipo: "CALIDAD_VISUAL", canal: "RRV_LOG", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/actas/{actaId}/procesar-ocr", descripcion: "Imagen ilegible. No se puede procesar acta.", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T19:23:40Z") }, createdAt: new Date("2025-10-19T19:23:40Z") },
  { logId: "LOG-005", actaId: "ACTA-RRV-003", smsId: "SMS-003", codigoMesa: "10101001003", tipo: "INCONSISTENCIA", severidad: "ERROR", mensaje: "Inconsistencia entre OCR y SMS para mesa 10101001003.", detalle: "OCR votosValidos=255, SMS votosValidos=250. Diferencia de 5 votos. Se requiere revisión.", modulo: "VALIDACION", fechaHora: new Date("2025-10-19T19:01:30Z"), datosReferencia: { actaId: "ACTA-RRV-003", smsId: "SMS-003" }, source: { tipo: "VALIDACION", canal: "RRV_LOG", modulo: "02-flujo-rapido-rrv", endpoint: null, descripcion: "Inconsistencia entre OCR y SMS para misma mesa.", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T19:01:30Z") }, createdAt: new Date("2025-10-19T19:01:30Z") },
  { logId: "LOG-006", actaId: null, smsId: "SMS-005", codigoMesa: "10101001001", tipo: "DUPLICADO", severidad: "WARNING", mensaje: "Mensaje SMS duplicado detectado para mesa 10101001001.", detalle: "Ya existe SMS-001 para esta mesa del mismo número. Nuevo SMS guardado como DUPLICADO.", modulo: "VALIDACION", fechaHora: new Date("2025-10-19T19:05:10Z"), datosReferencia: { smsIdOriginal: "SMS-001", smsIdDuplicado: "SMS-005" }, source: { tipo: "DUPLICADO", canal: "RRV_LOG", modulo: "02-flujo-rapido-rrv", endpoint: "POST /api/rrv/sms", descripcion: "Mensaje SMS duplicado detectado para una mesa.", generadoPor: "sistema", fechaRegistro: new Date("2025-10-19T19:05:10Z") }, createdAt: new Date("2025-10-19T19:05:10Z") },
];

let logInserted = 0;
logs.forEach(function (l) {
  const r = db.rrv_logs.updateOne(
    { logId: l.logId },
    { $set: l },
    { upsert: true }
  );
  if (r.upsertedCount > 0) { logInserted++; print("[INSERT] " + l.logId + " | " + l.severidad + " | " + l.tipo); }
  else print("[SKIP]   " + l.logId);
});
print("[DONE] Logs inserted: " + logInserted);

// ─────────────────────────────────────────────────────────────────────────────
//  Summary
// ─────────────────────────────────────────────────────────────────────────────

print("\n=================================================");
print(" Seed complete. Collection counts:");
print("  rrv_sms                   : " + db.rrv_sms.countDocuments());
print("  rrv_resultados_preliminares: " + db.rrv_resultados_preliminares.countDocuments());
print("  rrv_eventos               : " + db.rrv_eventos.countDocuments());
print("  rrv_logs                  : " + db.rrv_logs.countDocuments());
print("=================================================");
