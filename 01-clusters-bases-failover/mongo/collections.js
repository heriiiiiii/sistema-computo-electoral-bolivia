// =============================================================================
//  collections.js
//  MongoDB Collection Creation — Sistema Nacional de Cómputo Electoral Bolivia
//
//  Creates all 7 RRV collections with JSON Schema validators.
//  Run via mongosh against the primary:
//
//    mongosh "mongodb://localhost:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js
//
//  This script is IDEMPOTENT: it skips collections that already exist.
// =============================================================================

print("=================================================");
print(" OEP — MongoDB Collection Setup");
print(" Database: oep_rrv");
print("=================================================");

// Switch to the RRV database
use("oep_rrv");

// Helper — creates a collection only if it does not exist
function ensureCollection(name, options) {
  const existing = db.getCollectionNames();
  if (existing.includes(name)) {
    print("[SKIP] Collection already exists: " + name);
    return;
  }
  db.createCollection(name, options || {});
  print("[OK]   Created collection: " + name);
}

// ── 1. rrv_actas ─────────────────────────────────────────────────────────────
//  One document per received acta image/PDF. Does NOT store binary files.
//  The same mesa can have multiple actas (duplicates are kept for audit).
//
//  Optional `source` object describes the explicit origin of every record so
//  the evaluator can inspect it directly in MongoDB. It is additive and lives
//  alongside the legacy `fuente` string. Shape:
//    source: {
//      tipo, canal, modulo, endpoint, descripcion, generadoPor, fechaRegistro
//    }
ensureCollection("rrv_actas", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["actaId", "codigoMesa", "fuente", "estado", "createdAt"],
      properties: {
        actaId:    { bsonType: "string" },
        codigoMesa: { bsonType: "string" },
        fuente: {
          bsonType: "string",
          enum: ["APP_MOVIL", "CARGA_WEB", "SISTEMA"],
          description: "SMS must not create a full rrv_actas document"
        },
        source: {
          bsonType: "object",
          description: "Explicit origin of the record (RRV standardized field)",
          properties: {
            tipo:         { bsonType: "string" },
            canal:        { bsonType: "string" },
            modulo:       { bsonType: "string" },
            endpoint:     { bsonType: ["string", "null"] },
            descripcion:  { bsonType: ["string", "null"] },
            generadoPor:  { bsonType: ["string", "null"] },
            fechaRegistro:{ bsonType: ["date", "null"] }
          }
        },
        estado: {
          bsonType: "string",
          enum: ["RECIBIDA", "PROCESANDO", "VALIDADA", "SOSPECHOSA", "RECHAZADA", "PUBLICADA", "PENDIENTE_REVISION"]
        },
        createdAt: { bsonType: "date" }
      }
    }
  },
  validationAction: "warn"
});

// ── 2. rrv_sms ───────────────────────────────────────────────────────────────
//  One document per received SMS.
//  SMS security: authorized phone numbers, NOT tokens.
ensureCollection("rrv_sms", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["smsId", "codigoMesa", "numeroOrigen", "contenidoOriginal", "estado", "createdAt"],
      properties: {
        smsId:   { bsonType: "string" },
        codigoMesa: { bsonType: "string" },
        numeroOrigen: { bsonType: "string" },
        contenidoOriginal: { bsonType: "string" },
        source: {
          bsonType: "object",
          description: "Explicit origin of the SMS (RRV standardized field)",
          properties: {
            tipo:         { bsonType: "string" },
            canal:        { bsonType: "string" },
            modulo:       { bsonType: "string" },
            endpoint:     { bsonType: ["string", "null"] },
            descripcion:  { bsonType: ["string", "null"] },
            generadoPor:  { bsonType: ["string", "null"] },
            fechaRegistro:{ bsonType: ["date", "null"] }
          }
        },
        estado: {
          bsonType: "string",
          enum: ["RECIBIDO", "VALIDO", "INVALIDO", "SOSPECHOSO", "DUPLICADO"]
        },
        createdAt: { bsonType: "date" }
      }
    }
  },
  validationAction: "warn"
});

