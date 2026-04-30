'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * messageValidator — pre-validación estructural del mensaje SMS
 *
 * Se ejecuta ANTES del parser completo para dar errores claros al log
 * sin tener que invocar toda la lógica de parseo.
 *
 * Validaciones que realiza:
 *   1. El mensaje no está vacío.
 *   2. La longitud no supera el máximo razonable de un SMS concatenado.
 *   3. El mensaje comienza con la cabecera [ACTA-RRV].
 *   4. Están presentes las palabras clave obligatorias (Mesa:, Num:, Recinto:).
 *
 * No extrae valores; eso lo hace smsParser. Aquí solo se valida estructura.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MAX_SMS_LENGTH = 640; // SMS concatenado de 4 partes (4 × 160)

/**
 * @typedef {Object} MessageValidationResult
 * @property {boolean} valid
 * @property {string|null} error - Descripción del problema, null si es válido.
 */

/**
 * Valida la estructura básica del cuerpo del SMS.
 *
 * @param {string} body
 * @returns {MessageValidationResult}
 */
function validateMessageStructure(body) {
  // ── 1. Vacío ──────────────────────────────────────────────────────────────
  if (!body || body.trim().length === 0) {
    return fail('El cuerpo del SMS está vacío.');
  }

  // ── 2. Longitud excesiva (posible spam o error de gateway) ────────────────
  if (body.length > MAX_SMS_LENGTH) {
    return fail(
      `El SMS supera la longitud máxima permitida (${MAX_SMS_LENGTH} chars). ` +
      `Longitud recibida: ${body.length}.`
    );
  }

  const normalized = body.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);

  // ── 3. Cabecera obligatoria ────────────────────────────────────────────────
  if (!lines[0] || !/^\[ACTA-RRV\]$/i.test(lines[0])) {
    return fail(
      `Primera línea no reconocida: "${lines[0] ?? '(vacía)'}". ` +
      `El mensaje debe comenzar con [ACTA-RRV].`
    );
  }

  // ── 4. Presencia de palabras clave (sin extraer valores) ──────────────────
  const contenido = lines.slice(1).join('\n');
  const camposRequeridos = [
    { re: /Mesa:/i,    nombre: 'Mesa' },
    { re: /Num:/i,     nombre: 'Num' },
    { re: /Recinto:/i, nombre: 'Recinto' },
  ];

  for (const campo of camposRequeridos) {
    if (!campo.re.test(contenido)) {
      return fail(`Campo obligatorio ausente en el mensaje: "${campo.nombre}:".`);
    }
  }

  return { valid: true, error: null };
}

/** Helper para construir resultados de fallo. */
function fail(error) {
  return { valid: false, error };
}

module.exports = { validateMessageStructure };
