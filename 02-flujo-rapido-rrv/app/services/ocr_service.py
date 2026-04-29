from datetime import datetime, timezone
from pathlib import Path
import re

import cv2
import fitz
import numpy as np
import pytesseract
from PIL import Image, ImageDraw

try:
    import easyocr
except Exception:
    easyocr = None

from app.config.settings import OCR_LANGUAGE, TESSERACT_CMD
from app.utils.ocr_extraction_utils import extract_electoral_fields


class OCRService:
    TEMPLATE_WIDTH = 1400
    TEMPLATE_HEIGHT = 800

    def __init__(self):
        if TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

        self.easy_reader = None

    def get_easy_reader(self):
        if easyocr is None:
            return None

        if self.easy_reader is None:
            self.easy_reader = easyocr.Reader(["en"], gpu=False)

        return self.easy_reader

    def image_from_pdf(self, file_path):
        document = fitz.open(file_path)
        page = document.load_page(0)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
        image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
        document.close()
        return image

    def load_image(self, file_path, content_type):
        if content_type == "application/pdf":
            return self.image_from_pdf(file_path)

        return Image.open(file_path).convert("RGB")

    def crop_ratio(self, pil_image, x1, y1, x2, y2):
        width, height = pil_image.size

        return pil_image.crop((
            int(width * x1),
            int(height * y1),
            int(width * x2),
            int(height * y2)
        ))

    def pil_to_cv(self, pil_image):
        image_np = np.array(pil_image.convert("RGB"))
        return cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)

    def cv_to_pil(self, image_np):
        if len(image_np.shape) == 2:
            return Image.fromarray(image_np)

        image_rgb = cv2.cvtColor(image_np, cv2.COLOR_BGR2RGB)
        return Image.fromarray(image_rgb)

    def analyze_quality(self, pil_image):
        image_np = np.array(pil_image)
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)

        blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
        brightness = float(np.mean(gray))

        return {
            "blurScore": round(float(blur_score), 2),
            "brightness": round(brightness, 2)
        }

    def save_debug_image(self, acta_id, name, pil_image, subfolder=None):
        if not acta_id:
            return None

        debug_dir = Path("storage/debug_ocr") / str(acta_id)

        if subfolder:
            debug_dir = debug_dir / subfolder

        debug_dir.mkdir(parents=True, exist_ok=True)

        file_path = debug_dir / f"{name}.png"
        pil_image.save(file_path)

        return str(file_path).replace("\\", "/")

    def save_debug_text(self, acta_id, name, text):
        if not acta_id:
            return None

        debug_dir = Path("storage/debug_ocr") / str(acta_id)
        debug_dir.mkdir(parents=True, exist_ok=True)

        file_path = debug_dir / f"{name}.txt"
        file_path.write_text(text or "", encoding="utf-8")

        return str(file_path).replace("\\", "/")

    def order_points(self, points):
        rect = np.zeros((4, 2), dtype="float32")

        points_sum = points.sum(axis=1)
        points_diff = np.diff(points, axis=1)

        rect[0] = points[np.argmin(points_sum)]
        rect[2] = points[np.argmax(points_sum)]
        rect[1] = points[np.argmin(points_diff)]
        rect[3] = points[np.argmax(points_diff)]

        return rect

    def align_acta_image(self, pil_image, acta_id=None):
        image_bgr = self.pil_to_cv(pil_image)
        original = image_bgr.copy()

        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)

        edges = cv2.Canny(gray, 50, 150)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)

        contours, _ = cv2.findContours(
            edges,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        image_area = image_bgr.shape[0] * image_bgr.shape[1]
        best_quad = None
        best_area = 0

        for contour in sorted(contours, key=cv2.contourArea, reverse=True):
            area = cv2.contourArea(contour)

            if area < image_area * 0.20:
                continue

            perimeter = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)

            if len(approx) == 4 and area > best_area:
                best_quad = approx.reshape(4, 2).astype("float32")
                best_area = area

        if best_quad is None:
            orig_h, orig_w = original.shape[:2]
            new_h = int(orig_h * self.TEMPLATE_WIDTH / orig_w)
            resized = cv2.resize(
                original,
                (self.TEMPLATE_WIDTH, new_h),
                interpolation=cv2.INTER_CUBIC
            )
            aligned = self.cv_to_pil(resized)
            self.save_debug_image(acta_id, "ALIGNED_ACTA_FALLBACK_RESIZE", aligned)
            return aligned, {
                "aligned": False,
                "method": "fallback_resize",
                "reason": "NO_DOCUMENT_CONTOUR"
            }

        rect = self.order_points(best_quad)

        destination = np.array([
            [0, 0],
            [self.TEMPLATE_WIDTH - 1, 0],
            [self.TEMPLATE_WIDTH - 1, self.TEMPLATE_HEIGHT - 1],
            [0, self.TEMPLATE_HEIGHT - 1]
        ], dtype="float32")

        matrix = cv2.getPerspectiveTransform(rect, destination)

        warped = cv2.warpPerspective(
            original,
            matrix,
            (self.TEMPLATE_WIDTH, self.TEMPLATE_HEIGHT)
        )

        aligned = self.cv_to_pil(warped)
        self.save_debug_image(acta_id, "ALIGNED_ACTA", aligned)

        return aligned, {
            "aligned": True,
            "method": "perspective_warp",
            "contourArea": round(float(best_area), 2)
        }

    def extract_pdf_native_text(self, file_path):
        try:
            document = fitz.open(file_path)
            pages_text = []

            for page in document:
                pages_text.append(page.get_text("text"))

            document.close()

            return "\n".join(pages_text).strip()

        except Exception:
            return ""

    def extract_acta_metadata_from_pdf(self, file_path, acta_id=None):
        pdf_text = self.extract_pdf_native_text(file_path)

        if not pdf_text:
            return None

        self.save_debug_text(acta_id, "PDF_METADATA_EXTRACTED", pdf_text)

        lines = [ln.strip() for ln in pdf_text.splitlines() if ln.strip()]

        codigo_mesa_idx = None

        for i, line in enumerate(lines):
            compact = re.sub(r"\s+", "", line)

            if re.fullmatch(r"\d{11,}", compact):
                codigo_mesa_idx = i
                break

        if codigo_mesa_idx is None or codigo_mesa_idx < 1:
            return None

        codigo_mesa = re.sub(r"\s+", "", lines[codigo_mesa_idx])

        location_lines = lines[max(0, codigo_mesa_idx - 5):codigo_mesa_idx]

        while len(location_lines) < 5:
            location_lines.insert(0, None)

        departamento, provincia, municipio, recinto_nombre, direccion = location_lines

        if codigo_mesa_idx + 1 >= len(lines):
            return None

        numero_mesa_compact = re.sub(r"\s+", "", lines[codigo_mesa_idx + 1])

        if not numero_mesa_compact.isdigit():
            return None

        numero_mesa = int(numero_mesa_compact)

        rest = lines[codigo_mesa_idx + 2:]

        digit_state = {"idx": 0, "buffer": ""}

        def take(count):
            while len(digit_state["buffer"]) < count and digit_state["idx"] < len(rest):
                digits = re.sub(r"\D", "", rest[digit_state["idx"]])
                digit_state["idx"] += 1

                if digits:
                    digit_state["buffer"] += digits

            if len(digit_state["buffer"]) < count:
                return None

            result = digit_state["buffer"][:count]
            digit_state["buffer"] = digit_state["buffer"][count:]

            return result

        hora_apertura_raw = take(4)
        hora_cierre_raw = take(4)

        snapshot_idx = digit_state["idx"]
        snapshot_buffer = digit_state["buffer"]

        cantidad_habilitados_raw = take(3)
        papeletas_anfora_raw = take(3)
        papeletas_no_util_raw = take(3)
        p1_raw = take(3)
        p2_raw = take(3)
        p3_raw = take(3)
        p4_raw = take(3)
        validos_raw = take(3)
        blancos_raw = take(3)
        nulos_raw = take(3)

        post_habilitados_required = [
            papeletas_anfora_raw, papeletas_no_util_raw,
            p1_raw, p2_raw, p3_raw, p4_raw,
            validos_raw, blancos_raw, nulos_raw
        ]

        if any(value is None for value in post_habilitados_required):
            digit_state["idx"] = snapshot_idx
            digit_state["buffer"] = snapshot_buffer
            cantidad_habilitados_raw = None
            papeletas_anfora_raw = take(3)
            papeletas_no_util_raw = take(3)
            p1_raw = take(3)
            p2_raw = take(3)
            p3_raw = take(3)
            p4_raw = take(3)
            validos_raw = take(3)
            blancos_raw = take(3)
            nulos_raw = take(3)

        required = [
            hora_apertura_raw, hora_cierre_raw,
            papeletas_anfora_raw, papeletas_no_util_raw,
            p1_raw, p2_raw, p3_raw, p4_raw,
            validos_raw, blancos_raw, nulos_raw
        ]

        if any(value is None for value in required):
            return None

        return {
            "codigoMesa": codigo_mesa,
            "numeroMesa": numero_mesa,
            "ubicacion": {
                "departamento": departamento,
                "provincia": provincia,
                "municipio": municipio,
                "recintoNombre": recinto_nombre,
                "recintoDireccion": direccion
            },
            "datosActa": {
                "horaApertura": f"{hora_apertura_raw[:2]}:{hora_apertura_raw[2:]}",
                "horaCierre": f"{hora_cierre_raw[:2]}:{hora_cierre_raw[2:]}",
                "cantidadHabilitados": (
                    int(cantidad_habilitados_raw)
                    if cantidad_habilitados_raw is not None
                    else None
                ),
                "papeletasEnAnfora": int(papeletas_anfora_raw),
                "papeletasNoUtilizadas": int(papeletas_no_util_raw)
            },
            "votos": {
                "p1": int(p1_raw),
                "p2": int(p2_raw),
                "p3": int(p3_raw),
                "p4": int(p4_raw),
                "votosValidos": int(validos_raw),
                "votosBlancos": int(blancos_raw),
                "votosNulos": int(nulos_raw),
                "totalVotos": int(validos_raw) + int(blancos_raw) + int(nulos_raw)
            },
            "textoExtraido": pdf_text
        }

    def build_campos_from_vote_values(
        self,
        codigo_mesa,
        p1,
        p2,
        p3,
        p4,
        votos_validos,
        votos_blancos,
        votos_nulos
    ):
        votos_partidos = [
            {
                "partidoCodigo": "P1",
                "partidoNombre": "Partido 1",
                "cantidadVotos": p1
            },
            {
                "partidoCodigo": "P2",
                "partidoNombre": "Partido 2",
                "cantidadVotos": p2
            },
            {
                "partidoCodigo": "P3",
                "partidoNombre": "Partido 3",
                "cantidadVotos": p3
            },
            {
                "partidoCodigo": "P4",
                "partidoNombre": "Partido 4",
                "cantidadVotos": p4
            }
        ]

        total_votos = votos_validos + votos_blancos + votos_nulos

        return {
            "codigoMesa": str(codigo_mesa),
            "votosPartidos": votos_partidos,
            "votosValidos": votos_validos,
            "votosBlancos": votos_blancos,
            "votosNulos": votos_nulos,
            "totalVotos": total_votos,
            "camposDetectados": {
                "codigoMesa": True,
                "votosPartidos": True,
                "votosValidos": True,
                "votosBlancos": True,
                "votosNulos": True,
                "totalVotos": True
            }
        }

    def validate_extracted_vote_values(self, campos):
        errors = []

        votos_partidos = campos.get("votosPartidos", [])
        votos_validos = campos.get("votosValidos", 0)
        votos_blancos = campos.get("votosBlancos", 0)
        votos_nulos = campos.get("votosNulos", 0)
        total_votos = campos.get("totalVotos", 0)

        values = [
            votos_validos,
            votos_blancos,
            votos_nulos,
            total_votos
        ]

        for partido in votos_partidos:
            values.append(partido.get("cantidadVotos", -1))

        for value in values:
            if not isinstance(value, int):
                errors.append("VALOR_NO_NUMERICO")
                break

            if value < 0:
                errors.append("VALOR_NEGATIVO")
                break

            if value > 999:
                errors.append("VALOR_FUERA_DE_RANGO")
                break

        suma_partidos = sum(
            partido.get("cantidadVotos", 0)
            for partido in votos_partidos
        )

        if suma_partidos != votos_validos:
            errors.append("SUMA_PARTIDOS_NO_COINCIDE_VALIDOS")

        if total_votos != votos_validos + votos_blancos + votos_nulos:
            errors.append("TOTAL_INCOHERENTE")

        return errors

    def extract_numeric_groups_from_pdf_text(self, pdf_text, codigo_mesa):
        clean_codigo_mesa = str(codigo_mesa).strip()
        numeric_groups = []

        for line in pdf_text.splitlines():
            clean_line = line.strip()

            if not clean_line:
                continue

            if not re.fullmatch(r"[\d\s]+", clean_line):
                continue

            digits = re.sub(r"\D", "", clean_line)

            if not digits:
                continue

            if digits == clean_codigo_mesa:
                continue

            if len(digits) == 3:
                numeric_groups.append(digits)

        return numeric_groups

    def select_vote_groups_from_numeric_groups(self, numeric_groups):
        best_window = None
        best_score = -1

        for index in range(0, len(numeric_groups) - 6):
            window = numeric_groups[index:index + 7]

            try:
                values = [int(item) for item in window]
            except Exception:
                continue

            p1, p2, p3, p4, validos, blancos, nulos = values
            score = 0

            if p1 + p2 + p3 + p4 == validos:
                score += 100

            if validos + blancos + nulos <= 999:
                score += 20

            if all(0 <= value <= 999 for value in values):
                score += 10

            if validos >= max(p1, p2, p3, p4):
                score += 5

            if score > best_score:
                best_score = score
                best_window = window

        if best_window is not None and best_score >= 100:
            return best_window

        if len(numeric_groups) >= 7:
            return numeric_groups[-7:]

        return None

    def extract_votes_from_pdf_text(self, file_path, codigo_mesa, acta_id=None):
        pdf_text = self.extract_pdf_native_text(file_path)

        debug_text_file = self.save_debug_text(
            acta_id,
            "PDF_TEXT_EXTRACTED",
            pdf_text
        )

        if not pdf_text:
            return None

        clean_codigo_mesa = str(codigo_mesa).strip()
        compact_text = re.sub(r"\s+", "", pdf_text)

        if clean_codigo_mesa not in compact_text:
            return None

        numeric_groups = self.extract_numeric_groups_from_pdf_text(
            pdf_text,
            clean_codigo_mesa
        )

        selected_groups = self.select_vote_groups_from_numeric_groups(numeric_groups)

        if selected_groups is None:
            return None

        try:
            p1 = int(selected_groups[0])
            p2 = int(selected_groups[1])
            p3 = int(selected_groups[2])
            p4 = int(selected_groups[3])
            votos_validos = int(selected_groups[4])
            votos_blancos = int(selected_groups[5])
            votos_nulos = int(selected_groups[6])

        except Exception:
            return None

        campos = self.build_campos_from_vote_values(
            clean_codigo_mesa,
            p1,
            p2,
            p3,
            p4,
            votos_validos,
            votos_blancos,
            votos_nulos
        )

        validation_errors = self.validate_extracted_vote_values(campos)

        debug_summary = {
            "PDF_TEXT_EXTRACTED": debug_text_file,
            "PDF_TEXT_NUMERIC_GROUPS": numeric_groups,
            "PDF_TEXT_SELECTED_GROUPS": selected_groups
        }

        estado_sugerido = "VALIDADA"

        if validation_errors:
            estado_sugerido = "SOSPECHOSA"

        return {
            "campos": campos,
            "validationErrors": validation_errors,
            "debugFiles": debug_summary,
            "estadoSugerido": estado_sugerido,
            "textoExtraido": pdf_text
        }

    def process_pdf_text_extraction_result(self, file_path, codigo_mesa, now):
        pdf_result = self.extract_votes_from_pdf_text(
            file_path,
            codigo_mesa,
            acta_id=codigo_mesa
        )

        if pdf_result is None:
            return None

        validation_errors = pdf_result["validationErrors"]

        return {
            "success": True,
            "ocr": {
                "procesado": True,
                "motorOCR": "pdf-text-extraction",
                "confianzaPromedio": 0.99,
                "textoExtraido": pdf_result["textoExtraido"],
                "erroresOCR": validation_errors,
                "fechaProcesamiento": now
            },
            "qr": {
                "detectado": False,
                "contenido": None,
                "codigoMesaQr": None,
                "coincideConMesa": False
            },
            "campos": pdf_result["campos"],
            "quality": {
                "source": "PDF_TEXT_NATIVE",
                "requiresImageOCR": False
            },
            "debugFiles": pdf_result["debugFiles"],
            "estadoSugerido": pdf_result["estadoSugerido"]
        }

    def preprocess_for_ocr(self, pil_image):
        image_np = np.array(pil_image)
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)

        gray = cv2.resize(
            gray,
            None,
            fx=2,
            fy=2,
            interpolation=cv2.INTER_CUBIC
        )

        clahe = cv2.createCLAHE(
            clipLimit=2.0,
            tileGridSize=(8, 8)
        )
        enhanced = clahe.apply(gray)

        denoised = cv2.fastNlMeansDenoising(
            enhanced,
            None,
            20,
            7,
            21
        )

        threshold = cv2.threshold(
            denoised,
            0,
            255,
            cv2.THRESH_BINARY + cv2.THRESH_OTSU
        )[1]

        return threshold

    def preprocess_digit_cell_variants(self, pil_image):
        image_np = np.array(pil_image.convert("RGB"))
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)

        gray = cv2.resize(
            gray,
            None,
            fx=12,
            fy=12,
            interpolation=cv2.INTER_CUBIC
        )

        gray = cv2.GaussianBlur(gray, (3, 3), 0)

        binary_inv = cv2.threshold(
            gray,
            0,
            255,
            cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )[1]

        height, width = binary_inv.shape

        horizontal_kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (max(10, width // 2), 1)
        )

        vertical_kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (1, max(10, height // 2))
        )

        horizontal_lines = cv2.morphologyEx(
            binary_inv,
            cv2.MORPH_OPEN,
            horizontal_kernel,
            iterations=1
        )

        vertical_lines = cv2.morphologyEx(
            binary_inv,
            cv2.MORPH_OPEN,
            vertical_kernel,
            iterations=1
        )

        grid_lines = cv2.bitwise_or(horizontal_lines, vertical_lines)
        clean_digits = cv2.subtract(binary_inv, grid_lines)

        small_kernel = np.ones((2, 2), np.uint8)

        clean_digits = cv2.morphologyEx(
            clean_digits,
            cv2.MORPH_CLOSE,
            small_kernel,
            iterations=1
        )

        clean_digits = cv2.dilate(
            clean_digits,
            small_kernel,
            iterations=1
        )

        normal = cv2.bitwise_not(clean_digits)

        adaptive = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            9
        )

        variants = [
            normal,
            adaptive,
            cv2.bitwise_not(binary_inv)
        ]

        prepared = []

        for variant in variants:
            padded = cv2.copyMakeBorder(
                variant,
                40,
                40,
                40,
                40,
                cv2.BORDER_CONSTANT,
                value=255
            )
            prepared.append(padded)

        return prepared

    def normalize_digit_text(self, text):
        replacements = {
            "O": "0",
            "o": "0",
            "Q": "0",
            "D": "0",
            "I": "1",
            "l": "1",
            "|": "1",
            "!": "1",
            "S": "5",
            "s": "5",
            "B": "8",
            "b": "8",
            "Z": "2",
            "z": "2"
        }

        normalized = ""

        for char in text:
            if char.isdigit():
                normalized += char
            elif char in replacements:
                normalized += replacements[char]

        return normalized

    def detect_qr(self, pil_image):
        image_np = np.array(pil_image.convert("RGB"))
        detector = cv2.QRCodeDetector()
        data, points, _ = detector.detectAndDecode(image_np)

        if not data:
            return {
                "detectado": False,
                "contenido": None,
                "codigoMesaQr": None,
                "coincideConMesa": False
            }

        codigo_mesa_qr = None

        if "MESA:" in data:
            try:
                codigo_mesa_qr = data.split("MESA:")[1].split("|")[0].strip()
            except Exception:
                codigo_mesa_qr = None

        return {
            "detectado": True,
            "contenido": data,
            "codigoMesaQr": codigo_mesa_qr,
            "coincideConMesa": False
        }

    def run_tesseract(self, pil_image, psm=6, whitelist=None):
        try:
            processed = self.preprocess_for_ocr(pil_image)

            config = f"--oem 3 --psm {psm}"

            if whitelist:
                config += f" -c tessedit_char_whitelist={whitelist}"

            data = pytesseract.image_to_data(
                processed,
                lang=OCR_LANGUAGE,
                config=config,
                output_type=pytesseract.Output.DICT
            )

            words = []
            confidences = []

            for index, text in enumerate(data.get("text", [])):
                clean_text = text.strip()

                if clean_text:
                    words.append(clean_text)

                    try:
                        confidence = float(data["conf"][index])

                        if confidence >= 0:
                            confidences.append(confidence)
                    except Exception:
                        pass

            full_text = " ".join(words)

            avg_confidence = (
                round(sum(confidences) / len(confidences) / 100, 2)
                if confidences
                else 0
            )

            return full_text, avg_confidence, []

        except Exception as error:
            return "", 0, [f"OCR_ENGINE_ERROR: {str(error)}"]

    def save_debug_regions(self, acta_id, regions):
        debug_dir = Path("storage/debug_ocr") / str(acta_id)
        debug_dir.mkdir(parents=True, exist_ok=True)

        saved_files = {}

        for name, image in regions.items():
            file_path = debug_dir / f"{name}.png"
            image.save(file_path)
            saved_files[name] = str(file_path).replace("\\", "/")

        return saved_files

    def save_debug_crop_overlay(self, aligned_image, overlay_boxes, acta_id):
        overlay = aligned_image.copy().convert("RGB")
        draw = ImageDraw.Draw(overlay)
        width, height = overlay.size

        palette = ["red", "blue", "green", "orange", "purple", "cyan", "magenta"]

        for i, (label, x1r, y1r, x2r, y2r) in enumerate(overlay_boxes):
            color = palette[i % len(palette)]
            x1 = int(x1r * width)
            y1 = int(y1r * height)
            x2 = int(x2r * width)
            y2 = int(y2r * height)
            draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
            draw.text((x1 + 2, max(0, y1 - 12)), label, fill=color)

        debug_dir = Path("storage/debug_ocr") / str(acta_id) / "boxed_votes"
        debug_dir.mkdir(parents=True, exist_ok=True)
        overlay_path = debug_dir / "DEBUG_CROP_OVERLAY.png"
        overlay.save(overlay_path)

        return str(overlay_path).replace("\\", "/")

    def save_debug_boxed_votes(self, acta_id, boxed_regions):
        debug_dir = Path("storage/debug_ocr") / str(acta_id) / "boxed_votes"
        debug_dir.mkdir(parents=True, exist_ok=True)

        saved_files = {}

        for name, image in boxed_regions.items():
            file_path = debug_dir / f"{name}.png"
            image.save(file_path)
            saved_files[name] = str(file_path).replace("\\", "/")

        return saved_files

    def save_debug_digit_cell(self, acta_id, group_name, cell_index, attempt_index, image):
        if not acta_id:
            return None

        debug_dir = Path("storage/debug_ocr") / str(acta_id) / "boxed_votes" / "cells"
        debug_dir.mkdir(parents=True, exist_ok=True)

        file_path = debug_dir / f"{group_name}_cell_{cell_index}_try_{attempt_index}.png"
        image.save(file_path)

        return str(file_path).replace("\\", "/")

    def isolate_digit_on_canvas(self, pil_image):
        image_np = np.array(pil_image.convert("RGB"))
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)

        gray = cv2.resize(gray, None, fx=12, fy=12, interpolation=cv2.INTER_CUBIC)
        h, w = gray.shape

        binary = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            31,
            9
        )

        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        canvas_h, canvas_w = 120, 80
        canvas = np.ones((canvas_h, canvas_w), dtype=np.uint8) * 255

        if not contours:
            return Image.fromarray(canvas)

        min_area = 30
        digit_contours = []

        for contour in contours:
            _, _, contour_w, contour_h = cv2.boundingRect(contour)

            if cv2.contourArea(contour) < min_area:
                continue

            if contour_w > w * 0.85:
                continue

            if contour_h < max(5, int(h * 0.12)):
                continue

            digit_contours.append(contour)

        if not digit_contours:
            digit_contours = sorted(contours, key=cv2.contourArea, reverse=True)[:1]

        if not digit_contours:
            return Image.fromarray(canvas)

        x_min = min(cv2.boundingRect(contour)[0] for contour in digit_contours)
        y_min = min(cv2.boundingRect(contour)[1] for contour in digit_contours)
        x_max = max(
            cv2.boundingRect(contour)[0] + cv2.boundingRect(contour)[2]
            for contour in digit_contours
        )
        y_max = max(
            cv2.boundingRect(contour)[1] + cv2.boundingRect(contour)[3]
            for contour in digit_contours
        )

        if x_max <= x_min or y_max <= y_min:
            return Image.fromarray(canvas)

        binary_bw = cv2.bitwise_not(binary)
        digit_region = binary_bw[y_min:y_max, x_min:x_max]

        digit_h, digit_w = digit_region.shape[:2]

        if digit_w == 0 or digit_h == 0:
            return Image.fromarray(canvas)

        margin = 10
        scale = min(
            (canvas_w - 2 * margin) / digit_w,
            (canvas_h - 2 * margin) / digit_h
        )
        new_w = max(1, int(digit_w * scale))
        new_h = max(1, int(digit_h * scale))

        scaled = cv2.resize(digit_region, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

        x_offset = (canvas_w - new_w) // 2
        y_offset = (canvas_h - new_h) // 2
        canvas[y_offset:y_offset + new_h, x_offset:x_offset + new_w] = scaled

        return Image.fromarray(canvas)

    def read_single_digit_cell_with_tesseract(self, pil_image):
        variants = self.preprocess_digit_cell_variants(pil_image)
        candidates = []

        for variant in variants:
            for psm in [10, 13, 8]:
                config = (
                    f"--oem 3 --psm {psm} "
                    "-c tessedit_char_whitelist=0123456789OoIl|!SsBbZz"
                )

                try:
                    text = pytesseract.image_to_string(
                        variant,
                        lang=OCR_LANGUAGE,
                        config=config
                    )

                    normalized = self.normalize_digit_text(text)

                    if len(normalized) == 1:
                        candidates.append(normalized[0])
                except Exception:
                    pass

        if candidates:
            return max(set(candidates), key=candidates.count)

        return None

    def read_single_digit_cell_with_easyocr(self, pil_image):
        reader = self.get_easy_reader()

        if reader is None:
            return None

        try:
            image_np = np.array(pil_image.convert("RGB"))

            result = reader.readtext(
                image_np,
                detail=1,
                allowlist="0123456789"
            )

            candidates = []

            for item in result:
                text = str(item[1])
                confidence = float(item[2])

                if confidence < 0.40:
                    continue

                digits = "".join(char for char in text if char.isdigit())

                if len(digits) == 1:
                    candidates.append(digits)

            if candidates:
                return max(set(candidates), key=candidates.count)

        except Exception:
            pass

        return None

    def read_single_digit_cell(self, pil_image):
        isolated = self.isolate_digit_on_canvas(pil_image)
        isolated_np = np.array(isolated)
        padded = cv2.copyMakeBorder(
            isolated_np,
            20,
            20,
            20,
            20,
            cv2.BORDER_CONSTANT,
            value=255
        )

        candidates = []

        for psm in [10, 8, 13]:
            config = (
                f"--oem 3 --psm {psm} "
                "-c tessedit_char_whitelist=0123456789OoIl|!SsBbZz"
            )

            try:
                text = pytesseract.image_to_string(
                    Image.fromarray(padded),
                    lang=OCR_LANGUAGE,
                    config=config
                )
                normalized = self.normalize_digit_text(text)

                if len(normalized) == 1:
                    candidates.append(normalized[0])
            except Exception:
                pass

        if candidates:
            return max(set(candidates), key=candidates.count)

        tesseract_digit = self.read_single_digit_cell_with_tesseract(pil_image)

        if tesseract_digit is not None:
            return tesseract_digit

        return self.read_single_digit_cell_with_easyocr(pil_image)

    def read_group_with_full_ocr(self, pil_image):
        try:
            text_candidates = []

            for psm in [7, 8, 13]:
                processed = self.preprocess_for_ocr(pil_image)

                config = (
                    f"--oem 3 --psm {psm} "
                    "-c tessedit_char_whitelist=0123456789OoIl|!SsBbZz"
                )

                text = pytesseract.image_to_string(
                    processed,
                    lang=OCR_LANGUAGE,
                    config=config
                )

                normalized = self.normalize_digit_text(text)

                if len(normalized) == 3:
                    text_candidates.append(normalized)

            if text_candidates:
                selected = max(set(text_candidates), key=text_candidates.count)
                return int(selected)

        except Exception:
            pass

        reader = self.get_easy_reader()

        if reader is not None:
            try:
                image_np = np.array(pil_image.convert("RGB"))

                result = reader.readtext(
                    image_np,
                    detail=1,
                    allowlist="0123456789"
                )

                candidates = []

                for item in result:
                    text = str(item[1])
                    confidence = float(item[2])

                    if confidence < 0.45:
                        continue

                    digits = "".join(char for char in text if char.isdigit())

                    if len(digits) == 3:
                        candidates.append(digits)

                if candidates:
                    selected = max(set(candidates), key=candidates.count)
                    return int(selected)

            except Exception:
                pass

        return None

    def read_group_highres_ocr(self, pil_image):
        try:
            image_np = np.array(pil_image.convert("RGB"))
            gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)

            gray = cv2.resize(gray, None, fx=12, fy=12, interpolation=cv2.INTER_CUBIC)
            gray = cv2.GaussianBlur(gray, (3, 3), 0)

            binary = cv2.threshold(
                gray,
                0,
                255,
                cv2.THRESH_BINARY + cv2.THRESH_OTSU
            )[1]

            padded = cv2.copyMakeBorder(
                binary,
                40,
                40,
                40,
                40,
                cv2.BORDER_CONSTANT,
                value=255
            )

            candidates = []

            for psm in [7, 8, 13]:
                config = (
                    f"--oem 3 --psm {psm} "
                    "-c tessedit_char_whitelist=0123456789OoIl|!SsBbZz"
                )
                text = pytesseract.image_to_string(
                    padded,
                    lang=OCR_LANGUAGE,
                    config=config
                )
                normalized = self.normalize_digit_text(text)

                if len(normalized) == 3:
                    candidates.append(normalized)

            if candidates:
                return int(max(set(candidates), key=candidates.count))

        except Exception:
            pass

        return None

    def read_group_digits_by_cells(self, pil_image, group_name, acta_id=None, expected_digits=3):
        width, height = pil_image.size

        if acta_id:
            debug_dir = Path("storage/debug_ocr") / str(acta_id) / "boxed_votes"
            debug_dir.mkdir(parents=True, exist_ok=True)
            pil_image.save(debug_dir / f"{group_name}_full.png")

        full_value = self.read_group_highres_ocr(pil_image)

        if full_value is not None:
            return full_value

        full_value = self.read_group_with_full_ocr(pil_image)

        if full_value is not None:
            return full_value

        trim_ratio = 0.15
        trim_top = int(height * trim_ratio)
        trim_bottom = int(height * (1 - trim_ratio))

        if trim_bottom > trim_top + 4:
            pil_for_cells = pil_image.crop((0, trim_top, width, trim_bottom))
        else:
            pil_for_cells = pil_image

        cell_width_total, cell_height = pil_for_cells.size
        digits = []

        for index in range(expected_digits):
            cell_width = cell_width_total / expected_digits

            base_x1 = int(cell_width * index)
            base_x2 = int(cell_width * (index + 1))

            margins = [
                (0.10, 0.12),
                (0.16, 0.18),
                (0.06, 0.08),
                (0.02, 0.04)
            ]

            digit = None

            for attempt_index, (margin_x_ratio, margin_y_ratio) in enumerate(margins, start=1):
                margin_x = int(cell_width * margin_x_ratio)
                margin_y = int(cell_height * margin_y_ratio)

                x1 = max(0, base_x1 + margin_x)
                x2 = min(cell_width_total, base_x2 - margin_x)
                y1 = max(0, margin_y)
                y2 = min(cell_height, cell_height - margin_y)

                if x2 <= x1 or y2 <= y1:
                    continue

                cell = pil_for_cells.crop((x1, y1, x2, y2))

                self.save_debug_digit_cell(
                    acta_id,
                    group_name,
                    index + 1,
                    attempt_index,
                    cell
                )

                digit = self.read_single_digit_cell(cell)

                if digit is not None:
                    break

            if digit is None:
                return None

            digits.append(digit)

        raw_value = "".join(digits)

        return int(raw_value)

    def read_digits_only(self, pil_image):
        return self.read_group_digits_by_cells(
            pil_image,
            group_name="GENERIC",
            acta_id=None,
            expected_digits=3
        )

    def extract_boxed_votes_from_real_acta(self, aligned_image, acta_id=None):
        VOTE_X1 = 0.305
        VOTE_X2 = 0.420

        candidate_rows = [
            ("P1", "Partido 1", 0.331, 0.365),
            ("P2", "Partido 2", 0.355, 0.387),
            ("P3", "Partido 3", 0.377, 0.409),
            ("P4", "Partido 4", 0.400, 0.432),
        ]

        total_fields = [
            ("VOTOS_VALIDOS", 0.645, 0.715),
            ("VOTOS_BLANCOS", 0.730, 0.765),
            ("VOTOS_NULOS", 0.772, 0.838),
        ]

        candidatos = []
        boxed_regions = {}
        overlay_boxes = []

        for codigo, nombre, y1, y2 in candidate_rows:
            crop = self.crop_ratio(aligned_image, VOTE_X1, y1, VOTE_X2, y2)
            boxed_regions[codigo] = crop
            overlay_boxes.append((codigo, VOTE_X1, y1, VOTE_X2, y2))

            value = self.read_group_digits_by_cells(
                crop,
                group_name=codigo,
                acta_id=acta_id,
                expected_digits=3
            )

            if value is not None and 0 <= value <= 999:
                candidatos.append({
                    "partidoCodigo": codigo,
                    "partidoNombre": nombre,
                    "cantidadVotos": value
                })

        for field_key, y1, y2 in total_fields:
            crop = self.crop_ratio(aligned_image, VOTE_X1, y1, VOTE_X2, y2)
            boxed_regions[field_key] = crop
            overlay_boxes.append((field_key.replace("VOTOS_", ""), VOTE_X1, y1, VOTE_X2, y2))

        votos_validos = self.read_group_digits_by_cells(
            boxed_regions["VOTOS_VALIDOS"],
            "VOTOS_VALIDOS",
            acta_id,
            3
        )
        votos_blancos = self.read_group_digits_by_cells(
            boxed_regions["VOTOS_BLANCOS"],
            "VOTOS_BLANCOS",
            acta_id,
            3
        )
        votos_nulos = self.read_group_digits_by_cells(
            boxed_regions["VOTOS_NULOS"],
            "VOTOS_NULOS",
            acta_id,
            3
        )

        debug_boxed_files = {}

        if acta_id:
            debug_boxed_files = self.save_debug_boxed_votes(acta_id, boxed_regions)
            debug_boxed_files["overlay"] = self.save_debug_crop_overlay(
                aligned_image,
                overlay_boxes,
                acta_id
            )

        suma_partidos = sum(item["cantidadVotos"] for item in candidatos)

        total_votos = None

        if (
            votos_validos is not None
            and votos_blancos is not None
            and votos_nulos is not None
        ):
            total_votos = votos_validos + votos_blancos + votos_nulos

        return {
            "votosPartidos": candidatos,
            "votosValidos": votos_validos,
            "votosBlancos": votos_blancos,
            "votosNulos": votos_nulos,
            "totalVotos": total_votos,
            "sumaPartidos": suma_partidos,
            "debugBoxedFiles": debug_boxed_files
        }

    def validate_boxed_votes_reliability(self, boxed_votes):
        reliability_errors = []
        max_expected_votes = 999

        votos_partidos = boxed_votes.get("votosPartidos", [])
        votos_validos = boxed_votes.get("votosValidos")
        votos_blancos = boxed_votes.get("votosBlancos")
        votos_nulos = boxed_votes.get("votosNulos")
        total_votos = boxed_votes.get("totalVotos")

        if len(votos_partidos) != 4:
            reliability_errors.append("OCR_RECHAZADO_PARTIDOS_INCOMPLETOS")

        if votos_validos is None:
            reliability_errors.append("OCR_RECHAZADO_VALIDOS_NO_DETECTADOS")

        if votos_blancos is None:
            reliability_errors.append("OCR_RECHAZADO_BLANCOS_NO_DETECTADOS")

        if votos_nulos is None:
            reliability_errors.append("OCR_RECHAZADO_NULOS_NO_DETECTADOS")

        if total_votos is None:
            reliability_errors.append("OCR_RECHAZADO_TOTAL_NO_DETECTADO")

        valores = []

        for partido in votos_partidos:
            valores.append(partido.get("cantidadVotos", -1))

        for valor in [votos_validos, votos_blancos, votos_nulos, total_votos]:
            if valor is not None:
                valores.append(valor)

        for valor in valores:
            if not isinstance(valor, int):
                reliability_errors.append("OCR_RECHAZADO_VALOR_NO_NUMERICO")
                break

            if valor < 0:
                reliability_errors.append("OCR_RECHAZADO_VALOR_NEGATIVO")
                break

            if valor > max_expected_votes:
                reliability_errors.append("OCR_RECHAZADO_VALOR_FUERA_DE_RANGO")
                break

        if (
            votos_validos is not None
            and votos_blancos is not None
            and votos_nulos is not None
            and total_votos is not None
            and total_votos != votos_validos + votos_blancos + votos_nulos
        ):
            reliability_errors.append("OCR_RECHAZADO_TOTAL_INCOHERENTE")

        suma_partidos = sum(
            partido.get("cantidadVotos", 0)
            for partido in votos_partidos
        )

        if votos_validos is not None and suma_partidos > votos_validos:
            reliability_errors.append("OCR_RECHAZADO_PARTIDOS_SUPERAN_VALIDOS")

        return len(reliability_errors) == 0, reliability_errors

    def clean_unreliable_vote_fields(self, campos):
        campos["votosPartidos"] = []
        campos["votosValidos"] = 0
        campos["votosBlancos"] = 0
        campos["votosNulos"] = 0
        campos["totalVotos"] = 0

        campos["camposDetectados"]["votosPartidos"] = False
        campos["camposDetectados"]["votosValidos"] = False
        campos["camposDetectados"]["votosBlancos"] = False
        campos["camposDetectados"]["votosNulos"] = False
        campos["camposDetectados"]["totalVotos"] = False

        return campos

    def apply_reliable_vote_fields(self, campos, boxed_votes):
        if boxed_votes["votosPartidos"]:
            campos["votosPartidos"] = boxed_votes["votosPartidos"]
            campos["camposDetectados"]["votosPartidos"] = True

        if boxed_votes["votosValidos"] is not None:
            campos["votosValidos"] = boxed_votes["votosValidos"]
            campos["camposDetectados"]["votosValidos"] = True

        if boxed_votes["votosBlancos"] is not None:
            campos["votosBlancos"] = boxed_votes["votosBlancos"]
            campos["camposDetectados"]["votosBlancos"] = True

        if boxed_votes["votosNulos"] is not None:
            campos["votosNulos"] = boxed_votes["votosNulos"]
            campos["camposDetectados"]["votosNulos"] = True

        if boxed_votes["totalVotos"] is not None:
            campos["totalVotos"] = boxed_votes["totalVotos"]
            campos["camposDetectados"]["totalVotos"] = True

        return campos

    def process_file(self, file_path, content_type, codigo_mesa):
        errors = []
        now = datetime.now(timezone.utc)

        if not Path(file_path).exists():
            return {
                "success": False,
                "ocr": {
                    "procesado": False,
                    "motorOCR": "tesseract-aligned-opencv-easyocr",
                    "confianzaPromedio": 0,
                    "textoExtraido": "",
                    "erroresOCR": ["ARCHIVO_NO_ENCONTRADO"],
                    "fechaProcesamiento": now
                },
                "qr": {
                    "detectado": False,
                    "contenido": None,
                    "codigoMesaQr": None,
                    "coincideConMesa": False
                },
                "campos": {},
                "quality": {},
                "debugFiles": {},
                "estadoSugerido": "RECHAZADA"
            }

        if content_type == "application/pdf":
            pdf_text_result = self.process_pdf_text_extraction_result(
                file_path,
                codigo_mesa,
                now
            )

            if pdf_text_result is not None:
                return pdf_text_result

        original_image = self.load_image(file_path, content_type)
        quality = self.analyze_quality(original_image)

        if quality["blurScore"] < 80:
            errors.append("IMAGE_BLUR_DETECTED")

        if quality["brightness"] < 55:
            errors.append("IMAGE_TOO_DARK")

        if quality["brightness"] > 220:
            errors.append("IMAGE_TOO_BRIGHT")

        aligned_image, alignment_info = self.align_acta_image(
            original_image,
            acta_id=codigo_mesa
        )

        if not alignment_info.get("aligned"):
            errors.append("ACTA_ALIGNMENT_FALLBACK_USED")

        regions = {
            "GLOBAL": self.crop_ratio(aligned_image, 0.00, 0.00, 1.00, 1.00),
            "INFO_IZQUIERDA": self.crop_ratio(aligned_image, 0.00, 0.10, 0.28, 0.78),
            "CANDIDATOS": self.crop_ratio(aligned_image, 0.16, 0.27, 0.48, 0.58),
            "TOTALES": self.crop_ratio(aligned_image, 0.22, 0.48, 0.56, 0.78),
            "QR": self.crop_ratio(aligned_image, 0.08, 0.00, 0.30, 0.18)
        }

        debug_files = self.save_debug_regions(codigo_mesa, regions)
        debug_files["ALIGNED_ACTA_INFO"] = alignment_info

        texts = {}
        confidences = []
        ocr_errors = []

        global_text, global_conf, global_errors = self.run_tesseract(
            regions["GLOBAL"],
            psm=11
        )
        texts["GLOBAL"] = global_text
        ocr_errors.extend(global_errors)

        if global_conf > 0:
            confidences.append(global_conf)

        info_text, info_conf, info_errors = self.run_tesseract(
            regions["INFO_IZQUIERDA"],
            psm=6
        )
        texts["INFO_IZQUIERDA"] = info_text
        ocr_errors.extend(info_errors)

        if info_conf > 0:
            confidences.append(info_conf)

        candidate_text, candidate_conf, candidate_errors = self.run_tesseract(
            regions["CANDIDATOS"],
            psm=6
        )
        texts["CANDIDATOS"] = candidate_text
        ocr_errors.extend(candidate_errors)

        if candidate_conf > 0:
            confidences.append(candidate_conf)

        totals_text, totals_conf, totals_errors = self.run_tesseract(
            regions["TOTALES"],
            psm=6
        )
        texts["TOTALES"] = totals_text
        ocr_errors.extend(totals_errors)

        if totals_conf > 0:
            confidences.append(totals_conf)

        qr = self.detect_qr(regions["QR"])

        if not qr["detectado"]:
            errors.append("QR_NOT_DETECTED")

        if qr["codigoMesaQr"]:
            qr["coincideConMesa"] = str(qr["codigoMesaQr"]) == str(codigo_mesa)

            if not qr["coincideConMesa"]:
                errors.append("QR_MESA_NOT_MATCH")

        combined_text = "\n".join([
            "[INFO_IZQUIERDA]",
            texts["INFO_IZQUIERDA"],
            "[CANDIDATOS]",
            texts["CANDIDATOS"],
            "[TOTALES]",
            texts["TOTALES"],
            "[GLOBAL]",
            texts["GLOBAL"]
        ])

        confidence = round(sum(confidences) / len(confidences), 2) if confidences else 0

        errors.extend(ocr_errors)

        if not combined_text or len(combined_text.strip()) < 20:
            errors.append("OCR_TEXT_INSUFFICIENT")

        if confidence < 0.55:
            errors.append("OCR_LOW_CONFIDENCE")

        campos = extract_electoral_fields(combined_text)

        if "camposDetectados" not in campos:
            campos["camposDetectados"] = {}

        boxed_votes = self.extract_boxed_votes_from_real_acta(
            aligned_image,
            acta_id=codigo_mesa
        )

        ocr_votos_confiables, errores_confiabilidad = self.validate_boxed_votes_reliability(
            boxed_votes
        )

        if not ocr_votos_confiables:
            errors.append("OCR_RESULTADOS_NO_CONFIABLES")
            errors.extend(errores_confiabilidad)
            campos = self.clean_unreliable_vote_fields(campos)
        else:
            campos = self.apply_reliable_vote_fields(campos, boxed_votes)

        campos_detectados = campos.get("camposDetectados", {})

        if not campos_detectados.get("codigoMesa"):
            errors.append("MESA_NOT_DETECTED")

        if not campos_detectados.get("votosPartidos") and campos.get("votosValidos", 0) == 0:
            errors.append("VOTES_NOT_DETECTED")

        if campos_detectados.get("votosPartidos") and len(campos.get("votosPartidos", [])) < 4:
            errors.append("VOTOS_PARTIDOS_INCOMPLETOS")

        if campos.get("votosValidos", 0) == 0:
            errors.append("VOTOS_VALIDOS_NO_DETECTADOS")

        if campos.get("totalVotos", 0) == 0:
            errors.append("TOTAL_VOTOS_NO_DETECTADO")

        suma_partidos = sum(
            item["cantidadVotos"]
            for item in campos.get("votosPartidos", [])
        )

        votos_validos = campos.get("votosValidos", 0)
        votos_blancos = campos.get("votosBlancos", 0)
        votos_nulos = campos.get("votosNulos", 0)
        total_votos = campos.get("totalVotos", 0)
        habilitados = campos.get("cantidadHabilitados")

        if suma_partidos > 0 and votos_validos > 0 and suma_partidos != votos_validos:
            errors.append("SUMA_PARTIDOS_NO_COINCIDE_VALIDOS")

        if total_votos > 0 and total_votos != votos_validos + votos_blancos + votos_nulos:
            errors.append("TOTAL_INCOHERENTE")

        if habilitados is not None and total_votos > habilitados:
            errors.append("TOTAL_SUPERA_HABILITADOS")

        unique_errors = list(dict.fromkeys(errors))

        debug_files["BOXED_VOTES"] = boxed_votes.get("debugBoxedFiles", {})
        debug_files["BOXED_VOTES_RAW_OCR"] = {
            "votosPartidos": boxed_votes.get("votosPartidos", []),
            "votosValidos": boxed_votes.get("votosValidos"),
            "votosBlancos": boxed_votes.get("votosBlancos"),
            "votosNulos": boxed_votes.get("votosNulos"),
            "totalVotos": boxed_votes.get("totalVotos"),
            "sumaPartidos": boxed_votes.get("sumaPartidos")
        }

        if "TOTAL_SUPERA_HABILITADOS" in unique_errors:
            estado_sugerido = "RECHAZADA"
        elif any(
            error in unique_errors
            for error in [
                "VOTES_NOT_DETECTED",
                "OCR_TEXT_INSUFFICIENT",
                "OCR_RESULTADOS_NO_CONFIABLES"
            ]
        ):
            estado_sugerido = "PENDIENTE_REVISION"
        elif unique_errors:
            estado_sugerido = "SOSPECHOSA"
        else:
            estado_sugerido = "VALIDADA"

        return {
            "success": True,
            "ocr": {
                "procesado": True,
                "motorOCR": "tesseract-aligned-opencv-easyocr",
                "confianzaPromedio": confidence,
                "textoExtraido": combined_text,
                "erroresOCR": unique_errors,
                "fechaProcesamiento": now
            },
            "qr": qr,
            "campos": campos,
            "quality": quality,
            "alignment": alignment_info,
            "debugFiles": debug_files,
            "estadoSugerido": estado_sugerido
        }