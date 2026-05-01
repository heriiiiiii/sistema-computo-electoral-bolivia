"""Defensive text normalization for territorial / recinto comparison.

PDF font extraction and OCR can damage short Bolivian place names in ways that
look like territorial mismatches: NUL bytes, replacement boxes, lost accents,
and punctuation variants such as "U.E." vs "Unidad Educativa".

The helpers in this module are intentionally text-only. Numeric OCR repair
belongs in ``ocr_normalization_utils`` so names such as "Luis Calvo" never pass
through digit substitution logic.
"""

from difflib import SequenceMatcher
import re
import unicodedata


_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")
_MULTISPACE_RE = re.compile(r"\s+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9\s]")
_DAMAGED_SYMBOLS = {
    "\ufffd",  # replacement character
    "\u25a1",  # white square / missing glyph box
    "\u25a0",
    "\u25ab",
    "\u25ad",
    "\u25af",
    "\u25fb",
    "\u25fc",
    "\u25fd",
    "\u25fe",
    "\u2b1a",
}
_UE_VARIANT_RE = re.compile(r"\bu\s*\.?\s*e\s*\.?", re.IGNORECASE)
_UNIDAD_EDUCATIVA_RE = re.compile(
    r"\bunidad\s+educativa\b|\bunid\.?\s*educ\.?\b|\bu\.?\s*educativa\b",
    re.IGNORECASE,
)
_ABBREVIATIONS = (
    (re.compile(r"\bdpto\.?\b|\bdepto\.?\b", re.IGNORECASE), "departamento"),
    (re.compile(r"\bprov\.?\b", re.IGNORECASE), "provincia"),
    (re.compile(r"\bmpio\.?\b|\bmun\.?\b", re.IGNORECASE), "municipio"),
    (re.compile(r"\bcant\.?\b", re.IGNORECASE), "canton"),
)

# Default similarity threshold for territorial fuzzy matching. Below this we
# treat the difference as a real mismatch worth reporting; above it we
# consider it a likely OCR/encoding artifact.
DEFAULT_TERRITORIAL_SIMILARITY = 0.85
DAMAGED_TERRITORIAL_SIMILARITY = 0.65


def _is_control_or_non_printable(ch: str) -> bool:
    if ch in "\t\n\r":
        return False
    category = unicodedata.category(ch)
    return category.startswith("C")


def has_damaged_text_chars(value) -> bool:
    """True when the extracted text contains replacement/control artifacts."""
    if value is None:
        return False

    text = str(value)
    return any(
        ch in _DAMAGED_SYMBOLS
        or _is_control_or_non_printable(ch)
        for ch in text
    )


def clean_broken_text(value) -> str:
    """Clean OCR/PDF text artifacts without doing semantic substitutions."""
    if value is None:
        return ""

    cleaned_chars = []
    for ch in str(value):
        if ch in _DAMAGED_SYMBOLS or _is_control_or_non_printable(ch):
            continue
        cleaned_chars.append(ch)

    text = "".join(cleaned_chars)
    text = _MULTISPACE_RE.sub(" ", text).strip()
    return text


def clean_control_chars(value) -> str:
    """Backward-compatible alias used by older validator code."""
    return clean_broken_text(value)


def strip_accents(value: str) -> str:
    if not value:
        return ""
    nfkd = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def normalize_text_for_comparison(value) -> str:
    """Normalize text for safe comparisons against official CSV values."""
    if value is None:
        return ""

    text = clean_broken_text(value)
    text = strip_accents(text).lower()

    text = _UNIDAD_EDUCATIVA_RE.sub("ue", text)
    text = _UE_VARIANT_RE.sub("ue", text)
    for pattern, replacement in _ABBREVIATIONS:
        text = pattern.sub(replacement, text)

    text = _NON_ALNUM_RE.sub(" ", text)
    text = _MULTISPACE_RE.sub(" ", text).strip()
    return text


def text_similarity(actual, expected) -> float:
    """Similarity ratio (0..1) over the *normalized* representations.

    Uses difflib.SequenceMatcher.ratio(). Returns 0.0 if either input is
    empty after normalization.
    """
    a = normalize_text_for_comparison(actual)
    b = normalize_text_for_comparison(expected)

    if not a or not b:
        return 0.0

    return SequenceMatcher(None, a, b).ratio()


def texts_match_with_similarity(
    extracted,
    expected,
    threshold: float = DEFAULT_TERRITORIAL_SIMILARITY,
    damaged_threshold: float = DAMAGED_TERRITORIAL_SIMILARITY,
) -> dict:
    """Return structured match evidence for territorial/free-text fields."""
    extracted_clean = clean_broken_text(extracted)
    expected_clean = clean_broken_text(expected)
    extracted_normalized = normalize_text_for_comparison(extracted)
    expected_normalized = normalize_text_for_comparison(expected)
    had_damaged = has_damaged_text_chars(extracted)

    result = {
        "match": False,
        "similarity": 0.0,
        "method": "no_match",
        "extractedClean": extracted_clean,
        "expectedClean": expected_clean,
        "extractedNormalized": extracted_normalized,
        "expectedNormalized": expected_normalized,
        "hadDamagedChars": had_damaged,
    }

    if not extracted_normalized or not expected_normalized:
        return result

    if extracted_normalized == expected_normalized:
        result.update({
            "match": True,
            "similarity": 1.0,
            "method": "exact_normalized",
        })
        return result

    if extracted_normalized.replace(" ", "") == expected_normalized.replace(" ", ""):
        result.update({
            "match": True,
            "similarity": 1.0,
            "method": "exact_normalized",
        })
        return result

    similarity = SequenceMatcher(
        None,
        extracted_normalized,
        expected_normalized,
    ).ratio()
    result["similarity"] = similarity

    if had_damaged and similarity >= damaged_threshold:
        result.update({
            "match": True,
            "method": "damaged_fuzzy",
        })
    elif similarity >= threshold:
        result.update({
            "match": True,
            "method": "fuzzy",
        })

    return result
