/// Configuración central de la aplicación.
/// Todos los valores configurables están aquí — no hardcodear en otros archivos.
class AppConfig {
  AppConfig._();

  // ── Servidor PC — recepción de PDFs por WiFi ──────────────────────────────
  //
  // Cambiar la IP por la IP local de la PC en la red WiFi.
  // Cómo obtener la IP: abrir CMD en la PC y ejecutar:
  //   ipconfig
  // Buscar "Dirección IPv4" bajo el adaptador WiFi.
  // Ejemplo: 192.168.1.105
  //
  static const String pcServerUrl = 'http://192.168.0.6:3000';

  static const String actasEndpoint = '/api/rrv/actas/upload';

  // Carpeta de destino en la PC (solo informativo, el servidor decide dónde guardar)
  static const String pcSaveDir = r'C:\Users\Jared\Desktop\ACTAS_COACH';

  // Tiempo máximo de espera para el envío HTTP (segundos)
  static const int timeoutSeconds = 30;

  // ── Flujo SMS — envío sin internet ───────────────────────────────────────
  static const String smsRecipientNumber = '+59176458591';

  // Número del delegado que usa esta app (se valida en el servidor contra la lista autorizada).
  // Cambiar por el número real del delegado antes de distribuir el APK.
  static const String delegateNumber = '+59171440740';

  static const String smsWebhookUrl =
      'https://tremendous-evangelina-nonmiscible.ngrok-free.dev/api/rrv/sms';
}
