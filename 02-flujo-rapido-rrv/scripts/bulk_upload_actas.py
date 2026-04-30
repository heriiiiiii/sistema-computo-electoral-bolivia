"""Carga masiva de actas RRV desde una carpeta local.

Recorre los archivos PDF/PNG/JPG de una carpeta y los envía uno por uno al
endpoint POST /api/rrv/actas/auto del backend RRV. Genera un reporte JSON y
CSV con el resultado de cada archivo. No reimplementa OCR ni validaciones:
toda la logica vive en el backend.

Uso basico:
    python scripts/bulk_upload_actas.py --folder "C:/path/ACTAS_COACH"

Opciones:
    --url            URL base del backend (default http://localhost:4001)
    --recursive      Buscar tambien dentro de subcarpetas
    --limit N        Procesar como maximo N archivos
    --delay S        Esperar S segundos entre archivos
"""

import argparse
import csv
import json
import mimetypes
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    sys.stderr.write(
        "Falta la libreria 'requests'. Instalala con:\n"
        "  pip install requests\n"
    )
    sys.exit(1)


SUPPORTED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}

EXTENSION_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
REPORT_DIR = PROJECT_DIR / "storage" / "reportes_lote"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Carga masiva de actas RRV desde una carpeta local."
    )
    parser.add_argument(
        "--folder",
        required=True,
        help="Carpeta con los archivos PDF/imagen a cargar."
    )
    parser.add_argument(
        "--url",
        default="http://localhost:4001",
        help="URL base del backend RRV (default http://localhost:4001)."
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Buscar archivos tambien en subcarpetas."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Procesar como maximo N archivos."
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.0,
        help="Segundos a esperar entre archivos (default 0)."
    )

    return parser.parse_args()


def check_backend_health(base_url):
    health_url = f"{base_url.rstrip('/')}/api/rrv/health"

    try:
        response = requests.get(health_url, timeout=10)
    except requests.RequestException as error:
        return False, f"No se pudo conectar al backend: {error}"

    if response.status_code != 200:
        return False, f"Health respondio HTTP {response.status_code}"

    try:
        body = response.json()
    except ValueError:
        return False, "Health respondio con un cuerpo no JSON"

    if not body.get("success"):
        return False, f"Backend reporto fallo: {body}"

    return True, body


def discover_files(folder, recursive):
    folder_path = Path(folder).resolve()

    if not folder_path.exists() or not folder_path.is_dir():
        return None, f"La carpeta {folder_path} no existe o no es un directorio."

    iterator = folder_path.rglob("*") if recursive else folder_path.glob("*")
    files = []

    for item in iterator:
        if not item.is_file():
            continue

        if item.suffix.lower() in SUPPORTED_EXTENSIONS:
            files.append(item)

    files.sort(key=lambda p: str(p).lower())

    return files, None


def detect_content_type(file_path):
    extension = file_path.suffix.lower()
    explicit = EXTENSION_MIME_TYPES.get(extension)

    if explicit:
        return explicit

    guessed, _ = mimetypes.guess_type(str(file_path))

    return guessed or "application/octet-stream"


def upload_single_file(base_url, file_path):
    upload_url = f"{base_url.rstrip('/')}/api/rrv/actas/auto"
    content_type = detect_content_type(file_path)

    data = {
        "usuarioId": "operador-lote",
        "nombreOperador": "Operador lote",
        "dispositivo": "script-carga-masiva",
        "latitud": "0",
        "longitud": "0",
        "sourceTipo": "CARGA_LOTE",
    }

    try:
        with open(file_path, "rb") as opened:
            files = {
                "archivo": (file_path.name, opened, content_type)
            }

            response = requests.post(
                upload_url,
                files=files,
                data=data,
                timeout=120
            )
    except requests.RequestException as error:
        return {
            "categoria": "ERROR_CONEXION",
            "httpStatus": None,
            "body": None,
            "error": str(error),
        }
    except OSError as error:
        return {
            "categoria": "ERROR_LECTURA_ARCHIVO",
            "httpStatus": None,
            "body": None,
            "error": str(error),
        }

    body = None

    try:
        body = response.json()
    except ValueError:
        body = None

    if response.status_code >= 400:
        return {
            "categoria": "ERROR_HTTP",
            "httpStatus": response.status_code,
            "body": body,
            "error": (
                body.get("message")
                if isinstance(body, dict)
                else f"HTTP {response.status_code}"
            ),
        }

    return {
        "categoria": "OK",
        "httpStatus": response.status_code,
        "body": body,
        "error": None,
    }


