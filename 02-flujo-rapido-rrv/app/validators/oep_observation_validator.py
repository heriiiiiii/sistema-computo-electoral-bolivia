"""Validador de inconsistencias OEP / Ley 026 para actas RRV.

Importante: El RRV es un flujo PRELIMINAR, no oficial. Por eso este modulo
nunca declara nulidad legal de un acta. Aplica las reglas de la Ley 026 y de
los formularios oficiales del OEP unicamente como criterios para clasificar
operativamente cada acta en uno de los estados permitidos:

    VALIDADA, SOSPECHOSA, PENDIENTE_REVISION, RECHAZADA.

La funcion publica `validate_oep_inconsistencies` es defensiva:
- ningun error interno debe propagarse,
- los campos faltantes no pueden romper la validacion,
- los numeros invalidos se manejan con seguridad,
- si el CSV de observaciones oficiales reporta un problema y el detector
  automatico no lo confirma, igual se anade una advertencia con
  fuente=CSV_OBSERVATION para evitar que el acta pase como VALIDADA.
"""

import re
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from app.services.actas_impresas_service import (
    get_acta_impresa,
    get_actas_impresas_status,
)
from app.utils.text_normalization_utils import (
    clean_broken_text,
    normalize_text_for_comparison as _shared_normalize_for_comparison,
    texts_match_with_similarity,
)
from app.utils.ocr_normalization_utils import normalize_ocr_number

try:
    from app.config.settings import (
        EXPECTED_ELECTION_DATE,
        EXPECTED_OPENING_HOUR_MAX,
        EXPECTED_OPENING_HOUR_MIN,
        EXPECTED_VOTING_DURATION_HOURS,
        TERRITORIAL_BASE_PATH,
    )
except Exception:  # pragma: no cover - defensivo
    EXPECTED_ELECTION_DATE = "2025-08-17"
    EXPECTED_OPENING_HOUR_MIN = 7
    EXPECTED_OPENING_HOUR_MAX = 10
    EXPECTED_VOTING_DURATION_HOURS = 8
    TERRITORIAL_BASE_PATH = "storage/oep/base_territorial.csv"


# ---------------------------------------------------------------------------
# Estado y prioridad
# ---------------------------------------------------------------------------

ESTADO_VALIDADA = "VALIDADA"
ESTADO_PENDIENTE = "PENDIENTE_REVISION"
ESTADO_SOSPECHOSA = "SOSPECHOSA"
ESTADO_RECHAZADA = "RECHAZADA"

_STATE_PRIORITY = {
    ESTADO_VALIDADA: 0,
    ESTADO_PENDIENTE: 1,
    ESTADO_SOSPECHOSA: 2,
    ESTADO_RECHAZADA: 3,
}


# Codigo -> estado a sugerir si aparece en errores.
# El estado final del acta sera el de mayor prioridad de toda la lista.
_CODE_STATE_MAP = {
    # Horarios
    "HORA_APERTURA_FALTANTE": ESTADO_PENDIENTE,
    "HORA_CIERRE_FALTANTE": ESTADO_PENDIENTE,
    "HORA_APERTURA_FORMATO_INVALIDO": ESTADO_PENDIENTE,
    "HORA_CIERRE_FORMATO_INVALIDO": ESTADO_PENDIENTE,
    "HORA_CIERRE_ANTES_APERTURA": ESTADO_SOSPECHOSA,
    "HORA_APERTURA_FUERA_RANGO": ESTADO_SOSPECHOSA,
    "CIERRE_ANTES_DE_8_HORAS": ESTADO_SOSPECHOSA,
    "CIERRE_EXTENDIDO": ESTADO_VALIDADA,           # solo WARNING, no afecta estado
    "CIERRE_MUY_EXTENDIDO": ESTADO_VALIDADA,       # WARNING informativo, no degrada
    "CIERRE_MUY_EXTENDIDO_SIN_OBSERVACION": ESTADO_PENDIENTE,
    "CIERRE_EXTENDIDO_SIN_OBSERVACION": ESTADO_SOSPECHOSA,
    "CIERRE_EXTREMADAMENTE_EXTENDIDO": ESTADO_VALIDADA,
    "CIERRE_EXTREMADAMENTE_EXTENDIDO_SIN_OBSERVACION": ESTADO_SOSPECHOSA,

    # Ubicacion
    "MESA_NO_EXISTE": ESTADO_RECHAZADA,
    "RECINTO_NO_EXISTE": ESTADO_RECHAZADA,
    "MESA_NO_PERTENECE_RECINTO": ESTADO_SOSPECHOSA,
    "UBICACION_NO_COINCIDE_BASE_TERRITORIAL": ESTADO_SOSPECHOSA,
    "RECINTO_EXTRAIDO_DIFERENTE": ESTADO_SOSPECHOSA,
    "TEXTO_TERRITORIAL_NORMALIZADO": ESTADO_VALIDADA,
    "TERRITORIO_CORREGIDO_POR_BASE_OFICIAL": ESTADO_VALIDADA,
    "ACTAS_IMPRESAS_NO_DISPONIBLE": ESTADO_VALIDADA,
    "ACTA_IMPRESA_NO_EXISTE": ESTADO_RECHAZADA,
    "ACTA_RECINTO_NO_COINCIDE": ESTADO_SOSPECHOSA,
    "ACTA_NUMERO_MESA_NO_COINCIDE": ESTADO_SOSPECHOSA,
    "HABILITADOS_NO_COINCIDE_ACTA_IMPRESA": ESTADO_SOSPECHOSA,
    "HABILITADOS_FALTANTE_ACTA_IMPRESA": ESTADO_PENDIENTE,
    "MESA_FUERA_DE_RANGO_RECINTO": ESTADO_SOSPECHOSA,
    "DIRECCION_RECINTO_DIFERENTE": ESTADO_SOSPECHOSA,
    "DEPARTAMENTO_NO_COINCIDE": ESTADO_SOSPECHOSA,
    "PROVINCIA_NO_COINCIDE": ESTADO_SOSPECHOSA,
    "MUNICIPIO_NO_COINCIDE": ESTADO_SOSPECHOSA,
    "BASE_TERRITORIAL_NO_DISPONIBLE": ESTADO_VALIDADA,

    # Formulario
    "FORMULARIO_NO_OFICIAL": ESTADO_RECHAZADA,
    "FORMATO_ACTA_NO_RECONOCIDO": ESTADO_SOSPECHOSA,
    "ENCABEZADO_OFICIAL_NO_DETECTADO": ESTADO_PENDIENTE,
    "ZONA_RESULTADOS_NO_DETECTADA": ESTADO_PENDIENTE,
    "ZONA_JURADOS_NO_DETECTADA": ESTADO_PENDIENTE,
    "ZONA_OBSERVACIONES_NO_DETECTADA": ESTADO_VALIDADA,
    "MARCADORES_OFICIALES_INSUFICIENTES": ESTADO_SOSPECHOSA,

    # Fecha
    "FECHA_ELECCION_FALTANTE": ESTADO_PENDIENTE,
    "FECHA_ELECCION_FORMATO_INVALIDO": ESTADO_PENDIENTE,
    "FECHA_ELECCION_NO_COINCIDE": ESTADO_SOSPECHOSA,

    # Delegados
    "DELEGADOS_AUSENTES_SIN_OBSERVACION": ESTADO_PENDIENTE,
    "ZONA_DELEGADOS_NO_VISIBLE": ESTADO_PENDIENTE,
    "DELEGADOS_ILEGIBLES": ESTADO_PENDIENTE,

    # Correcciones / tachaduras
    "TACHADURA_EN_RESULTADOS": ESTADO_SOSPECHOSA,
    "BORRON_EN_RESULTADOS": ESTADO_SOSPECHOSA,
    "ENMIENDA_EN_RESULTADOS": ESTADO_SOSPECHOSA,
    "ALTERACION_SIN_OBSERVACION": ESTADO_SOSPECHOSA,
    "OBSERVACION_ILEGIBLE": ESTADO_PENDIENTE,

    # Firmas / huellas
    "ZONA_JURADOS_NO_VISIBLE": ESTADO_PENDIENTE,
    "FIRMAS_HUELLAS_INSUFICIENTES": ESTADO_SOSPECHOSA,
    "ZONA_FIRMAS_RECORTADA": ESTADO_PENDIENTE,
    "FIRMAS_HUELLAS_ILEGIBLES": ESTADO_PENDIENTE,

    # Aritmetica
    "VOTO_PARTIDO_NO_NUMERICO": ESTADO_PENDIENTE,
    "VOTO_PARTIDO_NEGATIVO": ESTADO_RECHAZADA,
    "VOTOS_BLANCOS_NEGATIVO": ESTADO_RECHAZADA,
    "VOTOS_NULOS_NEGATIVO": ESTADO_RECHAZADA,
    "VOTOS_VALIDOS_NEGATIVO": ESTADO_RECHAZADA,
    "TOTAL_VOTOS_NEGATIVO": ESTADO_RECHAZADA,
    "CANTIDAD_HABILITADOS_NEGATIVA": ESTADO_RECHAZADA,
    "PAPELETAS_ANFORA_NEGATIVA": ESTADO_RECHAZADA,
    "PAPELETAS_NO_UTILIZADAS_NEGATIVA": ESTADO_RECHAZADA,
    "VALOR_NUMERICO_NEGATIVO": ESTADO_RECHAZADA,
    "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS": ESTADO_SOSPECHOSA,
    "TOTAL_INCOHERENTE": ESTADO_SOSPECHOSA,
    "TOTAL_NO_COINCIDE_PAPELETAS_ANFORA": ESTADO_SOSPECHOSA,
    "PAPELETAS_NO_COINCIDEN_HABILITADOS": ESTADO_SOSPECHOSA,
    "TOTAL_SUPERA_HABILITADOS": ESTADO_RECHAZADA,
    "TOTAL_SUPERA_PAPELETAS_ANFORA": ESTADO_SOSPECHOSA,

    # Papeletas
    "PAPELETAS_NO_AUTORIZADAS_REPORTADAS": ESTADO_SOSPECHOSA,
    # Solo limitacion del sistema (INFO): no debe degradar el estado.
    "PAPELETAS_NO_AUTORIZADAS_NO_VERIFICABLE_AUTOMATICAMENTE": ESTADO_VALIDADA,
    "FORMULARIO_O_PAPELETA_NO_OFICIAL": ESTADO_SOSPECHOSA,

    # Normalizaciones OCR: nunca degradan estado por si solas (INFO).
    "OCR_CODIGO_MESA_NORMALIZADO": ESTADO_VALIDADA,
    "OCR_NUMERICO_NORMALIZADO": ESTADO_VALIDADA,
    "OCR_CORRECCION_APLICADA": ESTADO_VALIDADA,
    "OCR_SIGNO_NEGATIVO_CORREGIDO": ESTADO_VALIDADA,
    "OCR_REPARACION_NO_RESUELVE_ARITMETICA": ESTADO_SOSPECHOSA,
    "FORMULARIO_VALIDADO_POR_ESTRUCTURA": ESTADO_VALIDADA,
    "FORMATO_VALIDADO_POR_CAMPOS_ESTRUCTURADOS": ESTADO_VALIDADA,

    # Casos especiales / notas de prueba del CSV.
    "IMAGEN_GIRADA_90": ESTADO_PENDIENTE,
    "IMAGEN_GIRADA_180": ESTADO_PENDIENTE,
    "ACTA_AL_REVES": ESTADO_PENDIENTE,
    "IMAGEN_GIRADA_270": ESTADO_PENDIENTE,
    "ARCHIVO_COMPRIMIDO_O_CALIDAD_REDUCIDA": ESTADO_PENDIENTE,
    "ACTA_ANULADA_REPORTADA": ESTADO_SOSPECHOSA,
    "DATOS_BORRADOS": ESTADO_SOSPECHOSA,
    "ALTERACION_DIGITOS": ESTADO_SOSPECHOSA,
    "ACTA_DUPLICADA_REPORTADA": ESTADO_SOSPECHOSA,
    "IMAGEN_RECORTADA": ESTADO_PENDIENTE,
    "PDF_PLANO_ESPERADO": ESTADO_PENDIENTE,
    "TAMANIO_PAGINA_INESPERADO": ESTADO_PENDIENTE,
    "CAMBIO_NULOS_BLANCO": ESTADO_SOSPECHOSA,
    # Confusion menor: si el valor se parsea OK, no degradar.
    "POSIBLE_CONFUSION_OCR_CARACTERES": ESTADO_VALIDADA,
    "PATRON_NUMERICO_SOSPECHOSO": ESTADO_SOSPECHOSA,
    "CASO_ESPECIAL_NO_CLASIFICADO": ESTADO_PENDIENTE,
}


