"""Carga masiva de actas RRV desde una carpeta local.

Recorre archivos PDF/PNG/JPG de una carpeta y los envia al endpoint
POST /api/rrv/actas/auto del backend RRV. La logica de OCR, validacion,
persistencia y estados sigue viviendo en el backend.

Por defecto conserva el flujo secuencial. Para lotes grandes se puede usar
paralelismo controlado:

    python scripts/bulk_upload_actas.py --folder "C:/ACTAS" --workers 6
"""

import argparse
import csv
import hashlib
import json
import math
import mimetypes
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
THREAD_LOCAL = threading.local()


def parse_args():
    parser = argparse.ArgumentParser(
        description="Carga masiva de actas RRV desde una carpeta local."
    )
    parser.add_argument(
        "--folder",
        required=True,
        help="Carpeta con los archivos PDF/imagen a cargar.",
    )
    parser.add_argument(
        "--url",
        default="http://localhost:4001",
        help="URL base del backend RRV (default http://localhost:4001).",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Buscar archivos tambien dentro de subcarpetas.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Procesar como maximo N archivos.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.0,
        help="Segundos a esperar entre archivos/submisiones (default 0).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Numero de uploads paralelos dentro de cada batch (default 1).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Numero de archivos por batch (default 100).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=180.0,
        help="Timeout HTTP por archivo en segundos (default 180).",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Reintentos para errores transitorios (default 2).",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=2.0,
        help="Segundos de espera entre reintentos (default 2).",
    )
    parser.add_argument(
        "--pause-between-batches",
        type=float,
        default=0.0,
        help="Pausa opcional despues de cada batch en segundos (default 0).",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Reanudar desde checkpoint y omitir archivos ya exitosos.",
    )
    parser.add_argument(
        "--checkpoint",
        default=None,
        help="Ruta del checkpoint JSON. Si se omite se crea una ruta estable.",
    )

    return parser.parse_args()


def validate_args(args):
    errors = []

    if args.workers < 1:
        errors.append("--workers debe ser >= 1")
    if args.batch_size < 1:
        errors.append("--batch-size debe ser >= 1")
    if args.timeout <= 0:
        errors.append("--timeout debe ser > 0")
    if args.retries < 0:
        errors.append("--retries debe ser >= 0")
    if args.retry_delay < 0:
        errors.append("--retry-delay debe ser >= 0")
    if args.pause_between_batches < 0:
        errors.append("--pause-between-batches debe ser >= 0")
    if args.delay < 0:
        errors.append("--delay debe ser >= 0")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        sys.exit(2)

    if args.workers > 12:
        print(
            "ADVERTENCIA FUERTE: --workers > 12 puede sobrecargar FastAPI, OCR, "
            "MongoDB o disco. Empieza con 6 u 8."
        )
    elif args.workers > 8:
        print(
            "ADVERTENCIA: --workers > 8 puede ser agresivo para esta practica. "
            "Monitorea CPU, disco y MongoDB."
        )


def get_session():
    """Thread-local requests.Session; never shared across worker threads."""
    session = getattr(THREAD_LOCAL, "session", None)

    if session is None:
        session = requests.Session()
        THREAD_LOCAL.session = session

    return session


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


def is_retryable_http_status(status_code):
    return status_code is not None and status_code >= 500


