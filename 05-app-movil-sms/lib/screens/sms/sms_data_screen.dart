import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../models/sms_acta_model.dart';
import '../../validators/sms_validator.dart';
import 'sms_preview_screen.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// PASO 1 del flujo SMS — Captura de datos y foto
///
/// Flujo completo de esta pantalla:
///   a) El usuario fotografía el acta con la cámara (obligatorio).
///   b) Puede revisar la foto y repetirla si no es nítida.
///   c) Completa los tres campos del formulario.
///   d) Pulsa "Generar SMS" → se validan todos los campos juntos.
///   e) Si hay errores: se muestran inline en cada campo y en un banner.
///   f) Si todo es válido: se construye [SmsActaModel] y navega a
///      [SmsPreviewScreen] con el modelo ya listo.
///
/// Esta pantalla NO genera ni envía ningún mensaje. Solo recopila datos.
/// ─────────────────────────────────────────────────────────────────────────────
class SmsDataScreen extends StatefulWidget {
  const SmsDataScreen({super.key});

  @override
  State<SmsDataScreen> createState() => _SmsDataScreenState();
}

class _SmsDataScreenState extends State<SmsDataScreen> {
  // ── Controladores de texto ─────────────────────────────────────────────────
  final _codigoMesaCtrl = TextEditingController();
  final _numeroMesaCtrl = TextEditingController();
  final _codigoRecintoCtrl = TextEditingController();

  // ── Estado de la foto ──────────────────────────────────────────────────────
  File? _foto;

  // ── Errores de validación (null = sin error) ───────────────────────────────
  // Se guardan en estado para mostrarlos inline en cada campo.
  String? _errorCodigoMesa;
  String? _errorNumeroMesa;
  String? _errorCodigoRecinto;
  String? _errorFoto;

  @override
  void dispose() {
    _codigoMesaCtrl.dispose();
    _numeroMesaCtrl.dispose();
    _codigoRecintoCtrl.dispose();
    super.dispose();
  }

  // ── Acciones ───────────────────────────────────────────────────────────────

  /// Abre la cámara trasera y guarda la imagen capturada.
  Future<void> _tomarFoto() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      preferredCameraDevice: CameraDevice.rear,
    );
    if (picked == null) return; // usuario canceló

    setState(() {
      _foto = File(picked.path);
      _errorFoto = null; // limpiar error de foto si ya había uno
    });
  }

  void _repetirFoto() => setState(() => _foto = null);

  /// Paso central: valida, construye el modelo y navega a la pantalla de preview.
  void _generarSms() {
    // 1. Validar todos los campos de una vez (ver SmsValidator)
    final resultado = SmsValidator.validarFormulario(
      codigoMesa: _codigoMesaCtrl.text,
      numeroMesa: _numeroMesaCtrl.text,
      codigoRecinto: _codigoRecintoCtrl.text,
      imagePath: _foto?.path,
    );

    // 2. Si hay errores, actualizar estado y abortar navegación
    if (!resultado.esValido) {
      setState(() {
        _errorCodigoMesa = resultado.codigoMesaError;
        _errorNumeroMesa = resultado.numeroMesaError;
        _errorCodigoRecinto = resultado.codigoRecintoError;
        _errorFoto = resultado.fotoError;
      });
      return;
    }

    // 3. Todo válido → construir el modelo de datos
    final acta = SmsActaModel(
      codigoMesa: _codigoMesaCtrl.text.trim(),
      numeroMesa: _numeroMesaCtrl.text.trim(),
      codigoRecinto: _codigoRecintoCtrl.text.trim(),
      imagePath: _foto!.path,
      timestamp: DateTime.now(),
    );

    // 4. Navegar a SmsPreviewScreen — a partir de aquí el flujo es de solo lectura
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => SmsPreviewScreen(acta: acta)),
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Registro por SMS')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Banner informativo del flujo
            _InfoBanner(),
            const SizedBox(height: 20),

            // Sección: foto del acta (obligatoria)
            _FotoSection(
              foto: _foto,
              error: _errorFoto,
              onTomarFoto: _tomarFoto,
              onRepetirFoto: _repetirFoto,
            ),
            const SizedBox(height: 24),

            // Sección: formulario de datos mínimos
            _FormularioSection(
              codigoMesaCtrl: _codigoMesaCtrl,
              numeroMesaCtrl: _numeroMesaCtrl,
              codigoRecintoCtrl: _codigoRecintoCtrl,
              errorCodigoMesa: _errorCodigoMesa,
              errorNumeroMesa: _errorNumeroMesa,
              errorCodigoRecinto: _errorCodigoRecinto,
              // Limpiar error del campo cuando el usuario empieza a editar
              onCodigoMesaChanged: (_) => setState(() => _errorCodigoMesa = null),
              onNumeroMesaChanged: (_) => setState(() => _errorNumeroMesa = null),
              onCodigoRecintoChanged: (_) =>
                  setState(() => _errorCodigoRecinto = null),
            ),
            const SizedBox(height: 32),

            ElevatedButton.icon(
              onPressed: _generarSms,
              icon: const Icon(Icons.sms),
              label: const Text('Generar SMS →'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Widgets internos ──────────────────────────────────────────────────────────

class _InfoBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.teal[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.teal.shade200),
      ),
      child: const Row(
        children: [
          Icon(Icons.wifi_off, color: Colors.teal, size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Modo sin conexión — El mensaje se enviará desde tu app de SMS.',
              style: TextStyle(fontSize: 13, color: Colors.black87),
            ),
          ),
        ],
      ),
    );
  }
}

