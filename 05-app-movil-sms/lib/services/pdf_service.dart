import 'dart:io';
import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// Convierte un archivo de imagen a PDF en memoria.
class PdfService {
  static Future<Uint8List> imagenAPdf(File imagen) async {
    final doc = pw.Document();
    final imageBytes = await imagen.readAsBytes();
    final pdfImage = pw.MemoryImage(imageBytes);

    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: pw.EdgeInsets.zero,
        build: (_) => pw.Center(
          child: pw.Image(pdfImage, fit: pw.BoxFit.contain),
        ),
      ),
    );

    return doc.save();
  }
}