def upload_single_file(
    base_url,
    file_path,
    timeout=180,
    retries=2,
    retry_delay=2,
):
    upload_url = f"{base_url.rstrip('/')}/api/rrv/actas/auto"
    content_type = detect_content_type(file_path)
    started = time.perf_counter()
    max_attempts = retries + 1

    data = {
        "usuarioId": "operador-lote",
        "nombreOperador": "Operador lote",
        "dispositivo": "script-carga-masiva",
        "latitud": "0",
        "longitud": "0",
        "sourceTipo": "CARGA_LOTE",
    }

    last_result = None

    for attempt_index in range(max_attempts):
        retry_count = attempt_index

        try:
            with open(file_path, "rb") as opened:
                files = {
                    "archivo": (file_path.name, opened, content_type),
                }
                response = get_session().post(
                    upload_url,
                    files=files,
                    data=data,
                    timeout=timeout,
                )
        except OSError as error:
            return {
                "categoria": "ERROR_LECTURA_ARCHIVO",
                "httpStatus": None,
                "body": None,
                "error": str(error),
                "errorTipo": "READ_ERROR",
                "errorMensaje": str(error),
                "retryCount": retry_count,
                "finalAttemptStatus": "READ_ERROR",
                "elapsedSeconds": round(time.perf_counter() - started, 3),
            }
        except requests.Timeout as error:
            last_result = {
                "categoria": "ERROR_CONEXION",
                "httpStatus": None,
                "body": None,
                "error": str(error),
                "errorTipo": "TIMEOUT",
                "errorMensaje": str(error),
                "retryCount": retry_count,
                "finalAttemptStatus": "TIMEOUT",
            }
        except requests.ConnectionError as error:
            last_result = {
                "categoria": "ERROR_CONEXION",
                "httpStatus": None,
                "body": None,
                "error": str(error),
                "errorTipo": "CONNECTION_ERROR",
                "errorMensaje": str(error),
                "retryCount": retry_count,
                "finalAttemptStatus": "CONNECTION_ERROR",
            }
        except requests.RequestException as error:
            last_result = {
                "categoria": "ERROR_CONEXION",
                "httpStatus": None,
                "body": None,
                "error": str(error),
                "errorTipo": "REQUEST_ERROR",
                "errorMensaje": str(error),
                "retryCount": retry_count,
                "finalAttemptStatus": "REQUEST_ERROR",
            }
        else:
            body = None

            try:
                body = response.json()
            except ValueError:
                body = None

            if response.status_code >= 400:
                last_result = {
                    "categoria": "ERROR_HTTP",
                    "httpStatus": response.status_code,
                    "body": body,
                    "error": (
                        body.get("message")
                        if isinstance(body, dict)
                        else f"HTTP {response.status_code}"
                    ),
                    "errorTipo": (
                        "HTTP_5XX"
                        if response.status_code >= 500
                        else "HTTP_4XX"
                    ),
                    "errorMensaje": (
                        body.get("message")
                        if isinstance(body, dict)
                        else f"HTTP {response.status_code}"
                    ),
                    "retryCount": retry_count,
                    "finalAttemptStatus": f"HTTP_{response.status_code}",
                }

                if is_retryable_http_status(response.status_code) and attempt_index < retries:
                    time.sleep(retry_delay)
                    continue

                last_result["elapsedSeconds"] = round(time.perf_counter() - started, 3)
                return last_result

            if body is None:
                last_result = {
                    "categoria": "ERROR_RESPUESTA_INVALIDA",
                    "httpStatus": response.status_code,
                    "body": None,
                    "error": "Respuesta HTTP sin JSON valido",
                    "errorTipo": "INVALID_RESPONSE",
                    "errorMensaje": "Respuesta HTTP sin JSON valido",
                    "retryCount": retry_count,
                    "finalAttemptStatus": "INVALID_RESPONSE",
                }
            else:
                return {
                    "categoria": "OK",
                    "httpStatus": response.status_code,
                    "body": body,
                    "error": None,
                    "errorTipo": None,
                    "errorMensaje": None,
                    "retryCount": retry_count,
                    "finalAttemptStatus": "OK",
                    "elapsedSeconds": round(time.perf_counter() - started, 3),
                }

        if attempt_index < retries:
            time.sleep(retry_delay)

    if last_result is None:
        last_result = {
            "categoria": "ERROR_CONEXION",
            "httpStatus": None,
            "body": None,
            "error": "Upload fallido sin respuesta final",
            "errorTipo": "UNKNOWN_ERROR",
            "errorMensaje": "Upload fallido sin respuesta final",
            "retryCount": retries,
            "finalAttemptStatus": "UNKNOWN_ERROR",
        }

    last_result["elapsedSeconds"] = round(time.perf_counter() - started, 3)
    return last_result


