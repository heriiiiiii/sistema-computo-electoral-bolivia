class SmsValidationResult {
  final String? codigoMesaError;
  final String? codigoRecintoError;
  final String? votosP1Error;
  final String? votosP2Error;
  final String? votosP3Error;
  final String? votosP4Error;
  final String? votosBlancosError;
  final String? votosNulosError;

  const SmsValidationResult({
    this.codigoMesaError,
    this.codigoRecintoError,
    this.votosP1Error,
    this.votosP2Error,
    this.votosP3Error,
    this.votosP4Error,
    this.votosBlancosError,
    this.votosNulosError,
  });

  bool get esValido =>
      codigoMesaError == null &&
      codigoRecintoError == null &&
      votosP1Error == null &&
      votosP2Error == null &&
      votosP3Error == null &&
      votosP4Error == null &&
      votosBlancosError == null &&
      votosNulosError == null;
}

class SmsValidator {
  SmsValidator._();

  static String? validarCodigo(String? valor) {
    final v = valor?.trim() ?? '';
    if (v.isEmpty) return 'Obligatorio';
    if (v.length < 2) return 'Min. 2 caracteres';
    return null;
  }

  static String? validarVotos(String? valor) {
    final v = valor?.trim() ?? '';
    if (v.isEmpty) return 'Obligatorio';
    final n = int.tryParse(v);
    if (n == null || n < 0) return 'Entero >= 0';
    return null;
  }

  static SmsValidationResult validarFormulario({
    required String? codigoMesa,
    required String? codigoRecinto,
    required String? votosP1,
    required String? votosP2,
    required String? votosP3,
    required String? votosP4,
    required String? votosBlancos,
    required String? votosNulos,
  }) {
    return SmsValidationResult(
      codigoMesaError:   validarCodigo(codigoMesa),
      codigoRecintoError: validarCodigo(codigoRecinto),
      votosP1Error:      validarVotos(votosP1),
      votosP2Error:      validarVotos(votosP2),
      votosP3Error:      validarVotos(votosP3),
      votosP4Error:      validarVotos(votosP4),
      votosBlancosError: validarVotos(votosBlancos),
      votosNulosError:   validarVotos(votosNulos),
    );
  }
}
