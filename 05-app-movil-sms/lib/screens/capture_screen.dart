import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../config/app_config.dart';
import '../services/pdf_service.dart';
import '../services/upload_service.dart';

enum _Estado { inicial, previsualizando, enviando, exito, error }

class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  _Estado _estado = _Estado.inicial;
  File? _foto;
  String? _archivoGuardado;
  String? _mensajeError;

  Future<void> _tomarFoto() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 90,
      preferredCameraDevice: CameraDevice.rear,
    );
    if (picked == null) return;
    setState(() {
      _foto = File(picked.path);
      _estado = _Estado.previsualizando;
    });
  }

  Future<void> _enviar() async {
    if (_foto == null) return;
    setState(() {
      _estado = _Estado.enviando;
      _mensajeError = null;
    });
    try {
      final pdfBytes = await PdfService.imagenAPdf(_foto!);
      final archivo = await UploadService.subirPdf(pdfBytes);
      if (!mounted) return;
      setState(() {
        _estado = _Estado.exito;
        _archivoGuardado = archivo;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _estado = _Estado.error;
        _mensajeError = _formatearError(e);
      });
    }
  }

  void _nuevaFoto() => setState(() {
        _estado = _Estado.inicial;
        _foto = null;
        _archivoGuardado = null;
        _mensajeError = null;
      });

  String _formatearError(dynamic e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('socketexception') || msg.contains('connection refused')) {
      return 'No se pudo conectar al servidor.\n\n'
          'Verifica:\n'
          '• PC encendida y servidor corriendo\n'
          '• Celular y PC en la misma red WiFi\n'
          '• IP configurada: ${AppConfig.pcServerUrl}';
    }
    if (msg.contains('timeout')) {
      return 'Tiempo de espera agotado.\n\n'
          'Verifica que el celular y la PC estén\nen la misma red WiFi.';
    }
    return 'Error inesperado:\n${e.toString()}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Enviar acta al servidor')),
      body: switch (_estado) {
        _Estado.inicial => _VistaInicial(onTomarFoto: _tomarFoto),
        _Estado.previsualizando => _VistaPreview(
            foto: _foto!,
            onEnviar: _enviar,
            onRepetir: _tomarFoto,
          ),
        _Estado.enviando => const _VistaEnviando(),
        _Estado.exito => _VistaExito(
            archivo: _archivoGuardado!,
            onNueva: _nuevaFoto,
          ),
        _Estado.error => _VistaError(
            mensaje: _mensajeError!,
            onReintentar: _enviar,
            onNueva: _nuevaFoto,
          ),
      },
    );
  }
}

// ── Estado: inicial ───────────────────────────────────────────────────────────

class _VistaInicial extends StatelessWidget {
  final VoidCallback onTomarFoto;
  const _VistaInicial({required this.onTomarFoto});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: const Color(0xFF1A237E).withOpacity(0.08),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.camera_alt_outlined,
                size: 60,
                color: Color(0xFF1A237E),
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              'Capturar acta electoral',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              'La foto se convierte a PDF y se envía\nautomáticamente por WiFi a la PC.',
              style: TextStyle(fontSize: 14, color: Colors.grey[600]),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 40),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                onPressed: onTomarFoto,
                icon: const Icon(Icons.camera_alt, size: 24),
                label: const Text('Abrir cámara', style: TextStyle(fontSize: 16)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1A237E),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Servidor: ${AppConfig.pcServerUrl}',
              style: TextStyle(fontSize: 11, color: Colors.grey[400]),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Estado: previsualización ──────────────────────────────────────────────────

class _VistaPreview extends StatelessWidget {
  final File foto;
  final VoidCallback onEnviar;
  final VoidCallback onRepetir;
  const _VistaPreview({
    required this.foto,
    required this.onEnviar,
    required this.onRepetir,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.file(foto, fit: BoxFit.contain),
              Positioned(
                top: 12,
                right: 12,
                child: TextButton.icon(
                  onPressed: onRepetir,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Repetir'),
                  style: TextButton.styleFrom(
                    backgroundColor: Colors.black54,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(24),
          child: SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton.icon(
              onPressed: onEnviar,
              icon: const Icon(Icons.send, size: 22),
              label: const Text(
                'Convertir a PDF y enviar',
                style: TextStyle(fontSize: 16),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1A237E),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Estado: enviando ──────────────────────────────────────────────────────────

class _VistaEnviando extends StatelessWidget {
  const _VistaEnviando();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(color: Color(0xFF1A237E), strokeWidth: 3),
          SizedBox(height: 28),
          Text('Convirtiendo a PDF...', style: TextStyle(fontSize: 16)),
          SizedBox(height: 8),
          Text(
            'Enviando al servidor...',
            style: TextStyle(fontSize: 14, color: Colors.grey),
          ),
        ],
      ),
    );
  }
}

// ── Estado: éxito ─────────────────────────────────────────────────────────────

class _VistaExito extends StatelessWidget {
  final String archivo;
  final VoidCallback onNueva;
  const _VistaExito({required this.archivo, required this.onNueva});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle, size: 90, color: Color(0xFF2E7D32)),
            const SizedBox(height: 24),
            const Text(
              'Acta enviada correctamente',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey[100],
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Archivo guardado:',
                      style: TextStyle(fontSize: 12, color: Colors.grey)),
                  const SizedBox(height: 4),
                  Text(archivo,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 12),
                  const Text('Ubicación en la PC:',
                      style: TextStyle(fontSize: 12, color: Colors.grey)),
                  const SizedBox(height: 4),
                  Text(AppConfig.pcSaveDir,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 12)),
                ],
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: onNueva,
                icon: const Icon(Icons.camera_alt),
                label: const Text('Enviar otra acta'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1A237E),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Estado: error ─────────────────────────────────────────────────────────────

class _VistaError extends StatelessWidget {
  final String mensaje;
  final VoidCallback onReintentar;
  final VoidCallback onNueva;
  const _VistaError({
    required this.mensaje,
    required this.onReintentar,
    required this.onNueva,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 80, color: Color(0xFFC62828)),
            const SizedBox(height: 20),
            const Text(
              'Error al enviar',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFFC62828),
              ),
            ),
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFFFEBEE),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                mensaje,
                style: const TextStyle(fontSize: 14),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: onReintentar,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar envío'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1A237E),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextButton.icon(
              onPressed: onNueva,
              icon: const Icon(Icons.camera_alt),
              label: const Text('Nueva foto'),
            ),
          ],
        ),
      ),
    );
  }
}
