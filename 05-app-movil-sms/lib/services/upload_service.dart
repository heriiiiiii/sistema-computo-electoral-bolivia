import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

/// Envía un PDF en bytes al servidor de la PC mediante HTTP multipart.
/// Devuelve el nombre del archivo guardado en la PC.
class UploadService {
  static Future<String> subirPdf(Uint8List pdfBytes) async {
    final ts = DateTime.now()
        .toIso8601String()
        .replaceAll(':', '-')
        .replaceAll('.', '-')
        .substring(0, 19);
    final fileName = 'acta_$ts.pdf';

    final uri = Uri.parse('${AppConfig.pcServerUrl}/upload');
    final request = http.MultipartRequest('POST', uri)
      ..files.add(
        http.MultipartFile.fromBytes('file', pdfBytes, filename: fileName),
      );

    final response = await request
        .send()
        .timeout(const Duration(seconds: AppConfig.timeoutSeconds));

    if (response.statusCode != 200) {
      throw Exception('Servidor respondió con código ${response.statusCode}');
    }

    return fileName;
  }
}