// ── 3. sms_numeros_autorizados ────────────────────────────────────────────────
//  Whitelist of phone numbers authorized to send SMS results.
ensureCollection("sms_numeros_autorizados", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["numeroOrigen", "codigoMesa", "activo", "createdAt"],
      properties: {
        numeroOrigen: { bsonType: "string" },
        codigoMesa:   { bsonType: "string" },
        activo:       { bsonType: "bool" },
        createdAt:    { bsonType: "date" }
      }
    }
  },
  validationAction: "warn"
});

// ── 4. rrv_resultados_preliminares ───────────────────────────────────────────
//  Unified preliminary results from OCR or SMS.
//  Dashboard queries this instead of rrv_actas + rrv_sms separately.
ensureCollection("rrv_resultados_preliminares", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["resultadoId", "codigoMesa", "fuente", "estado", "createdAt"],
      properties: {
        resultadoId: { bsonType: "string" },
        codigoMesa:  { bsonType: "string" },
        fuente: {
          bsonType: "string",
          enum: ["OCR", "SMS"]
        },
        franja: {
          bsonType: "string",
          enum: ["PRESIDENTE", "DIPUTADO_UNINOMINAL"]
        },
        estado: {
          bsonType: "string",
          enum: ["VALIDO", "SOSPECHOSO", "RECHAZADO", "PENDIENTE_REVISION", "PUBLICADO"]
        },
        createdAt: { bsonType: "date" }
      }
    }
  },
  validationAction: "warn"
});

// ── 5. rrv_eventos ───────────────────────────────────────────────────────────
//  Event sourcing log for the RRV flow.
ensureCollection("rrv_eventos", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["eventId", "tipoEvento", "fechaEvento", "createdAt"],
      properties: {
        eventId:    { bsonType: "string" },
        tipoEvento: { bsonType: "string" },
        fechaEvento: { bsonType: "date" },
        procesado:  { bsonType: "bool" },
        intentos:   { bsonType: "int" },
        source: {
          bsonType: "object",
          description: "Explicit origin of the event (RRV standardized field)",
          properties: {
            tipo:         { bsonType: "string" },
            canal:        { bsonType: "string" },
            modulo:       { bsonType: "string" },
            endpoint:     { bsonType: ["string", "null"] },
            descripcion:  { bsonType: ["string", "null"] },
            generadoPor:  { bsonType: ["string", "null"] },
            fechaRegistro:{ bsonType: ["date", "null"] }
          }
        },
        createdAt:  { bsonType: "date" }
      }
    }
  },
  validationAction: "warn"
});

// ── 6. rrv_logs ──────────────────────────────────────────────────────────────
//  Operational logs for the RRV flow.
ensureCollection("rrv_logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["logId", "tipo", "severidad", "mensaje", "createdAt"],
      properties: {
        logId:    { bsonType: "string" },
        tipo: {
          bsonType: "string",
          enum: ["ERROR_IMAGEN", "ERROR_OCR", "FRAUDE", "DUPLICADO", "SMS_INVALIDO",
                 "SMS_NUMERO_NO_AUTORIZADO", "INCONSISTENCIA", "SISTEMA", "CLUSTER"]
        },
        severidad: {
          bsonType: "string",
          enum: ["INFO", "WARNING", "ERROR", "CRITICAL"]
        },
        source: {
          bsonType: "object",
          description: "Explicit origin of the log (RRV standardized field)",
          properties: {
            tipo:         { bsonType: "string" },
            canal:        { bsonType: "string" },
            modulo:       { bsonType: "string" },
            endpoint:     { bsonType: ["string", "null"] },
            descripcion:  { bsonType: ["string", "null"] },
            generadoPor:  { bsonType: ["string", "null"] },
            fechaRegistro:{ bsonType: ["date", "null"] }
          }
        },
        createdAt: { bsonType: "date" }
      }
    }
  },
  validationAction: "warn"
});

// ── 7. rrv_cluster_status ─────────────────────────────────────────────────────
//  Snapshot of MongoDB replica set node states.
//  Updated by the health check script.
ensureCollection("rrv_cluster_status");

print("\n=================================================");
print(" Collection setup complete.");
print(" Run indexes.js next:");
print("   mongosh \"mongodb://localhost:27017/oep_rrv?replicaSet=rs0\" /scripts/indexes.js");
print("=================================================");
