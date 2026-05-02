'use strict';

/**
 * Configuración central del backend.
 * Todos los valores sensibles vienen de variables de entorno (.env).
 * Los valores con || son defaults seguros para desarrollo local.
 */
module.exports = {
  // Puerto del servidor HTTP
  port: parseInt(process.env.PORT, 10) || 3001,

  // Número de destino (el que recibe los SMS desde los delegados)
  // Debe coincidir con AppConfig.smsRecipientNumber de la app Flutter
  smsRecipientNumber: process.env.SMS_RECIPIENT_NUMBER || '+59171440740',

  // Secreto compartido con el gateway SMS para verificar autenticidad del webhook.
  // En Twilio esto es el Auth Token; en otros gateways puede ser una API key.
  webhookSecret: process.env.SMS_WEBHOOK_SECRET || '',

  // Tipo de gateway SMS: 'twilio' | 'africastalking' | 'generic'
  // Determina cómo se normalizan los campos del request entrante.
  gatewayType: process.env.SMS_GATEWAY_TYPE || 'generic',

  // Si true, rechaza SMS con firma de gateway inválida.
  // En desarrollo se puede desactivar para pruebas con curl.
  enforceWebhookSignature: process.env.ENFORCE_WEBHOOK_SIGNATURE === 'true',
};