def build_record(file_path, attempt_result, batch_number=None):
    body = attempt_result.get("body") or {}

    if not isinstance(body, dict):
        body = {}

    calidad_visual = body.get("calidadVisual") or {}
    resultados = body.get("resultadosPresidente") or {}

    errores_visuales = calidad_visual.get("erroresVisuales") or []

    if errores_visuales and isinstance(errores_visuales[0], dict):
        errores_visuales = [
            item.get("codigo")
            for item in errores_visuales
            if isinstance(item, dict)
        ]

    estado = body.get("estado")
    errores_ocr = body.get("erroresOCR", []) or []
    tiene_problemas_visuales = calidad_visual.get("tieneProblemasVisuales", False)
    success = bool(body.get("success")) if body else False

    return {
        "nombreArchivo": file_path.name,
        "rutaArchivo": str(file_path),
        "archivo": file_path.name,
        "ruta": str(file_path),
        "success": success,
        "httpStatus": attempt_result.get("httpStatus"),
        "actaId": body.get("actaId"),
        "codigoMesa": body.get("codigoMesa"),
        "numeroMesa": body.get("numeroMesa"),
        "estado": estado,
        "esDuplicada": body.get("esDuplicada", False),
        "requiereRevisionManual": body.get("requiereRevisionManual", False),
        "esSospechosa": estado == "SOSPECHOSA",
        "tieneProblemasVisuales": tiene_problemas_visuales,
        "conAdvertenciaVisual": bool(tiene_problemas_visuales),
        "erroresVisuales": errores_visuales,
        "erroresOCR": errores_ocr,
        "conErrorOCR": bool(errores_ocr),
        "erroresValidacion": body.get("inconsistencias", []),
        "votosValidos": resultados.get("votosValidos"),
        "votosBlancos": resultados.get("votosBlancos"),
        "votosNulos": resultados.get("votosNulos"),
        "totalVotos": resultados.get("totalVotos"),
        "mensaje": body.get("message"),
        "error": attempt_result.get("error"),
        "errorTipo": attempt_result.get("errorTipo"),
        "errorMensaje": attempt_result.get("errorMensaje"),
        "categoria": attempt_result.get("categoria"),
        "elapsedSeconds": attempt_result.get("elapsedSeconds"),
        "retryCount": attempt_result.get("retryCount", 0),
        "finalAttemptStatus": attempt_result.get("finalAttemptStatus"),
        "batchNumber": batch_number,
    }


def upload_and_build_record(
    base_url,
    file_path,
    timeout,
    retries,
    retry_delay,
    batch_number,
):
    attempt = upload_single_file(
        base_url,
        file_path,
        timeout=timeout,
        retries=retries,
        retry_delay=retry_delay,
    )
    return build_record(file_path, attempt, batch_number=batch_number)


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


def summarize(
    records,
    total_found,
    total_seconds,
    workers=None,
    batch_size=None,
    checkpoint=None,
    rate_count=None,
):
    processed = len(records)
    rate_base = processed if rate_count is None else max(0, rate_count)
    summary = {
        "totalEncontrados": total_found,
        "totalProcesados": processed,
        "exitosas": 0,
        "fallidas": 0,
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
        "promedioActasPorMinuto": round((rate_base / total_seconds) * 60, 2)
        if total_seconds > 0 and rate_base > 0
        else 0,
        "workersUsados": workers,
        "batchSizeUsado": batch_size,
        "checkpoint": str(checkpoint) if checkpoint else None,
    }

    for record in records:
        estado = record.get("estado")
        categoria = record.get("categoria")

        if record.get("success"):
            summary["exitosas"] += 1
        else:
            summary["fallidas"] += 1

        if categoria == "ERROR_HTTP":
            summary["erroresHttp"] += 1
        elif categoria in (
            "ERROR_CONEXION",
            "ERROR_LECTURA_ARCHIVO",
            "ERROR_RESPUESTA_INVALIDA",
        ):
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

        if record.get("tieneProblemasVisuales") or record.get("conAdvertenciaVisual"):
            summary["conAdvertenciasVisuales"] += 1

        if record.get("erroresOCR") or record.get("conErrorOCR"):
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
        "batchNumber",
        "elapsedSeconds",
        "retryCount",
        "finalAttemptStatus",
        "errorTipo",
        "errorMensaje",
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


