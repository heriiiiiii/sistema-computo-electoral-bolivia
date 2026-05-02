import 'dart:io';
import 'package:flutter/material.dart';
import '../models/acta_model.dart';
import '../services/offline_queue_service.dart';
import '../utils/connectivity_helper.dart';
import 'capture_screen.dart';

/// Estados posibles del resultado de un envío.
enum EnvioStatus {
  exitoso,
  offline,        // sin conexión, guardado en cola
  errorServidor,  // el backend respondió con 4xx/5xx
  errorRed,       // timeout, socket cerrado, etc.
}

/// Pantalla de resultado: muestra éxito, error o modo offline.
///
/// - Éxito: icono verde + resumen. Botón para capturar un nuevo acta.
/// - Offline: icono azul + aviso de cola. Botón para reintentar ahora o
///   capturar otro acta. Escucha reconexión automáticamente.
/// - Error (servidor/red): icono rojo + mensaje. Botón de reintento que
///   vuelve a intentar el mismo envío o guarda en cola si persiste sin red.
class ResultScreen extends StatefulWidget {
  final ActaModel acta;
  final EnvioStatus status;
  final String? detalle;

  const ResultScreen({
    super.key,
    required this.acta,
    required this.status,
    this.detalle,
  });

  @override
  State<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends State<ResultScreen> {
  bool _reintentando = false;

  @override
  void initState() {
    super.initState();
    // Si estamos en modo offline o error de red, escuchar reconexión
    if (widget.status == EnvioStatus.offline ||
        widget.status == EnvioStatus.errorRed) {
      _escucharReconexion();
    }
  }

  /// Cuando se recupera la red, procesa automáticamente la cola pendiente.
  void _escucharReconexion() {
    ConnectivityHelper.onConnectivityChanged.listen((hayRed) async {
      if (!hayRed || !mounted) return;
      final resultado = await OfflineQueueService.procesarCola();
      if (!mounted) return;
      if (resultado.enviados > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                '${resultado.enviados} acta(s) enviada(s) automáticamente al recuperar la red.'),
            backgroundColor: Colors.green[700],
          ),
        );
      }
    });
  }

  /// Reintenta el envío del acta actual (no la cola completa).
  Future<void> _reintentar() async {
    setState(() => _reintentando = true);
    try {
      final hayRed = await ConnectivityHelper.isConnected();

      if (!hayRed) {
        // Aún sin red: encolar si no estaba ya en cola
        if (widget.status != EnvioStatus.offline) {
          await OfflineQueueService.encolar(widget.acta);
        }
        _mostrarSnack('Sin conexión. El acta se enviará cuando vuelva la red.');
        return;
      }

      // Con red: intentar la cola completa (incluye el acta actual si fue encolada)
      final resultado = await OfflineQueueService.procesarCola();
      if (resultado.enviados > 0) {
        _mostrarSnack('¡Enviado correctamente!');
        // Regresar a captura como si hubiera sido exitoso
        if (mounted) {
          Navigator.pushAndRemoveUntil(
            context,
            MaterialPageRoute(builder: (_) => const CaptureScreen()),
            (_) => false,
          );
        }
      } else {
        _mostrarSnack('No se pudo enviar. Intenta de nuevo más tarde.');
      }
    } finally {
      if (mounted) setState(() => _reintentando = false);
    }
  }

  void _nuevaCaptura() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const CaptureScreen()),
      (_) => false,
    );
  }

  void _mostrarSnack(String msg) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg), duration: const Duration(seconds: 3)));
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Resultado del envío')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _StatusCard(status: widget.status, detalle: widget.detalle),
            const SizedBox(height: 24),
            _MiniPreview(acta: widget.acta),
            const SizedBox(height: 32),
            _botones(),
          ],
        ),
      ),
    );
  }

  Widget _botones() {
    switch (widget.status) {
      case EnvioStatus.exitoso:
        return ElevatedButton.icon(
          onPressed: _nuevaCaptura,
          icon: const Icon(Icons.add_a_photo),
          label: const Text('Capturar otro acta'),
        );

      case EnvioStatus.offline:
      case EnvioStatus.errorRed:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ElevatedButton.icon(
              onPressed: _reintentando ? null : _reintentar,
              icon: _reintentando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.refresh),
              label: Text(_reintentando ? 'Reintentando…' : 'Reintentar ahora'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _nuevaCaptura,
              icon: const Icon(Icons.add_a_photo),
              label: const Text('Capturar otro acta'),
            ),
          ],
        );

      case EnvioStatus.errorServidor:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ElevatedButton.icon(
              onPressed: _reintentando ? null : _reintentar,
              icon: const Icon(Icons.refresh),
              label: const Text('Guardar en cola y reintentar'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _nuevaCaptura,
              icon: const Icon(Icons.add_a_photo),
              label: const Text('Capturar otro acta'),
            ),
          ],
        );
    }
  }
}