def build_record(file_path, attempt_result):
    body = attempt_result.get("body") or {}

    if not isinstance(body, dict):
        body = {}

    calidad_visual = body.get("calidadVisual") or {}
    resultados = body.get("resultadosPresidente") or {}

    errores_visuales = calidad_visual.get("erroresVisuales") or []

    if errores_visuales and isinstance(errores_visuales[0], dict):
        errores_visuales = [item.get("codigo") for item in errores_visuales if isinstance(item, dict)]

    return {
        "nombreArchivo": file_path.name,
        "rutaArchivo": str(file_path),
        "success": bool(body.get("success")) if body else False,
        "httpStatus": attempt_result.get("httpStatus"),
        "actaId": body.get("actaId"),
        "codigoMesa": body.get("codigoMesa"),
        "numeroMesa": body.get("numeroMesa"),
        "estado": body.get("estado"),
        "esDuplicada": body.get("esDuplicada", False),
        "requiereRevisionManual": body.get("requiereRevisionManual", False),
        "tieneProblemasVisuales": calidad_visual.get("tieneProblemasVisuales", False),
        "erroresVisuales": errores_visuales,
        "erroresOCR": body.get("erroresOCR", []),
        "erroresValidacion": body.get("inconsistencias", []),
        "votosValidos": resultados.get("votosValidos"),
        "votosBlancos": resultados.get("votosBlancos"),
        "votosNulos": resultados.get("votosNulos"),
        "totalVotos": resultados.get("totalVotos"),
        "mensaje": body.get("message"),
        "error": attempt_result.get("error"),
        "categoria": attempt_result.get("categoria"),
    }


def short_progress_label(record):
    estado = record.get("estado")
    visual = record.get("tieneProblemasVisuales")
    duplicada = record.get("esDuplicada")
    categoria = record.get("categoria")

    if categoria != "OK":
        return f"{categoria} ({record.get('httpStatus')})"

    parts = [estado or "DESCONOCIDO"]

    if duplicada:
        parts.append("duplicada")

    if visual:
        parts.append("con advertencias visuales")

    return " ".join(parts)


def summarize(records, total_found, total_seconds):
    summary = {
        "totalEncontrados": total_found,
        "totalProcesados": len(records),
        "validadas": 0,
        "sospechosas": 0,
        "pendientesRevision": 0,
        "rechazadas": 0,
        "erroresHttp": 0,
        "erroresConexion": 0,
        "duplicadas": 0,
        "conAdvertenciasVisuales": 0,
        "conErrorOCR": 0,
        "tiempoTotalSegundos": round(total_seconds, 2),
    }

    for record in records:
        estado = record.get("estado")
        categoria = record.get("categoria")

        if categoria == "ERROR_HTTP":
            summary["erroresHttp"] += 1
        elif categoria in ("ERROR_CONEXION", "ERROR_LECTURA_ARCHIVO"):
            summary["erroresConexion"] += 1

        if estado == "VALIDADA":
            summary["validadas"] += 1
        elif estado == "SOSPECHOSA":
            summary["sospechosas"] += 1
        elif estado == "PENDIENTE_REVISION":
            summary["pendientesRevision"] += 1
        elif estado == "RECHAZADA":
            summary["rechazadas"] += 1

        if record.get("esDuplicada"):
            summary["duplicadas"] += 1

        if record.get("tieneProblemasVisuales"):
            summary["conAdvertenciasVisuales"] += 1

        if record.get("erroresOCR"):
            summary["conErrorOCR"] += 1

    return summary


