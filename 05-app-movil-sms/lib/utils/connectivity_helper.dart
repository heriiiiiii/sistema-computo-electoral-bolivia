import 'package:connectivity_plus/connectivity_plus.dart';

class ConnectivityHelper {
  static final _connectivity = Connectivity();

  static Future<bool> isConnected() async {
    final result = await _connectivity.checkConnectivity();
    return result != ConnectivityResult.none;
  }

  static Stream<bool> get onConnectivityChanged =>
      _connectivity.onConnectivityChanged
          .map((result) => result != ConnectivityResult.none);
}
