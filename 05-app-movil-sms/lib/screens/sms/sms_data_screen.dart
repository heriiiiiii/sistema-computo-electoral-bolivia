import 'package:flutter/material.dart';
import '../../models/sms_acta_model.dart';
import '../../validators/sms_validator.dart';
import 'sms_preview_screen.dart';

class SmsDataScreen extends StatefulWidget {
  const SmsDataScreen({super.key});

  @override
  State<SmsDataScreen> createState() => _SmsDataScreenState();
}

class _SmsDataScreenState extends State<SmsDataScreen> {
  final _mesaCtrl    = TextEditingController();
  final _recintoCtrl = TextEditingController();
  final _p1Ctrl      = TextEditingController();
  final _p2Ctrl      = TextEditingController();
  final _p3Ctrl      = TextEditingController();
  final _p4Ctrl      = TextEditingController();
  final _blancosCtrl = TextEditingController();
  final _nulosCtrl   = TextEditingController();

  String? _eMesa, _eRecinto, _eP1, _eP2, _eP3, _eP4, _eBlancos, _eNulos;

  @override
  void dispose() {
    for (final c in [_mesaCtrl, _recintoCtrl, _p1Ctrl, _p2Ctrl, _p3Ctrl, _p4Ctrl, _blancosCtrl, _nulosCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  void _generarSms() {
    final r = SmsValidator.validarFormulario(
      codigoMesa:    _mesaCtrl.text,
      codigoRecinto: _recintoCtrl.text,
      votosP1:       _p1Ctrl.text,
      votosP2:       _p2Ctrl.text,
      votosP3:       _p3Ctrl.text,
      votosP4:       _p4Ctrl.text,
      votosBlancos:  _blancosCtrl.text,
      votosNulos:    _nulosCtrl.text,
    );

    if (!r.esValido) {
      setState(() {
        _eMesa    = r.codigoMesaError;
        _eRecinto = r.codigoRecintoError;
        _eP1      = r.votosP1Error;
        _eP2      = r.votosP2Error;
        _eP3      = r.votosP3Error;
        _eP4      = r.votosP4Error;
        _eBlancos = r.votosBlancosError;
        _eNulos   = r.votosNulosError;
      });
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SmsPreviewScreen(
          acta: SmsActaModel(
            codigoMesa:    _mesaCtrl.text.trim(),
            codigoRecinto: _recintoCtrl.text.trim(),
            votosP1:       _p1Ctrl.text.trim(),
            votosP2:       _p2Ctrl.text.trim(),
            votosP3:       _p3Ctrl.text.trim(),
            votosP4:       _p4Ctrl.text.trim(),
            votosBlancos:  _blancosCtrl.text.trim(),
            votosNulos:    _nulosCtrl.text.trim(),
            timestamp:     DateTime.now(),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Registro por SMS')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Banner informativo
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.teal[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.teal.shade200),
              ),
              child: const Row(
                children: [
                  Icon(Icons.wifi_off, color: Colors.teal, size: 20),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Modo sin conexion — El mensaje se enviara desde tu app de SMS.',
                      style: TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // ── Identificacion ────────────────────────────────────────────
            const _Titulo('Identificacion de la mesa'),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _Campo(ctrl: _mesaCtrl,    label: 'MESA',    hint: 'Ej: CM-001', error: _eMesa,    teclado: TextInputType.text,   onChanged: (_) => setState(() => _eMesa = null))),
                const SizedBox(width: 12),
                Expanded(child: _Campo(ctrl: _recintoCtrl, label: 'RECINTO', hint: 'Ej: RC-005', error: _eRecinto, teclado: TextInputType.text,   onChanged: (_) => setState(() => _eRecinto = null))),
              ],
            ),
            const SizedBox(height: 20),

            // ── Votos por partido ─────────────────────────────────────────
            const _Titulo('Votos por partido'),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _Campo(ctrl: _p1Ctrl, label: 'P1', hint: '0', error: _eP1, teclado: TextInputType.number, onChanged: (_) => setState(() => _eP1 = null))),
                const SizedBox(width: 12),
                Expanded(child: _Campo(ctrl: _p2Ctrl, label: 'P2', hint: '0', error: _eP2, teclado: TextInputType.number, onChanged: (_) => setState(() => _eP2 = null))),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _Campo(ctrl: _p3Ctrl, label: 'P3', hint: '0', error: _eP3, teclado: TextInputType.number, onChanged: (_) => setState(() => _eP3 = null))),
                const SizedBox(width: 12),
                Expanded(child: _Campo(ctrl: _p4Ctrl, label: 'P4', hint: '0', error: _eP4, teclado: TextInputType.number, onChanged: (_) => setState(() => _eP4 = null))),
              ],
            ),
            const SizedBox(height: 20),

            // ── Votos especiales ──────────────────────────────────────────
            const _Titulo('Votos especiales'),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _Campo(ctrl: _blancosCtrl, label: 'BLANCOS', hint: '0', error: _eBlancos, teclado: TextInputType.number, onChanged: (_) => setState(() => _eBlancos = null))),
                const SizedBox(width: 12),
                Expanded(child: _Campo(ctrl: _nulosCtrl,   label: 'NULOS',   hint: '0', error: _eNulos,   teclado: TextInputType.number, onChanged: (_) => setState(() => _eNulos = null))),
              ],
            ),
            const SizedBox(height: 32),

            ElevatedButton.icon(
              onPressed: _generarSms,
              icon: const Icon(Icons.sms),
              label: const Text('Generar SMS', style: TextStyle(fontSize: 16)),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal[700],
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 52),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

class _Titulo extends StatelessWidget {
  final String texto;
  const _Titulo(this.texto);
  @override
  Widget build(BuildContext context) =>
      Text(texto, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15));
}

class _Campo extends StatelessWidget {
  final TextEditingController ctrl;
  final String label;
  final String hint;
  final String? error;
  final TextInputType teclado;
  final ValueChanged<String> onChanged;

  const _Campo({
    required this.ctrl, required this.label, required this.hint,
    required this.error, required this.teclado, required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: ctrl,
      keyboardType: teclado,
      textInputAction: TextInputAction.next,
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        errorText: error,
        errorStyle: const TextStyle(fontSize: 11),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      ),
    );
  }
}
