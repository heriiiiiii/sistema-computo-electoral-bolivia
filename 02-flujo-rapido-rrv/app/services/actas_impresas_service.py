"""Carga opcional de actas impresas y base territorial de la practica.

ActasImpresas.csv es la fuente canonica para saber que codigoActa/codigoMesa
existe, a que recinto pertenece, cual es su numero de mesa y cuantos votantes
habilitados debe tener.
"""

import csv
import logging
import re
import threading
import unicodedata
from pathlib import Path

from app.config.settings import (
    ACTAS_IMPRESAS_PATH,
    DISTRIBUCION_TERRITORIAL_PATH,
    RECINTOS_ELECTORALES_PATH,
)

try:
    from app.utils.ocr_normalization_utils import normalize_codigo_numerico
except Exception:  # pragma: no cover - util siempre presente, fallback defensivo
    normalize_codigo_numerico = None


_FILENAME_DIGITS_RE = re.compile(r"(\d{6,20})")


logger = logging.getLogger(__name__)

_CACHE = {
    "loaded": False,
    "actas": {},
    "recintos": {},
    "territorial": {},
    "paths": {},
    "errors": {},
}
_LOCK = threading.Lock()


def _strip_accents(value: str) -> str:
    if not value:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(value))
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def _normalize_key(value: str) -> str:
    return _strip_accents(value or "").strip().lower().replace(" ", "")


def normalize_text(value) -> str:
    return _strip_accents(value or "").strip().lower()


def _clean_row(row):
    return {
        _normalize_key(key): (value or "").strip()
        for key, value in (row or {}).items()
    }


def _safe_int(value):
    try:
        if value is None or value == "":
            return None
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _read_csv_rows(path_str, cache_key):
    if not path_str:
        _CACHE["errors"][cache_key] = "PATH_NO_CONFIGURADO"
        return []

    path = Path(path_str)
    _CACHE["paths"][cache_key] = path_str

    if not path.exists() or not path.is_file():
        _CACHE["errors"][cache_key] = "CSV_NO_DISPONIBLE"
        return []

    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as csv_file:
            return list(csv.DictReader(csv_file))
    except Exception as error:
        logger.warning("No se pudo leer %s: %s", path, error)
        _CACHE["errors"][cache_key] = str(error)
        return []


def _load_recintos():
    recintos = {}

    for row in _read_csv_rows(RECINTOS_ELECTORALES_PATH, "recintos"):
        clean = _clean_row(row)
        codigo_recinto = clean.get("codigorecinto")

        if not codigo_recinto:
            continue

        recintos[str(codigo_recinto)] = {
            "recintoCode": clean.get("recintocode"),
            "codigoTerritorial": clean.get("codigoterritorial"),
            "codigoRecinto": codigo_recinto,
            "recintoNombre": clean.get("recintonombre"),
            "recintoDireccion": clean.get("recintodireccion"),
            "numMesas": _safe_int(clean.get("nummesas")),
        }

    return recintos


def _load_territorial():
    territorial = {}

    for row in _read_csv_rows(DISTRIBUCION_TERRITORIAL_PATH, "territorial"):
        clean = _clean_row(row)
        codigo_territorial = clean.get("codigoterritorial")

        if not codigo_territorial:
            continue

        # IMPORTANTE: el archivo "DistribucionTerritorial.csv" del recurso de la
        # practica tiene los encabezados invertidos (header dice "Municipio,Provincia"
        # pero los valores reales estan en orden Provincia,Municipio).
        # Por ejemplo, fila 10101: "Chuquisaca,Oropeza,Sucre" donde Oropeza es la
        # PROVINCIA real y Sucre el MUNICIPIO. Aqui corregimos la asignacion para
        # que el resto del sistema reciba provincia y municipio en sus claves
        # correctas. El validador entonces compara provincia<->provincia y
        # municipio<->municipio sin cruzarlos.
        territorial[str(codigo_territorial)] = {
            "codigoTerritorial": codigo_territorial,
            "departamento": clean.get("departamento"),
            "provincia": clean.get("municipio"),
            "municipio": clean.get("provincia"),
        }

    return territorial