# ---------------------------------------------------------------------------
# Marcadores OFICIALES esperados en una acta OEP
# ---------------------------------------------------------------------------

OFFICIAL_FORM_MARKERS = [
    "ACTA ELECTORAL",
    "ESCRUTINIO",
    "CONTEO",
    "ORIGINAL",
    "JURADOS",
    "OBSERVACIONES",
    "PAPELETAS",
    "ANFORA",
    "VALIDOS",
    "BLANCOS",
    "NULOS",
    "MESA",
    "RECINTO",
]

# Cuando aparecen suficientes marcadores el formulario se considera oficial.
MIN_MARKERS_OFFICIAL = 7
MIN_MARKERS_PARTIAL = 4


# ---------------------------------------------------------------------------
# Mapeo de observaciones del CSV oficial -> categoria interna de regla
# ---------------------------------------------------------------------------

_CSV_OBS_CATEGORIES = [
    ("HORARIO", [
        "falta de datos de apertura",
        "falta de datos de cierre",
        "falta de datos de apertura o cierre",
        "datos de apertura o cierre",
    ]),
    ("UBICACION", [
        "mesa en lugar distinto",
        "mesa en lugar diferente",
        "ubicacion incorrecta",
    ]),
    ("FORMULARIO", [
        "formulario no oficial",
        "formularios no oficiales",
        "uso de formularios no oficiales",
        "papeleta no oficial",
    ]),
    ("FECHA", [
        "fecha incorrecta",
        "fecha de eleccion",
    ]),
    ("DELEGADOS", [
        "ausencia de delegados",
        "delegados sin justificacion",
    ]),
    ("CORRECCIONES", [
        "tachadura",
        "tachaduras",
        "enmienda",
        "enmiendas",
        "errores de transcripcion",
        "transcripcion no aclarad",
    ]),
    ("FIRMAS", [
        "falta de firmas",
        "falta de huellas",
        "firmas o huellas",
        "firmas y huellas",
    ]),
    ("ARITMETICA", [
        "inconsistencia aritmetica",
        "inconsistencias aritmeticas",
        "error aritmetico",
    ]),
    ("PAPELETAS", [
        "papeletas no autorizadas",
        "papeleta no autorizada",
    ]),
]


# ---------------------------------------------------------------------------
# Cache de la base territorial (CSV opcional)
# ---------------------------------------------------------------------------

_TERRITORIAL_CACHE = {
    "loaded": False,
    "data": {},
    "available": False,
    "error": None,
}


def _strip_accents(value: str) -> str:
    if not value:
        return ""
    nfkd = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def _normalize_text(value) -> str:
    return _strip_accents(str(value or "")).lower().strip()


def _normalize_for_comparison(value) -> str:
    """Delegate to the shared text normalization utility.

    Lives here as a thin wrapper so the rest of this module reads naturally
    and so any future change can be done in a single place
    (`app.utils.text_normalization_utils`).
    """
    return _shared_normalize_for_comparison(value)


def _safe_int(value):
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_int_with_ocr_repair(value, field_name, repairs):
    """_safe_int extendido que intenta reparar caracteres confundidos por OCR.

    - Si el valor ya es un int o un string puramente numerico, lo devuelve.
    - Si es un string con caracteres reconocibles (O,l,B,S,Z,G,A,...)
      intenta normalizarlo con `normalize_ocr_number`. Si la conversion es
      confiable, registra la correccion en `repairs` y devuelve el numero.
    - Cualquier otro caso devuelve None (mismo contrato que _safe_int).
    """
    base = _safe_int(value)
    if base is not None:
        return base

    if value is None or isinstance(value, bool):
        return None

    repair = normalize_ocr_number(value, field_name=field_name)
    if not repair.get("esConfiable") or repair.get("numero") is None:
        return None

    if repair.get("correcciones"):
        _append_unique_normalization(
            repairs,
            {
                "campo": field_name,
                "valorOriginal": repair.get("valorOriginal"),
                "valorNormalizado": repair.get("valorNormalizado"),
                "numero": repair.get("numero"),
                "correcciones": repair.get("correcciones"),
                "tipo": "numero",
            },
        )

    return repair.get("numero")


def _append_unique_normalization(items, item):
    key = (
        item.get("campo"),
        str(item.get("valorOriginal")),
        str(item.get("valorNormalizado") or item.get("valorCorregido")),
        item.get("metodo") or item.get("tipo"),
    )
    for existing in items:
        existing_key = (
            existing.get("campo"),
            str(existing.get("valorOriginal")),
            str(existing.get("valorNormalizado") or existing.get("valorCorregido")),
            existing.get("metodo") or existing.get("tipo"),
        )
        if existing_key == key:
            return
    items.append(item)


def _normalize_time_with_ocr_repair(value, field_name, repairs):
    if value is None or isinstance(value, bool):
        return value

    if not isinstance(value, str):
        return value

    if _parse_hhmm(value) is not None:
        return value

    repair = normalize_ocr_number(value, field_name=field_name)
    normalized = repair.get("valorNormalizado")

    if (
        repair.get("esConfiable")
        and normalized
        and normalized != str(value)
        and _parse_hhmm(normalized) is not None
    ):
        _append_unique_normalization(
            repairs,
            {
                "campo": field_name,
                "valorOriginal": repair.get("valorOriginal"),
                "valorNormalizado": normalized,
                "numero": repair.get("numero"),
                "correcciones": repair.get("correcciones"),
                "tipo": "hora",
            },
        )
        return normalized

    return value


def _parse_hhmm(value):
    if not value or not isinstance(value, str):
        return None
    match = re.fullmatch(r"\s*(\d{1,2})\s*:\s*(\d{2})\s*", value)
    if not match:
        return None
    hours = int(match.group(1))
    minutes = int(match.group(2))
    if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
        return None
    return hours * 60 + minutes


def _load_territorial_base():
    if _TERRITORIAL_CACHE["loaded"]:
        return _TERRITORIAL_CACHE

    _TERRITORIAL_CACHE["loaded"] = True

    path_str = TERRITORIAL_BASE_PATH

    if not path_str:
        _TERRITORIAL_CACHE["error"] = "TERRITORIAL_PATH_NO_CONFIGURADO"
        return _TERRITORIAL_CACHE

    path = Path(path_str)

    if not path.exists() or not path.is_file():
        _TERRITORIAL_CACHE["error"] = "TERRITORIAL_NO_DISPONIBLE"
        return _TERRITORIAL_CACHE

    try:
        import csv

        with open(path, "r", encoding="utf-8-sig", newline="") as csv_file:
            reader = csv.DictReader(csv_file)

            for row in reader:
                clean = {
                    (k or "").strip().lower(): (v or "").strip()
                    for k, v in row.items()
                }

                codigo_mesa = (
                    clean.get("codigomesa")
                    or clean.get("codigoacta")
                    or clean.get("mesa")
                )

                if not codigo_mesa:
                    continue

                _TERRITORIAL_CACHE["data"][str(codigo_mesa)] = {
                    "codigoRecinto": clean.get("codigorecinto"),
                    "departamento": clean.get("departamento"),
                    "provincia": clean.get("provincia"),
                    "municipio": clean.get("municipio"),
                    "recinto": clean.get("recinto") or clean.get("nombrerecinto"),
                }

        _TERRITORIAL_CACHE["available"] = True
    except Exception as error:
        _TERRITORIAL_CACHE["error"] = f"TERRITORIAL_LOAD_FAILED: {error}"

    return _TERRITORIAL_CACHE


def _categorize_csv_observation(observation: str):
    """Devuelve lista de categorias de regla detectadas en la observacion."""
    if not observation:
        return []

    normalized = _normalize_text(observation)

    if not normalized:
        return []

    categorias = []

    for categoria, frases in _CSV_OBS_CATEGORIES:
        for frase in frases:
            if frase in normalized:
                if categoria not in categorias:
                    categorias.append(categoria)
                break

    return categorias


# ---------------------------------------------------------------------------
# Construccion de contexto compartido
# ---------------------------------------------------------------------------


class _Context:
    def __init__(self, acta, extracted_text, visual_quality):
        acta = acta or {}

        self.acta = acta

        # Buffer donde se acumulan reparaciones OCR aplicadas a campos
        # numericos. Si queda no vacio, el validador emite OCR_NUMERICO_NORMALIZADO.
        self.normalizaciones_ocr = []
        self.normalizaciones_texto = []
        self.csv_special_case_note = None

        # codigoMesa / codigoRecinto se pueden tratar como string identificadores;
        # la reparacion contra ActasImpresas se hace en _try_repair_codigo_mesa.
        self.codigo_mesa = acta.get("codigoMesa")
        self.codigo_recinto = acta.get("codigoRecinto")
        self.numero_mesa = _safe_int_with_ocr_repair(
            acta.get("numeroMesa"), "numeroMesa", self.normalizaciones_ocr
        )
        if self.numero_mesa is not None and acta.get("numeroMesa") != self.numero_mesa:
            acta["numeroMesa"] = self.numero_mesa

        self.ubicacion = acta.get("ubicacion") or {}

        datos = acta.get("datosActa") or {}
        self.datos_acta = datos

        habilitados_raw = (
            datos.get("cantidadHabilitados")
            if datos.get("cantidadHabilitados") is not None
            else datos.get("cantidadElectoresHabilitados")
        )
        self.cantidad_habilitados = _safe_int_with_ocr_repair(
            habilitados_raw, "cantidadHabilitados", self.normalizaciones_ocr
        )
        if self.cantidad_habilitados is not None:
            datos["cantidadHabilitados"] = self.cantidad_habilitados

        self.papeletas_anfora = _safe_int_with_ocr_repair(
            datos.get("papeletasEnAnfora"),
            "papeletasEnAnfora",
            self.normalizaciones_ocr,
        )
        if self.papeletas_anfora is not None:
            datos["papeletasEnAnfora"] = self.papeletas_anfora

        self.papeletas_no_util = _safe_int_with_ocr_repair(
            datos.get("papeletasNoUtilizadas"),
            "papeletasNoUtilizadas",
            self.normalizaciones_ocr,
        )
        if self.papeletas_no_util is not None:
            datos["papeletasNoUtilizadas"] = self.papeletas_no_util

        self.hora_apertura = _normalize_time_with_ocr_repair(
            datos.get("horaApertura"),
            "horaApertura",
            self.normalizaciones_ocr,
        )
        if self.hora_apertura != datos.get("horaApertura"):
            datos["horaApertura"] = self.hora_apertura

        self.hora_cierre = _normalize_time_with_ocr_repair(
            datos.get("horaCierre"),
            "horaCierre",
            self.normalizaciones_ocr,
        )
        if self.hora_cierre != datos.get("horaCierre"):
            datos["horaCierre"] = self.hora_cierre

        ocr = acta.get("ocr") or {}
        self.ocr = ocr
        text_from_acta = ocr.get("textoExtraido") or ""
        self.texto = (extracted_text or text_from_acta or "")
        self.texto_normalizado = _normalize_text(self.texto)

        resultados = (acta.get("resultados") or {}).get("presidente") or {}
        self.resultados = resultados

        repaired_partidos = []
        for partido in resultados.get("votosPartidos") or []:
            if not isinstance(partido, dict):
                repaired_partidos.append(partido)
                continue
            cantidad_raw = partido.get("cantidadVotos")
            cantidad_int = _safe_int_with_ocr_repair(
                cantidad_raw,
                f"votosPartidos.{partido.get('partidoCodigo', '')}",
                self.normalizaciones_ocr,
            )
            if cantidad_int is not None and cantidad_raw != cantidad_int:
                partido["cantidadVotos"] = cantidad_int
            repaired_partidos.append(partido)
        self.votos_partidos = repaired_partidos

        validos_repaired = _safe_int_with_ocr_repair(
            resultados.get("votosValidos"), "votosValidos", self.normalizaciones_ocr
        )
        if validos_repaired is not None:
            resultados["votosValidos"] = validos_repaired
        self.votos_validos = validos_repaired or 0

        blancos_repaired = _safe_int_with_ocr_repair(
            resultados.get("votosBlancos"), "votosBlancos", self.normalizaciones_ocr
        )
        if blancos_repaired is not None:
            resultados["votosBlancos"] = blancos_repaired
        self.votos_blancos = blancos_repaired or 0

        nulos_repaired = _safe_int_with_ocr_repair(
            resultados.get("votosNulos"), "votosNulos", self.normalizaciones_ocr
        )
        if nulos_repaired is not None:
            resultados["votosNulos"] = nulos_repaired
        self.votos_nulos = nulos_repaired or 0

        total_repaired = _safe_int_with_ocr_repair(
            resultados.get("totalVotos"), "totalVotos", self.normalizaciones_ocr
        )
        if total_repaired is not None:
            resultados["totalVotos"] = total_repaired
        self.total_votos = total_repaired or 0

        self.resultados_diputado = (
            (acta.get("resultados") or {}).get("diputadoUninominal") or {}
        )
        self.votos_partidos_diputado = self._normalize_resultado_section(
            self.resultados_diputado,
            "diputadoUninominal",
        )

        qr = acta.get("qr") or {}
        self.qr = qr

        self.visual = visual_quality or acta.get("calidadVisual") or {}
        self.errores_visuales = self.visual.get("erroresVisuales") or []
        self.codigos_visuales = {
            (item.get("codigo") if isinstance(item, dict) else str(item))
            for item in self.errores_visuales
        }

        self.detected = {
            "marcadoresOficiales": [],
            "marcadoresOficialesCount": 0,
            "horarioCoherente": None,
            "aritmeticaCoherente": None,
            "delegadosVisibles": None,
            "firmasVisibles": None,
            "correccionesDetectadas": False,
            "fechaEleccionDetectada": None,
            "observacionTextoOCR": None,
        }

    def _normalize_resultado_section(self, resultados, prefix):
        if not resultados:
            return []

        repaired_partidos = []
        for partido in resultados.get("votosPartidos") or []:
            if not isinstance(partido, dict):
                repaired_partidos.append(partido)
                continue

            cantidad_raw = partido.get("cantidadVotos")
            field_name = f"{prefix}.votosPartidos.{partido.get('partidoCodigo', '')}"
            cantidad_int = _safe_int_with_ocr_repair(
                cantidad_raw,
                field_name,
                self.normalizaciones_ocr,
            )
            if cantidad_int is not None and cantidad_raw != cantidad_int:
                partido["cantidadVotos"] = cantidad_int
            repaired_partidos.append(partido)

        for key in ["votosValidos", "votosBlancos", "votosNulos", "totalVotos"]:
            repaired = _safe_int_with_ocr_repair(
                resultados.get(key),
                f"{prefix}.{key}",
                self.normalizaciones_ocr,
            )
            if repaired is not None:
                resultados[key] = repaired

        return repaired_partidos


