'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * smsParser — extrae y convierte los campos del mensaje SMS predefinido
 *
 * FORMATO ESPERADO (generado por la app Flutter, definido en SmsService.dart):
 *
 *   [ACTA-RRV]
 *   Mesa: CM-001
 *   Num: 42
 *   Recinto: RC-005
 *   20/10/2024 14:35
 *
 * Reglas de parsing:
 *   - La cabecera [ACTA-RRV] es obligatoria y debe ser la primera línea no vacía.
 *   - Los campos Mesa:, Num:, Recinto: se identifican por prefijo (case-insensitive).
 *   - El timestamp es la última línea con formato DD/MM/AAAA HH:MM.
 *   - Num se convierte a entero; los demás quedan como strings.
 *   - Los saltos de línea pueden ser \n o \r\n (SMS varía según dispositivo).
 *
 * Si el formato no coincide, se lanza ParseError con un mensaje descriptivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Expresiones regulares ─────────────────────────────────────────────────────

const HEADER_RE = /^\[ACTA-RRV\]$/i;
const MESA_RE   = /^Mesa:\s*(.+)$/i;
const NUM_RE    = /^Num:\s*(\d+)$/i;
const RECINTO_RE = /^Recinto:\s*(.+)$/i;
const TIMESTAMP_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;

// ── Clase de error específica ─────────────────────────────────────────────────

class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Parsea el cuerpo del SMS y devuelve un objeto con los campos extraídos.
 *
 * @param {string} rawBody - Texto completo del SMS recibido.
 * @returns {{ codigoMesa: string, numeroMesa: number, codigoRecinto: string, timestamp: Date, rawMessage: string }}
 * @throws {ParseError} Si el formato no coincide con el esperado.
 */
function parseSms(rawBody) {
  if (!rawBody || typeof rawBody !== 'string') {
    throw new ParseError('El cuerpo del SMS está vacío o no es texto.');
  }

  // Normalizar saltos de línea y limpiar líneas vacías
  const lines = rawBody
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    throw new ParseError('El SMS está vacío después de limpiar espacios.');
  }

  // ── Paso 1: verificar cabecera ────────────────────────────────────────────
  if (!HEADER_RE.test(lines[0])) {
    throw new ParseError(
      `Cabecera no reconocida: "${lines[0]}". Se esperaba "[ACTA-RRV]".`
    );
  }

  const body = lines.slice(1); // resto del mensaje sin la cabecera

  // ── Paso 2: extraer campo Mesa ────────────────────────────────────────────
  const codigoMesa = _extraerCampo(body, MESA_RE, 'Mesa');

  // ── Paso 3: extraer y convertir Num a entero ──────────────────────────────
  const numRaw = _extraerCampo(body, NUM_RE, 'Num');
  const numeroMesa = parseInt(numRaw, 10);
  if (isNaN(numeroMesa) || numeroMesa <= 0) {
    throw new ParseError(
      `El campo Num tiene un valor inválido: "${numRaw}". Se esperaba un entero positivo.`
    );
  }

  // ── Paso 4: extraer campo Recinto ─────────────────────────────────────────
  const codigoRecinto = _extraerCampo(body, RECINTO_RE, 'Recinto');

  // ── Paso 5: extraer y parsear timestamp ───────────────────────────────────
  const timestamp = _extraerTimestamp(body);

  return {
    codigoMesa,
    numeroMesa,      // número entero, no string
    codigoRecinto,
    timestamp,       // objeto Date en UTC
    rawMessage: rawBody,
  };
}

// ── Helpers privados ──────────────────────────────────────────────────────────

/**
 * Busca una línea que coincida con el regex y devuelve el grupo capturado (índice 1).
 * Lanza ParseError si no se encuentra el campo.
 */
function _extraerCampo(lines, regex, nombreCampo) {
  for (const line of lines) {
    const match = line.match(regex);
    if (match) return match[1].trim();
  }
  throw new ParseError(
    `Campo obligatorio ausente en el SMS: "${nombreCampo}". ` +
    `Verifica que el mensaje tenga el formato predefinido.`
  );
}

/**
 * Busca el timestamp en el formato DD/MM/AAAA HH:MM y lo convierte a Date.
 * Se interpreta como hora local de Bolivia (UTC-4).
 */
function _extraerTimestamp(lines) {
  for (const line of lines) {
    const match = line.match(TIMESTAMP_RE);
    if (match) {
      const [, dd, mm, yyyy, hh, min] = match;
      // Construir ISO string interpretando como hora de Bolivia (UTC-4)
      const isoString = `${yyyy}-${mm}-${dd}T${hh}:${min}:00-04:00`;
      const date = new Date(isoString);
      if (isNaN(date.getTime())) {
        throw new ParseError(`Timestamp inválido: "${line}".`);
      }
      return date;
    }
  }
  throw new ParseError(
    'No se encontró el timestamp en el SMS. ' +
    'Se esperaba formato DD/MM/AAAA HH:MM.'
  );
}

module.exports = { parseSms, ParseError };
