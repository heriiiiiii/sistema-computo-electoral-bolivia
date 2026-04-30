/// Datos mínimos del acta para el flujo de envío por SMS.
///
/// Este modelo es EXCLUSIVO del flujo SMS y no tiene relación con
/// [ActaModel], que pertenece al flujo de foto + API REST.
///
/// La foto ([imagePath]) es evidencia local que queda en el dispositivo.
/// No se transmite por SMS porque el protocolo SMS solo soporta texto.
class SmsActaModel {
  final String codigoMesa;
  final String numeroMesa;
  final String codigoRecinto;

  /// Ruta absoluta de la foto tomada como evidencia local.
  /// Obligatoria para garantizar que el delegado tiene el acta física frente a él.
  final String imagePath;

  /// Momento exacto en que se generó el registro (se incluye en el SMS).
  final DateTime timestamp;

  const SmsActaModel({
    required this.codigoMesa,
    required this.numeroMesa,
    required this.codigoRecinto,
    required this.imagePath,
    required this.timestamp,
  });
}
