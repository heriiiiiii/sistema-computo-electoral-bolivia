import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../config/app_config.dart';
import '../models/acta_model.dart';

/// Resultado del envío al backend.
class EnvioResult {
  final bool exitoso;
  final String mensaje;
  final int? statusCode;

  const EnvioResult({
    required this.exitoso,
    required this.mensaje,
    this.statusCode,
  });
}

/// Encapsula toda la comunicación HTTP con el backend.
/// El backend es responsable de validar, procesar e integrar la foto al PDF.
class ApiService {
  /// Envía el acta (foto + campos) al endpoint POST /api/rrv/actas.
  /// Lanza [ApiException] si el servidor responde con error 4xx/5xx.
  /// Lanza [SocketException] o [TimeoutException] si no hay conectividad.
  static Future<EnvioResult> enviarActa(ActaModel acta) async {
    final uri = Uri.parse('${AppConfig.pcServerUrl}${AppConfig.actasEndpoint}');
    final request = http.MultipartRequest('POST', uri);

    // Campos de texto del formulario
    request.fields['codigoMesa'] = acta.codigoMesa;
    request.fields['numeroMesa'] = acta.numeroMesa;
    request.fields['codigoRecinto'] = acta.codigoRecinto;
    request.fields['timestamp'] = acta.timestamp.toIso8601String();

    // Archivo de imagen (multipart)
    final imageFile = File(acta.imagePath);
    request.files.add(
      await http.MultipartFile.fromPath(
        'foto', // nombre del campo en el backend
        imageFile.path,
        contentType: MediaType('image', 'jpeg'),
      ),
    );

    final streamed = await request.send().timeout(
      Duration(seconds: AppConfig.timeoutSeconds),
      onTimeout: () => throw const ApiException(
        'Tiempo de espera agotado. Verifica tu conexión.',
        408,
      ),
    );

    final response = await http.Response.fromStream(streamed);

    if (response.statusCode == 200 || response.statusCode == 201) {
      return const EnvioResult(
        exitoso: true,
        mensaje: 'Acta enviada correctamente.',
      );
    }

    // El backend rechazó la solicitud; no es un error de red
    throw ApiException(
      'El servidor rechazó el envío (${response.statusCode}).',
      response.statusCode,
    );
  }
}

/// Error devuelto por el backend con un código HTTP conocido.
class ApiException implements Exception {
  final String message;
  final int statusCode;

  const ApiException(this.message, this.statusCode);

  @override
  String toString() => message;
}