// ── Widgets auxiliares ─────────────────────────────────────────────────────

/// Tarjeta de estado con color e icono según el resultado.
class _StatusCard extends StatelessWidget {
  final EnvioStatus status;
  final String? detalle;

  const _StatusCard({required this.status, this.detalle});

  @override
  Widget build(BuildContext context) {
    final config = _config();
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: config.bgColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: config.borderColor),
      ),
      child: Column(
        children: [
          Icon(config.icono, size: 56, color: config.iconColor),
          const SizedBox(height: 14),
          Text(
            config.titulo,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: config.iconColor,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            config.descripcion,
            style: const TextStyle(fontSize: 14, color: Colors.black87),
            textAlign: TextAlign.center,
          ),
          if (detalle != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.black12,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                detalle!,
                style: const TextStyle(fontSize: 12, color: Colors.black54),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ],
      ),
    );
  }

  _StatusConfig _config() {
    switch (status) {
      case EnvioStatus.exitoso:
        return _StatusConfig(
          icono: Icons.check_circle,
          iconColor: Colors.green[700]!,
          bgColor: Colors.green[50]!,
          borderColor: Colors.green[200]!,
          titulo: 'Acta enviada correctamente',
          descripcion: 'El acta fue recibida por el servidor y será procesada.',
        );
      case EnvioStatus.offline:
        return _StatusConfig(
          icono: Icons.cloud_off,
          iconColor: Colors.blue[700]!,
          bgColor: Colors.blue[50]!,
          borderColor: Colors.blue[200]!,
          titulo: 'Sin conexión — Guardada en cola',
          descripcion:
              'El acta está guardada localmente. Se enviará automáticamente '
              'cuando se recupere la conexión.',
        );
      case EnvioStatus.errorRed:
        return _StatusConfig(
          icono: Icons.wifi_off,
          iconColor: Colors.orange[800]!,
          bgColor: Colors.orange[50]!,
          borderColor: Colors.orange[200]!,
          titulo: 'Error de conexión',
          descripcion:
              'No se pudo completar el envío. Revisa tu red o reintenta más tarde.',
        );
      case EnvioStatus.errorServidor:
        return _StatusConfig(
          icono: Icons.error,
          iconColor: Colors.red[700]!,
          bgColor: Colors.red[50]!,
          borderColor: Colors.red[200]!,
          titulo: 'Error del servidor',
          descripcion:
              'El servidor no pudo procesar el acta. Guárdala en cola para reintentarlo.',
        );
    }
  }
}

class _StatusConfig {
  final IconData icono;
  final Color iconColor;
  final Color bgColor;
  final Color borderColor;
  final String titulo;
  final String descripcion;

  const _StatusConfig({
    required this.icono,
    required this.iconColor,
    required this.bgColor,
    required this.borderColor,
    required this.titulo,
    required this.descripcion,
  });
}

/// Miniatura del acta con resumen de datos, sin foto grande.
class _MiniPreview extends StatelessWidget {
  final ActaModel acta;

  const _MiniPreview({required this.acta});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(
                File(acta.imagePath),
                width: 80,
                height: 80,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _linea('Cód. mesa', acta.codigoMesa),
                  _linea('N° mesa', acta.numeroMesa),
                  _linea('Recinto', acta.codigoRecinto),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _linea(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(fontSize: 13, color: Colors.black87),
          children: [
            TextSpan(
              text: '$label: ',
              style: const TextStyle(color: Colors.black54),
            ),
            TextSpan(
              text: value,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}
