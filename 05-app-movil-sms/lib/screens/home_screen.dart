import 'package:flutter/material.dart';
import 'capture_screen.dart';
import 'sms/sms_data_screen.dart';

/// Pantalla de inicio: selector de flujo.
///
/// Separa visualmente los dos modos de operación de la app:
///
///   ┌─────────────────────────────────┐
///   │  [Foto + API]  requiere internet │  → CaptureScreen (flujo HTTP)
///   ├─────────────────────────────────┤
///   │  [SMS]  funciona sin internet   │  → SmsDataScreen (flujo SMS)
///   └─────────────────────────────────┘
///
/// El delegado elige el modo según si tiene conexión en el momento
/// del reporte. Los dos flujos son completamente independientes
/// y no comparten estado.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sistema de Cómputo Electoral'),
        centerTitle: true,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Logo / encabezado institucional
            const _Encabezado(),
            const SizedBox(height: 48),

            // Flujo 1: envío de foto al sistema (requiere internet)
            _FlujCard(
              icono: Icons.cloud_upload_outlined,
              color: const Color(0xFF1A237E),
              titulo: 'Enviar foto al sistema',
              descripcion:
                  'Toma una foto del acta y envíala directamente al servidor '
                  'de cómputo. Requiere conexión a internet.',
              etiquetaConexion: 'Requiere internet',
              iconoConexion: Icons.wifi,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CaptureScreen()),
              ),
            ),
            const SizedBox(height: 20),

            // Flujo 2: envío por SMS (funciona sin internet)
            _FlujCard(
              icono: Icons.sms_outlined,
              color: Colors.teal[700]!,
              titulo: 'Enviar por SMS',
              descripcion:
                  'Si no tienes internet, genera un mensaje de texto con los '
                  'datos del acta y envíalo desde tu app de SMS.',
              etiquetaConexion: 'Sin internet',
              iconoConexion: Icons.wifi_off,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SmsDataScreen()),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Widgets internos ──────────────────────────────────────────────────────────

class _Encabezado extends StatelessWidget {
  const _Encabezado();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(Icons.how_to_vote, size: 64, color: Colors.grey[400]),
        const SizedBox(height: 12),
        const Text(
          'Registro de Actas RRV',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(
          'Selecciona el modo de envío según tu conectividad.',
          style: TextStyle(fontSize: 14, color: Colors.grey[600]),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _FlujCard extends StatelessWidget {
  final IconData icono;
  final Color color;
  final String titulo;
  final String descripcion;
  final String etiquetaConexion;
  final IconData iconoConexion;
  final VoidCallback onTap;

  const _FlujCard({
    required this.icono,
    required this.color,
    required this.titulo,
    required this.descripcion,
    required this.etiquetaConexion,
    required this.iconoConexion,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            border: Border.all(color: color.withOpacity(0.4), width: 1.5),
            borderRadius: BorderRadius.circular(14),
            color: color.withOpacity(0.04),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Ícono del modo
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icono, color: color, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      titulo,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: color,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      descripcion,
                      style: const TextStyle(fontSize: 13, color: Colors.black54),
                    ),
                    const SizedBox(height: 10),
                    // Etiqueta de conectividad requerida
                    Row(
                      children: [
                        Icon(iconoConexion, size: 14, color: color),
                        const SizedBox(width: 4),
                        Text(
                          etiquetaConexion,
                          style: TextStyle(
                            fontSize: 11,
                            color: color,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey[400]),
            ],
          ),
        ),
      ),
    );
  }
}
