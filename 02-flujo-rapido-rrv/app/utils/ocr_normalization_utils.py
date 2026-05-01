"""Defensive normalization for OCR-confused numeric fields.

The substitutions here are only for fields whose schema says "this must be a
number". Text and territorial names must use text_normalization_utils instead.
"""

import re


_DIGIT_REPLACEMENTS = {
    "O": "0", "o": "0", "Q": "0", "D": "0",
    "I": "1", "l": "1", "|": "1", "!": "1", "i": "1",
    "B": "8", "b": "8",
    "S": "5", "s": "5",
    "Z": "2", "z": "2",
    "G": "6", "g": "6",
    "A": "4",
}

NUMERIC_FIELD_NAMES = {
    "AperturaHora",
    "AperturaMinutos",
    "CierreHora",
    "CierreMinutos",
    "codigoMesa",
    "codigoRecinto",
    "numeroMesa",
    "cantidadHabilitados",
    "papeletasEnAnfora",
    "papeletasNoUtilizadas",
    "votosValidos",
    "votosBlancos",
    "votosNulos",
    "totalVotos",
    "horaApertura",
    "horaCierre",
    "diputadoUninominal.votosPartidos",
    "diputadoUninominal.votosValidos",
    "diputadoUninominal.votosBlancos",
    "diputadoUninominal.votosNulos",
    "diputadoUninominal.totalVotos",
    "presidente.votosPartidos",
    "votosPartidos",
    "cantidadVotos",
}

_SPACES_RE = re.compile(r"\s+")
_DASH_CHARS = {
    "-": "-",
    "\u2212": "-",
    "\u2013": "-",
    "\u2014": "-",
    "\u2010": "-",
    "\u2011": "-",
    "\u2012": "-",
    "\u2015": "-",
}
_NUMERIC_PREFIXES = (
    "votosPartidos.",
    "presidente.votosPartidos.",
    "diputadoUninominal.votosPartidos.",
)


def _empty_result(original):
    return {
        "valorOriginal": original,
        "valorNormalizado": "",
        "numero": None,
        "correcciones": [],
        "esConfiable": False,
    }


def is_numeric_field_name(field_name=None) -> bool:
    """Return whether a caller-declared field is safe for numeric OCR repair."""
    if field_name is None:
        return True

    name = str(field_name)
    if name in NUMERIC_FIELD_NAMES:
        return True

    return any(name.startswith(prefix) for prefix in _NUMERIC_PREFIXES)


def _result(original, normalized, numero, corrections, confiable, **extra):
    data = {
        "valorOriginal": original,
        "valorNormalizado": normalized,
        "numero": numero,
        "correcciones": corrections,
        "esConfiable": confiable,
    }
    if extra:
        data.update(extra)
    return data


def _surrounded_by_digits(text, idx):
    prev_d = idx > 0 and text[idx - 1].isdigit()
    next_d = idx < len(text) - 1 and text[idx + 1].isdigit()
    return prev_d and next_d


def normalize_ocr_number(value, field_name=None):
    """Repair OCR digit confusions and return a structured parse result."""
    if value is None or isinstance(value, bool):
        return _empty_result(value)

    if isinstance(value, int):
        return _result(value, str(value), value, [], True)

    original = str(value)

    cleaned = _SPACES_RE.sub("", original)

    if not cleaned:
        return _empty_result(original)

    if not is_numeric_field_name(field_name):
        if cleaned.lstrip("-").isdigit():
            try:
                return _result(original, cleaned, int(cleaned), [], True)
            except ValueError:
                pass
        return _result(original, "", None, [], False, campoNumerico=False)

    correcciones = []
    repaired_chars = []
    seen_digit = False
    colon_count = 0

    for idx, ch in enumerate(cleaned):
        if ch.isdigit():
            repaired_chars.append(ch)
            seen_digit = True
            continue

        if ch in _DASH_CHARS:
            if idx != 0:
                return _result(
                    original,
                    "".join(repaired_chars),
                    None,
                    correcciones,
                    False,
                )
            normalized_dash = _DASH_CHARS[ch]
            repaired_chars.append(normalized_dash)
            if ch != normalized_dash:
                correcciones.append({"from": ch, "to": normalized_dash, "posicion": idx})
            continue

        if ch == ":":
            colon_count += 1
            if colon_count > 1:
                return _result(
                    original,
                    "".join(repaired_chars),
                    None,
                    correcciones,
                    False,
                )
            repaired_chars.append(ch)
            continue

        if ch == "q":
            if _surrounded_by_digits(cleaned, idx):
                repaired_chars.append("9")
                correcciones.append({"from": ch, "to": "9", "posicion": idx})
                seen_digit = True
                continue
            return _result(
                original,
                "".join(repaired_chars),
                None,
                correcciones,
                False,
            )

        replacement = _DIGIT_REPLACEMENTS.get(ch)
        if replacement is None:
            return _result(
                original,
                "".join(repaired_chars),
                None,
                correcciones,
                False,
            )
        repaired_chars.append(replacement)
        correcciones.append({"from": ch, "to": replacement, "posicion": idx})
        seen_digit = True

    normalized = "".join(repaired_chars)

    if not normalized or not seen_digit:
        return _empty_result(original)

    if ":" in normalized:
        return _result(
            original,
            normalized,
            None,
            correcciones,
            True,
            tipo="hora",
        )

    try:
        numero = int(normalized)
    except ValueError:
        return _result(original, normalized, None, correcciones, False)

    return _result(original, normalized, numero, correcciones, True)


def normalize_codigo_numerico(value):
    """Normalize an identifier-style code (codigoMesa, codigoRecinto).

    Same engine as `normalize_ocr_number` but also strips internal
    whitespace and returns the cleaned digit string (not just the int) so
    the caller can preserve leading zeros (e.g. "010101...").
    """
    result = normalize_ocr_number(value, field_name="codigoMesa")
    return result
