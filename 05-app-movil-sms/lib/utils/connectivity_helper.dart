import 'package:connectivity_plus/connectivity_plus.dart';

/// Utilidad para verificar y observar el estado de la red.
/// connectivity_plus 5.x devuelve List<ConnectivityResult> en lugar de un
/// valor único, por eso se comprueba si algún resultado es distinto de "none".
class ConnectivityHelper {
  static final _connectivity = Connectivity();

  /// Comprobación puntual: ¿hay conexión ahora mismo?
  static Future<bool> isConnected() async {
    final results = await _connectivity.checkConnectivity();
    return _hasConnection(results);
  }

  /// Stream que emite true/false cada vez que cambia la conectividad.
  /// Útil para escuchar recuperación de red y reintentar la cola offline.
  static Stream<bool> get onConnectivityChanged =>
      _connectivity.onConnectivityChanged.map(_hasConnection);

  static bool _hasConnection(List<ConnectivityResult> results) =>
      results.any((r) => r != ConnectivityResult.none);
}
