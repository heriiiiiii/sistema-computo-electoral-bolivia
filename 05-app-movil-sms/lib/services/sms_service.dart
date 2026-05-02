import 'dart:io';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_config.dart';
import '../models/sms_acta_model.dart';

/// Resultado del intento de abrir la app de SMS.
enum SmsLaunchStatus {
  exitoso,
  appNoDisponible, // el dispositivo no tiene app de SMS instalada
  errorInesperado,
}

/// ─────────────────────────────────────────────────────────────────────────────
/// SmsService — responsabilidades únicas:
///   1. Generar el texto del mensaje en formato predefinido.
///   2. Construir el URI de SMS con destinatario y cuerpo precargado.
///   3. Delegar la apertura al sistema operativo (intent / URL scheme).
///
/// NO envía el mensaje automáticamente.
/// NO copia al portapapeles.
/// NO accede a ningún servidor.
/// ─────────────────────────────────────────────────────────────────────────────
class SmsService {
  SmsService._(); // clase no instanciable

  // ── 1. Generación del mensaje ─────────────────────────────────────────────

  /// Genera el texto del SMS con un formato fijo y predefinido.
  ///
  /// Formato resultante (≈ 90 caracteres, cabe en un SMS estándar de 160):
  /// ```
  /// [ACTA-RRV]
  /// Mesa: CM-001
  /// Num: 42
  /// Recinto: RC-005
  /// 20/10/2024 14:35
  /// ```
  ///
  /// El formato NO puede modificarse desde la UI. Si se necesita cambiarlo,
  /// solo se edita este método y todos los mensajes generados quedan actualizados.
  static String generarMensaje(SmsActaModel acta) {
    return 'MESA:${acta.codigoMesa.trim()}'
        ';RECINTO:${acta.codigoRecinto.trim()}'
        ';P1:${acta.votosP1.trim()}'
        ';P2:${acta.votosP2.trim()}'
        ';P3:${acta.votosP3.trim()}'
        ';P4:${acta.votosP4.trim()}'
        ';BLANCOS:${acta.votosBlancos.trim()}'
        ';NULOS:${acta.votosNulos.trim()}';
  }

  // ── 2. Construcción del URI de SMS ────────────────────────────────────────

  /// Construye el URI correcto según la plataforma.
  ///
  /// Android usa `?body=` como separador del query parameter.
  /// iOS usa `&body=` (comportamiento del URL scheme nativo de iMessage/Mensajes).
  ///
  /// El cuerpo se codifica con [Uri.encodeComponent] para escapar saltos de
  /// línea, espacios y caracteres especiales que romperían el URI.
  static Uri _construirUri(String mensaje) {
    final numero = AppConfig.smsRecipientNumber;
    final cuerpoEncoded = Uri.encodeComponent(mensaje);

    // Diferencia de plataforma: Android usa '?', iOS usa '&'
    final uriString = Platform.isIOS
        ? 'sms:$numero&body=$cuerpoEncoded'
        : 'sms:$numero?body=$cuerpoEncoded';

    return Uri.parse(uriString);
  }

  // ── 3. Apertura de la app de SMS ──────────────────────────────────────────

  /// Abre la app de SMS predeterminada del dispositivo con el destinatario
  /// y el mensaje ya precargados. El usuario solo tiene que pulsar "Enviar".
  ///
  /// Devuelve [SmsLaunchStatus] para que la UI pueda mostrar el error correcto.
  static Future<SmsLaunchStatus> abrirAppSms(String mensaje) async {
    final uri = _construirUri(mensaje);

    try {
      final disponible = await canLaunchUrl(uri);
      if (!disponible) return SmsLaunchStatus.appNoDisponible;

      final abierto = await launchUrl(uri);
      return abierto ? SmsLaunchStatus.exitoso : SmsLaunchStatus.appNoDisponible;
    } catch (_) {
      return SmsLaunchStatus.errorInesperado;
    }
  }
}
