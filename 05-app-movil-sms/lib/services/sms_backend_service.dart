import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class SmsBackendService {
  static Future<bool> sendSmsCopyToBackend(String smsMessage) async {
    final result = await registrar(smsMessage);
    return result.ok;
  }

  static Future<SmsBackendResult> registrar(String mensajeSms) async {
    try {
      final uri = Uri.parse(AppConfig.smsWebhookUrl);
      final response = await http
          .post(
            uri,
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
            },
            body: jsonEncode({
              'from': AppConfig.delegateNumber,
              'message': mensajeSms,
              'fuente': 'APP_MOVIL_SMS',
              'canal': 'SMS_APP_MOVIL',
              'moduloOrigen': '05-app-movil-sms',
            }),
          )
          .timeout(const Duration(seconds: 10));

      final data = _decodeResponse(response.body);
      final backendAccepted = data['success'] != false && data['ok'] != false;

      if (response.statusCode >= 200 &&
          response.statusCode < 300 &&
          backendAccepted) {
        return SmsBackendResult.exito;
      }

      return SmsBackendResult.rechazado(
        data['error']?.toString() ??
            data['message']?.toString() ??
            'HTTP ${response.statusCode}',
      );
    } on Exception catch (e) {
      final msg = e.toString().toLowerCase();
      if (msg.contains('timeout') || msg.contains('socket')) {
        return SmsBackendResult.sinConexion;
      }
      return SmsBackendResult.rechazado(e.toString());
    }
  }

  static Map<String, dynamic> _decodeResponse(String body) {
    if (body.isEmpty) return const {};

    final decoded = jsonDecode(body);
    if (decoded is Map<String, dynamic>) return decoded;
    return {'raw': decoded};
  }
}

enum _Tipo { exito, sinConexion, rechazado }

class SmsBackendResult {
  final _Tipo _tipo;
  final String? detalle;

  const SmsBackendResult._(_Tipo tipo, [this.detalle]) : _tipo = tipo;

  static const exito = SmsBackendResult._(_Tipo.exito);
  static const sinConexion = SmsBackendResult._(_Tipo.sinConexion);
  static SmsBackendResult rechazado(String detalle) =>
      SmsBackendResult._(_Tipo.rechazado, detalle);

  bool get ok => _tipo == _Tipo.exito;
  bool get esSinConexion => _tipo == _Tipo.sinConexion;

  String get mensaje => switch (_tipo) {
        _Tipo.exito => 'Copia enviada al backend',
        _Tipo.sinConexion => 'No se pudo enviar copia HTTP',
        _Tipo.rechazado => detalle ?? 'Copia HTTP rechazada',
      };
}