def default_checkpoint_path(folder, url):
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    folder_path = str(Path(folder).resolve()).lower()
    fingerprint = hashlib.sha1(f"{folder_path}|{url}".encode("utf-8")).hexdigest()[:10]
    folder_name = Path(folder).resolve().name or "lote"
    safe_folder = "".join(
        char if char.isalnum() or char in ("-", "_") else "_"
        for char in folder_name
    )
    return REPORT_DIR / f"checkpoint_{safe_folder}_{fingerprint}.json"


def resolve_checkpoint_path(args):
    if args.checkpoint:
        return Path(args.checkpoint).resolve()
    return default_checkpoint_path(args.folder, args.url)


def load_checkpoint(checkpoint_path):
    if not checkpoint_path.exists():
        return [], checkpoint_path

    try:
        with open(checkpoint_path, "r", encoding="utf-8") as checkpoint_file:
            payload = json.load(checkpoint_file)
    except (OSError, json.JSONDecodeError) as error:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        replacement = checkpoint_path.with_name(
            f"{checkpoint_path.stem}_{stamp}{checkpoint_path.suffix or '.json'}"
        )
        print(
            f"ADVERTENCIA: checkpoint corrupto/no legible ({error}). "
            f"Se ignorara y se usara {replacement}"
        )
        return [], replacement

    records = payload.get("results") or payload.get("registros") or []

    if not isinstance(records, list):
        return [], checkpoint_path

    return records, checkpoint_path


def write_checkpoint(
    checkpoint_path,
    records,
    args,
    total_files,
    total_found,
    started_at,
    elapsed,
    rate_count=None,
):
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

    summary = summarize(
        records,
        total_found,
        elapsed,
        workers=args.workers,
        batch_size=args.batch_size,
        checkpoint=checkpoint_path,
        rate_count=rate_count,
    )

    payload = {
        "timestamp": datetime.now().isoformat(),
        "startedAt": started_at.isoformat(),
        "folder": str(Path(args.folder).resolve()),
        "url": args.url,
        "totalFiles": total_files,
        "totalFound": total_found,
        "processedFiles": len(records),
        "successfulFiles": summary["exitosas"],
        "failedFiles": summary["fallidas"],
        "workers": args.workers,
        "batchSize": args.batch_size,
        "summary": summary,
        "results": records,
    }

    tmp_path = checkpoint_path.with_suffix(f"{checkpoint_path.suffix}.tmp")

    with open(tmp_path, "w", encoding="utf-8") as checkpoint_file:
        json.dump(payload, checkpoint_file, ensure_ascii=False, indent=2, default=str)

    tmp_path.replace(checkpoint_path)


def chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def ordered_records(records_by_path, file_order):
    return sorted(
        records_by_path.values(),
        key=lambda record: file_order.get(record.get("rutaArchivo"), sys.maxsize),
    )


def format_duration(seconds):
    seconds = max(0, int(seconds))
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)

    if hours:
        return f"{hours}h {minutes}m {sec}s"
    if minutes:
        return f"{minutes}m {sec}s"
    return f"{sec}s"


def progress_snapshot(
    records,
    total_selected,
    total_found,
    started_perf,
    workers,
    batch_size,
    checkpoint,
    skipped_count=0,
):
    elapsed = time.perf_counter() - started_perf
    uploaded_this_run = max(0, len(records) - skipped_count)
    summary = summarize(
        records,
        total_found,
        elapsed,
        workers=workers,
        batch_size=batch_size,
        checkpoint=checkpoint,
        rate_count=uploaded_this_run,
    )
    processed = len(records)
    rate_per_min = summary["promedioActasPorMinuto"]
    remaining = total_selected - processed
    eta = (remaining / (rate_per_min / 60)) if rate_per_min > 0 else 0
    return summary, rate_per_min, eta


