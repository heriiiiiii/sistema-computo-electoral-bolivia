'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * actaService — lógica de negocio para el procesamiento de actas recibidas por SMS
 *
 * Esta capa es la única que toma decisiones de negocio:
 *   - ¿Es un acta duplicada?
 *   - ¿El número de mesa es coherente con el recinto?
 *   - ¿Qué hacer con los datos una vez validados?
 *
 * Actualmente usa almacenamiento en memoria (Map) para prototipo.
 * Para producción: reemplazar _store por una conexión a la base de datos
 * del sistema de cómputo electoral (PostgreSQL, SQLite, etc.)
 *
 * SEPARACIÓN DE RESPONSABILIDADES:
 *   - La app Flutter solo genera el SMS con formato predefinido.
 *   - El gateway SMS recibe el mensaje y llama al webhook.
 *   - gatewayNormalizer extrae from/body/to del request del gateway.
 *   - numberValidator verifica que el remitente está autorizado.
 *   - messageValidator verifica la estructura del texto.
 *   - smsParser extrae y tipifica cada campo del mensaje.
 *   - actaService (este archivo) aplica la lógica de negocio.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Almacenamiento en memoria (reemplazar con DB en producción) ───────────────

/** @type {Map<string, ActaRegistrada>} Clave: `${codigoMesa}-${numeroMesa}` */
const _store = new Map();

// ── Tipos (JSDoc) ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ActaParsed
 * @property {string} codigoMesa
 * @property {number} numeroMesa
 * @property {string} codigoRecinto
 * @property {Date} timestamp
 * @property {string} rawMessage
 */

/**
 * @typedef {Object} ActaRegistrada
 * @property {string} id
 * @property {string} fromNumber
 * @property {string} codigoMesa
 * @property {number} numeroMesa
 * @property {string} codigoRecinto
 * @property {Date} timestampActa    - Hora registrada en el SMS por el delegado
 * @property {Date} receivedAt       - Hora en que el backend recibió el SMS
 * @property {'recibida'|'duplicada'|'procesada'} status
 */

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Procesa un acta parseada y aplica la lógica de negocio.
 *
 * @param {ActaParsed} acta - Datos extraídos por smsParser.
 * @param {string} fromNumber - Número del delegado que envió el SMS (normalizado).
 * @returns {{ resultado: ActaRegistrada, esDuplicada: boolean }}
 */
function processActa(acta, fromNumber) {
  const clave = _buildKey(acta.codigoMesa, acta.numeroMesa);
  const receivedAt = new Date();

  // ── 1. Detectar duplicados ────────────────────────────────────────────────
  // Un acta se considera duplicada si ya existe un registro con la misma
  // combinación codigoMesa + numeroMesa.
  // Regla de negocio: el primer SMS recibido gana; los siguientes se ignoran.
  if (_store.has(clave)) {
    const existente = _store.get(clave);
    console.warn(
      `[actaService] Acta duplicada recibida. Clave: ${clave}. ` +
      `Primera recepción: ${existente.receivedAt.toISOString()}`
    );

    // Actualizar status del existente para auditoría
    _store.set(clave, { ...existente, status: 'duplicada' });

    return {
      resultado: _store.get(clave),
      esDuplicada: true,
    };
  }

  // ── 2. Construir el registro ───────────────────────────────────────────────
  /** @type {ActaRegistrada} */
  const registro = {
    id: _generateId(clave, receivedAt),
    fromNumber,
    codigoMesa: acta.codigoMesa,
    numeroMesa: acta.numeroMesa,
    codigoRecinto: acta.codigoRecinto,
    timestampActa: acta.timestamp,
    receivedAt,
    status: 'recibida',
  };

  // ── 3. Persistir (en memoria; reemplazar con DB) ──────────────────────────
  _store.set(clave, registro);

  // ── 4. Log de auditoría ───────────────────────────────────────────────────
  console.log(
    `[actaService] Acta registrada OK. ` +
    `id=${registro.id} mesa=${acta.codigoMesa}/${acta.numeroMesa} ` +
    `recinto=${acta.codigoRecinto} from=${fromNumber}`
  );

  // ── 5. Disparar procesamiento posterior ───────────────────────────────────
  // Aquí iría: integración al PDF del sistema RRV, notificación al dashboard,
  // actualización del cómputo parcial, etc.
  _triggerDownstreamProcessing(registro);

  return { resultado: registro, esDuplicada: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clave única por acta: combina código y número de mesa. */
function _buildKey(codigoMesa, numeroMesa) {
  return `${codigoMesa.toUpperCase()}-${numeroMesa}`;
}

/** ID único para auditoría: timestamp + hash de la clave. */
function _generateId(clave, date) {
  const ts = date.getTime().toString(36);
  const hash = Buffer.from(clave).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
  return `SMS-${ts}-${hash}`.toUpperCase();
}

/**
 * Stub para la integración downstream.
 * En producción: llamar al módulo de PDF, al dashboard, al sistema de cómputo.
 */
function _triggerDownstreamProcessing(registro) {
  // TODO: integrar con módulo 03-flujo-oficial o 04-dashboard-avanzado
  // Ejemplo: await pdfService.appendActa(registro);
  //          await dashboardService.updateCounter(registro.codigoRecinto);
  console.log(`[actaService] Procesamiento downstream pendiente para id=${registro.id}`);
}

// ── Consultas (para endpoints de diagnóstico) ─────────────────────────────────

/** Devuelve todos los actas registradas (solo para uso interno/diagnóstico). */
function getAllActas() {
  return Array.from(_store.values());
}

/** Busca un acta por codigoMesa + numeroMesa. */
function findActa(codigoMesa, numeroMesa) {
  return _store.get(_buildKey(codigoMesa, numeroMesa)) || null;
}

module.exports = { processActa, getAllActas, findActa };
