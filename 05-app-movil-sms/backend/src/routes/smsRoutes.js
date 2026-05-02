'use strict';

const express = require('express');
const router = express.Router();

const gatewayNormalizer     = require('../middleware/gatewayNormalizer');
const { validateSenderNumber }  = require('../validators/numberValidator');
const { validateMessageStructure } = require('../validators/messageValidator');
const { parseSms, ParseError }  = require('../parsers/smsParser');
const { processActa, getAllActas } = require('../services/actaService');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/sms/incoming
 *
 * Webhook que llama el gateway SMS (Twilio, Africa's Talking, genérico)
 * cada vez que el número 71440740 recibe un SMS.
 *
 * Pipeline de procesamiento (en orden):
 *
 *   1. gatewayNormalizer  → verifica firma + normaliza campos a req.sms
 *   2. validateSenderNumber → el remitente debe estar en la lista autorizada
 *   3. validateMessageStructure → la estructura del texto debe ser correcta
 *   4. parseSms → extrae y tipifica cada campo del mensaje
 *   5. processActa → aplica la lógica de negocio (deduplicación, persistencia)
 *   6. Responder 200 → CRÍTICO: los gateways reintentan si no reciben 200
 *
 * Regla de respuesta HTTP:
 *   - Siempre devolver HTTP 200, incluso si el mensaje es inválido o no autorizado.
 *   - Usar el campo "status" del body JSON para indicar qué pasó.
 *   - Si se devuelve 4xx/5xx, el gateway puede reintentar indefinidamente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
router.post('/incoming', gatewayNormalizer, async (req, res) => {
  const { from, body: smsBody } = req.sms;

  // ── Paso 2: validar número remitente ──────────────────────────────────────
  const { authorized, normalized: fromNormalized } = validateSenderNumber(from);

  if (!authorized) {
    // Responder 200 para no generar reintentos del gateway, pero loguear el rechazo
    console.warn(`[/incoming] Remitente no autorizado: from="${from}" normalizado="${fromNormalized}"`);
    return res.status(200).json({
      status: 'rejected',
      reason: 'sender_not_authorized',
      // No revelar detalles del sistema de autorización al exterior
      message: 'El número remitente no está autorizado para enviar actas.',
    });
  }

  // ── Paso 3: validación estructural del mensaje ────────────────────────────
  const structureCheck = validateMessageStructure(smsBody);

  if (!structureCheck.valid) {
    console.warn(`[/incoming] Estructura inválida: ${structureCheck.error}`);
    return res.status(200).json({
      status: 'rejected',
      reason: 'invalid_message_structure',
      message: structureCheck.error,
    });
  }

  // ── Paso 4: parsear el mensaje y extraer campos ───────────────────────────
  let acta;
  try {
    acta = parseSms(smsBody);
  } catch (err) {
    if (err instanceof ParseError) {
      console.warn(`[/incoming] Error de parseo: ${err.message}`);
      return res.status(200).json({
        status: 'rejected',
        reason: 'parse_error',
        message: err.message,
      });
    }
    // Error inesperado en el parser: loguear y responder 200 igual
    console.error('[/incoming] Error inesperado en parseSms:', err);
    return res.status(200).json({
      status: 'error',
      reason: 'internal_parser_error',
      message: 'Error interno al procesar el mensaje.',
    });
  }

  // ── Paso 5: lógica de negocio ─────────────────────────────────────────────
  let resultado, esDuplicada;
  try {
    ({ resultado, esDuplicada } = processActa(acta, fromNormalized));
  } catch (err) {
    console.error('[/incoming] Error en processActa:', err);
    return res.status(200).json({
      status: 'error',
      reason: 'processing_error',
      message: 'Error interno al registrar el acta.',
    });
  }

  // ── Paso 6: responder al gateway ──────────────────────────────────────────
  return res.status(200).json({
    status: esDuplicada ? 'duplicate' : 'accepted',
    id: resultado.id,
    codigoMesa: resultado.codigoMesa,
    numeroMesa: resultado.numeroMesa,
    codigoRecinto: resultado.codigoRecinto,
    receivedAt: resultado.receivedAt.toISOString(),
    message: esDuplicada
      ? `Acta duplicada. Ya existe un registro para la mesa ${resultado.codigoMesa}/${resultado.numeroMesa}.`
      : `Acta recibida y registrada correctamente.`,
  });
});

/**
 * GET /api/sms/actas
 * Endpoint de diagnóstico interno — listar todas las actas recibidas.
 * En producción: proteger con autenticación.
 */
router.get('/actas', (_req, res) => {
  const actas = getAllActas();
  res.json({
    total: actas.length,
    actas,
  });
});

module.exports = router;
