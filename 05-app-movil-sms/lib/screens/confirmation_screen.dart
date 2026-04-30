import 'dart:io';
import 'package:flutter/material.dart';
import '../models/acta_model.dart';
import '../services/api_service.dart';
import '../services/offline_queue_service.dart';
import '../utils/connectivity_helper.dart';
import 'result_screen.dart' show ResultScreen, EnvioStatus;

/// Pantalla de confirmación: muestra foto y datos antes del envío final.
///
/// Flujo:
///   1. Usuario revisa previsualización + datos.
///   2. Pulsa "Enviar" → se verifica conectividad.
///      - Con red: intenta envío HTTP. Navega a ResultScreen con éxito/error.
///      - Sin red: guarda en cola offline y navega a ResultScreen (offline).
///   3. Puede regresar a editar con la flecha atrás.
class ConfirmationScreen extends StatefulWidget {
  final ActaModel acta;

  const ConfirmationScreen({super.key, required this.acta});

  @override
  State<ConfirmationScreen> createState() => _ConfirmationScreenState();
}

class _ConfirmationScreenState extends State<ConfirmationScreen> {
  bool _enviando = false;

  Future<void> _enviar() async {
    setState(() => _enviando = true);

    try {
      final hayRed = await ConnectivityHelper.isConnected();

      if (!hayRed) {
        // Sin conexión: guardar en cola y mostrar resultado offline
        await OfflineQueueService.encolar(widget.acta);
        _irAResultado(EnvioStatus.offline);
        return;
      }

      // Con conexión: intentar envío directo
      await ApiService.enviarActa(widget.acta);
      _irAResultado(EnvioStatus.exitoso);
    } on ApiException catch (e) {
      // El backend respondió con error (4xx/5xx)
      _irAResultado(EnvioStatus.errorServidor, detalle: e.message);
    } catch (e) {
      // Error de red (sin conexión al momento del envío, timeout, etc.)
      _irAResultado(EnvioStatus.errorRed, detalle: e.toString());
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _irAResultado(EnvioStatus status, {String? detalle}) {
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => ResultScreen(
          acta: widget.acta,
          status: status,
          detalle: detalle,
        ),
      ),
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Scaffold(
          appBar: AppBar(
            title: const Text('Confirmar envío'),
            leading: _enviando
                ? const SizedBox.shrink() // deshabilitar retroceso durante envío
                : null,
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _previsualizacion(),
                const SizedBox(height: 24),
                _resumenDatos(),
                const SizedBox(height: 16),
                const _AvísoLegal(),
                const SizedBox(height: 32),
                ElevatedButton.icon(
                  onPressed: _enviando ? null : _enviar,
                  icon: const Icon(Icons.send),
                  label: const Text('Enviar acta'),
                ),
              ],
            ),
          ),
        ),
        // Overlay de carga superpuesto a toda la pantalla
        if (_enviando) const _LoadingOverlay(),
      ],
    );
  }

  Widget _previsualizacion() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Foto del acta',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.file(
            File(widget.acta.imagePath),
            width: double.infinity,
            height: 240,
            fit: BoxFit.cover,
          ),
        ),
      ],
    );
  }

  Widget _resumenDatos() {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Datos registrados',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
            ),
            const Divider(height: 20),
            _fila('Código de mesa', widget.acta.codigoMesa),
            const SizedBox(height: 8),
            _fila('Número de mesa', widget.acta.numeroMesa),
            const SizedBox(height: 8),
            _fila('Código de recinto', widget.acta.codigoRecinto),
            const SizedBox(height: 8),
            _fila(
              'Fecha y hora',
              _formatearFecha(widget.acta.timestamp),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fila(String etiqueta, String valor) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 150,
          child: Text(
            etiqueta,
            style: const TextStyle(color: Colors.black54, fontSize: 13),
          ),
        ),
        Expanded(
          child: Text(
            valor,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
        ),
      ],
    );
  }

  String _formatearFecha(DateTime dt) {
    return '${dt.day.toString().padLeft(2, '0')}/'
        '${dt.month.toString().padLeft(2, '0')}/'
        '${dt.year}  '
        '${dt.hour.toString().padLeft(2, '0')}:'
        '${dt.minute.toString().padLeft(2, '0')}';
  }
}

// ── Widgets auxiliares ─────────────────────────────────────────────────────

class _AvísoLegal extends StatelessWidget {
  const _AvísoLegal();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blue[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue[200]!),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, color: Colors.blue, size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Al enviar, la foto y los datos se transmitirán al sistema de '
              'cómputo electoral. La validación final la realiza el servidor.',
              style: TextStyle(fontSize: 13, color: Colors.black87),
            ),
          ),
        ],
      ),
    );
  }
}

class _LoadingOverlay extends StatelessWidget {
  const _LoadingOverlay();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black45,
      child: const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 40, vertical: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 18),
                Text('Enviando acta…', style: TextStyle(fontSize: 15)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
