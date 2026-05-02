'use strict';

const fs = require('fs');
const path = require('path');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * numberValidator — valida que el número remitente esté autorizado
 *
 * La lista de autorizados se carga desde authorized_numbers.json al iniciar
 * el servidor. Si el archivo cambia en producción, reiniciar el proceso
 * (o implementar un endpoint de recarga en caliente).
 *
 * Lógica de normalización:
 *   Bolivia usa números de 8 dígitos que empiezan con 6 o 7.
 *   Los gateways pueden enviarlos en distintos formatos:
 *     - Local:         71440740
 *     - Con prefijo:   071440740
 *     - Internacional: +59171440740
 *     - Sin +:         59171440740
 *   Todos se normalizan a E.164 (+591XXXXXXXX) antes de comparar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Cargar lista en memoria al iniciar (sincrónico, solo una vez)
const _dataPath = path.join(__dirname, '../data/authorized_numbers.json');
const _authorizedNumbers = _loadAuthorizedNumbers();

function _loadAuthorizedNumbers() {
  try {
    const raw = fs.readFileSync(_dataPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.numbers)) {
      throw new Error('El campo "numbers" no es un array.');
    }
    // Pre-normalizar para comparar más rápido en cada request
    return data.numbers.map(n => normalizeBolivianNumber(n));
  } catch (err) {
    console.error('[numberValidator] Error al cargar authorized_numbers.json:', err.message);
    return [];
  }
}

/**
 * Normaliza un número boliviano a formato E.164 (+591XXXXXXXX).
 * Devuelve el número original si no puede normalizarlo (para no perder información).
 *
 * @param {string} number
 * @returns {string}
 */
function normalizeBolivianNumber(number) {
  let n = String(number).replace(/[\s\-().]/g, ''); // quitar espacios, guiones, paréntesis

  // Ya en formato E.164 internacional
  if (/^\+591[67]\d{7}$/.test(n)) return n;

  // Sin el + pero con código de país (59171234567)
  if (/^591[67]\d{7}$/.test(n)) return '+' + n;

  // Número local boliviano de 8 dígitos (71234567)
  if (/^[67]\d{7}$/.test(n)) return '+591' + n;

  // Número local con 0 de prefijo (071234567)
  if (/^0[67]\d{7}$/.test(n)) return '+591' + n.slice(1);

  // No reconocido: devolver tal cual para no perder el número en los logs
  return n;
}

/**
 * Comprueba si el número que envió el SMS pertenece a la lista de autorizados.
 *
 * @param {string} fromNumber - Número remitente tal como lo envió el gateway.
 * @returns {{ authorized: boolean, normalized: string }}
 */
function validateSenderNumber(fromNumber) {
  const normalized = normalizeBolivianNumber(fromNumber);
  const authorized = _authorizedNumbers.includes(normalized);

  if (!authorized) {
    console.warn(
      `[numberValidator] Número no autorizado: original="${fromNumber}" normalizado="${normalized}"`
    );
  }

  return { authorized, normalized };
}

/**
 * Devuelve la lista de números autorizados (solo para diagnóstico interno,
 * nunca exponer en una respuesta HTTP pública).
 */
function getAuthorizedNumbers() {
  return [..._authorizedNumbers];
}

module.exports = { validateSenderNumber, normalizeBolivianNumber, getAuthorizedNumbers };
