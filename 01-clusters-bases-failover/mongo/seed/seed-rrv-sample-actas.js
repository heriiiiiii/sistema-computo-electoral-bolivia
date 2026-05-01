// =============================================================================
//  seed-rrv-sample-actas.js
//  RRV Sample Actas — Sistema Nacional de Cómputo Electoral Bolivia
//
//  Creates 5 sample actas covering all relevant states and scenarios:
//    1. PUBLICADA  — valid acta, all data correct, from mobile app
//    2. VALIDADA   — valid acta, from web upload, awaiting publication
//    3. SOSPECHOSA — OCR error: P1+P2+P3+P4 ≠ votosValidos (preserved as-is)
//    4. RECHAZADA  — multiple validation errors, unreadable image
//    5. RECIBIDA   — newly received, not yet processed
//
//  Vote consistency rule enforced in validation:
//    votosValidos = P1 + P2 + P3 + P4
//    totalVotos   = votosValidos + votosBlancos + votosNulos
//
//  Run via:
//    mongosh "mongodb://localhost:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-actas.js
//
//  IDEMPOTENT: upserts on actaId.
// =============================================================================

print("=================================================");
print(" OEP — Seeding rrv_actas (5 sample actas)");
print("=================================================");

use("oep_rrv");

const now      = new Date();
const elecDate = new Date("2025-10-19T00:00:00Z");

