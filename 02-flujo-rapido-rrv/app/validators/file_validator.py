from pathlib import Path

from app.config.settings import MAX_FILE_SIZE_MB

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "application/pdf"
}

ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".pdf"
}

# Mapeo extension -> MIME canonico, usado cuando el cliente manda
# `application/octet-stream` o un content_type generico.
EXTENSION_TO_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
}


class FileValidationError(Exception):
    def __init__(self, codigo_error: str, message: str):
        self.codigo_error = codigo_error
        self.message = message
        super().__init__(message)


def _sniff_mime_from_bytes(file_bytes: bytes):
    """Detecta el tipo real por magic bytes para reforzar validaciones.

    No es exhaustivo (no detecta JPEG progresivo raros, etc.) pero cubre los
    casos esperados en este proyecto. Devuelve None si no logra identificar.
    """
    if not file_bytes:
        return None

    # PDF
    if file_bytes[:4] == b"%PDF":
        return "application/pdf"

    # PNG
    if file_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"

    # JPEG
    if file_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"

    return None


def _normalize_mime(content_type: str, filename: str, file_bytes: bytes):
    """Decide el MIME efectivo a partir de cabecera, extension y magic bytes.

    Si la cabecera es generica (`application/octet-stream` o vacia) usamos la
    extension. Si los magic bytes contradicen la extension/cabecera, devolvemos
    el MIME real para que la validacion de coherencia lo detecte.
    """
    declared = (content_type or "").strip().lower()
    extension = Path(filename or "").suffix.lower()
    extension_mime = EXTENSION_TO_MIME.get(extension)
    sniffed = _sniff_mime_from_bytes(file_bytes)

    if declared not in ALLOWED_MIME_TYPES and extension_mime:
        declared = extension_mime

    return {
        "declared": declared,
        "extension": extension,
        "extension_mime": extension_mime,
        "sniffed": sniffed,
    }


def validate_uploaded_file(filename: str, content_type: str, file_bytes: bytes):
    if not filename:
        raise FileValidationError(
            "ARCHIVO_NO_ENVIADO",
            "No se recibió ningún archivo"
        )

    if not file_bytes:
        raise FileValidationError(
            "ARCHIVO_VACIO",
            "El archivo recibido está vacío"
        )

    info = _normalize_mime(content_type, filename, file_bytes)

    if info["declared"] not in ALLOWED_MIME_TYPES:
        raise FileValidationError(
            "ARCHIVO_FORMATO_INVALIDO",
            "El archivo no cumple el formato permitido (MIME no soportado)"
        )

    if info["extension"] and info["extension"] not in ALLOWED_EXTENSIONS:
        raise FileValidationError(
            "ARCHIVO_EXTENSION_INVALIDA",
            "La extensión del archivo no es permitida (.jpg, .jpeg, .png, .pdf)"
        )

    if info["extension_mime"] and info["extension_mime"] != info["declared"]:
        raise FileValidationError(
            "ARCHIVO_EXTENSION_NO_COINCIDE_MIME",
            "La extensión del archivo no coincide con su tipo MIME"
        )

    if info["sniffed"] and info["sniffed"] != info["declared"]:
        raise FileValidationError(
            "ARCHIVO_CONTENIDO_NO_COINCIDE_MIME",
            "El contenido binario del archivo no coincide con el tipo MIME declarado"
        )

    max_size_bytes = MAX_FILE_SIZE_MB * 1024 * 1024

    if len(file_bytes) > max_size_bytes:
        raise FileValidationError(
            "ARCHIVO_TAMANIO_EXCEDIDO",
            f"El archivo supera el tamaño máximo permitido de {MAX_FILE_SIZE_MB} MB"
        )

    return True