def print_result_progress(
    record,
    records,
    total_selected,
    total_found,
    started_perf,
    workers,
    batch_size,
    checkpoint,
    skipped_count=0,
):
    summary, rate_per_min, eta = progress_snapshot(
        records,
        total_selected,
        total_found,
        started_perf,
        workers,
        batch_size,
        checkpoint,
        skipped_count=skipped_count,
    )
    processed = len(records)
    failed = summary["fallidas"]
    print(
        f"  [{processed}/{total_selected}] {record.get('nombreArchivo')}: "
        f"{short_progress_label(record)} | ok={summary['exitosas']} "
        f"fallidas={failed} val={summary['validadas']} sosp={summary['sospechosas']} "
        f"pend={summary['pendientesRevision']} rech={summary['rechazadas']} "
        f"http={summary['erroresHttp']} conn={summary['erroresConexion']} "
        f"dup={summary['duplicadas']} actas/min={rate_per_min:.2f} "
        f"restante={format_duration(eta)}"
    )


def process_batch_sequential(
    batch,
    args,
    batch_number,
    records_by_path,
    file_order,
    total_selected,
    total_found,
    started_perf,
    checkpoint_path,
    skipped_count=0,
):
    for index, file_path in enumerate(batch):
        record = upload_and_build_record(
            args.url,
            file_path,
            args.timeout,
            args.retries,
            args.retry_delay,
            batch_number,
        )
        records_by_path[str(file_path)] = record
        records = ordered_records(records_by_path, file_order)
        print_result_progress(
            record,
            records,
            total_selected,
            total_found,
            started_perf,
            args.workers,
            args.batch_size,
            checkpoint_path,
            skipped_count=skipped_count,
        )

        if args.delay > 0 and index < len(batch) - 1:
            time.sleep(args.delay)


def process_batch_parallel(
    batch,
    args,
    batch_number,
    records_by_path,
    file_order,
    total_selected,
    total_found,
    started_perf,
    checkpoint_path,
    skipped_count=0,
):
    executor = ThreadPoolExecutor(max_workers=args.workers)
    future_to_file = {}

    try:
        for index, file_path in enumerate(batch):
            future = executor.submit(
                upload_and_build_record,
                args.url,
                file_path,
                args.timeout,
                args.retries,
                args.retry_delay,
                batch_number,
            )
            future_to_file[future] = file_path

            if args.delay > 0 and index < len(batch) - 1:
                time.sleep(args.delay)

        for future in as_completed(future_to_file):
            file_path = future_to_file[future]
            try:
                record = future.result()
            except Exception as error:  # pragma: no cover - defensivo
                record = build_record(
                    file_path,
                    {
                        "categoria": "ERROR_CONEXION",
                        "httpStatus": None,
                        "body": None,
                        "error": str(error),
                        "errorTipo": "WORKER_ERROR",
                        "errorMensaje": str(error),
                        "retryCount": args.retries,
                        "finalAttemptStatus": "WORKER_ERROR",
                        "elapsedSeconds": None,
                    },
                    batch_number=batch_number,
                )

            records_by_path[str(file_path)] = record
            records = ordered_records(records_by_path, file_order)
            print_result_progress(
                record,
                records,
                total_selected,
                total_found,
                started_perf,
                args.workers,
                args.batch_size,
                checkpoint_path,
                skipped_count=skipped_count,
            )
    except KeyboardInterrupt:
        for future in future_to_file:
            future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)
        raise
    else:
        executor.shutdown(wait=True)


def print_summary(summary):
    print()
    print("=" * 60)
    print("Resumen del lote")
    print("=" * 60)

    ordered_keys = [
        "totalEncontrados",
        "totalProcesados",
        "validadas",
        "sospechosas",
        "pendientesRevision",
        "rechazadas",
        "erroresHttp",
        "erroresConexion",
        "duplicadas",
        "conAdvertenciasVisuales",
        "conErrorOCR",
        "tiempoTotalSegundos",
        "promedioActasPorMinuto",
        "workersUsados",
        "batchSizeUsado",
        "checkpoint",
    ]

    for key in ordered_keys:
        print(f"  {key}: {summary.get(key)}")


