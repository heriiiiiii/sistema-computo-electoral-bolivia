from datetime import datetime, timezone

import cv2
import fitz
import numpy as np


# Zonas con datos electorales utiles. Aqui buscamos obstrucciones oscuras
# (manchas negras, partes tapadas) en cualquier zona.
CRITICAL_ZONES_RATIOS = {
    "LOWER_LEFT_PAPELETAS": (0.00, 0.55, 0.40, 0.85),
    "VOTES_AREA": (0.28, 0.30, 0.46, 0.62),
    "TOTALS_AREA": (0.40, 0.55, 0.62, 0.85),
    "OBSERVATIONS_AREA": (0.05, 0.78, 0.62, 0.95),
}


# Para color (manchas de cafe/tinta) solo evaluamos zonas que en una acta
# sana son casi totalmente blancas/grises. Los recuadros de partidos y de
# papeletas tienen logos/fotos a color por diseno (44-46% de saturacion en
# acta limpia), por eso quedan fuera del chequeo de color.
COLOR_CHECK_ZONES_RATIOS = {
    "TOTALS_AREA": (0.40, 0.55, 0.62, 0.85),
    "OBSERVATIONS_AREA": (0.05, 0.78, 0.62, 0.95),
}


# Zonas que normalmente contienen huellas, firmas, sellos, logos o cabecera.
# Las ignoramos porque su contenido es esperado por diseno y no representa un
# defecto: huellas dactilares azules a la derecha, codigos de barra y logos
# arriba, etc.
IGNORE_ZONES_RATIOS = {
    "RIGHT_SIGNATURES_AND_FINGERPRINTS": (0.62, 0.12, 0.98, 0.78),
    "HEADER_LOGO_BARCODE": (0.00, 0.00, 1.00, 0.15),
}


# Palabras clave que sugieren observaciones manuscritas reales. Mantenemos
# solo expresiones especificas para no chocar con etiquetas impresas del
# formulario (p. ej. "Observaciones:" como titulo de campo).
OBSERVATION_KEYWORDS = [
    "mesa en lugar",
    "mesa en lugar distinto",
    "recinto diferente",
    "anulado",
    "anulada",
]


