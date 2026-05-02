'use strict';

const { gatewayType, webhookSecret, enforceWebhookSignature } = require('../config/config');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * gatewayNormalizer — middleware de normalización + verificación de firma
 *
 * Problema: cada proveedor SMS envía el webhook con campos distintos:
 *
 *   Twilio           → { From, Body, To }          (URL-encoded)
 *   Africa's Talking → { from, text, to }           (URL-encoded)
 *   Genérico         → { from, body, to }           (JSON)
 *
 * Este middleware:
 *   1. Verifica la firma del gateway si ENFORCE_WEBHOOK_SIGNATURE=true
 *   2. Normaliza cualquiera de los formatos anteriores a:
 *        req.sms = { from: string, body: string, to: string }
 *   3. Llama a next() si todo es válido; responde 401/400 si no lo es.
 *
 * El resto del código solo trabaja con req.sms y no sabe qué gateway envió el SMS.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function gatewayNormalizer(req, res, next) {
  // ── 1. Verificación de firma (opcional según entorno) ─────────────────────
  if (enforceWebhookSignature) {
    const valid = _verifySignature(req);
    if (!valid) {
      console.warn('[GatewayNormalizer] Firma inválida — request rechazado.');
      return res.status(401).json({ error: 'Firma de gateway inválida.' });
    }
  }

  // ── 2. Normalización según tipo de gateway configurado ─────────────────────
  let normalized;
  try {
    normalized = _normalize(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // ── 3. Adjuntar al request para el siguiente middleware / controlador ──────
  req.sms = normalized;
  next();
}

/**
 * Extrae from, body y to del body del request independientemente del gateway.
 * Lanza Error si faltan campos obligatorios.
 */
function _normalize(body) {
  let from, smsBody, to;

  if (gatewayType === 'twilio') {
    // Twilio envía nombres con mayúscula inicial
    from = body.From;
    smsBody = body.Body;
    to = body.To;
  } else if (gatewayType === 'africastalking') {
    // Africa's Talking usa 'text' en lugar de 'body'
    from = body.from;
    smsBody = body.text;
    to = body.to;
  } else {
    // Formato genérico / pruebas con curl / JSON
    from = body.from;
    smsBody = body.body;
    to = body.to;
  }

  if (!from || !smsBody) {
    throw new Error(
      `Campos obligatorios ausentes en el webhook (gateway: ${gatewayType}). ` +
      `Se esperaban 'from' y 'body' (o equivalentes según el proveedor).`
    );
  }

  return {
    from: String(from).trim(),
    body: String(smsBody).trim(),
    to: to ? String(to).trim() : null,
  };
}

/**
 * Verifica la firma del gateway para asegurar que el webhook es auténtico.
 * Implementación de ejemplo para Twilio; adaptar según proveedor real.
 *
 * En producción usar la librería oficial del gateway (ej: twilio.validateRequest).
 */
function _verifySignature(req) {
  if (!webhookSecret) return false;

  // Twilio envía la firma en el header X-Twilio-Signature
  const signature = req.headers['x-twilio-signature'] ||
                    req.headers['x-gateway-signature'];

  if (!signature) return false;

  // Aquí iría la validación HMAC con webhookSecret
  // Ejemplo simplificado; en producción usar crypto.timingSafeEqual
  return signature === webhookSecret;
}

module.exports = gatewayNormalizer;