const actas = [

  // ── Acta 1: PUBLICADA — clean acta from mobile app ─────────────────────────
  {
    actaId: "ACTA-RRV-001",
    codigoMesa: "10101001001",
    numeroMesa: 1,
    codigoRecinto: "10101001",
    codigoTerritorial: "10101",

    fuente: "APP_MOVIL",
    source: {
      tipo: "APP_MOVIL_O_CARGA_WEB",
      canal: "RRV_ACTA",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/actas",
      descripcion: "Acta recibida con metadatos manuales desde app movil o carga web",
      generadoPor: "USR-JM-001",
      fechaRegistro: new Date("2025-10-19T18:32:14Z"),
    },
    estado: "PUBLICADA",

    ubicacion: {
      departamento: "Chuquisaca",
      provincia: "Oropeza",
      municipio: "Sucre",
      localidad: "Sucre",
      recinto: {
        nombre: "Instituto Particular Quillacollo",
        direccion: "Calle Gral. Pando entre Santa Cruz y Beni",
      },
    },

    archivo: {
      nombreOriginal: "acta_mesa_1_recinto_10101001.jpg",
      tipoArchivo: "image/jpeg",
      urlArchivo: "/uploads/actas/acta_mesa_1_recinto_10101001.jpg",
      hashArchivo: "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      tamanioMb: 1.24,
      fechaRecepcion: new Date("2025-10-19T18:32:14Z"),
    },

    datosActa: {
      codigoVerificacion: "OEP-2025-V-10101001001",
      codigoBarras: "7500123456789",
      cantidadElectoresHabilitados: 339,
      papeletasEnAnfora: 285,
      papeletasNoUtilizadas: 54,
      horaApertura: "08:00",
      horaCierre: "17:00",
      fechaEleccion: elecDate,
      observaciones: "",
    },

    qr: {
      detectado: true,
      contenido: "OEP|MESA:10101001001|RECINTO:10101001|FECHA:2025-10-19",
      codigoMesaQr: "10101001001",
      coincideConMesa: true,
    },

    ocr: {
      procesado: true,
      motorOCR: "tesseract-v5",
      confianzaPromedio: 0.94,
      textoExtraido: "MESA 1 RECINTO 10101001 P1:145 P2:88 P3:32 P4:10 BLANCOS:7 NULOS:3",
      camposExtraidos: {
        P1: 145, P2: 88, P3: 32, P4: 10,
        votosBlancos: 7, votosNulos: 3,
      },
      erroresOCR: [],
      fechaProcesamiento: new Date("2025-10-19T18:34:02Z"),
    },

    resultados: {
      presidente: {
        votosPartidos: [
          { partidoCodigo: "P1", partidoNombre: "Partido 1", cantidadVotos: 145 },
          { partidoCodigo: "P2", partidoNombre: "Partido 2", cantidadVotos: 88 },
          { partidoCodigo: "P3", partidoNombre: "Partido 3", cantidadVotos: 32 },
          { partidoCodigo: "P4", partidoNombre: "Partido 4", cantidadVotos: 10 },
        ],
        // 145+88+32+10 = 275 ✓
        votosValidos: 275,
        votosBlancos: 7,
        votosNulos: 3,
        // 275+7+3 = 285 ✓ (matches papeletasEnAnfora)
        totalVotos: 285,
      },
    },

    validacion: {
      esValida: true,
      esDuplicada: false,
      esSospechosa: false,
      requiereRevisionManual: false,
      errores: [],
      reglasEjecutadas: [
        "MESA_EXISTE", "QR_COINCIDE_CON_MESA", "SUMA_PARTIDOS_COINCIDE_VALIDOS",
        "TOTAL_COINCIDE", "CANTIDAD_NO_SUPERA_HABILITADOS", "NO_DUPLICADO",
      ],
      fechaValidacion: new Date("2025-10-19T18:34:05Z"),
    },

    conflicto: {
      tieneConflicto: false,
      tipoConflicto: null,
      actasRelacionadas: [],
      descripcion: null,
      requiereDecisionHumana: false,
    },

    auditoriaRecepcion: {
      usuarioId: "USR-JM-001",
      nombreOperador: "Juan Carlos Mamani Flores",
      rolOperador: "JURADO",
      ipOrigen: "192.168.1.45",
      dispositivo: "Android - Samsung Galaxy A32",
      canalRecepcion: "APP_MOVIL",
      ubicacionGps: { latitud: -19.0452, longitud: -65.2593 },
      fechaRegistroSistema: new Date("2025-10-19T18:32:14Z"),
    },

    createdAt: new Date("2025-10-19T18:32:14Z"),
    updatedAt: new Date("2025-10-19T18:35:00Z"),
  },

  // ── Acta 2: VALIDADA — web upload, awaiting publication ────────────────────
  {
    actaId: "ACTA-RRV-002",
    codigoMesa: "10101001002",
    numeroMesa: 2,
    codigoRecinto: "10101001",
    codigoTerritorial: "10101",

    fuente: "CARGA_WEB",
    source: {
      tipo: "CARGA_WEB_AUTOMATICA",
      canal: "RRV_ACTA_AUTO",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/actas/auto",
      descripcion: "Acta procesada automaticamente desde PDF o imagen",
      generadoPor: "USR-OP-003",
      fechaRegistro: new Date("2025-10-19T19:10:33Z"),
    },
    estado: "VALIDADA",

    ubicacion: {
      departamento: "Chuquisaca",
      provincia: "Oropeza",
      municipio: "Sucre",
      localidad: "Sucre",
      recinto: {
        nombre: "Instituto Particular Quillacollo",
        direccion: "Calle Gral. Pando entre Santa Cruz y Beni",
      },
    },

    archivo: {
      nombreOriginal: "acta_mesa2_digitalizacion.pdf",
      tipoArchivo: "application/pdf",
      urlArchivo: "/uploads/actas/acta_mesa2_digitalizacion.pdf",
      hashArchivo: "sha256:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
      tamanioMb: 0.87,
      fechaRecepcion: new Date("2025-10-19T19:10:33Z"),
    },

    datosActa: {
      codigoVerificacion: "OEP-2025-V-10101001002",
      codigoBarras: "7500123456790",
      cantidadElectoresHabilitados: 920,
      papeletasEnAnfora: 741,
      papeletasNoUtilizadas: 179,
      horaApertura: "08:00",
      horaCierre: "17:00",
      fechaEleccion: elecDate,
      observaciones: "Se registra un acta con tachado en votos de P3, corregido y refrendado.",
    },

    qr: { detectado: false, contenido: null, codigoMesaQr: null, coincideConMesa: false },

    ocr: {
      procesado: true,
      motorOCR: "tesseract-v5",
      confianzaPromedio: 0.89,
      textoExtraido: "MESA 2 RECINTO 10101001 P1:380 P2:240 P3:85 P4:22 BLANCOS:9 NULOS:5",
      camposExtraidos: { P1: 380, P2: 240, P3: 85, P4: 22, votosBlancos: 9, votosNulos: 5 },
      erroresOCR: [],
      fechaProcesamiento: new Date("2025-10-19T19:12:00Z"),
    },

    resultados: {
      presidente: {
        votosPartidos: [
          { partidoCodigo: "P1", partidoNombre: "Partido 1", cantidadVotos: 380 },
          { partidoCodigo: "P2", partidoNombre: "Partido 2", cantidadVotos: 240 },
          { partidoCodigo: "P3", partidoNombre: "Partido 3", cantidadVotos: 85 },
          { partidoCodigo: "P4", partidoNombre: "Partido 4", cantidadVotos: 22 },
        ],
        // 380+240+85+22 = 727 ✓
        votosValidos: 727,
        votosBlancos: 9,
        votosNulos: 5,
        // 727+9+5 = 741 ✓
        totalVotos: 741,
      },
    },

    validacion: {
      esValida: true, esDuplicada: false, esSospechosa: false, requiereRevisionManual: false,
      errores: [],
      reglasEjecutadas: [
        "MESA_EXISTE", "SUMA_PARTIDOS_COINCIDE_VALIDOS", "TOTAL_COINCIDE",
        "CANTIDAD_NO_SUPERA_HABILITADOS", "NO_DUPLICADO",
      ],
      fechaValidacion: new Date("2025-10-19T19:13:00Z"),
    },

    conflicto: { tieneConflicto: false, tipoConflicto: null, actasRelacionadas: [], descripcion: null, requiereDecisionHumana: false },

    auditoriaRecepcion: {
      usuarioId: "USR-OP-003",
      nombreOperador: "Operador Central OEP",
      rolOperador: "OPERADOR",
      ipOrigen: "10.0.0.5",
      dispositivo: "Windows PC — Chrome 118",
      canalRecepcion: "CARGA_WEB",
      ubicacionGps: null,
      fechaRegistroSistema: new Date("2025-10-19T19:10:33Z"),
    },

    createdAt: new Date("2025-10-19T19:10:33Z"),
    updatedAt: new Date("2025-10-19T19:13:10Z"),
  },

  // ── Acta 3: SOSPECHOSA — OCR extracted wrong votosValidos ──────────────────
  // P1+P2+P3+P4 = 120+90+30+10 = 250, but OCR read votosValidos as 255.
  // The system MUST preserve the original OCR values and mark as SOSPECHOSA.
  // The system must NOT silently correct votosValidos to 250.
  {
    actaId: "ACTA-RRV-003",
    codigoMesa: "10101001003",
    numeroMesa: 3,
    codigoRecinto: "10101001",
    codigoTerritorial: "10101",

    fuente: "APP_MOVIL",
    source: {
      tipo: "APP_MOVIL_O_CARGA_WEB",
      canal: "RRV_ACTA",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/actas",
      descripcion: "Acta recibida con metadatos manuales desde app movil o carga web",
      generadoPor: "USR-PA-002",
      fechaRegistro: new Date("2025-10-19T18:55:21Z"),
    },
    estado: "SOSPECHOSA",

    ubicacion: {
      departamento: "Chuquisaca",
      provincia: "Oropeza",
      municipio: "Sucre",
      localidad: "Sucre",
      recinto: {
        nombre: "Instituto Particular Quillacollo",
        direccion: "Calle Gral. Pando entre Santa Cruz y Beni",
      },
    },

    archivo: {
      nombreOriginal: "acta_mesa3_app.jpg",
      tipoArchivo: "image/jpeg",
      urlArchivo: "/uploads/actas/acta_mesa3_app.jpg",
      hashArchivo: "sha256:c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
      tamanioMb: 1.10,
      fechaRecepcion: new Date("2025-10-19T18:55:21Z"),
    },

    datosActa: {
      codigoVerificacion: "OEP-2025-V-10101001003",
      codigoBarras: "7500123456791",
      cantidadElectoresHabilitados: 300,
      papeletasEnAnfora: 263,
      papeletasNoUtilizadas: 37,
      horaApertura: "08:00",
      horaCierre: "17:00",
      fechaEleccion: elecDate,
      observaciones: "",
    },

    qr: { detectado: true, contenido: "OEP|MESA:10101001003|RECINTO:10101001|FECHA:2025-10-19", codigoMesaQr: "10101001003", coincideConMesa: true },

    ocr: {
      procesado: true,
      motorOCR: "tesseract-v5",
      // Low confidence — image had smudging near the votosValidos field
      confianzaPromedio: 0.71,
      textoExtraido: "MESA 3 RECINTO 10101001 P1:120 P2:90 P3:30 P4:10 VALIDOS:255 BLANCOS:5 NULOS:3",
      camposExtraidos: {
        // OCR extracted these values as-is (255 is wrong — it should be 250)
        P1: 120, P2: 90, P3: 30, P4: 10,
        votosValidos: 255,
        votosBlancos: 5,
        votosNulos: 3,
      },
      erroresOCR: ["LOW_CONFIDENCE_FIELD:votosValidos", "SMUDGE_DETECTED:row_7"],
      fechaProcesamiento: new Date("2025-10-19T18:57:10Z"),
    },

    resultados: {
      presidente: {
        votosPartidos: [
          { partidoCodigo: "P1", partidoNombre: "Partido 1", cantidadVotos: 120 },
          { partidoCodigo: "P2", partidoNombre: "Partido 2", cantidadVotos: 90 },
          { partidoCodigo: "P3", partidoNombre: "Partido 3", cantidadVotos: 30 },
          { partidoCodigo: "P4", partidoNombre: "Partido 4", cantidadVotos: 10 },
        ],
        // OCR-extracted value — preserved as-is. Real sum = 250, OCR says 255.
        // System must NOT correct this. Mark as SOSPECHOSA instead.
        votosValidos: 255,
        votosBlancos: 5,
        votosNulos: 3,
        // 255+5+3 = 263 (matches papeletasEnAnfora, but votosValidos is wrong)
        totalVotos: 263,
      },
    },

    validacion: {
      esValida: false,
      esDuplicada: false,
      esSospechosa: true,
      requiereRevisionManual: true,
      errores: [
        {
          codigo: "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS",
          descripcion: "Suma de partidos (250) no coincide con votosValidos extraído por OCR (255). Diferencia: 5.",
          severidad: "ERROR",
        },
        {
          codigo: "OCR_BAJA_CONFIANZA",
          descripcion: "Confianza promedio OCR 71% está por debajo del umbral mínimo (80%). Campo afectado: votosValidos.",
          severidad: "WARNING",
        },
      ],
      reglasEjecutadas: [
        "MESA_EXISTE", "QR_COINCIDE_CON_MESA", "SUMA_PARTIDOS_COINCIDE_VALIDOS",
        "TOTAL_COINCIDE", "CANTIDAD_NO_SUPERA_HABILITADOS",
      ],
      fechaValidacion: new Date("2025-10-19T18:57:15Z"),
    },

    conflicto: { tieneConflicto: false, tipoConflicto: null, actasRelacionadas: [], descripcion: null, requiereDecisionHumana: true },

    auditoriaRecepcion: {
      usuarioId: "USR-PA-002",
      nombreOperador: "Pedro Alvarado Tarqui",
      rolOperador: "JURADO",
      ipOrigen: "192.168.1.52",
      dispositivo: "Android - Motorola Moto G",
      canalRecepcion: "APP_MOVIL",
      ubicacionGps: { latitud: -19.0440, longitud: -65.2601 },
      fechaRegistroSistema: new Date("2025-10-19T18:55:21Z"),
    },

    createdAt: new Date("2025-10-19T18:55:21Z"),
    updatedAt: new Date("2025-10-19T18:57:20Z"),
  },

  // ── Acta 4: RECHAZADA — unreadable image, multiple errors ──────────────────
  {
    actaId: "ACTA-RRV-004",
    codigoMesa: "10101001004",
    numeroMesa: 4,
    codigoRecinto: "10101001",
    codigoTerritorial: "10101",

    fuente: "APP_MOVIL",
    source: {
      tipo: "APP_MOVIL_O_CARGA_WEB",
      canal: "RRV_ACTA",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/actas",
      descripcion: "Acta recibida con metadatos manuales desde app movil o carga web",
      generadoPor: "USR-OP-003",
      fechaRegistro: new Date("2025-10-19T19:22:05Z"),
    },
    estado: "RECHAZADA",

    ubicacion: {
      departamento: "Chuquisaca",
      provincia: "Oropeza",
      municipio: "Sucre",
      localidad: "Sucre",
      recinto: {
        nombre: "Instituto Particular Quillacollo",
        direccion: "Calle Gral. Pando entre Santa Cruz y Beni",
      },
    },

    archivo: {
      nombreOriginal: "acta_mesa4_borrosa.jpg",
      tipoArchivo: "image/jpeg",
      urlArchivo: "/uploads/actas/acta_mesa4_borrosa.jpg",
      hashArchivo: "sha256:d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
      tamanioMb: 0.45,
      fechaRecepcion: new Date("2025-10-19T19:22:05Z"),
    },

    datosActa: {
      codigoVerificacion: null,
      codigoBarras: null,
      cantidadElectoresHabilitados: null,
      papeletasEnAnfora: null,
      papeletasNoUtilizadas: null,
      horaApertura: null,
      horaCierre: null,
      fechaEleccion: elecDate,
      observaciones: "Imagen extremadamente borrosa. No se pueden extraer datos.",
    },

    qr: { detectado: false, contenido: null, codigoMesaQr: null, coincideConMesa: false },

    ocr: {
      procesado: true,
      motorOCR: "tesseract-v5",
      confianzaPromedio: 0.22,
      textoExtraido: "",
      camposExtraidos: {},
      erroresOCR: ["IMAGE_QUALITY_TOO_LOW", "ALL_FIELDS_UNREADABLE", "QR_NOT_DETECTED"],
      fechaProcesamiento: new Date("2025-10-19T19:23:30Z"),
    },

    resultados: { presidente: { votosPartidos: [], votosValidos: null, votosBlancos: null, votosNulos: null, totalVotos: null } },

    validacion: {
      esValida: false,
      esDuplicada: false,
      esSospechosa: false,
      requiereRevisionManual: false,
      errores: [
        { codigo: "IMAGEN_ILEGIBLE", descripcion: "Calidad de imagen insuficiente para extracción OCR.", severidad: "CRITICAL" },
        { codigo: "CAMPOS_OBLIGATORIOS_AUSENTES", descripcion: "No se pudieron extraer campos obligatorios.", severidad: "CRITICAL" },
        { codigo: "QR_NO_DETECTADO", descripcion: "Código QR no detectado en la imagen.", severidad: "ERROR" },
      ],
      reglasEjecutadas: ["CALIDAD_IMAGEN", "QR_DETECTADO"],
      fechaValidacion: new Date("2025-10-19T19:23:35Z"),
    },

    conflicto: { tieneConflicto: false, tipoConflicto: null, actasRelacionadas: [], descripcion: null, requiereDecisionHumana: false },

    auditoriaRecepcion: {
      usuarioId: "USR-OP-003",
      nombreOperador: "Operador Central OEP",
      rolOperador: "OPERADOR",
      ipOrigen: "10.0.0.5",
      dispositivo: "Windows PC — Chrome 118",
      canalRecepcion: "APP_MOVIL",
      ubicacionGps: null,
      fechaRegistroSistema: new Date("2025-10-19T19:22:05Z"),
    },

    createdAt: new Date("2025-10-19T19:22:05Z"),
    updatedAt: new Date("2025-10-19T19:23:40Z"),
  },

  // ── Acta 5: RECIBIDA — newly arrived, not yet processed ────────────────────
  {
    actaId: "ACTA-RRV-005",
    codigoMesa: "10101001005",
    numeroMesa: 5,
    codigoRecinto: "10101001",
    codigoTerritorial: "10101",

    fuente: "CARGA_WEB",
    source: {
      tipo: "CARGA_LOTE",
      canal: "RRV_ACTA_LOTE",
      modulo: "02-flujo-rapido-rrv",
      endpoint: "POST /api/rrv/actas/auto",
      descripcion: "Acta enviada por script de carga masiva desde carpeta",
      generadoPor: "operador-lote",
      fechaRegistro: new Date("2025-10-19T20:45:00Z"),
    },
    estado: "RECIBIDA",

    ubicacion: {
      departamento: "Chuquisaca",
      provincia: "Oropeza",
      municipio: "Sucre",
      localidad: "Sucre",
      recinto: {
        nombre: "Instituto Particular Quillacollo",
        direccion: "Calle Gral. Pando entre Santa Cruz y Beni",
      },
    },

    archivo: {
      nombreOriginal: "acta_mesa5_reciente.jpg",
      tipoArchivo: "image/jpeg",
      urlArchivo: "/uploads/actas/acta_mesa5_reciente.jpg",
      hashArchivo: "sha256:e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
      tamanioMb: 1.05,
      fechaRecepcion: new Date("2025-10-19T20:45:00Z"),
    },

    datosActa: {
      codigoVerificacion: null,
      codigoBarras: null,
      cantidadElectoresHabilitados: null,
      papeletasEnAnfora: null,
      papeletasNoUtilizadas: null,
      horaApertura: null,
      horaCierre: null,
      fechaEleccion: elecDate,
      observaciones: null,
    },

    qr: { detectado: false, contenido: null, codigoMesaQr: null, coincideConMesa: false },

    ocr: {
      procesado: false,
      motorOCR: null,
      confianzaPromedio: null,
      textoExtraido: null,
      camposExtraidos: null,
      erroresOCR: [],
      fechaProcesamiento: null,
    },

    resultados: { presidente: { votosPartidos: [], votosValidos: null, votosBlancos: null, votosNulos: null, totalVotos: null } },

    validacion: { esValida: null, esDuplicada: false, esSospechosa: false, requiereRevisionManual: false, errores: [], reglasEjecutadas: [], fechaValidacion: null },

    conflicto: { tieneConflicto: false, tipoConflicto: null, actasRelacionadas: [], descripcion: null, requiereDecisionHumana: false },

    auditoriaRecepcion: {
      usuarioId: "USR-OP-003",
      nombreOperador: "Operador Central OEP",
      rolOperador: "OPERADOR",
      ipOrigen: "10.0.0.5",
      dispositivo: "Windows PC — Firefox 119",
      canalRecepcion: "CARGA_WEB",
      ubicacionGps: null,
      fechaRegistroSistema: new Date("2025-10-19T20:45:00Z"),
    },

    createdAt: new Date("2025-10-19T20:45:00Z"),
    updatedAt: new Date("2025-10-19T20:45:00Z"),
  },
];

// ── Upsert all actas ──────────────────────────────────────────────────────────
let inserted = 0;
let updated  = 0;

actas.forEach(function (acta) {
  const result = db.rrv_actas.updateOne(
    { actaId: acta.actaId },
    { $set: { ...acta, updatedAt: now } },
    { upsert: true }
  );

  if (result.upsertedCount > 0) {
    inserted++;
    print("[INSERT] " + acta.actaId + " | mesa " + acta.codigoMesa + " | estado: " + acta.estado);
  } else if (result.modifiedCount > 0) {
    updated++;
    print("[UPDATE] " + acta.actaId + " (already existed)");
  } else {
    print("[SKIP]   " + acta.actaId + " (no change)");
  }
});

print("\n[DONE] Inserted: " + inserted + " | Updated: " + updated);
print("\nActas by state:");
["PUBLICADA", "VALIDADA", "SOSPECHOSA", "RECHAZADA", "RECIBIDA"].forEach(function (s) {
  print("  " + s + ": " + db.rrv_actas.countDocuments({ estado: s }));
});
print("=================================================");
