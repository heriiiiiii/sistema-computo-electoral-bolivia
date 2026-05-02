import 'package:flutter/material.dart';
import '../../config/app_config.dart';
import '../../models/sms_acta_model.dart';
import '../../services/sms_service.dart';
import '../../services/sms_backend_service.dart';

enum _RegistroEstado { inicial, cargando, exito, error }

class SmsPreviewScreen extends StatefulWidget {
  final SmsActaModel acta;
  const SmsPreviewScreen({super.key, required this.acta});

  @override
  State<SmsPreviewScreen> createState() => _SmsPreviewScreenState();
}

class _SmsPreviewScreenState extends State<SmsPreviewScreen> {
  late final String _mensajeGenerado;
  bool _abriendo = false;
  _RegistroEstado _registro = _RegistroEstado.inicial;
  String? _registroError;

  @override
  void initState() {
    super.initState();
    _mensajeGenerado = SmsService.generarMensaje(widget.acta);
  }

  Future<void> _abrirSms() async {
    setState(() {
      _abriendo = true;
      _registroError = null;
    });

    final smsStatus = await SmsService.abrirAppSms(_mensajeGenerado);

    if (!mounted) return;

    setState(() => _abriendo = false);

    if (smsStatus == SmsLaunchStatus.appNoDisponible) {
      _mostrarError('No se encontro una app de SMS en este dispositivo.');
    } else if (smsStatus == SmsLaunchStatus.errorInesperado) {
      _mostrarError('Error inesperado al abrir la app de SMS.');
    }

    await _enviarCopiaBackend();
  }

  Future<void> _enviarCopiaBackend() async {
    setState(() {
      _registro = _RegistroEstado.cargando;
      _registroError = null;
    });

    final backendResult = await SmsBackendService.registrar(_mensajeGenerado);

    if (!mounted) return;

    setState(() {
      _registro =
          backendResult.ok ? _RegistroEstado.exito : _RegistroEstado.error;
      _registroError = backendResult.ok ? null : backendResult.mensaje;
    });
  }

  void _mostrarError(String mensaje) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('No se pudo abrir SMS'),
        content: Text(mensaje),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Entendido')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mensaje listo para enviar')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Destinatario
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.grey[100],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Row(
                children: [
                  const Icon(Icons.person, size: 18, color: Colors.black54),
                  const SizedBox(width: 10),
                  const Text('Destinatario: ', style: TextStyle(fontSize: 13, color: Colors.black54)),
                  Text(
                    AppConfig.smsRecipientNumber,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                  const Spacer(),
                  Icon(Icons.lock_outline, size: 16, color: Colors.grey[400]),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Mensaje generado (solo lectura)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Text('Mensaje que se enviara',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    const Spacer(),
                    Icon(Icons.lock_outline, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Text('Solo lectura', style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                  ],
                ),
                const SizedBox(height: 8),
                IgnorePointer(
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.teal[50],
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.teal.shade200),
                    ),
                    child: Text(
                      _mensajeGenerado,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 14, height: 1.6),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Aviso formato fijo
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.amber[50],
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: Colors.amber.shade300),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: Colors.amber),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Formato oficial fijo. Al pulsar el boton, tu app de SMS se abrira con el texto listo.',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Botón principal
            ElevatedButton.icon(
              onPressed: _abriendo || _registro == _RegistroEstado.cargando
                  ? null
                  : _abrirSms,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal[700],
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 56),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              icon: _abriendo
                  ? const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.open_in_new),
              label: Text(_abriendo ? 'Abriendo SMS...' : 'Abrir app de SMS'),
            ),
            const SizedBox(height: 12),

            // Estado registro backend
            if (_registro != _RegistroEstado.inicial) _RegistroBadge(_registro, _registroError),
            const SizedBox(height: 12),

            // Volver
            OutlinedButton.icon(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.edit),
              label: const Text('Corregir datos'),
            ),
          ],
        ),
      ),
    );
  }
}

class _RegistroBadge extends StatelessWidget {
  final _RegistroEstado estado;
  final String? error;
  const _RegistroBadge(this.estado, this.error);

  @override
  Widget build(BuildContext context) {
    final (color, icono, texto) = switch (estado) {
      _RegistroEstado.cargando => (Colors.blue[50]!, Icons.sync, 'Enviando copia al backend...'),
      _RegistroEstado.exito    => (Colors.green[50]!, Icons.check_circle_outline, 'Copia enviada al backend'),
      _RegistroEstado.error    => (Colors.red[50]!, Icons.error_outline, error ?? 'No se pudo enviar copia HTTP'),
      _RegistroEstado.inicial  => (Colors.grey[50]!, Icons.info_outline, ''),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color),
      ),
      child: Row(
        children: [
          Icon(icono, size: 18,
              color: estado == _RegistroEstado.exito
                  ? Colors.green[700]
                  : estado == _RegistroEstado.error
                      ? Colors.red[700]
                      : Colors.blue[700]),
          const SizedBox(width: 8),
          Expanded(
            child: Text(texto,
                style: TextStyle(
                    fontSize: 13,
                    color: estado == _RegistroEstado.exito
                        ? Colors.green[800]
                        : estado == _RegistroEstado.error
                            ? Colors.red[800]
                            : Colors.blue[800])),
          ),
        ],
      ),
    );
  }
}
