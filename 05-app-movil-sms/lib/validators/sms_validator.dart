/// Resultado de validar el formulario del flujo SMS.
///
/// Cada campo tiene su propio mensaje de error (null = válido).
/// Separar el resultado de la lógica permite reusar la validación en
/// tests y en múltiples widgets sin duplicar código.
class SmsValidationResult {
  final String? codigoMesaError;
  final String? numeroMesaError;
  final String? codigoRecintoError;
  final String? fotoError;

  const SmsValidationResult({
    this.codigoMesaError,
    this.numeroMesaError,
    this.codigoRecintoError,
    this.fotoError,
  });

  /// True cuando todos los campos pasaron la validación.
  bool get esValido =>
      codigoMesaError == null &&
      numeroMesaError == null &&
      codigoRecintoError == null &&
      fotoError == null;

  /// Lista plana de errores activos (útil para accesibilidad o resumen).
  List<String> get errores => [
        if (codigoMesaError != null) codigoMesaError!,
        if (numeroMesaError != null) numeroMesaError!,
        if (codigoRecintoError != null) codigoRecintoError!,
        if (fotoError != null) fotoError!,
      ];
}

/// Centraliza todas las reglas de validación del flujo SMS.
///
/// Las reglas son intencionalmente mínimas: solo verifican presencia
/// y formato básico. La validación de negocio (si el código de mesa
/// existe, si ya fue reportada, etc.) la hace el receptor del SMS.
///
/// Cada método es estático y puro: recibe un valor, devuelve null (válido)
/// o un String con el error. Esto los hace fácilmente testeables.
class SmsValidator {
  SmsValidator._(); // clase no instanciable

  // ── Validaciones individuales ─────────────────────────────────────────────

  /// Código de mesa: obligatorio, mínimo 2 caracteres.
  /// No se valida formato exacto (varía según padrón electoral).
  static String? validarCodigoMesa(String? valor) {
    final v = valor?.trim() ?? '';
    if (v.isEmpty) return 'El código de mesa es obligatorio.';
    if (v.length < 2) return 'Mínimo 2 caracteres.';
    return null;
  }

  /// Número de mesa: obligatorio, debe ser un entero positivo.
  static String? validarNumeroMesa(String? valor) {
    final v = valor?.trim() ?? '';
    if (v.isEmpty) return 'El número de mesa es obligatorio.';
    final n = int.tryParse(v);
    if (n == null || n <= 0) return 'Debe ser un número entero positivo.';
    return null;
  }

  /// Código de recinto: obligatorio, mínimo 2 caracteres.
  static String? validarCodigoRecinto(String? valor) {
    final v = valor?.trim() ?? '';
    if (v.isEmpty) return 'El código de recinto es obligatorio.';
    if (v.length < 2) return 'Mínimo 2 caracteres.';
    return null;
  }

  /// La foto es obligatoria: garantiza que el delegado tiene el acta física.
  static String? validarFoto(String? imagePath) {
    if (imagePath == null || imagePath.isEmpty) {
      return 'Debes fotografiar el acta antes de generar el SMS.';
    }
    return null;
  }

  // ── Validación completa ───────────────────────────────────────────────────

  /// Valida todos los campos en una sola llamada.
  /// Devuelve todos los errores simultáneamente (no detiene en el primero)
  /// para que el usuario pueda corregirlos todos de una vez.
  static SmsValidationResult validarFormulario({
    required String? codigoMesa,
    required String? numeroMesa,
    required String? codigoRecinto,
    required String? imagePath,
  }) {
    return SmsValidationResult(
      codigoMesaError: validarCodigoMesa(codigoMesa),
      numeroMesaError: validarNumeroMesa(numeroMesa),
      codigoRecintoError: validarCodigoRecinto(codigoRecinto),
      fotoError: validarFoto(imagePath),
    );
  }
}
