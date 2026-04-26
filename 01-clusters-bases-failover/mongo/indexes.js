// =============================================================================
//  indexes.js
//  MongoDB Index Creation — Sistema Nacional de Cómputo Electoral Bolivia
//
//  Run via mongosh against the primary after collections are created:
//    mongosh "mongodb://localhost:27017/oep_rrv?replicaSet=rs0" /scripts/indexes.js
//
//  This script is IDEMPOTENT: MongoDB skips indexes that already exist.
// =============================================================================

print("=================================================");
print(" OEP — MongoDB Index Setup");
print(" Database: oep_rrv");
print("=================================================");

use("oep_rrv");

// ── rrv_actas ─────────────────────────────────────────────────────────────────
print("\n[INFO] Creating indexes for rrv_actas...");

db.rrv_actas.createIndex({ actaId: 1 }, { unique: true, name: "idx_actas_actaId_unique" });
db.rrv_actas.createIndex({ codigoMesa: 1 }, { name: "idx_actas_codigoMesa" });
db.rrv_actas.createIndex({ codigoRecinto: 1 }, { name: "idx_actas_codigoRecinto" });
db.rrv_actas.createIndex({ "archivo.hashArchivo": 1 }, { name: "idx_actas_hashArchivo" });
db.rrv_actas.createIndex({ estado: 1 }, { name: "idx_actas_estado" });
db.rrv_actas.createIndex({ fuente: 1 }, { name: "idx_actas_fuente" });
db.rrv_actas.createIndex({ "ubicacion.departamento": 1 }, { name: "idx_actas_departamento" });
db.rrv_actas.createIndex({ "ubicacion.municipio": 1 }, { name: "idx_actas_municipio" });
db.rrv_actas.createIndex({ "archivo.fechaRecepcion": -1 }, { name: "idx_actas_fechaRecepcion" });
db.rrv_actas.createIndex({ "validacion.esSospechosa": 1 }, { name: "idx_actas_sospechosa" });
db.rrv_actas.createIndex({ "validacion.esDuplicada": 1 }, { name: "idx_actas_duplicada" });
// Compound: dashboard queries by department + date
db.rrv_actas.createIndex(
  { "ubicacion.departamento": 1, "archivo.fechaRecepcion": -1 },
  { name: "idx_actas_depto_fecha" }
);

print("[OK] rrv_actas indexes created.");

// ── rrv_sms ───────────────────────────────────────────────────────────────────
print("[INFO] Creating indexes for rrv_sms...");

db.rrv_sms.createIndex({ smsId: 1 }, { unique: true, name: "idx_sms_smsId_unique" });
db.rrv_sms.createIndex({ codigoMesa: 1 }, { name: "idx_sms_codigoMesa" });
db.rrv_sms.createIndex({ codigoRecinto: 1 }, { name: "idx_sms_codigoRecinto" });
db.rrv_sms.createIndex({ numeroOrigen: 1 }, { name: "idx_sms_numeroOrigen" });
db.rrv_sms.createIndex({ estado: 1 }, { name: "idx_sms_estado" });
db.rrv_sms.createIndex({ fechaRecepcion: -1 }, { name: "idx_sms_fechaRecepcion" });

print("[OK] rrv_sms indexes created.");

// ── sms_numeros_autorizados ───────────────────────────────────────────────────
print("[INFO] Creating indexes for sms_numeros_autorizados...");

db.sms_numeros_autorizados.createIndex(
  { numeroOrigen: 1 },
  { unique: true, name: "idx_numeros_numeroOrigen_unique" }
);
db.sms_numeros_autorizados.createIndex({ codigoMesa: 1 }, { name: "idx_numeros_codigoMesa" });
db.sms_numeros_autorizados.createIndex({ codigoRecinto: 1 }, { name: "idx_numeros_codigoRecinto" });
db.sms_numeros_autorizados.createIndex({ activo: 1 }, { name: "idx_numeros_activo" });

print("[OK] sms_numeros_autorizados indexes created.");

// ── rrv_resultados_preliminares ───────────────────────────────────────────────
print("[INFO] Creating indexes for rrv_resultados_preliminares...");