class _FotoSection extends StatelessWidget {
  final File? foto;
  final String? error;
  final VoidCallback onTomarFoto;
  final VoidCallback onRepetirFoto;

  const _FotoSection({
    required this.foto,
    required this.error,
    required this.onTomarFoto,
    required this.onRepetirFoto,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              'Foto del acta',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
            ),
            const SizedBox(width: 6),
            Text(
              '(obligatoria)',
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: foto == null ? _placeholder() : _preview(),
        ),
        // Mensaje de error de foto
        if (error != null) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(Icons.error_outline, size: 14, color: Colors.red[700]),
              const SizedBox(width: 4),
              Text(
                error!,
                style: TextStyle(fontSize: 12, color: Colors.red[700]),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _placeholder() {
    return GestureDetector(
      onTap: onTomarFoto,
      child: Container(
        height: 200,
        color: Colors.grey[100],
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.camera_alt, size: 52, color: Colors.grey[400]),
            const SizedBox(height: 10),
            Text(
              'Toca para fotografiar el acta',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _preview() {
    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        Image.file(foto!, height: 240, width: double.infinity, fit: BoxFit.cover),
        Container(
          width: double.infinity,
          color: Colors.black54,
          child: TextButton.icon(
            onPressed: onRepetirFoto,
            icon: const Icon(Icons.refresh, color: Colors.white, size: 18),
            label: const Text('Repetir foto', style: TextStyle(color: Colors.white)),
          ),
        ),
      ],
    );
  }
}

class _FormularioSection extends StatelessWidget {
  final TextEditingController codigoMesaCtrl;
  final TextEditingController numeroMesaCtrl;
  final TextEditingController codigoRecintoCtrl;
  final String? errorCodigoMesa;
  final String? errorNumeroMesa;
  final String? errorCodigoRecinto;
  final ValueChanged<String> onCodigoMesaChanged;
  final ValueChanged<String> onNumeroMesaChanged;
  final ValueChanged<String> onCodigoRecintoChanged;

  const _FormularioSection({
    required this.codigoMesaCtrl,
    required this.numeroMesaCtrl,
    required this.codigoRecintoCtrl,
    required this.errorCodigoMesa,
    required this.errorNumeroMesa,
    required this.errorCodigoRecinto,
    required this.onCodigoMesaChanged,
    required this.onNumeroMesaChanged,
    required this.onCodigoRecintoChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Datos de la mesa',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
        ),
        const SizedBox(height: 14),
        _campo(
          controller: codigoMesaCtrl,
          label: 'Código de mesa',
          hint: 'Ej: CM-001',
          icono: Icons.qr_code,
          errorText: errorCodigoMesa,
          teclado: TextInputType.text,
          onChanged: onCodigoMesaChanged,
        ),
        const SizedBox(height: 14),
        _campo(
          controller: numeroMesaCtrl,
          label: 'Número de mesa',
          hint: 'Ej: 42',
          icono: Icons.table_chart,
          errorText: errorNumeroMesa,
          teclado: TextInputType.number,
          onChanged: onNumeroMesaChanged,
        ),
        const SizedBox(height: 14),
        _campo(
          controller: codigoRecintoCtrl,
          label: 'Código de recinto',
          hint: 'Ej: RC-005',
          icono: Icons.location_on,
          errorText: errorCodigoRecinto,
          teclado: TextInputType.text,
          onChanged: onCodigoRecintoChanged,
        ),
      ],
    );
  }

  Widget _campo({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icono,
    required String? errorText,
    required TextInputType teclado,
    required ValueChanged<String> onChanged,
  }) {
    return TextField(
      controller: controller,
      keyboardType: teclado,
      textInputAction: TextInputAction.next,
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icono),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        filled: true,
        fillColor: Colors.grey[50],
        // Mostrar error directamente en el campo sin necesitar Form/FormField
        errorText: errorText,
        errorStyle: const TextStyle(fontSize: 12),
      ),
    );
  }
}
