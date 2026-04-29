import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

APP_NAME = os.getenv("APP_NAME", "Flujo Rapido RRV")
APP_PORT = int(os.getenv("APP_PORT", "4001"))

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "oep_rrv")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "storage/actas")
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
OCR_LANGUAGE = os.getenv("OCR_LANGUAGE", "spa")
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "tesseract")

Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
