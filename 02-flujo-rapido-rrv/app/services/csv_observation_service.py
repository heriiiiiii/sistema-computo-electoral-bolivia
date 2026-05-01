"""Carga opcional del CSV de observaciones de transcripcion oficial.

El CSV es un insumo opcional. Si no existe, no se puede leer o trae cabeceras
raras, el RRV sigue funcionando con sus validaciones automaticas.

Ademas de la columna "Observaciones", el CSV de practica puede traer una
columna sin nombre inmediatamente despues de "Observaciones". Esa columna se
trata como CasosEspeciales/NotasPrueba y puede aplicar a un codigo puntual o a
un rango de codigos existentes en el propio CSV.
"""

import csv
import logging
import re
import threading
import unicodedata
from pathlib import Path

from app.config.settings import OEP_CSV_OBSERVATIONS_PATH


logger = logging.getLogger(__name__)

_CACHE = {
    "loaded": False,
    "path": None,
    "observations": {},
    "special_cases": {},
    "error": None,
}
_LOCK = threading.Lock()


# Aliases tolerados para las columnas, en minusculas y sin tildes.
_KEY_ALIASES = {
    "codigomesa": "codigoMesa",
    "codigoacta": "codigoMesa",
    "mesa": "codigoMesa",
    "numerocodigomesa": "codigoMesa",
}

_OBS_ALIASES = {
    "observacion": "observacion",
    "observaciones": "observacion",
    "observaciontranscripcion": "observacion",
    "obstranscripcion": "observacion",
    "obs": "observacion",
}

_SPECIAL_ALIASES = {
    "casosespeciales": "casoEspecial",
    "casoespecial": "casoEspecial",
    "notasprueba": "casoEspecial",
    "notaprueba": "casoEspecial",
}

_CODE_RE = re.compile(r"\b\d{11,}\b")
_RANGE_RE = re.compile(r"\b(\d{11,})\b\s*(?:-|x|X)\s*\b(\d{11,})\b(.*)")


def _strip_accents(value: str) -> str:
    if not value:
        return ""
    nf = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in nf if not unicodedata.combining(ch))


def _normalize_header(header: str) -> str:
    return _strip_accents(header or "").strip().lower().replace(" ", "")


def _detect_dialect(sample: str):
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        return None


def _cell(row, index):
    if index is None or index >= len(row):
        return ""
    return (row[index] or "").strip()


def _find_column_indexes(headers):
    codigo_idx = None
    observacion_idx = None
    special_idx = None

    normalized_headers = [_normalize_header(header) for header in headers]

    for index, normalized in enumerate(normalized_headers):
        if codigo_idx is None and normalized in _KEY_ALIASES:
            codigo_idx = index

        if observacion_idx is None and normalized in _OBS_ALIASES:
            observacion_idx = index

        if special_idx is None and normalized in _SPECIAL_ALIASES:
            special_idx = index

    # La practica trae una cabecera vacia justo despues de Observaciones.
    if (
        observacion_idx is not None
        and observacion_idx + 1 < len(normalized_headers)
        and normalized_headers[observacion_idx + 1] == ""
    ):
        special_idx = observacion_idx + 1

    return codigo_idx, observacion_idx, special_idx


def _codes_in_existing_range(existing_codes, start_code, end_code):
    start = int(start_code)
    end = int(end_code)

    if start > end:
        start, end = end, start

    return [
        code
        for code in existing_codes
        if code.isdigit() and start <= int(code) <= end
    ]


def _extract_targets_from_note(note, row_code, existing_codes):
    raw_note = (note or "").strip()

    if not raw_note:
        return [], raw_note

    range_match = _RANGE_RE.search(raw_note)

    if range_match:
        start_code, end_code, remainder = range_match.groups()
        targets = _codes_in_existing_range(existing_codes, start_code, end_code)
        validation_note = (remainder or "").strip() or raw_note
        return targets, validation_note

    codes = _CODE_RE.findall(raw_note)

    if codes:
        target = codes[0]
        validation_note = raw_note.replace(target, "", 1).strip(" -:") or raw_note
        return [target], validation_note

    return ([row_code] if row_code else []), raw_note


def _append_special_case(special_cases, code, raw_note, validation_note, row_code):
    if not code:
        return

    item = {
        "texto": raw_note,
        "notaValidacion": validation_note or raw_note,
        "codigoFilaOrigen": row_code,
    }

    special_cases.setdefault(str(code), []).append(item)


