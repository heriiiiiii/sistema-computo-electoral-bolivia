"""Servicio de respaldo local para actas que no pudieron persistirse en MongoDB.

Si la insercion en MongoDB falla por cualquier motivo (cluster caido, timeout,
write error, etc.), el archivo original NO se debe perder. Este servicio guarda
una copia del archivo en `storage/revision/YYYY-MM-DD/` junto con un JSON de
metadatos y registra el incidente en `storage/revision/revision_errors.log`.

El servicio es deliberadamente tolerante a fallos: si algo falla aqui, intenta
no propagar la excepcion al endpoint principal para no derribar FastAPI; en su
lugar registra lo que pueda en el log local y devuelve un dict con el resultado
del intento.
"""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

REVISION_ROOT = Path("storage/revision")
REVISION_LOG_FILE = REVISION_ROOT / "revision_errors.log"


def _ensure_revision_dirs(now: datetime) -> Path:
    REVISION_ROOT.mkdir(parents=True, exist_ok=True)
    day_folder = REVISION_ROOT / now.strftime("%Y-%m-%d")
    day_folder.mkdir(parents=True, exist_ok=True)
    return day_folder


def _serialize_for_json(value):
    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, Path):
        return str(value).replace("\\", "/")

    return str(value)


def _safe_str(value, default=""):
    if value is None:
        return default

    try:
        return str(value)
    except Exception:
        return default


def append_revision_log(message: str) -> None:
    """Anexa una linea al log local. Crea archivo y carpeta si hacen falta."""
    try:
        REVISION_ROOT.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).isoformat()
        line = f"[{timestamp}] {message}\n"

        with open(REVISION_LOG_FILE, "a", encoding="utf-8") as log_file:
            log_file.write(line)

    except Exception:
        # Nunca propagar errores del log de revision al endpoint.
        pass


def save_acta_to_revision(
    file_bytes: bytes,
    nombre_original: str,
    tipo_archivo: str,
    metadata: dict,
    error_mongo: str,
    file_path_original: str = None,
):
    """Guarda el archivo y un JSON de metadatos en storage/revision.

    Devuelve un dict con la informacion del respaldo. Nunca lanza excepciones
    al caller; si algo falla se registra en el revision_errors.log.
    """
    now = datetime.now(timezone.utc)

    backup_summary = {
        "guardado": False,
        "rutaArchivoRevision": None,
        "rutaMetadatosRevision": None,
        "fechaRespaldo": now.isoformat(),
        "errorRespaldo": None,
    }

    try:
        day_folder = _ensure_revision_dirs(now)
    except Exception as error:
        backup_summary["errorRespaldo"] = f"NO_SE_PUDO_CREAR_CARPETA: {error}"
        append_revision_log(
            f"ERROR creando carpeta storage/revision: {error}"
        )
        return backup_summary

    acta_id = (metadata or {}).get("actaId") or f"REV-{uuid4().hex[:8].upper()}"

    safe_name = (nombre_original or "archivo").strip().replace("/", "_").replace("\\", "_")
    if not safe_name:
        safe_name = "archivo"

    revision_filename = f"{acta_id}__{safe_name}"
    target_file_path = day_folder / revision_filename
    metadata_filename = f"{acta_id}__metadata.json"
    metadata_path = day_folder / metadata_filename

    # 1) Intentar copiar/escribir el archivo original.
    file_saved = False

    if file_bytes:
        try:
            with open(target_file_path, "wb") as out:
                out.write(file_bytes)
            file_saved = True
        except Exception as error:
            append_revision_log(
                f"ERROR escribiendo archivo en revision para acta {acta_id}: {error}"
            )

    if not file_saved and file_path_original:
        try:
            origin = Path(file_path_original)
            if origin.exists():
                shutil.copy2(origin, target_file_path)
                file_saved = True
        except Exception as error:
            append_revision_log(
                f"ERROR copiando {file_path_original} a revision para {acta_id}: {error}"
            )

    if file_saved:
        backup_summary["rutaArchivoRevision"] = (
            str(target_file_path).replace("\\", "/")
        )

    # 2) Escribir JSON de metadatos (siempre que se pueda).
    metadata_payload = dict(metadata or {})
    metadata_payload.setdefault("actaId", acta_id)
    metadata_payload["nombreOriginal"] = nombre_original
    metadata_payload["tipoArchivo"] = tipo_archivo
    metadata_payload["fechaRespaldo"] = now.isoformat()
    metadata_payload["errorMongo"] = _safe_str(error_mongo, "DESCONOCIDO")
    metadata_payload["rutaArchivoRevision"] = backup_summary["rutaArchivoRevision"]
    metadata_payload["rutaArchivoOriginal"] = (
        _safe_str(file_path_original) if file_path_original else None
    )

    try:
        with open(metadata_path, "w", encoding="utf-8") as meta_out:
            json.dump(
                metadata_payload,
                meta_out,
                ensure_ascii=False,
                indent=2,
                default=_serialize_for_json,
            )
        backup_summary["rutaMetadatosRevision"] = (
            str(metadata_path).replace("\\", "/")
        )
    except Exception as error:
        append_revision_log(
            f"ERROR escribiendo metadata en revision para acta {acta_id}: {error}"
        )
        backup_summary["errorRespaldo"] = f"NO_SE_PUDO_ESCRIBIR_METADATA: {error}"

    backup_summary["guardado"] = file_saved or backup_summary["rutaMetadatosRevision"] is not None

    append_revision_log(
        f"ACTA_REVISION acta_id={acta_id} archivo='{nombre_original}' "
        f"motivo='{metadata_payload.get('motivoRevision', 'MONGO_WRITE_ERROR')}' "
        f"errorMongo='{_safe_str(error_mongo)}' "
        f"archivoGuardado={file_saved} "
        f"rutaRevision={backup_summary['rutaArchivoRevision']}"
    )

    return backup_summary
