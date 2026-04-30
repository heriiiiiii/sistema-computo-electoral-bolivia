/// Configuración central de la aplicación.
/// Todos los valores configurables están aquí; no deben hardcodearse en otros archivos.
class AppConfig {
  AppConfig._(); // clase no instanciable

  // ── Flujo HTTP (envío de foto al servidor) ─────────────────────────────────

  // En emulador Android, 10.0.2.2 apunta al localhost de la máquina host.
  // En dispositivo físico, usar la IP real del servidor backend.
  static const String baseUrl = 'http://10.0.2.2:3000';

  // Endpoint de envío de actas
  static const String actasEndpoint = '/api/rrv/actas';

  // Tiempo máximo de espera para el envío (segundos)
  static const int timeoutSeconds = 30;

  // ── Flujo SMS (envío sin internet) ────────────────────────────────────────

  // Número de teléfono receptor del SMS (formato internacional sin espacios).
  // Cambiar por el número real del centro de cómputo electoral.
  // Número oficial del centro de cómputo electoral en Bolivia.
  // Formato internacional E.164 requerido por el URI scheme sms:.
  static const String smsRecipientNumber = '+59171440740';
}
