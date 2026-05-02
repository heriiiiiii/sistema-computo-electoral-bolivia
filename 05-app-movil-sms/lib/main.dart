import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const ActaElectoralApp());
}

class ActaElectoralApp extends StatelessWidget {
  const ActaElectoralApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Acta Electoral',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1A237E), // azul institucional
          brightness: Brightness.light,
        ),
        useMaterial3: true,
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1A237E),
          foregroundColor: Colors.white,
          elevation: 2,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF1A237E),
            foregroundColor: Colors.white,
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          filled: true,
          fillColor: Colors.grey[50],
        ),
      ),
      home: const HomeScreen(),
    );
  }
}