def main():
    args = parse_args()
    validate_args(args)

    checkpoint_path = resolve_checkpoint_path(args)

    print(f"Carpeta:    {args.folder}")
    print(f"Backend:    {args.url}")
    print(f"Recursivo:  {args.recursive}")
    print(f"Workers:    {args.workers}")
    print(f"Batch size: {args.batch_size}")
    print(f"Timeout:    {args.timeout}s")
    print(f"Retries:    {args.retries}")
    print(f"Checkpoint: {checkpoint_path}")

    if args.limit is not None:
        print(f"Limite:     {args.limit}")

    if args.delay > 0:
        print(f"Delay:      {args.delay}s entre archivos/submisiones")

    if args.pause_between_batches > 0:
        print(f"Pausa:      {args.pause_between_batches}s entre batches")

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

    selected_paths = {str(path) for path in files}
    file_order = {str(path): index for index, path in enumerate(files)}
    records_by_path = {}
    skipped = 0

    if args.resume:
        loaded_records, checkpoint_path = load_checkpoint(checkpoint_path)
        for record in loaded_records:
            ruta = record.get("rutaArchivo") or record.get("ruta")
            if ruta in selected_paths:
                records_by_path[ruta] = record

        skipped = sum(
            1
            for record in records_by_path.values()
            if record.get("success") is True
        )
        if skipped:
            print(f"Resume: se omitiran {skipped} archivos ya exitosos.")

        files = [
            path
            for path in files
            if not (
                records_by_path.get(str(path), {}).get("success") is True
            )
        ]

    total_selected = len(file_order)
    total_to_upload = len(files)

    print(f"Archivos encontrados: {total_found}")
    print(f"Archivos seleccionados: {total_selected}")
    print(f"Archivos a subir ahora: {total_to_upload}")
    print()

    started_at = datetime.now()
    started_perf = time.perf_counter()
    interrupted = False

    total_batches = math.ceil(total_to_upload / args.batch_size) if total_to_upload else 0

    try:
        for batch_number, batch in enumerate(chunks(files, args.batch_size), start=1):
            print(
                f"Batch {batch_number}/{total_batches}: "
                f"{len(batch)} archivos con {args.workers} worker(s)"
            )

            if args.workers == 1:
                process_batch_sequential(
                    batch,
                    args,
                    batch_number,
                    records_by_path,
                    file_order,
                    total_selected,
                    total_found,
                    started_perf,
                    checkpoint_path,
                    skipped_count=skipped,
                )
            else:
                process_batch_parallel(
                    batch,
                    args,
                    batch_number,
                    records_by_path,
                    file_order,
                    total_selected,
                    total_found,
                    started_perf,
                    checkpoint_path,
                    skipped_count=skipped,
                )

            elapsed = time.perf_counter() - started_perf
            records = ordered_records(records_by_path, file_order)
            uploaded_this_run = max(0, len(records) - skipped)
            write_checkpoint(
                checkpoint_path,
                records,
                args,
                total_selected,
                total_found,
                started_at,
                elapsed,
                rate_count=uploaded_this_run,
            )
            print(f"  Checkpoint actualizado: {checkpoint_path}")

            if args.pause_between_batches > 0 and batch_number < total_batches:
                time.sleep(args.pause_between_batches)

    except KeyboardInterrupt:
        interrupted = True
        print()
        print("Interrumpido por usuario. Guardando progreso parcial...")

    elapsed = time.perf_counter() - started_perf
    records = ordered_records(records_by_path, file_order)
    uploaded_this_run = max(0, len(records) - skipped)
    summary = summarize(
        records,
        total_found,
        elapsed,
        workers=args.workers,
        batch_size=args.batch_size,
        checkpoint=checkpoint_path,
        rate_count=uploaded_this_run,
    )
    summary["interrumpido"] = interrupted

    write_checkpoint(
        checkpoint_path,
        records,
        args,
        total_selected,
        total_found,
        started_at,
        elapsed,
        rate_count=uploaded_this_run,
    )

    json_path, csv_path = write_reports(records, summary, started_at)

    print_summary(summary)

    print()
    print(f"Reporte JSON: {json_path}")
    print(f"Reporte CSV:  {csv_path}")

    if interrupted:
        print("Ejecucion interrumpida. Puede continuar con --resume.")
        sys.exit(130)


if __name__ == "__main__":
    main()
