import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/acta_model.dart';
import 'api_service.dart';

/// Resumen del intento de procesar la cola pendiente.
class QueueProcessResult {
  final int enviados;
  final int pendientes;
  final int descartados; // imágenes ya no disponibles

  const QueueProcessResult({
    required this.enviados,
    required this.pendientes,
    required this.descartados,
  });
}

/// Gestiona la cola de actas pendientes de envío cuando no hay conexión.
///
/// Las actas se guardan como JSON en SharedPreferences.
/// Las imágenes se copian al directorio Documents del dispositivo para
/// sobrevivir reinicios de la app (el directorio de caché puede limpiarse).
class OfflineQueueService {
  static const _queueKey = 'pending_actas_queue';

  /// Copia la imagen al directorio persistente y agrega el acta a la cola.
  static Future<void> encolar(ActaModel acta) async {
    // Mover imagen a Documents/ para que no desaparezca del caché
    final persistedPath = await _copiarImagenADocuments(acta.imagePath);
    final actaPersistida = acta.copyWithImagePath(persistedPath);

    final prefs = await SharedPreferences.getInstance();
    final cola = await _leerCola(prefs);
    cola.add(actaPersistida.toJson());
    await prefs.setString(_queueKey, jsonEncode(cola));
  }

  /// Intenta enviar todas las actas en cola.
  /// Las que fallan vuelven a la cola; las que ya no tienen imagen se descartan.
  static Future<QueueProcessResult> procesarCola() async {
    final prefs = await SharedPreferences.getInstance();
    final cola = await _leerCola(prefs);

    if (cola.isEmpty) {
      return const QueueProcessResult(
          enviados: 0, pendientes: 0, descartados: 0);
    }

    final pendientes = <Map<String, dynamic>>[];
    int enviados = 0;
    int descartados = 0;

    for (final item in cola) {
      final acta = ActaModel.fromJson(item);

      // Si la imagen fue borrada externamente, descartar silenciosamente
      if (!File(acta.imagePath).existsSync()) {
        descartados++;
        continue;
      }

      try {
        await ApiService.enviarActa(acta);
        // Eliminar imagen persistida tras envío exitoso para liberar espacio
        _eliminarImagenSiExiste(acta.imagePath);
        enviados++;
      } catch (_) {
        // Fallo de red o servidor: mantener en cola para el próximo intento
        pendientes.add(item);
      }
    }

    await prefs.setString(_queueKey, jsonEncode(pendientes));
    return QueueProcessResult(
      enviados: enviados,
      pendientes: pendientes.length,
      descartados: descartados,
    );
  }

  /// Devuelve cuántas actas hay pendientes de envío.
  static Future<int> contarPendientes() async {
    final prefs = await SharedPreferences.getInstance();
    final cola = await _leerCola(prefs);
    return cola.length;
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  static Future<List<Map<String, dynamic>>> _leerCola(
      SharedPreferences prefs) async {
    final raw = prefs.getString(_queueKey);
    if (raw == null || raw.isEmpty) return [];
    return List<Map<String, dynamic>>.from(jsonDecode(raw) as List);
  }

  /// Copia la imagen al directorio Documents/ con un nombre único basado en
  /// la marca de tiempo, para evitar colisiones entre actas.
  static Future<String> _copiarImagenADocuments(String sourcePath) async {
    final docsDir = await getApplicationDocumentsDirectory();
    final destName = 'acta_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final destPath = p.join(docsDir.path, destName);

    // Si ya está en Documents/ no copiar de nuevo
    if (sourcePath.startsWith(docsDir.path)) return sourcePath;

    await File(sourcePath).copy(destPath);
    return destPath;
  }

  static void _eliminarImagenSiExiste(String path) {
    final file = File(path);
    if (file.existsSync()) file.deleteSync();
  }
}