def _load_actas(recintos, territorial):
    actas = {}

    for row in _read_csv_rows(ACTAS_IMPRESAS_PATH, "actas"):
        clean = _clean_row(row)
        codigo_acta = clean.get("codigoacta")

        if not codigo_acta:
            continue

        codigo_recinto = clean.get("codigorecinto")
        recinto = recintos.get(str(codigo_recinto)) if codigo_recinto else None
        territorio = None

        if recinto and recinto.get("codigoTerritorial"):
            territorio = territorial.get(str(recinto.get("codigoTerritorial")))

        actas[str(codigo_acta)] = {
            "codigoActa": str(codigo_acta),
            "codigoMesa": str(codigo_acta),
            "codigoRecinto": str(codigo_recinto) if codigo_recinto else None,
            "nroMesa": _safe_int(clean.get("nromesa")),
            "votantesHabilitados": _safe_int(clean.get("votanteshabilitados")),
            "recinto": recinto,
            "territorial": territorio,
        }

    return actas


def _ensure_loaded():
    if _CACHE["loaded"]:
        return

    with _LOCK:
        if _CACHE["loaded"]:
            return

        _CACHE["paths"] = {
            "actas": ACTAS_IMPRESAS_PATH,
            "recintos": RECINTOS_ELECTORALES_PATH,
            "territorial": DISTRIBUCION_TERRITORIAL_PATH,
        }
        _CACHE["errors"] = {}

        recintos = _load_recintos()
        territorial = _load_territorial()
        actas = _load_actas(recintos, territorial)

        _CACHE["recintos"] = recintos
        _CACHE["territorial"] = territorial
        _CACHE["actas"] = actas
        _CACHE["loaded"] = True


def get_acta_impresa(codigo_acta):
    """Devuelve el registro canonico de ActasImpresas por CodigoActa."""
    if not codigo_acta:
        return None

    _ensure_loaded()
    return _CACHE["actas"].get(str(codigo_acta).strip())


def get_actas_impresas_status():
    _ensure_loaded()

    return {
        "paths": dict(_CACHE["paths"]),
        "errors": dict(_CACHE["errors"]),
        "actasImpresasAvailable": "actas" not in _CACHE["errors"] and bool(_CACHE["actas"]),
        "recintosAvailable": "recintos" not in _CACHE["errors"] and bool(_CACHE["recintos"]),
        "territorialAvailable": "territorial" not in _CACHE["errors"] and bool(_CACHE["territorial"]),
        "totalActas": len(_CACHE["actas"]),
        "totalRecintos": len(_CACHE["recintos"]),
        "totalTerritorial": len(_CACHE["territorial"]),
    }


def reload_cache():
    with _LOCK:
        _CACHE["loaded"] = False
        _CACHE["actas"] = {}
        _CACHE["recintos"] = {}
        _CACHE["territorial"] = {}
        _CACHE["paths"] = {}
        _CACHE["errors"] = {}

    _ensure_loaded()


# ---------------------------------------------------------------------------
# Resolucion de territorio oficial (enriquecimiento geografico).
#
# Esta funcion NO cambia estados ni resultados de la acta. Solo intenta
# encontrar el departamento/provincia/municipio/recinto oficial a partir del
# codigoMesa o, en su defecto, del nombre/url del archivo (patron
# "acta_<digitos>.pdf"). Su unico proposito es alimentar el dashboard
# geografico de RRV cuando la ubicacion extraida del acta este vacia o no
# coincida con la base territorial oficial.
# ---------------------------------------------------------------------------


def _normalize_codigo_str(value):
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    if text.isdigit():
        return text

    if normalize_codigo_numerico is not None:
        try:
            parsed = normalize_codigo_numerico(text)
        except Exception:
            parsed = None

        if isinstance(parsed, dict) and parsed.get("esConfiable"):
            normalized = parsed.get("valorNormalizado")
            if normalized and str(normalized).isdigit():
                return str(normalized)

    digits_only = re.sub(r"\D", "", text)
    return digits_only or None


def _extract_codigo_from_filename(*candidates):
    for candidate in candidates:
        if not candidate:
            continue

        text = str(candidate)

        # Strip path components first so 'storage/actas/acta_123.pdf' works.
        try:
            stem = Path(text).name
        except Exception:
            stem = text

        match = _FILENAME_DIGITS_RE.search(stem)
        if not match:
            continue

        digits = match.group(1)
        if 8 <= len(digits) <= 20:
            return digits

    return None


def _empty_resolution(motivo):
    return {
        "resuelto": False,
        "fuente": "none",
        "codigoMesaOficial": None,
        "codigoRecintoOficial": None,
        "codigoTerritorial": None,
        "numeroMesaOficial": None,
        "cantidadHabilitadosOficial": None,
        "departamento": None,
        "provincia": None,
        "municipio": None,
        "recinto": {"nombre": None, "direccion": None},
        "motivoNoResuelto": motivo,
    }


