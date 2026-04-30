import 'dart:io';
import 'package:flutter/material.dart';
import '../../config/app_config.dart';
import '../../models/sms_acta_model.dart';
import '../../services/sms_service.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// PASO 2 del flujo SMS — Preview del mensaje y apertura de la app de SMS
///
/// Esta pantalla es de SOLO LECTURA. El usuario no puede editar nada.
///
/// Flujo de esta pantalla:
///   a) Recibe [SmsActaModel] ya validado desde [SmsDataScreen].
///   b) Llama a [SmsService.generarMensaje] y muestra el texto resultante.
///   c) Muestra el número receptor predefinido (no editable).
///   d) Muestra la miniatura de la foto como evidencia local.
///   e) Al pulsar "Abrir app de SMS", llama a [SmsService.abrirAppSms].
///   f) La app de SMS del dispositivo se abre con destinatario y mensaje listos.
///   g) El usuario solo tiene que pulsar "Enviar" en su app de SMS.
///
/// Lo que esta pantalla NO hace:
///   - No permite editar el mensaje.
///   - No copia el mensaje al portapapeles.
///   - No envía el SMS automáticamente.
///   - No hace ninguna llamada a servidores.
/// ─────────────────────────────────────────────────────────────────────────────
class SmsPreviewScreen extends StatefulWidget {
  final SmsActaModel acta;

  const SmsPreviewScreen({super.key, required this.acta});

  @override
  State<SmsPreviewScreen> createState() => _SmsPreviewScreenState();
}

class _SmsPreviewScreenState extends State<SmsPreviewScreen> {
  // El mensaje se genera una sola vez al construir el estado.
  // Es inmutable durante toda la vida de esta pantalla.
  late final String _mensajeGenerado;
  bool _abriendo = false;

  @override
  void initState() {
    super.initState();
    // Generación del mensaje: único punto donde se produce el texto final.
    // A partir de aquí el mensaje no se puede cambiar.
    _mensajeGenerado = SmsService.generarMensaje(widget.acta);
  }

  /// Abre la app de SMS del dispositivo con el mensaje y destinatario listos.
  Future<void> _abrirSms() async {
    setState(() => _abriendo = true);

    final status = await SmsService.abrirAppSms(_mensajeGenerado);

    if (!mounted) return;
    setState(() => _abriendo = false);

    switch (status) {
      case SmsLaunchStatus.exitoso:
        // El SO tomó control; la app de SMS está abierta.
        // No hacemos nada más — el usuario enviará desde allí.
        break;

      case SmsLaunchStatus.appNoDisponible:
        _mostrarError(
          'No se encontró una app de SMS en este dispositivo.\n'
          'Instala una app de mensajes e intenta de nuevo.',
        );

      case SmsLaunchStatus.errorInesperado:
        _mostrarError(
          'Ocurrió un error inesperado al abrir la app de SMS.\n'
          'Intenta de nuevo o escribe el mensaje manualmente.',
        );
    }
  }

  void _mostrarError(String mensaje) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('No se pudo abrir SMS'),
        content: Text(mensaje),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mensaje listo para enviar')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ① Foto de evidencia local (miniatura)
            _FotoEvidencia(imagePath: widget.acta.imagePath),
            const SizedBox(height: 20),

            // ② Destinatario predefinido (solo lectura, informativo)
            _DestinatarioCard(),
            const SizedBox(height: 16),

            // ③ Texto del mensaje generado (solo lectura, no editable)
            _MensajeCard(mensaje: _mensajeGenerado),
            const SizedBox(height: 16),

            // ④ Aviso de que el mensaje no se puede cambiar
            _AvisoSoloLectura(),
            const SizedBox(height: 32),

            // ⑤ Botón principal: delegar al sistema operativo
            ElevatedButton.icon(
              onPressed: _abriendo ? null : _abrirSms,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal[700],
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 56),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              icon: _abriendo
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.open_in_new),
              label: Text(_abriendo ? 'Abriendo…' : 'Abrir app de SMS'),
            ),
            const SizedBox(height: 12),

            // Botón secundario: volver a corregir datos
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

// ── Widgets internos ──────────────────────────────────────────────────────────

/// Miniatura de la foto tomada como evidencia local.
/// Aparece en la pantalla de preview para que el delegado confirme
/// visualmente que fotografió el acta correcta antes de enviar el SMS.
class _FotoEvidencia extends StatelessWidget {
  final String imagePath;
  const _FotoEvidencia({required this.imagePath});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Evidencia local (foto)',
          style: TextStyle(fontSize: 13, color: Colors.black54),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(
                File(imagePath),
                width: 90,
                height: 90,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Text(
                'La foto quedará guardada en tu dispositivo. '
                'No se envía por SMS.',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Muestra el número receptor predefinido. No editable.
class _DestinatarioCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
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
          const Text(
            'Destinatario: ',
            style: TextStyle(fontSize: 13, color: Colors.black54),
          ),
          Text(
            AppConfig.smsRecipientNumber,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5,
            ),
          ),
          const Spacer(),
          // Ícono de candado: refuerza que no se puede cambiar
          Icon(Icons.lock_outline, size: 16, color: Colors.grey[400]),
        ],
      ),
    );
  }
}

/// Muestra el texto del mensaje en un área de solo lectura.
/// El widget [IgnorePointer] evita cualquier interacción táctil sobre el texto.
class _MensajeCard extends StatelessWidget {
  final String mensaje;
  const _MensajeCard({required this.mensaje});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              'Mensaje que se enviará',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
            ),
            const Spacer(),
            Icon(Icons.lock_outline, size: 16, color: Colors.grey[500]),
            const SizedBox(width: 4),
            Text(
              'Solo lectura',
              style: TextStyle(fontSize: 11, color: Colors.grey[500]),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // IgnorePointer: impide que el usuario seleccione o edite el texto
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
              mensaje,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 15,
                height: 1.6,
                color: Colors.black87,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Aviso visual que recuerda al usuario que el mensaje es fijo.
class _AvisoSoloLectura extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
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
              'El mensaje tiene un formato oficial fijo y no puede modificarse. '
              'Al pulsar el botón, tu app de SMS se abrirá con el texto listo.',
              style: TextStyle(fontSize: 12, color: Colors.black87),
            ),
          ),
        ],
      ),
    );
  }
}