def _add_error(errores, codigo, descripcion, severidad, fuente, **extra):
    item = {
        "codigo": codigo,
        "descripcion": descripcion,
        "severidad": severidad,
        "fuente": fuente,
    }
    if extra:
        item.update(extra)
    errores.append(item)


def _dedupe_errors(errores):
    """Quita duplicados de la lista de errores antes de persistir.

    Clave: (codigo, fuente, campoComparado o campo, valorExtraido).
    Esto evita entradas repetidas como SUMA_PARTIDOS_NO_COINCIDE_VALIDOS x2
    o TERRITORIAL ... PROVINCIA_NO_COINCIDE x2 que aparecian cuando varias
    rutas del validador agregaban el mismo hallazgo.
    """
    deduped = []
    seen = set()

    for error in errores or []:
        if not isinstance(error, dict):
            continue
        key = (
            error.get("codigo"),
            error.get("fuente"),
            error.get("campoComparado") or error.get("campo"),
            (
                str(error.get("valorOriginal"))
                if error.get("valorOriginal") is not None
                else str(error.get("valorExtraido"))
                if error.get("valorExtraido") is not None
                else None
            ),
            (
                str(error.get("valorNormalizado"))
                if error.get("valorNormalizado") is not None
                else str(error.get("valorCorregido"))
                if error.get("valorCorregido") is not None
                else None
            ),
            str(error.get("valorEsperado")) if error.get("valorEsperado") is not None else None,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(error)

    return deduped


def _texts_match(actual, expected):
    """Backwards-compatible boolean check (delegates to fuzzy matcher)."""
    return bool(texts_match_with_similarity(actual, expected).get("match"))


def _texts_match_detailed(actual, expected):
    """Returns structured text comparison evidence.

    Used by _check_ubicacion to expose the similarity score in the debug
    payload of territorial mismatches and to absorb OCR encoding artifacts
    (e.g. "Zud\\x00\\x00ez" vs "Zudanez").
    """
    return texts_match_with_similarity(actual, expected)


def _comparison_debug_payload(ctx, campo, actual, expected, match_info, territorial=None):
    territorial = territorial or {}
    return {
        "campoComparado": campo,
        "valorExtraido": actual,
        "valorEsperado": expected,
        "valorExtraidoLimpio": match_info.get("extractedClean"),
        "valorEsperadoLimpio": match_info.get("expectedClean"),
        "valorExtraidoNormalizado": match_info.get("extractedNormalized"),
        "valorEsperadoNormalizado": match_info.get("expectedNormalized"),
        "similitudNormalizada": round(match_info.get("similarity") or 0.0, 4),
        "metodoComparacion": match_info.get("method"),
        "codigoMesa": ctx.codigo_mesa,
        "codigoRecinto": ctx.codigo_recinto,
        "codigoTerritorial": territorial.get("codigoTerritorial"),
    }


def _method_for_text_trace(match_info):
    method = match_info.get("method")
    if method == "damaged_fuzzy":
        return "damaged_fuzzy_base_territorial"
    if method == "fuzzy":
        return "fuzzy_base_territorial"
    return "exact_normalized_base_territorial"


def _set_location_value(ctx, campo, expected_value):
    if campo in ("departamento", "provincia", "municipio"):
        ctx.ubicacion[campo] = expected_value
        ctx.acta.setdefault("ubicacion", ctx.ubicacion)[campo] = expected_value
        return

    if campo in ("recinto.nombre", "recinto.direccion"):
        recinto = ctx.ubicacion.setdefault("recinto", {})
        ctx.acta.setdefault("ubicacion", ctx.ubicacion)["recinto"] = recinto
        key = campo.split(".", 1)[1]
        recinto[key] = expected_value


def _record_text_normalization(ctx, errores, campo, actual, expected, match_info, territorial=None):
    if not actual or not expected:
        return

    if clean_broken_text(actual) == clean_broken_text(expected):
        return

    territorial = territorial or {}
    trace = {
        "campo": campo,
        "valorOriginal": actual,
        "valorCorregido": expected,
        "valorOriginalNormalizado": match_info.get("extractedNormalized"),
        "valorEsperadoNormalizado": match_info.get("expectedNormalized"),
        "metodo": _method_for_text_trace(match_info),
        "similitud": round(match_info.get("similarity") or 0.0, 4),
        "codigoMesa": ctx.codigo_mesa,
        "codigoRecinto": ctx.codigo_recinto,
        "codigoTerritorial": territorial.get("codigoTerritorial"),
    }
    _append_unique_normalization(ctx.normalizaciones_texto, trace)
    _set_location_value(ctx, campo, expected)

    _add_error(
        errores,
        "TEXTO_TERRITORIAL_NORMALIZADO",
        "Campo territorial corregido por similitud contra base oficial",
        "INFO",
        "TERRITORIAL",
        campo=campo,
        valorOriginal=actual,
        valorCorregido=expected,
        similitudNormalizada=round(match_info.get("similarity") or 0.0, 4),
        metodoComparacion=match_info.get("method"),
        codigoMesa=ctx.codigo_mesa,
        codigoRecinto=ctx.codigo_recinto,
        codigoTerritorial=territorial.get("codigoTerritorial"),
    )


def _has_low_ocr_confidence(ctx: _Context):
    confidence = ctx.ocr.get("confianzaPromedio")

    if confidence is None:
        return False

    try:
        return float(confidence) < 0.55
    except (TypeError, ValueError):
        return False


# ---------------------------------------------------------------------------
# Reglas
# ---------------------------------------------------------------------------


def _check_horarios(ctx: _Context, errores, reglas, force=False):
    reglas.append("OEP_HORARIO_APERTURA_CIERRE")

    apertura = _parse_hhmm(ctx.hora_apertura)
    cierre = _parse_hhmm(ctx.hora_cierre)

    if not ctx.hora_apertura:
        _add_error(
            errores,
            "HORA_APERTURA_FALTANTE",
            "No se registro horaApertura en el acta",
            "WARNING",
            "OEP_RULE",
        )
    elif apertura is None:
        _add_error(
            errores,
            "HORA_APERTURA_FORMATO_INVALIDO",
            f"horaApertura con formato invalido: {ctx.hora_apertura}",
            "WARNING",
            "OEP_RULE",
        )

    if not ctx.hora_cierre:
        _add_error(
            errores,
            "HORA_CIERRE_FALTANTE",
            "No se registro horaCierre en el acta",
            "WARNING",
            "OEP_RULE",
        )
    elif cierre is None:
        _add_error(
            errores,
            "HORA_CIERRE_FORMATO_INVALIDO",
            f"horaCierre con formato invalido: {ctx.hora_cierre}",
            "WARNING",
            "OEP_RULE",
        )

    if apertura is None or cierre is None:
        ctx.detected["horarioCoherente"] = False
        return

    if (
        apertura < EXPECTED_OPENING_HOUR_MIN * 60
        or apertura > EXPECTED_OPENING_HOUR_MAX * 60
    ):
        _add_error(
            errores,
            "HORA_APERTURA_FUERA_RANGO",
            (
                f"horaApertura ({ctx.hora_apertura}) fuera del rango razonable "
                f"{EXPECTED_OPENING_HOUR_MIN:02d}:00 - {EXPECTED_OPENING_HOUR_MAX:02d}:00"
            ),
            "WARNING",
            "OEP_RULE",
        )

    if cierre <= apertura:
        _add_error(
            errores,
            "HORA_CIERRE_ANTES_APERTURA",
            (
                f"horaCierre ({ctx.hora_cierre}) no es posterior a horaApertura "
                f"({ctx.hora_apertura})"
            ),
            "ERROR",
            "OEP_RULE",
        )
        ctx.detected["horarioCoherente"] = False
        return

    expected_close = apertura + EXPECTED_VOTING_DURATION_HOURS * 60
    delta = cierre - expected_close

    todos_papeletas_usadas = (
        ctx.papeletas_anfora is not None
        and ctx.cantidad_habilitados is not None
        and ctx.papeletas_anfora == ctx.cantidad_habilitados
    )

    if delta < -5 and not todos_papeletas_usadas:
        _add_error(
            errores,
            "CIERRE_ANTES_DE_8_HORAS",
            (
                f"Cierre ({ctx.hora_cierre}) anterior al cierre esperado "
                f"(apertura + {EXPECTED_VOTING_DURATION_HOURS}h). "
                f"papeletasEnAnfora!=cantidadHabilitados, posible cierre prematuro."
            ),
            "WARNING",
            "OEP_RULE",
        )
        ctx.detected["horarioCoherente"] = False
        return

    tiene_observacion = bool(ctx.detected.get("observacionTextoOCR"))

    # Umbrales calibrados (delta = minutos despues del cierre esperado):
    #   <= 30  : tolerancia normal, no se reporta
    #   31..90 : CIERRE_EXTENDIDO (WARNING, NO degrada estado)
    #   91..120: CIERRE_MUY_EXTENDIDO (WARNING; PENDIENTE solo sin observacion)
    #   > 120  : CIERRE_EXTREMADAMENTE_EXTENDIDO (WARNING; SOSPECHOSA solo sin observacion)
    if delta > 120:
        codigo = (
            "CIERRE_EXTREMADAMENTE_EXTENDIDO"
            if tiene_observacion
            else "CIERRE_EXTREMADAMENTE_EXTENDIDO_SIN_OBSERVACION"
        )
        _add_error(
            errores,
            codigo,
            f"Cierre extendido > 120 minutos respecto al cierre esperado",
            "WARNING",
            "OEP_RULE",
        )
    elif delta > 90:
        codigo = (
            "CIERRE_MUY_EXTENDIDO"
            if tiene_observacion
            else "CIERRE_MUY_EXTENDIDO_SIN_OBSERVACION"
        )
        _add_error(
            errores,
            codigo,
            f"Cierre extendido {delta} minutos (>90) respecto al cierre esperado",
            "WARNING",
            "OEP_RULE",
        )
    elif delta > 30:
        _add_error(
            errores,
            "CIERRE_EXTENDIDO",
            f"Cierre extendido {delta} minutos respecto al cierre esperado",
            "WARNING",
            "OEP_RULE",
        )

    ctx.detected["horarioCoherente"] = True


def _try_repair_codigo_mesa(ctx: _Context, errores, reglas):
    """Repara codigoMesa con OCR-confused chars usando ActasImpresas como
    diccionario de verdad.

    Si el codigoMesa original no existe en ActasImpresas, intenta
    normalizarlo (O->0, l->1, B->8, S->5, Z->2, G->6, A->4) y vuelve a
    consultar. Si la version normalizada existe, persiste la version limpia
    en el acta y emite OCR_CODIGO_MESA_NORMALIZADO como INFO trazable.
    """
    if not ctx.codigo_mesa:
        return None

    # Caso feliz: el codigo ya existe limpio.
    direct = get_acta_impresa(ctx.codigo_mesa)
    if direct is not None:
        return direct

    raw = str(ctx.codigo_mesa)
    # Si ya es solo digitos no hay nada que reparar; lo dejamos para que
    # los siguientes checks emitan ACTA_IMPRESA_NO_EXISTE como antes.
    if raw.isdigit():
        return None

    repair = normalize_ocr_number(raw, field_name="codigoMesa")
    normalized = repair.get("valorNormalizado")

    if not normalized or normalized == raw:
        return None

    repaired = get_acta_impresa(normalized)
    if repaired is None:
        return None

    # Persistimos la version limpia para que el resto del flujo (resultados,
    # logs, dashboard, rrv_resultados) use el codigo correcto.
    ctx.acta["codigoMesa"] = normalized
    ctx.codigo_mesa = normalized
    reglas.append("OEP_CODIGO_MESA_OCR_REPARADO")
    if repaired.get("codigoRecinto") and not ctx.codigo_recinto:
        ctx.acta["codigoRecinto"] = repaired.get("codigoRecinto")
        ctx.codigo_recinto = repaired.get("codigoRecinto")

    _append_unique_normalization(
        ctx.normalizaciones_ocr,
        {
            "campo": "codigoMesa",
            "valorOriginal": raw,
            "valorNormalizado": normalized,
            "numero": repair.get("numero"),
            "correcciones": repair.get("correcciones") or [],
            "tipo": "codigoMesa",
            "metodo": "actas_impresas_lookup",
        },
    )

    _add_error(
        errores,
        "OCR_CODIGO_MESA_NORMALIZADO",
        (
            f"codigoMesa OCR='{raw}' fue normalizado a '{normalized}' "
            "y coincide con ActasImpresas."
        ),
        "INFO",
        "OCR",
        valorOriginal=raw,
        valorNormalizado=normalized,
        correcciones=repair.get("correcciones") or [],
    )

    return repaired


def _check_ubicacion(ctx: _Context, errores, reglas, force=False):
    reglas.append("OEP_UBICACION_TERRITORIAL")

    if not ctx.codigo_mesa:
        _add_error(
            errores,
            "ACTA_IMPRESA_NO_EXISTE",
            "El acta no tiene codigoMesa registrado",
            "ERROR",
            "ACTAS_IMPRESAS",
        )
        return

    # FIX OCR: si codigoMesa contiene caracteres confundidos por OCR
    # (O, l, B, S, Z, G, etc.) intentamos repararlo contra ActasImpresas
    # antes de declarar ACTA_IMPRESA_NO_EXISTE.
    _try_repair_codigo_mesa(ctx, errores, reglas)

    status = get_actas_impresas_status()

    if not status.get("actasImpresasAvailable"):
        _add_error(
            errores,
            "ACTAS_IMPRESAS_NO_DISPONIBLE",
            "ActasImpresas.csv no disponible: validacion de acta impresa omitida",
            "INFO",
            "ACTAS_IMPRESAS",
        )

        territorial = _load_territorial_base()

        if not territorial.get("available"):
            _add_error(
                errores,
                "BASE_TERRITORIAL_NO_DISPONIBLE",
                "Base territorial OEP no disponible: validacion territorial omitida",
                "INFO",
                "TERRITORIAL",
            )
            return

        record = territorial["data"].get(str(ctx.codigo_mesa))

        if not record:
            _add_error(
                errores,
                "MESA_NO_EXISTE",
                f"codigoMesa {ctx.codigo_mesa} no existe en la base territorial",
                "ERROR",
                "TERRITORIAL",
            )
            return

        expected_recinto = record.get("codigoRecinto")
        if (
            ctx.codigo_recinto
            and expected_recinto
            and str(ctx.codigo_recinto) != str(expected_recinto)
        ):
            _add_error(
                errores,
                "MESA_NO_PERTENECE_RECINTO",
                (
                    f"codigoMesa {ctx.codigo_mesa} corresponde al recinto "
                    f"{expected_recinto}, no a {ctx.codigo_recinto}"
                ),
                "ERROR",
                "TERRITORIAL",
            )

        expected_dep = record.get("departamento")
        actual_dep = ctx.ubicacion.get("departamento")
        if (
            expected_dep
            and actual_dep
        ):
            match_info = _texts_match_detailed(actual_dep, expected_dep)
            if match_info.get("match"):
                _record_text_normalization(
                    ctx,
                    errores,
                    "departamento",
                    actual_dep,
                    expected_dep,
                    match_info,
                    record,
                )
            else:
                _add_error(
                    errores,
                    "DEPARTAMENTO_NO_COINCIDE",
                    (
                        f"Departamento detectado '{actual_dep}' difiere del esperado "
                        f"'{expected_dep}'"
                    ),
                    "WARNING",
                    "TERRITORIAL",
                    **_comparison_debug_payload(
                        ctx,
                        "departamento",
                        actual_dep,
                        expected_dep,
                        match_info,
                        record,
                    ),
                )
        return

    acta_impresa = get_acta_impresa(ctx.codigo_mesa)

    if not acta_impresa:
        _add_error(
            errores,
            "ACTA_IMPRESA_NO_EXISTE",
            f"CodigoActa {ctx.codigo_mesa} no existe en ActasImpresas.csv",
            "ERROR",
            "ACTAS_IMPRESAS",
        )
        return

    ctx.detected["actaImpresaExiste"] = True
    ctx.detected["actaImpresa"] = {
        "codigoActa": acta_impresa.get("codigoActa"),
        "codigoRecinto": acta_impresa.get("codigoRecinto"),
        "nroMesa": acta_impresa.get("nroMesa"),
        "votantesHabilitados": acta_impresa.get("votantesHabilitados"),
    }

    basic_codes_before = {error.get("codigo") for error in errores}
    expected_recinto = acta_impresa.get("codigoRecinto")

    if expected_recinto and not ctx.codigo_recinto:
        ctx.acta["codigoRecinto"] = expected_recinto
        ctx.codigo_recinto = expected_recinto
        ctx.detected["codigoRecintoCompletadoDesdeActasImpresas"] = True
    elif (
        expected_recinto
        and ctx.codigo_recinto
        and str(ctx.codigo_recinto) != str(expected_recinto)
    ):
        _add_error(
            errores,
            "ACTA_RECINTO_NO_COINCIDE",
            (
                f"codigoRecinto del acta ({ctx.codigo_recinto}) no coincide "
                f"con ActasImpresas ({expected_recinto})"
            ),
            "WARNING",
            "ACTAS_IMPRESAS",
        )

    expected_numero = _safe_int(acta_impresa.get("nroMesa"))
    actual_numero = _safe_int(ctx.numero_mesa)

    if expected_numero is not None and actual_numero is not None and actual_numero != expected_numero:
        _add_error(
            errores,
            "ACTA_NUMERO_MESA_NO_COINCIDE",
            (
                f"numeroMesa del acta ({actual_numero}) no coincide "
                f"con ActasImpresas ({expected_numero})"
            ),
            "WARNING",
            "ACTAS_IMPRESAS",
        )

    expected_habilitados = _safe_int(acta_impresa.get("votantesHabilitados"))
    actual_habilitados = _safe_int(ctx.cantidad_habilitados)

    if expected_habilitados is not None:
        if actual_habilitados is None or _has_low_ocr_confidence(ctx):
            _add_error(
                errores,
                "HABILITADOS_FALTANTE_ACTA_IMPRESA",
                (
                    "cantidadHabilitados faltante o poco confiable para comparar "
                    "contra ActasImpresas"
                ),
                "WARNING",
                "ACTAS_IMPRESAS",
            )
        elif actual_habilitados != expected_habilitados:
            _add_error(
                errores,
                "HABILITADOS_NO_COINCIDE_ACTA_IMPRESA",
                (
                    f"cantidadHabilitados del acta ({actual_habilitados}) "
                    f"no coincide con ActasImpresas ({expected_habilitados})"
                ),
                "WARNING",
                "ACTAS_IMPRESAS",
            )

    basic_error_codes = {
        "ACTA_RECINTO_NO_COINCIDE",
        "ACTA_NUMERO_MESA_NO_COINCIDE",
        "HABILITADOS_NO_COINCIDE_ACTA_IMPRESA",
        "HABILITADOS_FALTANTE_ACTA_IMPRESA",
    }
    ctx.detected["actaImpresaBasicaCoincide"] = not (
        {error.get("codigo") for error in errores} - basic_codes_before
    ).intersection(basic_error_codes)

    recinto = acta_impresa.get("recinto")
    territorial = acta_impresa.get("territorial")

    if not status.get("recintosAvailable") or not status.get("territorialAvailable"):
        _add_error(
            errores,
            "BASE_TERRITORIAL_NO_DISPONIBLE",
            "RecintosElectorales.csv o DistribucionTerritorial.csv no disponible",
            "INFO",
            "TERRITORIAL",
        )
        return

    if not recinto:
        _add_error(
            errores,
            "RECINTO_NO_EXISTE",
            f"CodigoRecinto {expected_recinto} no existe en RecintosElectorales.csv",
            "ERROR",
            "TERRITORIAL",
        )
        return

    num_mesas = _safe_int(recinto.get("numMesas"))

    if (
        expected_numero is not None
        and num_mesas is not None
        and not (1 <= expected_numero <= num_mesas)
    ):
        _add_error(
            errores,
            "MESA_FUERA_DE_RANGO_RECINTO",
            f"NroMesa {expected_numero} fuera del rango 1..{num_mesas} del recinto",
            "WARNING",
            "TERRITORIAL",
        )

    expected_recinto_nombre = recinto.get("recintoNombre")
    actual_recinto = (ctx.ubicacion.get("recinto") or {}).get("nombre")

    if expected_recinto_nombre and actual_recinto:
        match_info = _texts_match_detailed(actual_recinto, expected_recinto_nombre)
        if match_info.get("match"):
            _record_text_normalization(
                ctx,
                errores,
                "recinto.nombre",
                actual_recinto,
                expected_recinto_nombre,
                match_info,
                territorial or {},
            )
        else:
            _add_error(
                errores,
                "RECINTO_EXTRAIDO_DIFERENTE",
                (
                    f"Recinto extraido '{actual_recinto}' difiere del esperado "
                    f"'{expected_recinto_nombre}'"
                ),
                "WARNING",
                "TERRITORIAL",
                **_comparison_debug_payload(
                    ctx,
                    "recinto.nombre",
                    actual_recinto,
                    expected_recinto_nombre,
                    match_info,
                    territorial or {},
                ),
            )

    expected_direccion = recinto.get("recintoDireccion")
    actual_direccion = (ctx.ubicacion.get("recinto") or {}).get("direccion")

    if expected_direccion and actual_direccion:
        match_info = _texts_match_detailed(actual_direccion, expected_direccion)
        if match_info.get("match"):
            _record_text_normalization(
                ctx,
                errores,
                "recinto.direccion",
                actual_direccion,
                expected_direccion,
                match_info,
                territorial or {},
            )
        else:
            _add_error(
                errores,
                "DIRECCION_RECINTO_DIFERENTE",
                (
                    f"Direccion extraida '{actual_direccion}' difiere de la esperada "
                    f"'{expected_direccion}'"
                ),
                "WARNING",
                "TERRITORIAL",
                **_comparison_debug_payload(
                    ctx,
                    "recinto.direccion",
                    actual_direccion,
                    expected_direccion,
                    match_info,
                    territorial or {},
                ),
            )

    if not territorial:
        _add_error(
            errores,
            "BASE_TERRITORIAL_NO_DISPONIBLE",
            "CodigoTerritorial del recinto no existe en DistribucionTerritorial.csv",
            "INFO",
            "TERRITORIAL",
        )
        return

    # Comparamos campo a campo, manteniendo:
    #   ubicacion.departamento <-> territorial.departamento
    #   ubicacion.provincia    <-> territorial.provincia
    #   ubicacion.municipio    <-> territorial.municipio
    # No se cruzan municipio/provincia. La normalizacion en _texts_match
    # (sin tildes, sin puntuacion, espacios colapsados, U.E. == UE)
    # absorbe diferencias menores de formato.
    comparisons = [
        ("departamento", "departamento", "DEPARTAMENTO_NO_COINCIDE"),
        ("provincia", "provincia", "PROVINCIA_NO_COINCIDE"),
        ("municipio", "municipio", "MUNICIPIO_NO_COINCIDE"),
    ]

    mismatch_fields = []

    for actual_key, expected_key, codigo_error in comparisons:
        actual_value = ctx.ubicacion.get(actual_key)
        expected_value = territorial.get(expected_key)

        if not (actual_value and expected_value):
            continue

        match_info = _texts_match_detailed(actual_value, expected_value)

        if match_info.get("match"):
            _record_text_normalization(
                ctx,
                errores,
                actual_key,
                actual_value,
                expected_value,
                match_info,
                territorial,
            )
            continue

        _add_error(
            errores,
            codigo_error,
            (
                f"{actual_key} extraido '{actual_value}' difiere del esperado "
                f"'{expected_value}' "
                f"(similitud={(match_info.get('similarity') or 0.0):.2f})"
            ),
            "WARNING",
            "TERRITORIAL",
            **_comparison_debug_payload(
                ctx,
                actual_key,
                actual_value,
                expected_value,
                match_info,
                territorial,
            ),
        )
        mismatch_fields.append({
            "campo": actual_key,
            "similitud": match_info.get("similarity") or 0.0,
            "hadDamagedChars": match_info.get("hadDamagedChars"),
        })

    # Solo emitimos el codigo generico cuando hay >=2 mismatches en la misma
    # acta (multiples campos no coinciden). Para 1 sola diferencia, basta el
    # codigo especifico que ya tiene los campos de debug. Esto evita inflar
    # el conteo de UBICACION_NO_COINCIDE_BASE_TERRITORIAL en un solo error
    # menor de formato.
    strong_single_mismatch = any(
        item.get("similitud", 0.0) < 0.35 and not item.get("hadDamagedChars")
        for item in mismatch_fields
    )

    if len(mismatch_fields) >= 2 or strong_single_mismatch:
        campos_diferentes = [item.get("campo") for item in mismatch_fields]
        _add_error(
            errores,
            "UBICACION_NO_COINCIDE_BASE_TERRITORIAL",
            f"Ubicacion extraida no coincide con la base territorial en: {', '.join(campos_diferentes)}",
            "WARNING",
            "TERRITORIAL",
            camposDiferentes=campos_diferentes,
            detallesComparacion=mismatch_fields,
            codigoMesa=ctx.codigo_mesa,
            codigoRecinto=ctx.codigo_recinto,
            codigoTerritorial=territorial.get("codigoTerritorial"),
        )


def _check_formulario(ctx: _Context, errores, reglas, force=False):
    reglas.append("OEP_FORMULARIO_OFICIAL")

    texto = ctx.texto_normalizado

    found = []

    if texto:
        for marker in OFFICIAL_FORM_MARKERS:
            if _normalize_text(marker) in texto:
                found.append(marker)

    ctx.detected["marcadoresOficiales"] = found
    ctx.detected["marcadoresOficialesCount"] = len(found)

    if not texto:
        # Si no hubo texto ni del PDF nativo ni del OCR, no podemos juzgar.
        _add_error(
            errores,
            "ENCABEZADO_OFICIAL_NO_DETECTADO",
            "No hay texto disponible para validar el formato del formulario",
            "INFO",
            "OCR",
        )
        return

    count = len(found)
    # Aceptamos la acta como "validada por estructura" cuando los campos
    # esenciales cuadran con ActasImpresas. Aflojamos los requisitos: no
    # exigimos votos_partidos ni papeletas_anfora porque los PDFs generados
    # pueden tener texto plano sin etiquetas, pero la mesa SI existe en la
    # base oficial.
    structured_acta_ok = (
        not force
        and ctx.detected.get("actaImpresaExiste") is True
        and ctx.detected.get("actaImpresaBasicaCoincide") is True
        and bool(ctx.codigo_mesa)
    )

    if count >= MIN_MARKERS_OFFICIAL:
        return

    if structured_acta_ok:
        ctx.detected["formularioAceptadoPorCamposEstructurados"] = True
        _add_error(
            errores,
            "FORMULARIO_VALIDADO_POR_ESTRUCTURA",
            (
                "Formulario aceptado por coincidencia con campos estructurados "
                "de ActasImpresas (codigoMesa, recinto, nro de mesa)."
            ),
            "INFO",
            "OEP_RULE",
        )
        return

    if count >= MIN_MARKERS_PARTIAL:
        _add_error(
            errores,
            "MARCADORES_OFICIALES_INSUFICIENTES",
            (
                f"Solo se detectaron {count}/{len(OFFICIAL_FORM_MARKERS)} "
                f"marcadores oficiales en el formulario"
            ),
            "WARNING",
            "OCR",
        )
        if "JURADOS" not in found:
            _add_error(
                errores,
                "ZONA_JURADOS_NO_DETECTADA",
                "Zona de jurados no detectada en el texto",
                "INFO",
                "OCR",
            )
        if "OBSERVACIONES" not in found:
            _add_error(
                errores,
                "ZONA_OBSERVACIONES_NO_DETECTADA",
                "Zona de observaciones no detectada en el texto",
                "INFO",
                "OCR",
            )
        return

    # Pocos marcadores: formato dudoso o no oficial.
    _add_error(
        errores,
        "FORMATO_ACTA_NO_RECONOCIDO",
        f"Solo se detectaron {count} marcadores oficiales",
        "WARNING",
        "OCR",
    )

    if "ACTA ELECTORAL" not in found and "ESCRUTINIO" not in found:
        _add_error(
            errores,
            "ENCABEZADO_OFICIAL_NO_DETECTADO",
            "No se detecto encabezado tipico de acta OEP",
            "WARNING",
            "OCR",
        )

    if "VALIDOS" not in found and "BLANCOS" not in found:
        _add_error(
            errores,
            "ZONA_RESULTADOS_NO_DETECTADA",
            "No se detectaron las etiquetas de resultados (validos/blancos)",
            "WARNING",
            "OCR",
        )

    # Solo declaramos FORMULARIO_NO_OFICIAL cuando ademas de la falta de
    # marcadores, NO hay rastro de campos estructurados (acta no existe en
    # ActasImpresas, sin codigoMesa coherente). De lo contrario se queda en
    # FORMATO_ACTA_NO_RECONOCIDO (SOSPECHOSA), no RECHAZADA.
    has_structured_evidence = (
        ctx.detected.get("actaImpresaExiste") is True
        or bool(ctx.codigo_mesa)
    )

    if count <= 1 and not has_structured_evidence:
        _add_error(
            errores,
            "FORMULARIO_NO_OFICIAL",
            "El archivo no parece ser un formulario oficial OEP",
            "ERROR",
            "OEP_RULE",
        )


def _check_fecha_eleccion(ctx: _Context, errores, reglas, force=False):
    reglas.append("OEP_FECHA_ELECCION")

    expected_str = (EXPECTED_ELECTION_DATE or "").strip()
    expected_date = None

    try:
        expected_date = datetime.strptime(expected_str, "%Y-%m-%d").date()
    except Exception:
        expected_date = None

    if not ctx.texto:
        if force:
            _add_error(
                errores,
                "FECHA_ELECCION_FALTANTE",
                "No fue posible extraer texto para detectar la fecha de eleccion",
                "WARNING",
                "OCR",
            )
        return

    fecha_match = re.search(
        r"\b(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{2,4})\b",
        ctx.texto,
    )

    if not fecha_match:
        if force:
            _add_error(
                errores,
                "FECHA_ELECCION_FALTANTE",
                "No se detecto una fecha en el texto del acta",
                "WARNING",
                "OCR",
            )
        return

    day_s, month_s, year_s = fecha_match.groups()

    try:
        day = int(day_s)
        month = int(month_s)
        year = int(year_s)
        if year < 100:
            year += 2000
        detected = date(year, month, day)
    except Exception:
        _add_error(
            errores,
            "FECHA_ELECCION_FORMATO_INVALIDO",
            f"Fecha detectada con formato no parseable: {fecha_match.group(0)}",
            "WARNING",
            "OCR",
        )
        return

    ctx.detected["fechaEleccionDetectada"] = detected.isoformat()

    if expected_date and detected != expected_date:
        _add_error(
            errores,
            "FECHA_ELECCION_NO_COINCIDE",
            (
                f"Fecha detectada {detected.isoformat()} no coincide con la "
                f"fecha esperada {expected_date.isoformat()}"
            ),
            "WARNING",
            "OEP_RULE",
        )


def _check_delegados(ctx: _Context, errores, reglas, force=False):
    reglas.append("OEP_DELEGADOS")

    texto = ctx.texto_normalizado

    if not texto:
        ctx.detected["delegadosVisibles"] = None
        if force:
            _add_error(
                errores,
                "ZONA_DELEGADOS_NO_VISIBLE",
                "No fue posible analizar la zona de delegados (sin texto OCR)",
                "INFO",
                "OCR",
            )
        return

    has_delegados_label = "delegado" in texto

    if not has_delegados_label:
        ctx.detected["delegadosVisibles"] = False
        if force:
            _add_error(
                errores,
                "ZONA_DELEGADOS_NO_VISIBLE",
                "No se detectaron etiquetas de delegados en el texto OCR",
                "WARNING",
                "OCR",
            )
        return

    ctx.detected["delegadosVisibles"] = True


def _check_correcciones(ctx: _Context, errores, reglas, force=False):
    reglas.append("OEP_CORRECCIONES_TACHADURAS")

    detected = False

    visual_codes = ctx.codigos_visuales
    if any(
        code in visual_codes
        for code in [
            "ACTA_CON_OBSERVACION_MANUSCRITA",
            "ACTA_CON_MANCHA_NEGRA",
            "ACTA_CON_MANCHA_COLOR",
        ]
    ):
        detected = True

    if ctx.texto_normalizado and any(
        keyword in ctx.texto_normalizado
        for keyword in ["tachadura", "enmienda", "borron", "anulad"]
    ):
        detected = True

    ctx.detected["correccionesDetectadas"] = detected

    if not detected:
        return

    observaciones_legibles = bool(ctx.detected.get("observacionTextoOCR"))

    _add_error(
        errores,
        "ENMIENDA_EN_RESULTADOS",
        "Posibles enmiendas/tachaduras detectadas en el acta",
        "WARNING",
        "VISUAL",
    )

    if not observaciones_legibles:
        _add_error(
            errores,
            "ALTERACION_SIN_OBSERVACION",
            "Hay alteracion visible pero no se detecta observacion que la justifique",
            "WARNING",
            "VISUAL",
        )


def _check_firmas_huellas(ctx: _Context, errores, reglas, force=False):
    reglas.append("OEP_FIRMAS_HUELLAS")

    visual_codes = ctx.codigos_visuales

    if "ACTA_POSIBLEMENTE_RECORTADA" in visual_codes:
        _add_error(
            errores,
            "ZONA_FIRMAS_RECORTADA",
            "La imagen tiene bordes muy oscuros: la zona de firmas puede estar recortada",
            "WARNING",
            "VISUAL",
        )

    if "ACTA_CON_BAJA_VISIBILIDAD" in visual_codes:
        _add_error(
            errores,
            "FIRMAS_HUELLAS_ILEGIBLES",
            "Baja visibilidad detectada: posibles firmas/huellas ilegibles",
            "WARNING",
            "VISUAL",
        )

    if force:
        # Si la regla es forzada por CSV pero no detectamos evidencia visual,
        # registramos al menos un PENDIENTE_REVISION operativo.
        if (
            "ZONA_FIRMAS_RECORTADA" not in {e["codigo"] for e in errores}
            and "FIRMAS_HUELLAS_ILEGIBLES" not in {e["codigo"] for e in errores}
        ):
            _add_error(
                errores,
                "FIRMAS_HUELLAS_INSUFICIENTES",
                "Observacion oficial reporta falta de firmas/huellas",
                "WARNING",
                "CSV_OBSERVATION",
            )

    ctx.detected["firmasVisibles"] = (
        "ZONA_FIRMAS_RECORTADA" not in {e["codigo"] for e in errores}
    )


_FRAUD_SPECIAL_KEYWORDS = [
    "cambiado 4 y 8",
    "alteracion digitos",
    "alteracion de digitos",
    "nulos por blancos",
    "cambio nulos blanco",
    "datos borrados",
    "borrados",
    "anulado",
    "anulada",
    "alteracion_digitos",
    "cambio_nulos_blanco",
    "datos_borrados",
    "acta_anulada_reportada",
]


def _has_csv_fraud_marker(ctx: _Context):
    note = ctx.csv_special_case_note
    if not note:
        return False
    normalized = _normalize_text(note).replace("_", " ")
    return any(keyword in normalized for keyword in _FRAUD_SPECIAL_KEYWORDS)


def _iter_nonnegative_numeric_refs(ctx: _Context):
    datos = ctx.datos_acta or {}
    yield {
        "campo": "datosActa.cantidadHabilitados",
        "codigo": "CANTIDAD_HABILITADOS_NEGATIVA",
        "container": datos,
        "key": "cantidadHabilitados",
        "valorOriginal": datos.get("cantidadHabilitados"),
    }
    yield {
        "campo": "datosActa.papeletasEnAnfora",
        "codigo": "PAPELETAS_ANFORA_NEGATIVA",
        "container": datos,
        "key": "papeletasEnAnfora",
        "valorOriginal": datos.get("papeletasEnAnfora"),
    }
    yield {
        "campo": "datosActa.papeletasNoUtilizadas",
        "codigo": "PAPELETAS_NO_UTILIZADAS_NEGATIVA",
        "container": datos,
        "key": "papeletasNoUtilizadas",
        "valorOriginal": datos.get("papeletasNoUtilizadas"),
    }

    for section_name, resultados in [
        ("presidente", ctx.resultados),
        ("diputadoUninominal", ctx.resultados_diputado),
    ]:
        if not resultados:
            continue

        for index, partido in enumerate(resultados.get("votosPartidos") or []):
            if not isinstance(partido, dict):
                continue
            partido_codigo = partido.get("partidoCodigo") or f"partido_{index}"
            yield {
                "campo": f"resultados.{section_name}.votosPartidos.{partido_codigo}",
                "codigo": "VOTO_PARTIDO_NEGATIVO",
                "container": partido,
                "key": "cantidadVotos",
                "valorOriginal": partido.get("cantidadVotos"),
            }

        for key, codigo in [
            ("votosValidos", "VOTOS_VALIDOS_NEGATIVO"),
            ("votosBlancos", "VOTOS_BLANCOS_NEGATIVO"),
            ("votosNulos", "VOTOS_NULOS_NEGATIVO"),
            ("totalVotos", "TOTAL_VOTOS_NEGATIVO"),
        ]:
            yield {
                "campo": f"resultados.{section_name}.{key}",
                "codigo": codigo,
                "container": resultados,
                "key": key,
                "valorOriginal": resultados.get(key),
            }


def _sync_context_numeric_values(ctx: _Context):
    datos = ctx.datos_acta or {}
    ctx.cantidad_habilitados = _safe_int(datos.get("cantidadHabilitados"))
    ctx.papeletas_anfora = _safe_int(datos.get("papeletasEnAnfora"))
    ctx.papeletas_no_util = _safe_int(datos.get("papeletasNoUtilizadas"))

    resultados = ctx.resultados or {}
    ctx.votos_partidos = resultados.get("votosPartidos") or []
    ctx.votos_validos = _safe_int(resultados.get("votosValidos")) or 0
    ctx.votos_blancos = _safe_int(resultados.get("votosBlancos")) or 0
    ctx.votos_nulos = _safe_int(resultados.get("votosNulos")) or 0
    ctx.total_votos = _safe_int(resultados.get("totalVotos")) or 0

    if ctx.resultados_diputado:
        ctx.votos_partidos_diputado = (
            ctx.resultados_diputado.get("votosPartidos") or []
        )


def _sum_partidos(resultados):
    total = 0
    for partido in (resultados or {}).get("votosPartidos") or []:
        if not isinstance(partido, dict):
            return None
        cantidad = _safe_int(partido.get("cantidadVotos"))
        if cantidad is None:
            return None
        total += cantidad
    return total


def _resultados_aritmetica_coherente(resultados):
    if not resultados:
        return True

    votos_partidos = resultados.get("votosPartidos") or []
    votos_validos = _safe_int(resultados.get("votosValidos"))
    votos_blancos = _safe_int(resultados.get("votosBlancos"))
    votos_nulos = _safe_int(resultados.get("votosNulos"))
    total_votos = _safe_int(resultados.get("totalVotos"))

    if any(value is None for value in [votos_validos, votos_blancos, votos_nulos, total_votos]):
        return False

    suma_partidos = _sum_partidos(resultados)
    if votos_partidos and suma_partidos != votos_validos:
        return False

    return total_votos == votos_validos + votos_blancos + votos_nulos


def _numeric_constraints_coherent(ctx: _Context):
    _sync_context_numeric_values(ctx)

    for ref in _iter_nonnegative_numeric_refs(ctx):
        value = _safe_int(ref["container"].get(ref["key"]))
        if value is not None and value < 0:
            return False

    if ctx.cantidad_habilitados is None or ctx.cantidad_habilitados <= 0:
        return False

    if not _resultados_aritmetica_coherente(ctx.resultados):
        return False

    if ctx.resultados_diputado and not _resultados_aritmetica_coherente(ctx.resultados_diputado):
        return False

    if ctx.total_votos > ctx.cantidad_habilitados:
        return False

    if ctx.papeletas_anfora is not None:
        if ctx.papeletas_anfora > ctx.cantidad_habilitados:
            return False
        if ctx.total_votos != ctx.papeletas_anfora:
            return False

    if ctx.papeletas_no_util is not None:
        if ctx.papeletas_no_util > ctx.cantidad_habilitados:
            return False
        if (
            ctx.papeletas_anfora is not None
            and ctx.papeletas_anfora + ctx.papeletas_no_util != ctx.cantidad_habilitados
        ):
            return False

    return True


def _try_repair_negative_signs(ctx: _Context, errores, reglas):
    negative_refs = []

    for ref in _iter_nonnegative_numeric_refs(ctx):
        value = _safe_int(ref["container"].get(ref["key"]))
        if value is not None and value < 0:
            ref["numero"] = value
            negative_refs.append(ref)

    if (
        not negative_refs
        or _has_csv_fraud_marker(ctx)
        or any(abs(ref["numero"]) > 1 for ref in negative_refs)
    ):
        return

    snapshot = [
        (ref["container"], ref["key"], ref["container"].get(ref["key"]))
        for ref in negative_refs
    ]

    for ref in negative_refs:
        ref["container"][ref["key"]] = abs(ref["numero"])

    if not _numeric_constraints_coherent(ctx):
        for container, key, value in snapshot:
            container[key] = value
        _sync_context_numeric_values(ctx)
        return

    reglas.append("OEP_SIGNO_NEGATIVO_OCR_REPARADO")

    for ref in negative_refs:
        repaired_value = abs(ref["numero"])
        repair = {
            "campo": ref["campo"],
            "valorOriginal": ref["valorOriginal"],
            "valorNormalizado": repaired_value,
            "numero": repaired_value,
            "correcciones": [{"from": "-", "to": "", "posicion": 0}],
            "tipo": "signo_negativo",
            "metodo": "reparacion_signo_negativo_por_coherencia_aritmetica",
        }
        _append_unique_normalization(ctx.normalizaciones_ocr, repair)

        _add_error(
            errores,
            "OCR_SIGNO_NEGATIVO_CORREGIDO",
            (
                f"Campo {ref['campo']}: signo negativo removido por coherencia "
                "aritmetica y base oficial"
            ),
            "INFO",
            "OCR",
            campo=ref["campo"],
            valorOriginal=ref["valorOriginal"],
            valorNormalizado=repaired_value,
        )
        _add_error(
            errores,
            "OCR_CORRECCION_APLICADA",
            f"Campo {ref['campo']}: '{ref['valorOriginal']}' -> '{repaired_value}'",
            "INFO",
            "OCR",
            campo=ref["campo"],
            valorOriginal=ref["valorOriginal"],
            valorNormalizado=repaired_value,
            correcciones=repair["correcciones"],
        )


def _add_negative_error(errores, codigo, campo, valor):
    _add_error(
        errores,
        codigo,
        f"Valor negativo no permitido en {campo}: {valor}",
        "CRITICAL",
        "ARITHMETIC",
        campo=campo,
        valorOriginal=valor,
    )


def _check_aritmetica(ctx: _Context, errores, reglas, force=False):
    reglas.append("OEP_ARITMETICA")

    coherente = True
    negative_fields = set()

    for ref in _iter_nonnegative_numeric_refs(ctx):
        value = _safe_int(ref["container"].get(ref["key"]))
        if value is not None and value < 0:
            coherente = False
            negative_fields.add(ref["campo"])
            _add_negative_error(errores, ref["codigo"], ref["campo"], value)

    suma_partidos = 0

    for index, partido in enumerate(ctx.votos_partidos or []):
        cantidad = partido.get("cantidadVotos") if isinstance(partido, dict) else None

        if cantidad is None:
            continue

        if isinstance(cantidad, bool) or not isinstance(cantidad, int):
            coherente = False
            _add_error(
                errores,
                "VOTO_PARTIDO_NO_NUMERICO",
                f"Voto de partido en posicion {index} no es entero",
                "WARNING",
                "ARITHMETIC",
            )
            continue

        if cantidad < 0:
            coherente = False

        suma_partidos += cantidad

    if ctx.votos_blancos < 0:
        coherente = False

    if ctx.votos_nulos < 0:
        coherente = False

    if ctx.votos_validos < 0:
        coherente = False

    if ctx.total_votos < 0:
        coherente = False

    if ctx.votos_partidos and suma_partidos != ctx.votos_validos:
        coherente = False
        _add_error(
            errores,
            "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS",
            (
                f"Suma de partidos ({suma_partidos}) "
                f"!= votosValidos ({ctx.votos_validos})"
            ),
            "WARNING",
            "ARITHMETIC",
        )

    total_calculado = ctx.votos_validos + ctx.votos_blancos + ctx.votos_nulos

    if ctx.total_votos != total_calculado:
        coherente = False
        _add_error(
            errores,
            "TOTAL_INCOHERENTE",
            (
                f"totalVotos ({ctx.total_votos}) "
                f"!= validos+blancos+nulos ({total_calculado})"
            ),
            "WARNING",
            "ARITHMETIC",
        )

    if (
        ctx.papeletas_anfora is not None
        and ctx.total_votos
        and ctx.total_votos != ctx.papeletas_anfora
    ):
        coherente = False
        _add_error(
            errores,
            "TOTAL_NO_COINCIDE_PAPELETAS_ANFORA",
            (
                f"totalVotos ({ctx.total_votos}) != papeletasEnAnfora "
                f"({ctx.papeletas_anfora})"
            ),
            "WARNING",
            "ARITHMETIC",
        )

    if (
        ctx.papeletas_anfora is not None
        and ctx.papeletas_no_util is not None
        and ctx.cantidad_habilitados is not None
        and (ctx.papeletas_anfora + ctx.papeletas_no_util) != ctx.cantidad_habilitados
    ):
        coherente = False
        _add_error(
            errores,
            "PAPELETAS_NO_COINCIDEN_HABILITADOS",
            (
                f"papeletasEnAnfora+papeletasNoUtilizadas "
                f"({ctx.papeletas_anfora + ctx.papeletas_no_util}) "
                f"!= cantidadHabilitados ({ctx.cantidad_habilitados})"
            ),
            "WARNING",
            "ARITHMETIC",
        )

    if (
        ctx.cantidad_habilitados is not None
        and ctx.total_votos > ctx.cantidad_habilitados
    ):
        coherente = False
        _add_error(
            errores,
            "TOTAL_SUPERA_HABILITADOS",
            (
                f"totalVotos ({ctx.total_votos}) > cantidadHabilitados "
                f"({ctx.cantidad_habilitados})"
            ),
            "ERROR",
            "ARITHMETIC",
        )

    diputado = ctx.resultados_diputado or {}
    if diputado and (
        diputado.get("votosPartidos")
        or diputado.get("votosValidos")
        or diputado.get("votosBlancos")
        or diputado.get("votosNulos")
        or diputado.get("totalVotos")
    ):
        dip_validos = _safe_int(diputado.get("votosValidos")) or 0
        dip_blancos = _safe_int(diputado.get("votosBlancos")) or 0
        dip_nulos = _safe_int(diputado.get("votosNulos")) or 0
        dip_total = _safe_int(diputado.get("totalVotos")) or 0
        dip_suma = _sum_partidos(diputado)

        if diputado.get("votosPartidos") and dip_suma is not None and dip_suma != dip_validos:
            coherente = False
            _add_error(
                errores,
                "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS",
                (
                    f"Suma de partidos diputadoUninominal ({dip_suma}) "
                    f"!= votosValidos ({dip_validos})"
                ),
                "WARNING",
                "ARITHMETIC",
                campo="resultados.diputadoUninominal.votosValidos",
            )

        dip_total_calculado = dip_validos + dip_blancos + dip_nulos
        if dip_total != dip_total_calculado:
            coherente = False
            _add_error(
                errores,
                "TOTAL_INCOHERENTE",
                (
                    f"totalVotos diputadoUninominal ({dip_total}) "
                    f"!= validos+blancos+nulos ({dip_total_calculado})"
                ),
                "WARNING",
                "ARITHMETIC",
                campo="resultados.diputadoUninominal.totalVotos",
            )

    ctx.detected["aritmeticaCoherente"] = coherente


def _check_papeletas_no_autorizadas(ctx: _Context, errores, reglas, force=False):
    """Solo se emite un codigo cuando hay evidencia explicita.

    "PAPELETAS_NO_AUTORIZADAS_NO_VERIFICABLE_AUTOMATICAMENTE" no debe
    aparecer en cada acta solo porque el sistema no puede medirlo desde la
    imagen sola: era ruido que afectaba 518 actas. Solo lo emitimos
    explicitamente si el resto del flujo (OCR, CSV, casos especiales)
    da indicios concretos.
    """
    reglas.append("OEP_PAPELETAS_NO_AUTORIZADAS")

    if force:
        _add_error(
            errores,
            "PAPELETAS_NO_AUTORIZADAS_REPORTADAS",
            "El CSV oficial reporta papeletas no autorizadas para esta mesa",
            "WARNING",
            "CSV_OBSERVATION",
        )
        return

    if not ctx.texto_normalizado:
        # Sin texto OCR no podemos juzgar; en lugar de emitir el codigo
        # "no verificable" para todas las actas, simplemente no reportamos
        # nada (no es una inconsistencia real).
        return

    if "papeleta no autorizad" in ctx.texto_normalizado or "papeletas no autorizad" in ctx.texto_normalizado:
        _add_error(
            errores,
            "PAPELETAS_NO_AUTORIZADAS_REPORTADAS",
            "Texto del acta menciona papeletas no autorizadas",
            "WARNING",
            "OCR",
        )


# ---------------------------------------------------------------------------
# Aplicacion del CSV oficial
# ---------------------------------------------------------------------------

_CATEGORY_FALLBACK_CODES = {
    "HORARIO": (
        "HORA_APERTURA_FALTANTE",
        "Observacion CSV: falta de datos de apertura o cierre",
        "WARNING",
        ESTADO_SOSPECHOSA,
    ),
    "UBICACION": (
        "MESA_NO_PERTENECE_RECINTO",
        "Observacion CSV: mesa en lugar distinto",
        "WARNING",
        ESTADO_SOSPECHOSA,
    ),
    "FORMULARIO": (
        "FORMULARIO_NO_OFICIAL",
        "Observacion CSV: uso de formularios no oficiales",
        "WARNING",
        ESTADO_SOSPECHOSA,
    ),
    "FECHA": (
        "FECHA_ELECCION_NO_COINCIDE",
        "Observacion CSV: fecha incorrecta",
        "WARNING",
        ESTADO_SOSPECHOSA,
    ),
    "DELEGADOS": (
        "DELEGADOS_AUSENTES_SIN_OBSERVACION",
        "Observacion CSV: ausencia de delegados sin justificacion",
        "WARNING",
        ESTADO_PENDIENTE,
    ),
    "CORRECCIONES": (
        "ENMIENDA_EN_RESULTADOS",
        "Observacion CSV: tachaduras o enmiendas no aclaradas",
        "WARNING",
        ESTADO_SOSPECHOSA,
    ),
    "FIRMAS": (
        "FIRMAS_HUELLAS_INSUFICIENTES",
        "Observacion CSV: falta de firmas o huellas",
        "WARNING",
        ESTADO_SOSPECHOSA,
    ),
    "ARITMETICA": (
        "TOTAL_INCOHERENTE",
        "Observacion CSV: inconsistencia aritmetica",
        "WARNING",
        ESTADO_SOSPECHOSA,
    ),
    "PAPELETAS": (
        "PAPELETAS_NO_AUTORIZADAS_REPORTADAS",
        "Observacion CSV: papeletas no autorizadas",
        "WARNING",
        ESTADO_SOSPECHOSA,
    ),
}


def _apply_csv_observation(ctx: _Context, observation, errores, reglas):
    """Si existe observacion oficial, asegura que la regla corra y
    deja al menos un warning con fuente CSV_OBSERVATION cuando el
    detector automatico no detecto el problema."""
    if not observation:
        return None

    categorias = _categorize_csv_observation(observation)

    if not categorias:
        # Observacion sin categoria conocida: la registramos igual.
        _add_error(
            errores,
            "OBSERVACION_OFICIAL_REGISTRADA",
            f"Observacion oficial CSV: {observation}",
            "WARNING",
            "CSV_OBSERVATION",
        )
        reglas.append("OEP_OBSERVACION_OFICIAL_GENERICA")
        return {
            "csvObservacion": observation,
            "csvCategorias": [],
        }

    codigos_existentes = {e["codigo"] for e in errores}

    for categoria in categorias:
        # Marca regla forzada en metricas
        reglas.append(f"OEP_CSV_FORZADO_{categoria}")

        if categoria == "FORMULARIO" and "FORMULARIO_NO_OFICIAL" not in codigos_existentes:
            _check_formulario(ctx, errores, reglas, force=True)
        elif categoria == "HORARIO":
            # Ya se ejecuto antes; si no hubo errores, anadimos uno por CSV
            pass
        elif categoria == "DELEGADOS":
            _check_delegados(ctx, errores, reglas, force=True)
        elif categoria == "FIRMAS":
            _check_firmas_huellas(ctx, errores, reglas, force=True)
        elif categoria == "PAPELETAS":
            _check_papeletas_no_autorizadas(ctx, errores, reglas, force=True)

        codigos_existentes = {e["codigo"] for e in errores}

        # Verificamos si alguna evidencia automatica respalda la observacion
        cubierto = False
        for codigo in list(codigos_existentes):
            if codigo in _CODE_STATE_MAP:
                # Cubre la categoria si el codigo pertenece a la misma familia
                if categoria == "HORARIO" and codigo.startswith("HORA"):
                    cubierto = True
                    break
                if categoria == "UBICACION" and (
                    codigo.startswith("MESA_") or "RECINTO" in codigo or "UBICACION" in codigo
                ):
                    cubierto = True
                    break
                if categoria == "FORMULARIO" and (
                    "FORMULARIO" in codigo or "FORMATO_ACTA" in codigo or "MARCADORES" in codigo
                ):
                    cubierto = True
                    break
                if categoria == "FECHA" and "FECHA" in codigo:
                    cubierto = True
                    break
                if categoria == "DELEGADOS" and "DELEGADOS" in codigo:
                    cubierto = True
                    break
                if categoria == "CORRECCIONES" and (
                    "TACHADURA" in codigo or "ENMIENDA" in codigo or "BORRON" in codigo or "ALTERACION" in codigo
                ):
                    cubierto = True
                    break
                if categoria == "FIRMAS" and (
                    "FIRMAS" in codigo or "ZONA_JURADOS" in codigo or "ZONA_FIRMAS" in codigo
                ):
                    cubierto = True
                    break
                if categoria == "ARITMETICA" and (
                    "SUMA" in codigo
                    or "TOTAL" in codigo
                    or "PAPELETAS" in codigo
                    or "VOTO" in codigo
                ):
                    cubierto = True
                    break
                if categoria == "PAPELETAS" and "PAPELETAS_NO_AUTORIZADAS" in codigo:
                    cubierto = True
                    break

        if not cubierto:
            fallback = _CATEGORY_FALLBACK_CODES.get(categoria)
            if fallback:
                codigo, descripcion, severidad, _ = fallback
                _add_error(
                    errores,
                    codigo,
                    descripcion,
                    severidad,
                    "CSV_OBSERVATION",
                )

    return {
        "csvObservacion": observation,
        "csvCategorias": categorias,
    }


_SPECIAL_CASE_RULES = [
    (
        "IMAGEN_GIRADA_90",
        ["jirado 90", "girado 90", "90 grados", "90 gados"],
        "Nota CSV reporta imagen girada 90 grados",
        "WARNING",
    ),
    (
        "IMAGEN_GIRADA_180",
        ["jirado 180", "girado 180", "180 grados"],
        "Nota CSV reporta acta girada 180 grados / al reves",
        "WARNING",
    ),
    (
        "IMAGEN_GIRADA_270",
        ["jirado 270", "girado 270", "270 grados"],
        "Nota CSV reporta imagen girada 270 grados",
        "WARNING",
    ),
    (
        "ARCHIVO_COMPRIMIDO_O_CALIDAD_REDUCIDA",
        ["comprimido"],
        "Nota CSV reporta archivo comprimido o con calidad reducida",
        "WARNING",
    ),
    (
        "ACTA_ANULADA_REPORTADA",
        ["anulado", "anulada"],
        "Nota CSV reporta acta anulada",
        "WARNING",
    ),
    (
        "DATOS_BORRADOS",
        ["datos borrados", "borrados"],
        "Nota CSV reporta datos borrados",
        "WARNING",
    ),
    (
        "ALTERACION_DIGITOS",
        ["cambiado 4 y 8", "alteracion digitos", "alteracion de digitos"],
        "Nota CSV reporta alteracion de digitos",
        "WARNING",
    ),
    (
        "ACTA_DUPLICADA_REPORTADA",
        ["duplicado de", "duplicada de", "cudriplicados", "cuadriplicados"],
        "Nota CSV reporta duplicidad de acta",
        "WARNING",
    ),
    (
        "MESA_NO_EXISTE",
        ["mesa que no existe", "mesas que no existen"],
        "Nota CSV reporta mesa inexistente",
        "ERROR",
    ),
    (
        "IMAGEN_RECORTADA",
        ["recortado", "recortada"],
        "Nota CSV reporta imagen recortada",
        "WARNING",
    ),
    (
        "PDF_PLANO_ESPERADO",
        ["aplanado"],
        "Nota CSV reporta PDF plano/aplanado",
        "WARNING",
    ),
    (
        "TAMANIO_PAGINA_INESPERADO",
        ["cambio de a4 a a0", "a4 a a0"],
        "Nota CSV reporta cambio inesperado de tamano de pagina",
        "WARNING",
    ),
    (
        "CAMBIO_NULOS_BLANCO",
        ["nulos por blancos", "nullos por blancos", "cambio nulos por blancos"],
        "Nota CSV reporta cambio de nulos por blancos",
        "WARNING",
    ),
    (
        "POSIBLE_CONFUSION_OCR_CARACTERES",
        ["0 x o", "1 x l", "8 x b", "2 x 9"],
        "Nota CSV reporta posible confusion de caracteres OCR (informativo)",
        "INFO",
    ),
    (
        "UBICACION_NO_COINCIDE_BASE_TERRITORIAL",
        ["univalle"],
        "Nota CSV reporta marcador de ubicacion inesperado",
        "WARNING",
    ),
    (
        "PATRON_NUMERICO_SOSPECHOSO",
        ["666"],
        "Nota CSV reporta patron numerico sospechoso",
        "WARNING",
    ),
    (
        "CASO_ESPECIAL_NO_CLASIFICADO",
        ["conado"],
        "Nota CSV reporta caso especial no clasificado",
        "WARNING",
    ),
]


def _classify_special_case(note):
    normalized = _normalize_text(note)

    if not normalized:
        return (
            "CASO_ESPECIAL_NO_CLASIFICADO",
            "Nota CSV de caso especial vacia o no interpretable",
            "WARNING",
        )

    for codigo, keywords, descripcion, severidad in _SPECIAL_CASE_RULES:
        if any(keyword in normalized for keyword in keywords):
            return codigo, descripcion, severidad

    return (
        "CASO_ESPECIAL_NO_CLASIFICADO",
        "Nota CSV de caso especial no clasificada automaticamente",
        "WARNING",
    )


def _apply_csv_special_case(ctx: _Context, special_case_note, errores, reglas):
    if not special_case_note:
        return None

    reglas.append("OEP_CSV_CASO_ESPECIAL")

    codigo, descripcion, severidad = _classify_special_case(special_case_note)

    _add_error(
        errores,
        codigo,
        descripcion,
        severidad,
        "CSV_CASO_ESPECIAL",
        notaCSV=special_case_note,
        codigoMesa=ctx.codigo_mesa,
    )

    return {
        "csvCasoEspecial": special_case_note,
        "csvCasoEspecialCodigo": codigo,
    }


# ---------------------------------------------------------------------------
# Decision de estado
# ---------------------------------------------------------------------------


# Codigos cuyo solo motivo NO debe llevar al RECHAZADA cuando la acta tiene
# evidencia estructural (ActasImpresas, codigoMesa). En esos casos el peor
# estado razonable es SOSPECHOSA o PENDIENTE_REVISION.
_SOFT_REJECTION_CODES = {
    "FORMULARIO_NO_OFICIAL",
    "ENCABEZADO_OFICIAL_NO_DETECTADO",
    "FORMATO_ACTA_NO_RECONOCIDO",
    "ZONA_RESULTADOS_NO_DETECTADA",
}

# Codigos cuya unica presencia es una limitacion del sistema o una
# advertencia operativa: no deberian degradar a PENDIENTE_REVISION o peor.
_NEVER_DEGRADE_ALONE = {
    "PAPELETAS_NO_AUTORIZADAS_NO_VERIFICABLE_AUTOMATICAMENTE",
    "BASE_TERRITORIAL_NO_DISPONIBLE",
    "ACTAS_IMPRESAS_NO_DISPONIBLE",
    "TEXTO_TERRITORIAL_NORMALIZADO",
    "TERRITORIO_CORREGIDO_POR_BASE_OFICIAL",
    "OCR_CODIGO_MESA_NORMALIZADO",
    "OCR_NUMERICO_NORMALIZADO",
    "OCR_CORRECCION_APLICADA",
    "OCR_SIGNO_NEGATIVO_CORREGIDO",
    "FORMULARIO_VALIDADO_POR_ESTRUCTURA",
    "FORMATO_VALIDADO_POR_CAMPOS_ESTRUCTURADOS",
    "POSIBLE_CONFUSION_OCR_CARACTERES",
    "CIERRE_EXTENDIDO",
}


def _decide_estado(errores):
    """Calcula el estado final basado en la severidad y mapeo de codigos.

    Reglas:
    - Errores con severidad INFO NUNCA afectan el estado final.
      Codigos como BASE_TERRITORIAL_NO_DISPONIBLE, ACTAS_IMPRESAS_NO_DISPONIBLE,
      FORMULARIO_VALIDADO_POR_ESTRUCTURA, FORMATO_VALIDADO_POR_CAMPOS_ESTRUCTURADOS
      y CIERRE_EXTENDIDO cuando se emiten como INFO no degradan a una acta valida.
    - Solo WARNING, ERROR o CRITICAL pueden afectar el estado, y solo si el
      codigo aparece mapeado en _CODE_STATE_MAP a un estado distinto a VALIDADA.
    - CSV_OBSERVATION / CSV_CASO_ESPECIAL son excepciones: si el codigo
      asociado es VALIDADA, garantizamos al menos PENDIENTE_REVISION para no
      perder la observacion oficial.
    """
    estado_actual = ESTADO_VALIDADA

    for error in errores:
        severidad = (error.get("severidad") or "").upper()

        # INFO nunca degrada el estado final.
        if severidad in ("INFO", ""):
            continue

        codigo = error.get("codigo")
        candidato = _CODE_STATE_MAP.get(codigo, ESTADO_VALIDADA)

        # CSV_OBSERVATION / CSV_CASO_ESPECIAL nunca pasa como VALIDADA:
        # garantizamos al menos PENDIENTE.
        if (
            error.get("fuente") in ["CSV_OBSERVATION", "CSV_CASO_ESPECIAL"]
            and candidato == ESTADO_VALIDADA
        ):
            candidato = ESTADO_PENDIENTE

        if _STATE_PRIORITY[candidato] > _STATE_PRIORITY[estado_actual]:
            estado_actual = candidato

    return estado_actual


def _maybe_downgrade_state(ctx: "_Context", errores, estado):
    """Downgrade RECHAZADA si los unicos motivos son codigos "blandos".

    Una acta no debe terminar en RECHAZADA solo por:
        - CIERRE_EXTENDIDO / CIERRE_MUY_EXTENDIDO
        - PAPELETAS_NO_AUTORIZADAS_NO_VERIFICABLE_AUTOMATICAMENTE
        - ENCABEZADO_OFICIAL_NO_DETECTADO
        - FORMATO_ACTA_NO_RECONOCIDO
        - ZONA_RESULTADOS_NO_DETECTADA
        - FORMULARIO_NO_OFICIAL (cuando hay evidencia estructural)

    Los rechazos validos (ACTA_IMPRESA_NO_EXISTE, MESA_NO_EXISTE,
    TOTAL_SUPERA_HABILITADOS, VOTO_PARTIDO_NEGATIVO, archivo invalido)
    siempre se conservan.
    """
    if estado != ESTADO_RECHAZADA:
        return estado

    has_structured_evidence = (
        ctx.detected.get("actaImpresaExiste") is True
        or bool(ctx.codigo_mesa)
    )

    hard_rejections = []
    soft_rejections = []

    for error in errores:
        if (error.get("severidad") or "").upper() == "INFO":
            continue

        codigo = error.get("codigo")
        candidato = _CODE_STATE_MAP.get(codigo, ESTADO_VALIDADA)

        if candidato != ESTADO_RECHAZADA:
            continue

        if codigo in _SOFT_REJECTION_CODES and has_structured_evidence:
            soft_rejections.append(codigo)
        else:
            hard_rejections.append(codigo)

    if hard_rejections:
        return ESTADO_RECHAZADA

    if soft_rejections:
        # Solo rechazos blandos con acta valida en ActasImpresas: degradamos
        # a SOSPECHOSA para no perder la acta.
        return ESTADO_SOSPECHOSA

    return estado


# ---------------------------------------------------------------------------
# API publica
# ---------------------------------------------------------------------------


def validate_oep_inconsistencies(
    acta: dict,
    extracted_text: Optional[str] = None,
    visual_quality: Optional[dict] = None,
    official_observation: Optional[str] = None,
    special_case_note: Optional[str] = None,
) -> dict:
    """Aplica todas las reglas OEP y devuelve el resultado consolidado.

    Si algo falla internamente, devuelve un resultado seguro con
    estadoSugerido=PENDIENTE_REVISION para no bloquear FastAPI.
    """
    try:
        ctx = _Context(acta, extracted_text, visual_quality)
        ctx.csv_special_case_note = special_case_note

        errores = []
        reglas = []

        # Heuristica simple: detectar si las observaciones tienen texto OCR.
        texto_obs = None
        if ctx.texto_normalizado:
            for keyword in ["observaciones", "observacion"]:
                idx = ctx.texto_normalizado.find(keyword)
                if idx >= 0:
                    fragment = ctx.texto[idx: idx + 240]
                    if len(fragment.strip()) > len(keyword) + 5:
                        texto_obs = fragment.strip()
                        break
        ctx.detected["observacionTextoOCR"] = texto_obs

        _check_horarios(ctx, errores, reglas)
        _check_ubicacion(ctx, errores, reglas)
        _check_formulario(ctx, errores, reglas)
        _check_fecha_eleccion(ctx, errores, reglas)
        _check_delegados(ctx, errores, reglas)
        _check_correcciones(ctx, errores, reglas)
        _check_firmas_huellas(ctx, errores, reglas)
        _try_repair_negative_signs(ctx, errores, reglas)
        _check_aritmetica(ctx, errores, reglas)
        _check_papeletas_no_autorizadas(ctx, errores, reglas)

        csv_meta = _apply_csv_observation(ctx, official_observation, errores, reglas)
        special_meta = _apply_csv_special_case(ctx, special_case_note, errores, reglas)

        # Si hubo reparaciones OCR sobre valores numericos, dejamos rastro
        # como INFO (no degrada estado por _CODE_STATE_MAP) y persistimos
        # las correcciones en la acta para que rrv_resultados y el dashboard
        # puedan auditarlas. Si quedo una incoherencia aritmetica que el
        # repair no pudo resolver, emitimos OCR_REPARACION_NO_RESUELVE_ARITMETICA
        # como SOSPECHOSA (segun mapeo).
        if ctx.normalizaciones_ocr:
            _add_error(
                errores,
                "OCR_NUMERICO_NORMALIZADO",
                (
                    f"Se aplicaron {len(ctx.normalizaciones_ocr)} reparaciones OCR "
                    "a valores numericos (O->0, l->1, B->8, etc.)."
                ),
                "INFO",
                "OCR",
                campos=[r.get("campo") for r in ctx.normalizaciones_ocr],
            )
            for repair in ctx.normalizaciones_ocr:
                _add_error(
                    errores,
                    "OCR_CORRECCION_APLICADA",
                    (
                        f"Campo {repair.get('campo')}: "
                        f"'{repair.get('valorOriginal')}' -> '{repair.get('valorNormalizado')}'"
                    ),
                    "INFO",
                    "OCR",
                    campo=repair.get("campo"),
                    valorOriginal=repair.get("valorOriginal"),
                    valorNormalizado=repair.get("valorNormalizado"),
                    correcciones=repair.get("correcciones"),
                )

            arithmetic_unresolved = any(
                error.get("codigo") in (
                    "SUMA_PARTIDOS_NO_COINCIDE_VALIDOS",
                    "TOTAL_INCOHERENTE",
                    "TOTAL_NO_COINCIDE_PAPELETAS_ANFORA",
                    "PAPELETAS_NO_COINCIDEN_HABILITADOS",
                    "TOTAL_SUPERA_HABILITADOS",
                    "TOTAL_SUPERA_PAPELETAS_ANFORA",
                )
                for error in errores
            )

            if arithmetic_unresolved:
                _add_error(
                    errores,
                    "OCR_REPARACION_NO_RESUELVE_ARITMETICA",
                    (
                        "Aun despues de normalizar caracteres OCR, las sumas "
                        "siguen sin cuadrar. Se mantiene el flag aritmetico."
                    ),
                    "WARNING",
                    "OCR",
                )

        observaciones_detectadas = dict(ctx.detected)
        observaciones_detectadas["normalizacionesOCR"] = list(
            ctx.normalizaciones_ocr
        )
        observaciones_detectadas["normalizacionesTexto"] = list(
            ctx.normalizaciones_texto
        )
        if csv_meta:
            observaciones_detectadas.update(csv_meta)
        if special_meta:
            observaciones_detectadas.update(special_meta)

        # Persistir las normalizaciones en la acta (auditoria y rrv_resultados).
        validacion_dict = ctx.acta.setdefault("validacion", {})
        if ctx.normalizaciones_ocr:
            validacion_dict["normalizacionesOCR"] = list(ctx.normalizaciones_ocr)
        if ctx.normalizaciones_texto:
            validacion_dict["normalizacionesTexto"] = list(ctx.normalizaciones_texto)

        # Deduplicacion final por (codigo, fuente, campoComparado/campo) para
        # evitar entradas repetidas como SUMA_PARTIDOS_NO_COINCIDE_VALIDOS x2.
        errores = _dedupe_errors(errores)

        estado = _decide_estado(errores)
        estado = _maybe_downgrade_state(ctx, errores, estado)

        return {
            "errores": errores,
            "reglasEjecutadas": reglas,
            "estadoSugerido": estado,
            "observacionesDetectadas": observaciones_detectadas,
            "casoEspecialCSV": special_case_note,
        }

    except Exception as error:  # pragma: no cover - defensivo
        return {
            "errores": [{
                "codigo": "OEP_VALIDADOR_ERROR_INTERNO",
                "descripcion": f"Validacion OEP fallo internamente: {error}",
                "severidad": "WARNING",
                "fuente": "OEP_RULE",
            }],
            "reglasEjecutadas": ["OEP_VALIDADOR_FAIL_SAFE"],
            "estadoSugerido": ESTADO_PENDIENTE,
            "observacionesDetectadas": {},
        }