def write_reports(records, summary, started_at):
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    stamp = started_at.strftime("%Y%m%d_%H%M%S")
    json_path = REPORT_DIR / f"reporte_lote_{stamp}.json"
    csv_path = REPORT_DIR / f"reporte_lote_{stamp}.csv"

    payload = {
        "fechaEjecucion": started_at.isoformat(),
        "summary": summary,
        "registros": records,
    }

    with open(json_path, "w", encoding="utf-8") as json_file:
        json.dump(payload, json_file, ensure_ascii=False, indent=2, default=str)

    csv_columns = [
        "nombreArchivo",
        "rutaArchivo",
        "categoria",
        "httpStatus",
        "success",
        "actaId",
        "codigoMesa",
        "numeroMesa",
        "estado",
        "esDuplicada",
        "requiereRevisionManual",
        "tieneProblemasVisuales",
        "erroresVisuales",
        "erroresOCR",
        "erroresValidacion",
        "votosValidos",
        "votosBlancos",
        "votosNulos",
        "totalVotos",
        "mensaje",
        "error",
    ]

    with open(csv_path, "w", encoding="utf-8", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(csv_columns)

        for record in records:
            row = []

            for column in csv_columns:
                value = record.get(column)

                if isinstance(value, list):
                    value = "; ".join(str(item) for item in value)
                elif isinstance(value, bool):
                    value = "true" if value else "false"
                elif value is None:
                    value = ""

                row.append(value)

            writer.writerow(row)

    return json_path, csv_path


def main():
    args = parse_args()

    print(f"Carpeta:    {args.folder}")
    print(f"Backend:    {args.url}")
    print(f"Recursivo:  {args.recursive}")

    if args.limit is not None:
        print(f"Limite:     {args.limit}")

    if args.delay > 0:
        print(f"Delay:      {args.delay}s entre archivos")

    print()
    print("Verificando backend...")
    healthy, info = check_backend_health(args.url)

    if not healthy:
        print(f"  ERROR: {info}")
        print(
            "No se pudo verificar el backend RRV. "
            "Revisa que Uvicorn este corriendo."
        )
        sys.exit(2)

    print(f"  OK -> {info}")
    print()

    files, error = discover_files(args.folder, args.recursive)

    if error is not None:
        print(error)
        sys.exit(2)

    total_found = len(files)

    if args.limit is not None and args.limit >= 0:
        files = files[: args.limit]

    if total_found == 0:
        print("No se encontraron archivos PDF/PNG/JPG en la carpeta indicada.")
        sys.exit(0)

    print(f"Archivos encontrados: {total_found}")
    print(f"Archivos a procesar:  {len(files)}")
    print()

    records = []
    started_at = datetime.now()
    started_perf = time.perf_counter()

    for index, file_path in enumerate(files, start=1):
        print(f"[{index}/{len(files)}] Procesando {file_path.name}")

        attempt = upload_single_file(args.url, file_path)
        record = build_record(file_path, attempt)
        records.append(record)

        print(f"  Resultado: {short_progress_label(record)}")

        if args.delay > 0 and index < len(files):
            time.sleep(args.delay)

    elapsed = time.perf_counter() - started_perf
    summary = summarize(records, total_found, elapsed)

    json_path, csv_path = write_reports(records, summary, started_at)

    print()
    print("=" * 60)
    print("Resumen del lote")
    print("=" * 60)

    for key, value in summary.items():
        print(f"  {key}: {value}")

    print()
    print(f"Reporte JSON: {json_path}")
    print(f"Reporte CSV:  {csv_path}")


if __name__ == "__main__":
    main()