def resolve_official_territory_for_acta(acta):
    """Resuelve el territorio oficial de una acta para enriquecimiento geografico.

    Devuelve un dict con la forma documentada en CLAUDE/PHASE-2. Nunca cambia
    estado ni datos de la acta; el caller decide como persistirlo.
    """
    if not isinstance(acta, dict):
        return _empty_resolution("SIN_CODIGO_MESA")

    fuente = "codigoMesa"
    codigo_mesa = _normalize_codigo_str(acta.get("codigoMesa"))

    if not codigo_mesa:
        archivo = acta.get("archivo") or {}
        candidato = _extract_codigo_from_filename(
            archivo.get("nombreOriginal"),
            archivo.get("urlArchivo"),
        )

        if candidato:
            codigo_mesa = _normalize_codigo_str(candidato)
            fuente = "filename" if codigo_mesa else fuente

    if not codigo_mesa:
        # Si tampoco hay nombre/url utilizable, intentamos desde codigoRecinto
        codigo_recinto_directo = _normalize_codigo_str(acta.get("codigoRecinto"))
        if codigo_recinto_directo:
            return _resolve_from_codigo_recinto(codigo_recinto_directo)
        return _empty_resolution(
            "CODIGO_MESA_NO_EXTRAIBLE"
            if (acta.get("archivo") or {}).get("nombreOriginal")
            or (acta.get("archivo") or {}).get("urlArchivo")
            else "SIN_CODIGO_MESA"
        )

    acta_impresa = get_acta_impresa(codigo_mesa)

    if not acta_impresa:
        # Posible: el codigo se confundio en OCR. Probemos con codigoRecinto si lo hay.
        codigo_recinto_directo = _normalize_codigo_str(acta.get("codigoRecinto"))
        if codigo_recinto_directo:
            via_recinto = _resolve_from_codigo_recinto(codigo_recinto_directo)
            if via_recinto.get("resuelto"):
                via_recinto["codigoMesaOficial"] = codigo_mesa
                via_recinto["fuente"] = (
                    "codigoMesa+codigoRecinto"
                    if fuente == "codigoMesa"
                    else f"{fuente}+codigoRecinto"
                )
                return via_recinto
        return _empty_resolution("ACTA_IMPRESA_NO_EXISTE")

    recinto = acta_impresa.get("recinto") or {}
    territorio = acta_impresa.get("territorial") or {}

    if not recinto:
        return _empty_resolution("RECINTO_NO_EXISTE")

    if not territorio:
        return _empty_resolution("DISTRIBUCION_TERRITORIAL_NO_EXISTE")

    return {
        "resuelto": True,
        "fuente": fuente,
        "codigoMesaOficial": str(acta_impresa.get("codigoMesa") or codigo_mesa),
        "codigoRecintoOficial": str(acta_impresa.get("codigoRecinto") or recinto.get("codigoRecinto") or ""),
        "codigoTerritorial": str(territorio.get("codigoTerritorial") or ""),
        "numeroMesaOficial": acta_impresa.get("nroMesa"),
        "cantidadHabilitadosOficial": acta_impresa.get("votantesHabilitados"),
        "departamento": territorio.get("departamento"),
        "provincia": territorio.get("provincia"),
        "municipio": territorio.get("municipio"),
        "recinto": {
            "nombre": recinto.get("recintoNombre"),
            "direccion": recinto.get("recintoDireccion"),
        },
        "motivoNoResuelto": None,
    }


def _resolve_from_codigo_recinto(codigo_recinto):
    _ensure_loaded()
    recinto = _CACHE["recintos"].get(str(codigo_recinto))
    if not recinto:
        return _empty_resolution("RECINTO_NO_EXISTE")

    codigo_territorial = recinto.get("codigoTerritorial")
    territorio = (
        _CACHE["territorial"].get(str(codigo_territorial))
        if codigo_territorial
        else None
    )

    if not territorio:
        return _empty_resolution("DISTRIBUCION_TERRITORIAL_NO_EXISTE")

    return {
        "resuelto": True,
        "fuente": "codigoRecinto",
        "codigoMesaOficial": None,
        "codigoRecintoOficial": str(recinto.get("codigoRecinto") or codigo_recinto),
        "codigoTerritorial": str(codigo_territorial or ""),
        "numeroMesaOficial": None,
        "cantidadHabilitadosOficial": None,
        "departamento": territorio.get("departamento"),
        "provincia": territorio.get("provincia"),
        "municipio": territorio.get("municipio"),
        "recinto": {
            "nombre": recinto.get("recintoNombre"),
            "direccion": recinto.get("recintoDireccion"),
        },
        "motivoNoResuelto": None,
    }