def _load_csv(path: Path) -> dict:
    """Lee observaciones y casos especiales desde un CSV tolerante."""
    observations = {}
    special_cases = {}
    rows = []

    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as csv_file:
            sample = csv_file.read(4096)
            csv_file.seek(0)

            dialect = _detect_dialect(sample)
            reader = csv.reader(csv_file, dialect=dialect) if dialect else csv.reader(csv_file)

            try:
                headers = next(reader)
            except StopIteration:
                return {"observations": observations, "special_cases": special_cases}

            codigo_idx, observacion_idx, special_idx = _find_column_indexes(headers)

            if codigo_idx is None:
                return {"observations": observations, "special_cases": special_cases}

            for raw_row in reader:
                codigo_mesa = _cell(raw_row, codigo_idx)

                if not codigo_mesa:
                    continue

                observacion = _cell(raw_row, observacion_idx)
                special_note = _cell(raw_row, special_idx)

                if codigo_mesa not in observations:
                    observations[codigo_mesa] = observacion or ""

                rows.append({
                    "codigoMesa": codigo_mesa,
                    "casoEspecial": special_note,
                })

        existing_codes = [row["codigoMesa"] for row in rows if row.get("codigoMesa")]

        for row in rows:
            raw_note = row.get("casoEspecial") or ""
            if not raw_note.strip():
                continue

            targets, validation_note = _extract_targets_from_note(
                raw_note,
                row.get("codigoMesa"),
                existing_codes,
            )

            for target in targets:
                if target in existing_codes:
                    _append_special_case(
                        special_cases,
                        target,
                        raw_note.strip(),
                        validation_note,
                        row.get("codigoMesa"),
                    )

    except Exception as error:
        logger.warning("No se pudo leer CSV de observaciones OEP: %s", error)
        return {"__error__": str(error)}

    return {
        "observations": observations,
        "special_cases": special_cases,
    }


def _ensure_loaded():
    if _CACHE["loaded"]:
        return

    with _LOCK:
        if _CACHE["loaded"]:
            return

        path_str = OEP_CSV_OBSERVATIONS_PATH
        _CACHE["path"] = path_str

        if not path_str:
            _CACHE["observations"] = {}
            _CACHE["special_cases"] = {}
            _CACHE["error"] = "CSV_PATH_NO_CONFIGURADO"
            _CACHE["loaded"] = True
            return

        path = Path(path_str)

        if not path.exists() or not path.is_file():
            _CACHE["observations"] = {}
            _CACHE["special_cases"] = {}
            _CACHE["error"] = "CSV_NO_DISPONIBLE"
            _CACHE["loaded"] = True
            return

        result = _load_csv(path)

        if isinstance(result, dict) and "__error__" in result:
            _CACHE["observations"] = {}
            _CACHE["special_cases"] = {}
            _CACHE["error"] = result["__error__"]
        else:
            _CACHE["observations"] = result.get("observations", {})
            _CACHE["special_cases"] = result.get("special_cases", {})
            _CACHE["error"] = None

        _CACHE["loaded"] = True


def get_official_observation(codigo_mesa) -> str | None:
    """Devuelve la observacion oficial del CSV para un codigoMesa, o None."""
    if not codigo_mesa:
        return None

    _ensure_loaded()

    return _CACHE["observations"].get(str(codigo_mesa)) or None


def get_special_case(codigo_mesa) -> str | None:
    """Devuelve el/los casos especiales del CSV para un codigoMesa, o None."""
    if not codigo_mesa:
        return None

    _ensure_loaded()

    cases = _CACHE["special_cases"].get(str(codigo_mesa)) or []
    texts = [item.get("texto") for item in cases if item.get("texto")]

    return " | ".join(texts) if texts else None


def get_csv_validation_metadata(codigo_mesa) -> dict:
    """Devuelve observacion oficial y casos especiales para una mesa."""
    if not codigo_mesa:
        return {
            "codigoMesa": None,
            "observacionOficial": None,
            "casoEspecialCSV": None,
            "casosEspecialesCSV": [],
        }

    _ensure_loaded()

    code = str(codigo_mesa)
    cases = _CACHE["special_cases"].get(code) or []
    texts = [item.get("texto") for item in cases if item.get("texto")]

    return {
        "codigoMesa": code,
        "observacionOficial": _CACHE["observations"].get(code) or None,
        "casoEspecialCSV": " | ".join(texts) if texts else None,
        "casosEspecialesCSV": cases,
    }


def is_csv_available() -> bool:
    _ensure_loaded()
    return (
        _CACHE["error"] is None
        and (bool(_CACHE["observations"]) or bool(_CACHE["special_cases"]))
    )


def get_status() -> dict:
    _ensure_loaded()
    return {
        "path": _CACHE["path"],
        "available": is_csv_available(),
        "totalObservaciones": len(_CACHE["observations"]),
        "totalCasosEspeciales": sum(
            len(items) for items in _CACHE["special_cases"].values()
        ),
        "error": _CACHE["error"],
    }


def reload_cache():
    """Forzar recarga (util para tests o si el CSV se actualiza en caliente)."""
    with _LOCK:
        _CACHE["loaded"] = False
        _CACHE["observations"] = {}
        _CACHE["special_cases"] = {}
        _CACHE["error"] = None

    _ensure_loaded()