db.rrv_resultados_preliminares.createIndex(
  { resultadoId: 1 },
  { unique: true, name: "idx_resultados_resultadoId_unique" }
);
db.rrv_resultados_preliminares.createIndex({ codigoMesa: 1 }, { name: "idx_resultados_codigoMesa" });
db.rrv_resultados_preliminares.createIndex({ codigoRecinto: 1 }, { name: "idx_resultados_codigoRecinto" });
db.rrv_resultados_preliminares.createIndex({ fuente: 1 }, { name: "idx_resultados_fuente" });
db.rrv_resultados_preliminares.createIndex({ franja: 1 }, { name: "idx_resultados_franja" });
db.rrv_resultados_preliminares.createIndex({ estado: 1 }, { name: "idx_resultados_estado" });
db.rrv_resultados_preliminares.createIndex({ fechaRegistro: -1 }, { name: "idx_resultados_fechaRegistro" });
// Compound: dashboard query — results by mesa + franja
db.rrv_resultados_preliminares.createIndex(
  { codigoMesa: 1, franja: 1 },
  { name: "idx_resultados_mesa_franja" }
);

print("[OK] rrv_resultados_preliminares indexes created.");

// ── rrv_eventos ───────────────────────────────────────────────────────────────
print("[INFO] Creating indexes for rrv_eventos...");

db.rrv_eventos.createIndex({ eventId: 1 }, { unique: true, name: "idx_eventos_eventId_unique" });
db.rrv_eventos.createIndex({ tipoEvento: 1 }, { name: "idx_eventos_tipoEvento" });
db.rrv_eventos.createIndex({ codigoMesa: 1 }, { name: "idx_eventos_codigoMesa" });
db.rrv_eventos.createIndex({ fechaEvento: -1 }, { name: "idx_eventos_fechaEvento" });
db.rrv_eventos.createIndex({ procesado: 1 }, { name: "idx_eventos_procesado" });

print("[OK] rrv_eventos indexes created.");

// ── rrv_logs ──────────────────────────────────────────────────────────────────
print("[INFO] Creating indexes for rrv_logs...");

db.rrv_logs.createIndex({ logId: 1 }, { unique: true, name: "idx_logs_logId_unique" });
db.rrv_logs.createIndex({ actaId: 1 }, { name: "idx_logs_actaId" });
db.rrv_logs.createIndex({ smsId: 1 }, { name: "idx_logs_smsId" });
db.rrv_logs.createIndex({ codigoMesa: 1 }, { name: "idx_logs_codigoMesa" });
db.rrv_logs.createIndex({ tipo: 1 }, { name: "idx_logs_tipo" });
db.rrv_logs.createIndex({ severidad: 1 }, { name: "idx_logs_severidad" });
db.rrv_logs.createIndex({ modulo: 1 }, { name: "idx_logs_modulo" });
db.rrv_logs.createIndex({ fechaHora: -1 }, { name: "idx_logs_fechaHora" });

print("[OK] rrv_logs indexes created.");

// ── rrv_cluster_status ────────────────────────────────────────────────────────
print("[INFO] Creating indexes for rrv_cluster_status...");

db.rrv_cluster_status.createIndex({ nodo: 1 }, { name: "idx_cluster_nodo" });
db.rrv_cluster_status.createIndex({ estado: 1 }, { name: "idx_cluster_estado" });
db.rrv_cluster_status.createIndex({ ultimaVerificacion: -1 }, { name: "idx_cluster_ultimaVerificacion" });

print("[OK] rrv_cluster_status indexes created.");

print("\n=================================================");
print(" Index setup complete.");
print(" Run seed scripts next:");
print("   mongosh \"mongodb://localhost:27017/oep_rrv?replicaSet=rs0\" /scripts/seed/seed-authorized-sms.js");
print("   mongosh \"mongodb://localhost:27017/oep_rrv?replicaSet=rs0\" /scripts/seed/seed-rrv-sample-actas.js");
print("   mongosh \"mongodb://localhost:27017/oep_rrv?replicaSet=rs0\" /scripts/seed/seed-rrv-sample-results.js");
print("=================================================");