class VisualQualityService:
    DARK_PIXEL_THRESHOLD = 35
    COLOR_SATURATION_THRESHOLD = 60
    COLOR_VALUE_MIN = 50

    # Una zona critica se considera afectada solo cuando la mancha cubre una
    # parte significativa de la zona. Subimos los umbrales para evitar falsos
    # positivos por contornos del formulario o variaciones de tinta normales.
    DARK_PCT_CRITICAL_ZONE = 12.0
    # OBSERVATIONS_AREA tiene ~12% de pixeles saturados en acta limpia por la
    # tipografia/lineas de cabecera. Subimos su umbral para que solo manchas
    # reales (cafe, marcador) la disparen. TOTALS_AREA suele ser casi 0%, asi
    # que un umbral mas bajo es seguro.
    COLOR_PCT_BY_ZONE = {
        "TOTALS_AREA": 15.0,
        "OBSERVATIONS_AREA": 25.0,
    }

    # Solo flagear visibilidad/blur cuando son realmente extremos: la mayoria
    # de scans sanos quedan muy por encima de estos umbrales.
    BLUR_LAPLACIAN_THRESHOLD = 40.0
    LOW_BRIGHTNESS_THRESHOLD = 90.0
    LOW_CONTRAST_THRESHOLD = 20.0

    EXTREME_PORTRAIT_RATIO = 0.40
    EXTREME_LANDSCAPE_RATIO = 2.50
    BORDER_STRIP_RATIO = 0.04
    BORDER_DARK_PCT_THRESHOLD = 90.0

    def render_image(self, file_path, content_type):
        try:
            if content_type == "application/pdf":
                document = fitz.open(file_path)

                try:
                    page = document.load_page(0)
                    pixmap = page.get_pixmap(
                        matrix=fitz.Matrix(2, 2),
                        alpha=False
                    )
                    image_rgb = np.frombuffer(
                        pixmap.samples,
                        dtype=np.uint8
                    ).reshape(pixmap.height, pixmap.width, 3)
                finally:
                    document.close()

                return cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

            return cv2.imread(str(file_path))

        except Exception:
            return None

    def empty_result(self):
        return {
            "procesado": False,
            "tieneProblemasVisuales": False,
            "afectaZonaCritica": False,
            "requiereRevisionManual": False,
            "impactoLectura": "NINGUNO",
            "soloAdvertencia": False,
            "erroresVisuales": [],
            "metricas": {
                "porcentajeZonasOscuras": 0.0,
                "porcentajeManchasColor": 0.0,
                "brilloPromedio": 0.0,
                "contraste": 0.0,
                "blurScore": 0.0,
                "orientacionDetectada": "DESCONOCIDA"
            },
            "fechaAnalisis": datetime.now(timezone.utc)
        }

    def build_ignore_mask(self, height, width):
        ignore_mask = np.zeros((height, width), dtype=np.uint8)

        for x1r, y1r, x2r, y2r in IGNORE_ZONES_RATIOS.values():
            x1 = max(0, int(x1r * width))
            y1 = max(0, int(y1r * height))
            x2 = min(width, int(x2r * width))
            y2 = min(height, int(y2r * height))
            ignore_mask[y1:y2, x1:x2] = 1

        return ignore_mask

    def analyze(self, file_path, content_type, pdf_text=None):
        result = self.empty_result()

        image_bgr = self.render_image(file_path, content_type)

        if image_bgr is None:
            result["erroresVisuales"].append({
                "codigo": "ANALISIS_VISUAL_NO_DISPONIBLE",
                "descripcion": "No fue posible renderizar la imagen para analisis visual",
                "severidad": "INFO"
            })
            result["tieneProblemasVisuales"] = True
            result["soloAdvertencia"] = True
            result["impactoLectura"] = "ADVERTENCIA"
            return result

        result["procesado"] = True

        height, width = image_bgr.shape[:2]
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)

        brightness = float(np.mean(gray))
        contrast = float(np.std(gray))
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        kernel = np.ones((5, 5), np.uint8)

        # Mascara base de zonas oscuras (manchas/obstrucciones).
        dark_mask = (gray < self.DARK_PIXEL_THRESHOLD).astype(np.uint8)
        dark_mask = cv2.morphologyEx(dark_mask, cv2.MORPH_OPEN, kernel)

        # Mascara base de zonas con color saturado (manchas de tinta, cafe, etc.).
        saturation = hsv[:, :, 1]
        value = hsv[:, :, 2]
        color_mask = (
            (saturation > self.COLOR_SATURATION_THRESHOLD)
            & (value > self.COLOR_VALUE_MIN)
        ).astype(np.uint8)
        color_mask = cv2.morphologyEx(color_mask, cv2.MORPH_OPEN, kernel)

        # Excluir zonas esperadas (huellas/firmas a la derecha, cabecera/logo).
        ignore_mask = self.build_ignore_mask(height, width)
        keep_mask = (1 - ignore_mask).astype(np.uint8)

        dark_mask_filtered = dark_mask * keep_mask
        color_mask_filtered = color_mask * keep_mask

        # Las metricas globales se calculan sobre la mascara filtrada
        # para que un acta limpia con muchas firmas no parezca "manchada".
        dark_pct = float(np.mean(dark_mask_filtered) * 100)
        color_pct = float(np.mean(color_mask_filtered) * 100)

        aspect_ratio = width / height if height else 0
        orientation = "NORMAL"

        if aspect_ratio < self.EXTREME_PORTRAIT_RATIO:
            orientation = "PORTRAIT_EXTREMO"
        elif aspect_ratio > self.EXTREME_LANDSCAPE_RATIO:
            orientation = "LANDSCAPE_EXTREMO"

        result["metricas"] = {
            "porcentajeZonasOscuras": round(dark_pct, 2),
            "porcentajeManchasColor": round(color_pct, 2),
            "brilloPromedio": round(brightness, 2),
            "contraste": round(contrast, 2),
            "blurScore": round(blur_score, 2),
            "orientacionDetectada": orientation,
            "ancho": int(width),
            "alto": int(height)
        }

        errores = []

        # Las advertencias de mancha SOLO se emiten si la mancha cae en una
        # zona critica de datos. No usamos el porcentaje global para decidir.
        zonas_oscuras_afectadas = []
        zonas_color_afectadas = []

        # MANCHA_NEGRA: cualquier zona critica con suficientes pixeles muy oscuros
        # se considera obstruccion sobre datos.
        for zone_name, (x1r, y1r, x2r, y2r) in CRITICAL_ZONES_RATIOS.items():
            x1 = max(0, int(x1r * width))
            y1 = max(0, int(y1r * height))
            x2 = min(width, int(x2r * width))
            y2 = min(height, int(y2r * height))

            zone_dark = dark_mask_filtered[y1:y2, x1:x2]
            zone_dark_pct = float(np.mean(zone_dark) * 100) if zone_dark.size > 0 else 0.0

            if zone_dark_pct >= self.DARK_PCT_CRITICAL_ZONE:
                zonas_oscuras_afectadas.append({
                    "zona": zone_name,
                    "porcentajeOscuro": round(zone_dark_pct, 2)
                })

        # MANCHA_COLOR: solo en zonas que en una acta sana son casi blancas.
        # Cada zona tiene su propio umbral porque la tipografia/lineas de
        # cabecera ya generan algo de saturacion natural.
        for zone_name, (x1r, y1r, x2r, y2r) in COLOR_CHECK_ZONES_RATIOS.items():
            x1 = max(0, int(x1r * width))
            y1 = max(0, int(y1r * height))
            x2 = min(width, int(x2r * width))
            y2 = min(height, int(y2r * height))

            zone_color = color_mask_filtered[y1:y2, x1:x2]
            zone_color_pct = float(np.mean(zone_color) * 100) if zone_color.size > 0 else 0.0
            zone_threshold = self.COLOR_PCT_BY_ZONE.get(zone_name, 25.0)

            if zone_color_pct >= zone_threshold:
                zonas_color_afectadas.append({
                    "zona": zone_name,
                    "porcentajeColor": round(zone_color_pct, 2)
                })

        if zonas_oscuras_afectadas:
            errores.append({
                "codigo": "ACTA_CON_MANCHA_NEGRA",
                "descripcion": (
                    "Obstrucciones oscuras sobre datos: "
                    + ", ".join(
                        f"{item['zona']} ({item['porcentajeOscuro']}%)"
                        for item in zonas_oscuras_afectadas
                    )
                ),
                "severidad": "WARNING",
                "zonasAfectadas": zonas_oscuras_afectadas
            })

        if zonas_color_afectadas:
            errores.append({
                "codigo": "ACTA_CON_MANCHA_COLOR",
                "descripcion": (
                    "Manchas de color sobre datos: "
                    + ", ".join(
                        f"{item['zona']} ({item['porcentajeColor']}%)"
                        for item in zonas_color_afectadas
                    )
                ),
                "severidad": "WARNING",
                "zonasAfectadas": zonas_color_afectadas
            })

        zonas_afectadas_total = zonas_oscuras_afectadas + zonas_color_afectadas

        if zonas_afectadas_total:
            errores.append({
                "codigo": "ZONA_CRITICA_AFECTADA",
                "descripcion": (
                    "Zonas criticas afectadas: "
                    + ", ".join(
                        sorted({item["zona"] for item in zonas_afectadas_total})
                    )
                ),
                "severidad": "WARNING",
                "zonasAfectadas": zonas_afectadas_total
            })

        # Visibilidad / arrugas / blur: umbrales muy estrictos. Una textura
        # de papel normal o un scan ligeramente arrugado NO disparan estos
        # codigos. Solo los disparamos en imagenes realmente degradadas.
        if contrast < self.LOW_CONTRAST_THRESHOLD:
            errores.append({
                "codigo": "ACTA_CON_BAJA_VISIBILIDAD",
                "descripcion": f"Bajo contraste ({contrast:.1f})",
                "severidad": "WARNING"
            })
        elif brightness < self.LOW_BRIGHTNESS_THRESHOLD:
            errores.append({
                "codigo": "ACTA_CON_BAJA_VISIBILIDAD",
                "descripcion": f"Brillo bajo ({brightness:.1f})",
                "severidad": "WARNING"
            })

        if blur_score < self.BLUR_LAPLACIAN_THRESHOLD:
            errores.append({
                "codigo": "ACTA_CON_ARRUGAS_O_SOMBRAS",
                "descripcion": (
                    f"Posibles arrugas o sombras "
                    f"(blurScore {blur_score:.1f})"
                ),
                "severidad": "WARNING"
            })

        if orientation != "NORMAL":
            errores.append({
                "codigo": "ACTA_ROTADA_O_INVERTIDA",
                "descripcion": f"Orientacion detectada: {orientation}",
                "severidad": "WARNING"
            })

        # Recorte: solo si los bordes (que normalmente son blancos del scan)
        # estan casi totalmente oscuros (90%+). Esto detecta sombras fuertes
        # o paginas cortadas, no margenes normales.
        bs_h = max(1, int(self.BORDER_STRIP_RATIO * height))
        bs_w = max(1, int(self.BORDER_STRIP_RATIO * width))
        border_strips = [
            gray[:bs_h, :],
            gray[-bs_h:, :],
            gray[:, :bs_w],
            gray[:, -bs_w:]
        ]

        border_dark_percentages = []

        for region in border_strips:
            if region.size > 0:
                border_dark_percentages.append(
                    float(np.mean(region < self.DARK_PIXEL_THRESHOLD) * 100)
                )

        if any(pct > self.BORDER_DARK_PCT_THRESHOLD for pct in border_dark_percentages):
            errores.append({
                "codigo": "ACTA_POSIBLEMENTE_RECORTADA",
                "descripcion": (
                    "Bordes con grandes zonas oscuras "
                    "(posible recorte o sombra fuerte)"
                ),
                "severidad": "WARNING"
            })

        # Observacion manuscrita: solo frases inequivocas, no etiquetas impresas
        # del formulario.
        if pdf_text:
            text_lower = pdf_text.lower()

            for keyword in OBSERVATION_KEYWORDS:
                if keyword in text_lower:
                    errores.append({
                        "codigo": "ACTA_CON_OBSERVACION_MANUSCRITA",
                        "descripcion": (
                            "Posible observacion manuscrita detectada "
                            f"(palabra clave: '{keyword}')"
                        ),
                        "severidad": "WARNING"
                    })
                    break

        afecta_zona_critica = len(zonas_afectadas_total) > 0

        result["erroresVisuales"] = errores
        result["tieneProblemasVisuales"] = len(errores) > 0
        result["afectaZonaCritica"] = afecta_zona_critica
        result["impactoLectura"] = "ADVERTENCIA" if errores else "NINGUNO"
        result["soloAdvertencia"] = bool(errores)
        result["requiereRevisionManual"] = False

        return result
