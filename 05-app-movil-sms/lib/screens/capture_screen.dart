import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../models/acta_model.dart';
import '../services/offline_queue_service.dart';
import 'confirmation_screen.dart';

/// Pantalla principal: captura de foto del acta + formulario con datos mínimos.
///
/// Flujo:
///   1. El usuario toma una foto con la cámara.
///   2. Se muestra previsualización con opción de repetir.
///   3. El usuario completa los tres campos del formulario.
///   4. Al pulsar "Siguiente" navega a ConfirmationScreen.
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codigoMesaCtrl = TextEditingController();
  final _numeroMesaCtrl = TextEditingController();
  final _codigoRecintoCtrl = TextEditingController();

  File? _imagenSeleccionada;
  int _pendientesEnCola = 0;

  @override
  void initState() {
    super.initState();
    _verificarColaPendiente();
  }

  @override
  void dispose() {
    _codigoMesaCtrl.dispose();
    _numeroMesaCtrl.dispose();
    _codigoRecintoCtrl.dispose();
    super.dispose();
  }

  // Muestra un badge informativo si hay actas guardadas sin enviar
  Future<void> _verificarColaPendiente() async {
    final n = await OfflineQueueService.contarPendientes();
    if (mounted) setState(() => _pendientesEnCola = n);
  }

  /// Abre la cámara y guarda la imagen capturada.
  Future<void> _tomarFoto() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85, // balance calidad/tamaño para el upload
      preferredCameraDevice: CameraDevice.rear,
    );

    if (picked == null) return; // el usuario canceló
    setState(() => _imagenSeleccionada = File(picked.path));
  }

  /// Descarta la foto actual para permitir repetir la captura.
  void _repetirFoto() => setState(() => _imagenSeleccionada = null);

  /// Valida el formulario y navega a la pantalla de confirmación.
  Future<void> _siguiente() async {
    if (_imagenSeleccionada == null) {
      _mostrarSnack('Primero toma una foto del acta.');
      return;
    }
    if (!_formKey.currentState!.validate()) return;

    final acta = ActaModel(
      codigoMesa: _codigoMesaCtrl.text.trim(),
      numeroMesa: _numeroMesaCtrl.text.trim(),
      codigoRecinto: _codigoRecintoCtrl.text.trim(),
      imagePath: _imagenSeleccionada!.path,
      timestamp: DateTime.now(),
    );

    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => ConfirmationScreen(acta: acta)),
    );

    // Al regresar, actualizar el contador de cola por si cambió
    _verificarColaPendiente();
  }

  void _mostrarSnack(String msg) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg), duration: const Duration(seconds: 3)));
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Captura de Acta Electoral'),
        actions: [
          if (_pendientesEnCola > 0)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Chip(
                backgroundColor: Colors.orange[700],
                label: Text(
                  '$_pendientesEnCola pendiente${_pendientesEnCola > 1 ? 's' : ''}',
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                ),
              ),
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _FotoSection(
              imagen: _imagenSeleccionada,
              onTomarFoto: _tomarFoto,
              onRepetirFoto: _repetirFoto,
            ),
            const SizedBox(height: 28),
            _FormularioSection(
              formKey: _formKey,
              codigoMesaCtrl: _codigoMesaCtrl,
              numeroMesaCtrl: _numeroMesaCtrl,
              codigoRecintoCtrl: _codigoRecintoCtrl,
            ),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: _siguiente,
              icon: const Icon(Icons.arrow_forward),
              label: const Text('Siguiente → Revisar'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Widget: sección de foto ────────────────────────────────────────────────

class _FotoSection extends StatelessWidget {
  final File? imagen;
  final VoidCallback onTomarFoto;
  final VoidCallback onRepetirFoto;

  const _FotoSection({
    required this.imagen,
    required this.onTomarFoto,
    required this.onRepetirFoto,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Foto del acta',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: imagen == null
              ? _placeholder(context)
              : _preview(context),
        ),
      ],
    );
  }

  Widget _placeholder(BuildContext context) {
    return GestureDetector(
      onTap: onTomarFoto,
      child: Container(
        height: 220,
        color: Colors.grey[200],
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.camera_alt, size: 60, color: Colors.grey[500]),
            const SizedBox(height: 12),
            Text(
              'Toca para tomar la foto',
              style: TextStyle(color: Colors.grey[600], fontSize: 15),
            ),
          ],
        ),
      ),
    );
  }

  Widget _preview(BuildContext context) {
    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        Image.file(
          imagen!,
          height: 280,
          width: double.infinity,
          fit: BoxFit.cover,
        ),
        // Barra translúcida con botón de repetir
        Container(
          width: double.infinity,
          color: Colors.black54,
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: TextButton.icon(
            onPressed: onRepetirFoto,
            icon: const Icon(Icons.refresh, color: Colors.white),
            label: const Text(
              'Repetir foto',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Widget: formulario de datos mínimos ────────────────────────────────────

class _FormularioSection extends StatelessWidget {
  final GlobalKey<FormState> formKey;
  final TextEditingController codigoMesaCtrl;
  final TextEditingController numeroMesaCtrl;
  final TextEditingController codigoRecintoCtrl;

  const _FormularioSection({
    required this.formKey,
    required this.codigoMesaCtrl,
    required this.numeroMesaCtrl,
    required this.codigoRecintoCtrl,
  });

  @override
  Widget build(BuildContext context) {
    return Form(
      key: formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Datos de la mesa',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 14),
          _campo(
            controller: codigoMesaCtrl,
            label: 'Código de mesa',
            hint: 'Ej: CM-001',
            icono: Icons.qr_code,
            teclado: TextInputType.text,
          ),
          const SizedBox(height: 14),
          _campo(
            controller: numeroMesaCtrl,
            label: 'Número de mesa',
            hint: 'Ej: 42',
            icono: Icons.table_chart,
            teclado: TextInputType.number,
          ),
          const SizedBox(height: 14),
          _campo(
            controller: codigoRecintoCtrl,
            label: 'Código de recinto',
            hint: 'Ej: RC-005',
            icono: Icons.location_on,
            teclado: TextInputType.text,
          ),
        ],
      ),
    );
  }

  Widget _campo({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icono,
    required TextInputType teclado,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: teclado,
      textInputAction: TextInputAction.next,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icono),
      ),
      // Validación mínima: campo obligatorio. El backend decide el resto.
      validator: (v) =>
          (v == null || v.trim().isEmpty) ? 'Este campo es obligatorio' : null,
    );
  }
}
