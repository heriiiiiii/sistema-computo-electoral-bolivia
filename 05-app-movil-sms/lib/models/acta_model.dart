/// Representa los datos mínimos de un acta electoral antes de ser enviada.
/// No se persiste en base de datos local; solo se usa en memoria y en la
/// cola offline (JSON en SharedPreferences).
class ActaModel {
  final String codigoMesa;
  final String numeroMesa;
  final String codigoRecinto;

  /// Ruta absoluta a la imagen en el sistema de archivos del dispositivo.
  /// Para la cola offline se copia a Documents/ para sobrevivir reinicios.
  final String imagePath;

  final DateTime timestamp;

  const ActaModel({
    required this.codigoMesa,
    required this.numeroMesa,
    required this.codigoRecinto,
    required this.imagePath,
    required this.timestamp,
  });

  /// Serializa el modelo a JSON para guardarlo en SharedPreferences.
  Map<String, dynamic> toJson() => {
        'codigoMesa': codigoMesa,
        'numeroMesa': numeroMesa,
        'codigoRecinto': codigoRecinto,
        'imagePath': imagePath,
        'timestamp': timestamp.toIso8601String(),
      };

  /// Reconstruye el modelo desde JSON (cola offline).
  factory ActaModel.fromJson(Map<String, dynamic> json) => ActaModel(
        codigoMesa: json['codigoMesa'] as String,
        numeroMesa: json['numeroMesa'] as String,
        codigoRecinto: json['codigoRecinto'] as String,
        imagePath: json['imagePath'] as String,
        timestamp: DateTime.parse(json['timestamp'] as String),
      );

  /// Crea una copia del modelo con una ruta de imagen diferente.
  /// Se usa al mover la imagen de caché a Documents/ para persistencia.
  ActaModel copyWithImagePath(String newPath) => ActaModel(
        codigoMesa: codigoMesa,
        numeroMesa: numeroMesa,
        codigoRecinto: codigoRecinto,
        imagePath: newPath,
        timestamp: timestamp,
      );
}
