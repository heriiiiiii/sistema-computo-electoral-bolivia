class SmsActaModel {
  final String codigoMesa;
  final String codigoRecinto;
  final String votosP1;
  final String votosP2;
  final String votosP3;
  final String votosP4;
  final String votosBlancos;
  final String votosNulos;
  final DateTime timestamp;

  const SmsActaModel({
    required this.codigoMesa,
    required this.codigoRecinto,
    required this.votosP1,
    required this.votosP2,
    required this.votosP3,
    required this.votosP4,
    required this.votosBlancos,
    required this.votosNulos,
    required this.timestamp,
  });
}
