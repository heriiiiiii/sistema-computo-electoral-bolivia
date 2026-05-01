import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

APP_NAME = os.getenv("APP_NAME", "Flujo Rapido RRV")
APP_PORT = int(os.getenv("APP_PORT", "4001"))

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "oep_rrv")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "storage/actas")
REVISION_DIR = os.getenv("REVISION_DIR", "storage/revision")
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
OCR_LANGUAGE = os.getenv("OCR_LANGUAGE", "spa")
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "tesseract")

# OEP / Ley 026 - configuracion opcional de validaciones avanzadas. Todo aqui
# es opcional: si los archivos no existen el sistema sigue funcionando y solo
# emite advertencias controladas (BASE_TERRITORIAL_NO_DISPONIBLE, etc.).
EXPECTED_ELECTION_DATE = os.getenv("EXPECTED_ELECTION_DATE", "2025-08-17")
EXPECTED_OPENING_HOUR_MIN = int(os.getenv("EXPECTED_OPENING_HOUR_MIN", "7"))
EXPECTED_OPENING_HOUR_MAX = int(os.getenv("EXPECTED_OPENING_HOUR_MAX", "10"))
EXPECTED_VOTING_DURATION_HOURS = int(os.getenv("EXPECTED_VOTING_DURATION_HOURS", "8"))

OEP_CSV_OBSERVATIONS_PATH = os.getenv(
    "OEP_CSV_OBSERVATIONS_PATH",
    "storage/oep/_Recursos Practica 4 - Transcripciones.csv"
)
ACTAS_IMPRESAS_PATH = os.getenv(
    "ACTAS_IMPRESAS_PATH",
    "storage/oep/_Recursos Practica 4 - ActasImpresas.csv"
)
RECINTOS_ELECTORALES_PATH = os.getenv(
    "RECINTOS_ELECTORALES_PATH",
    "storage/oep/_Recursos Practica 4 - RecintosElectorales.csv"
)
DISTRIBUCION_TERRITORIAL_PATH = os.getenv(
    "DISTRIBUCION_TERRITORIAL_PATH",
    "storage/oep/_Recursos Practica 4 - DistribucionTerritorial.csv"
)
TERRITORIAL_BASE_PATH = os.getenv(
    "TERRITORIAL_BASE_PATH",
    "storage/oep/base_territorial.csv"
)

Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
Path(REVISION_DIR).mkdir(parents=True, exist_ok=True)
