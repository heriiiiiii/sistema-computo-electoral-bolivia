from app.config.settings import MAX_FILE_SIZE_MB

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "application/pdf"
}

class FileValidationError(Exception):
    def __init__(self, codigo_error: str, message: str):
        self.codigo_error = codigo_error
        self.message = message
        super().__init__(message)

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

    if content_type not in ALLOWED_MIME_TYPES:
        raise FileValidationError(
            "ARCHIVO_FORMATO_INVALIDO",
            "El archivo no cumple el formato permitido"
        )

    max_size_bytes = MAX_FILE_SIZE_MB * 1024 * 1024

    if len(file_bytes) > max_size_bytes:
        raise FileValidationError(
            "ARCHIVO_TAMANIO_EXCEDIDO",
            f"El archivo supera el tamaño máximo permitido de {MAX_FILE_SIZE_MB} MB"
        )

    return True
