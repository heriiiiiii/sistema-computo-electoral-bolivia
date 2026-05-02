# Módulo 02 — Flujo Rápido RRV (Quick Vote Count)

Backend para el procesamiento preliminar de actas electorales mediante OCR, validación y corrección manual.

---

## Tecnologías

- Python 3.x + FastAPI
- MongoDB (Replica Set)
- OpenCV + Tesseract OCR + EasyOCR
- PyMuPDF (PDF support)
- Pillow / NumPy

---

## Levantar el servidor

```bash
cd 02-flujo-rapido-rrv
.\venv\Scripts\activate
uvicorn app.main:app --reload --port 4001
```

Swagger UI disponible en: `http://localhost:4001/docs`

---

## Variables de entorno (.env)

```env
MONGO_URI=mongodb://localhost:27017/?replicaSet=rs0
MONGO_DB_NAME=oep_rrv
UPLOAD_DIR=storage/actas
TESSERACT_CMD=tesseract
OCR_LANGUAGE=spa
```

---

## Endpoints disponibles

### Health
```
GET /api/rrv/health
```

### Actas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/rrv/actas` | Recibir una nueva acta (imagen o PDF) — requiere metadatos manuales |
| `POST` | `/api/rrv/actas/auto` | Ingreso 100% automático de un PDF nativo (extrae todos los metadatos) |
| `GET` | `/api/rrv/actas` | Listar actas con filtros opcionales |
| `GET` | `/api/rrv/actas/{actaId}` | Detalle de un acta |
| `POST` | `/api/rrv/actas/{actaId}/procesar-ocr` | Ejecutar OCR sobre el archivo del acta |
| `PATCH` | `/api/rrv/actas/{actaId}/resultados-manuales` | Corregir resultados manualmente |
| `POST` | `/api/rrv/sms` | Recibir un SMS reenviado por HTTP y guardarlo en `oep_rrv.rrv_sms` |

### SMS por HTTP

El backend RRV solo puede guardar SMS si recibe un HTTP POST. Que el mensaje
llegue a la bandeja SMS del telefono no alcanza: SMS Forwarder, la app movil o
el servidor PC deben reenviar `from/sender/phone/number` y
`body/message/text` al endpoint.

El endpoint normaliza payloads comunes, guarda siempre `rawPayload`, registra
`receivedAt` con la fecha del backend y luego intenta parsear el resultado RRV
sin bloquear el guardado.

### Logs
```
GET /api/rrv/logs
```

---

## Ingreso automático de actas PDF (`POST /api/rrv/actas/auto`)

Endpoint pensado para PDFs con **texto nativo extraíble**. El backend extrae automáticamente todos los metadatos del acta directamente del PDF (no usa OCR sobre la imagen) y crea el documento Mongo en una sola llamada.

### Multipart form

| Campo | Tipo | Requerido | Default |
|-------|------|-----------|---------|
| `archivo` | file | sí | — |
| `usuarioId` | string | no | `operador-auto` |
| `nombreOperador` | string | no | `Operador automatico` |
| `dispositivo` | string | no | `carga-web-auto` |
| `latitud` | float | no | `0` |
| `longitud` | float | no | `0` |

### Comportamiento

1. Se guarda el archivo en `storage/actas/`.
2. Si es PDF, se invoca `extract_acta_metadata_from_pdf()` (texto nativo con PyMuPDF).
3. Si la extracción tiene éxito, se llenan automáticamente:
   - `codigoMesa`, `numeroMesa`
   - `ubicacion.departamento`, `provincia`, `municipio`, `recinto.nombre`, `recinto.direccion`
   - `datosActa.horaApertura`, `horaCierre`, `cantidadHabilitados`, `papeletasEnAnfora`, `papeletasNoUtilizadas`
   - `resultados.presidente.votosPartidos`, `votosValidos`, `votosBlancos`, `votosNulos`, `totalVotos`
4. Se ejecutan las siguientes validaciones de consistencia:
   - `suma(P1..P4) == votosValidos` → si no, `SUMA_PARTIDOS_NO_COINCIDE_VALIDOS`
   - `totalVotos == votosValidos + votosBlancos + votosNulos` → si no, `TOTAL_INCOHERENTE`
   - `totalVotos == papeletasEnAnfora` → si no, `TOTAL_NO_COINCIDE_PAPELETAS_ANFORA`
   - `papeletasEnAnfora + papeletasNoUtilizadas == cantidadHabilitados` → si no, `PAPELETAS_NO_COINCIDEN_HABILITADOS`
5. Detección de duplicados por hash y por `codigoMesa` (igual que el endpoint manual).

### Estados resultantes

| Situación | Estado |
|-----------|--------|
| Todo consistente y no duplicado | `VALIDADA` |
| Hash o mesa duplicada | `SOSPECHOSA` |
| Inconsistencias de votos / papeletas | `SOSPECHOSA` |
| No fue posible extraer texto del PDF | `PENDIENTE_REVISION` |

El endpoint clásico `POST /api/rrv/actas` **no fue modificado** y sigue siendo la vía manual cuando el operador necesita registrar metadatos a mano o cuando el archivo es una imagen.

### Ejemplo de respuesta exitosa

```json
{
  "success": true,
  "message": "Acta procesada automaticamente",
  "actaId": "RRV-2026-AB12CD34",
  "estado": "VALIDADA",
  "codigoMesa": "1010200001003",
  "numeroMesa": 3,
  "esDuplicada": false,
  "requiereRevisionManual": false,
  "metodoExtraccion": "pdf-text-extraction",
  "inconsistencias": [],
  "resultadosPresidente": {
    "votosPartidos": [
      { "partidoCodigo": "P1", "cantidadVotos": 183 },
      { "partidoCodigo": "P2", "cantidadVotos": 32 },
      { "partidoCodigo": "P3", "cantidadVotos": 52 },
      { "partidoCodigo": "P4", "cantidadVotos": 481 }
    ],
    "votosValidos": 748,
    "votosBlancos": 12,
    "votosNulos": 97,
    "totalVotos": 857
  }
}
```

### Probar en Swagger

1. Abrir `http://localhost:4001/docs`
2. Ir a `POST /api/rrv/actas/auto`.
3. En `archivo`, subir el PDF (por ejemplo `acta_1010200001003.pdf`).
4. Dejar los demás campos en blanco para usar defaults.
5. Ejecutar y verificar que `estado = VALIDADA` con todos los campos llenos.
6. `GET /api/rrv/actas/{actaId}` para ver el documento Mongo completo.

---

## Validación de calidad visual del acta

Toda acta procesada (vía `POST /api/rrv/actas/auto` o `POST /api/rrv/actas/{actaId}/procesar-ocr`) pasa por un análisis de **calidad visual** que detecta accidentes naturales del documento (manchas, sombras, arrugas, recortes, rotaciones extremas, observaciones manuscritas). El objetivo es **registrar evidencia y trazabilidad**, no rechazar el acta cuando los datos numéricos siguen siendo legibles.

El resultado se guarda en el documento Mongo bajo `calidadVisual` y los códigos detectados también se anexan a `validacion.errores`. Cada análisis registra un log `tipo=ERROR_IMAGEN`.

### Zonas ignoradas y zonas críticas

El detector evalúa las manchas **solo dentro de las zonas con datos electorales útiles**, e ignora regiones que en cualquier acta sana contienen elementos esperados (huellas dactilares, firmas, sellos, logos, código de barras):

| Zona | Coordenadas relativas | Uso |
|------|----------------------|-----|
| `RIGHT_SIGNATURES_AND_FINGERPRINTS` | x ∈ [0.62, 0.98], y ∈ [0.12, 0.78] | **ignorada** — firmas y huellas de jurados |
| `HEADER_LOGO_BARCODE` | y ∈ [0.00, 0.15] | **ignorada** — cabecera, logos, barcode |
| `LOWER_LEFT_PAPELETAS` | x ∈ [0.00, 0.40], y ∈ [0.55, 0.85] | crítica — papeletas/habilitados |
| `VOTES_AREA` | x ∈ [0.28, 0.46], y ∈ [0.30, 0.62] | crítica — votos por candidato |
| `TOTALS_AREA` | x ∈ [0.40, 0.62], y ∈ [0.55, 0.85] | crítica — totales |
| `OBSERVATIONS_AREA` | x ∈ [0.05, 0.62], y ∈ [0.78, 0.95] | crítica — observaciones |

Las zonas `LOWER_LEFT_PAPELETAS` y `VOTES_AREA` contienen logos/fotos a color de los partidos por diseño (44–46% de saturación natural en acta limpia), así que el chequeo de **manchas de color** se evalúa solo en `TOTALS_AREA` y `OBSERVATIONS_AREA`. Las **manchas oscuras** sí se buscan en las cuatro zonas críticas porque cualquier obstrucción negra sobre datos importa.

### Códigos detectables

| Código | Disparador | Tipo |
|--------|-----------|------|
| `ACTA_CON_MANCHA_NEGRA` | ≥ 12% de pixeles muy oscuros dentro de **alguna zona crítica** (excluyendo huellas/firmas) | warning |
| `ACTA_CON_MANCHA_COLOR` | ≥ 15% de saturación en `TOTALS_AREA` o ≥ 25% en `OBSERVATIONS_AREA` (ambos exceden el ruido natural del formulario) | warning |
| `ACTA_CON_ARRUGAS_O_SOMBRAS` | `blurScore` < 40 (sólo imágenes muy desenfocadas; un acta ligeramente arrugada pero legible no dispara) | warning |
| `ACTA_CON_BAJA_VISIBILIDAD` | contraste < 20 o brillo < 90 (umbrales muy estrictos) | warning |
| `ACTA_POSIBLEMENTE_RECORTADA` | algún borde tiene > 90% de pixeles muy oscuros | warning |
| `ACTA_ROTADA_O_INVERTIDA` | aspect ratio en rango extremo (< 0.40 o > 2.50) | warning |
| `ACTA_CON_OBSERVACION_MANUSCRITA` | el texto extraído contiene frases inequívocas: `mesa en lugar (distinto)`, `recinto diferente`, `anulado/anulada` | warning |
| `ZONA_CRITICA_AFECTADA` | una mancha real intersecta una zona crítica (no se dispara por color/tinta natural del formulario) | warning |

Si un acta está limpia, todos estos códigos quedan vacíos: `tieneProblemasVisuales=false`, `erroresVisuales=[]`, no se registra log `ERROR_IMAGEN`, y el resumen del lote no la cuenta como "con advertencias visuales".

### Cómo afecta al estado

Las advertencias visuales son **observaciones**, no causas de sospecha. El estado del acta se decide únicamente por duplicados, inconsistencias numéricas o falta de campos críticos. Una mancha, una arruga o una observación manuscrita **nunca** mueve un acta de `VALIDADA` a `SOSPECHOSA`.

| Caso | Estado resultante |
|------|-------------------|
| Sin advertencias visuales y sin inconsistencias | `VALIDADA` |
| Advertencias visuales (manchas, arrugas, sombras, observación manuscrita, zona crítica) — datos legibles y sumas coherentes | **`VALIDADA`** + warnings en `calidadVisual.erroresVisuales` y `validacion.errores` |
| Inconsistencia numérica (suma partidos ≠ válidos, total ≠ válidos+blancos+nulos, papeletas ≠ habilitados) | `SOSPECHOSA` + `requiereRevisionManual=true` |
| Duplicado por hash o misma mesa | `SOSPECHOSA` + `requiereRevisionManual=true` |
| Faltan campos críticos (no se extrajo `codigoMesa`, `votosValidos`, `totalVotos`, etc.) | `PENDIENTE_REVISION` |

`calidadVisual.requiereRevisionManual` siempre es `false` para las heurísticas actuales — el campo se conserva por compatibilidad. La intensidad real del problema se publica en `calidadVisual.impactoLectura` (`NINGUNO` o `ADVERTENCIA`) y `calidadVisual.soloAdvertencia` (siempre `true` para las heurísticas actuales). Los votos extraídos **siempre se preservan**.

### Estructura persistida

```json
"calidadVisual": {
  "procesado": true,
  "tieneProblemasVisuales": true,
  "afectaZonaCritica": true,
  "requiereRevisionManual": false,
  "impactoLectura": "ADVERTENCIA",
  "soloAdvertencia": true,
  "erroresVisuales": [
    {
      "codigo": "ACTA_CON_MANCHA_NEGRA",
      "descripcion": "Zonas oscuras u obstruidas detectadas (5.9% del area)",
      "severidad": "WARNING"
    },
    {
      "codigo": "ZONA_CRITICA_AFECTADA",
      "descripcion": "Zonas criticas afectadas: LOWER_LEFT_PAPELETAS",
      "severidad": "WARNING",
      "zonasAfectadas": [
        { "zona": "LOWER_LEFT_PAPELETAS", "porcentajeOscuro": 12.4, "porcentajeColor": 0.2 }
      ]
    }
  ],
  "metricas": {
    "porcentajeZonasOscuras": 5.95,
    "porcentajeManchasColor": 13.33,
    "brilloPromedio": 178.48,
    "contraste": 64.58,
    "blurScore": 1744.58,
    "orientacionDetectada": "NORMAL",
    "ancho": 1872,
    "alto": 1224
  },
  "fechaAnalisis": "2026-04-28T..."
}
```

### Probar en Swagger

1. `POST /api/rrv/actas/auto` con cada uno de los siguientes PDFs (en `storage/actas/`):
   - `acta_1010200001002.pdf` — obstrucción negra inferior izquierda → `MANCHA_NEGRA` + `ZONA_CRITICA_AFECTADA` → **`VALIDADA`** si las sumas cuadran (warnings en `calidadVisual`).
   - `acta_1010300011005.pdf` — arrugas/sombras suaves → procesa sin advertencias visuales → `VALIDADA`.
   - `acta_1010300011011.pdf` — observación manuscrita "Mesa en lugar distinto" → `OBSERVACION_MANUSCRITA` + `MANCHA_COLOR` + `ZONA_CRITICA_AFECTADA` → **`VALIDADA`** si las sumas cuadran (la observación es solo advertencia).
2. `GET /api/rrv/actas/{actaId}` para ver el documento completo, incluido `calidadVisual` y `validacion.errores`.
3. `GET /api/rrv/logs?tipo=ERROR_IMAGEN` para ver los logs registrados por el análisis visual.
4. `GET /api/rrv/actas-sospechosas` para ver actas marcadas para revisión por causas visuales.

---

## Carga masiva de actas desde una carpeta (script local)

Para procesar muchas actas a la vez (por ejemplo, un `.rar` con varias decenas de PDFs entregado durante la defensa), el módulo incluye un script local:

```
02-flujo-rapido-rrv/scripts/bulk_upload_actas.py
```

El script **no reimplementa OCR ni validaciones**: simplemente recorre los archivos de una carpeta y los envía uno por uno al endpoint `POST /api/rrv/actas/auto`. Toda la lógica vive en el backend.

### Pasos previos

1. Extraer manualmente el `.rar` con un descompresor (7-Zip / WinRAR) en una carpeta cualquiera, por ejemplo `C:\actas\ACTAS_COACH`.
2. Levantar el backend RRV:

```bash
cd 02-flujo-rapido-rrv
.\venv\Scripts\activate
uvicorn app.main:app --reload --port 4001
```

3. Asegurar que `requests` está instalado (ya está en `requirements.txt`):

```bash
pip install -r requirements.txt
```

### Uso básico

```bash
python scripts/bulk_upload_actas.py --folder "C:\actas\ACTAS_COACH" --url http://localhost:4001
```

### Opciones

| Flag | Descripción |
|------|-------------|
| `--folder` | (requerido) Carpeta con los PDFs/imágenes a cargar. |
| `--url` | URL base del backend. Default: `http://localhost:4001`. |
| `--recursive` | Buscar también dentro de subcarpetas. |
| `--limit N` | Procesar como máximo `N` archivos (útil para pruebas rápidas). |
| `--delay S` | Esperar `S` segundos entre archivos (descarga el backend si lo necesitas). |

Extensiones aceptadas: `.pdf`, `.png`, `.jpg`, `.jpeg`.

### Comportamiento

- Antes de empezar llama a `GET /api/rrv/health`. Si el backend no responde, el script termina con código de salida `2` y un mensaje claro:
  > "No se pudo verificar el backend RRV. Revisa que Uvicorn este corriendo."
- Por cada archivo envía `multipart/form-data` a `POST /api/rrv/actas/auto` con los campos por defecto del operador masivo (`usuarioId="operador-lote"`, `nombreOperador="Operador lote"`, `dispositivo="script-carga-masiva"`, lat/lon `0`).
- Procesa **uno por uno**. Si un archivo falla (HTTP error, conexión caída, archivo ilegible), el lote **no se detiene** — registra la falla y sigue.
- Imprime una línea por archivo, por ejemplo:
  ```
  [12/199] Procesando acta_1010200001012.pdf
    Resultado: VALIDADA con advertencias visuales
  ```

### Reportes generados

Al finalizar se crean dos reportes en `02-flujo-rapido-rrv/storage/reportes_lote/`:

```
storage/reportes_lote/reporte_lote_YYYYMMDD_HHMMSS.json
storage/reportes_lote/reporte_lote_YYYYMMDD_HHMMSS.csv
```

Cada registro contiene: `nombreArchivo`, `rutaArchivo`, `success`, `httpStatus`, `actaId`, `codigoMesa`, `numeroMesa`, `estado`, `esDuplicada`, `requiereRevisionManual`, `tieneProblemasVisuales`, `erroresVisuales`, `erroresOCR`, `erroresValidacion`, `votosValidos`, `votosBlancos`, `votosNulos`, `totalVotos`, `mensaje`, `error`.

El JSON además incluye un bloque `summary` con:

```json
{
  "totalEncontrados": 199,
  "totalProcesados": 199,
  "validadas": 162,
  "sospechosas": 18,
  "pendientesRevision": 4,
  "rechazadas": 0,
  "erroresHttp": 0,
  "erroresConexion": 0,
  "duplicadas": 6,
  "conAdvertenciasVisuales": 27,
  "conErrorOCR": 5,
  "tiempoTotalSegundos": 412.35
}
```

### Verificación posterior en Swagger / API

Después del lote, validar resultados en el backend:

- `GET /api/rrv/resumen` — KPIs globales (totales por estado).
- `GET /api/rrv/actas-sospechosas` — solo las actas marcadas como sospechosas (duplicadas o numéricamente inconsistentes).
- `GET /api/rrv/logs` — todos los logs de la sesión.
- `GET /api/rrv/logs?tipo=ERROR_IMAGEN` — solo las advertencias visuales (manchas, arrugas, observaciones manuscritas).

Recordatorio: el script **reutiliza** `POST /api/rrv/actas/auto`. Las reglas de negocio actuales se mantienen — un acta manchada pero legible y con sumas coherentes seguirá siendo `VALIDADA`, y solo duplicados o inconsistencias numéricas la moverán a `SOSPECHOSA`.

---

## Cómo funciona el OCR

1. **Carga del archivo**: imagen PNG/JPG o PDF.
2. **Análisis de calidad**: blur score, brillo.
3. **Alineación**: intento de corrección de perspectiva con detección de contornos. Si falla, se redimensiona preservando la relación de aspecto original.
4. **Detección de QR**: lectura del código QR del acta.
5. **Extracción de votos en celdas**:
   - Se recortan regiones exactas del acta para cada partido (P1–P4) y totales (válidos, blancos, nulos).
   - Estrategia de lectura: primero 12× upscaling (para celdas pequeñas ~22px), luego OCR estándar, luego lectura celda por celda.
6. **Validación de confiabilidad**:
   - Se verifica que los 4 partidos fueron detectados.
   - Todos los valores deben ser enteros no negativos ≤ 350.
   - `totalVotos = votosValidos + votosBlancos + votosNulos` debe ser coherente.
7. **Registro de inconsistencias**:
   - Si `suma(partidos) != votosValidos` → error `SUMA_PARTIDOS_NO_COINCIDE_VALIDOS`.
   - El acta queda en estado `SOSPECHOSA`, no `VALIDADA`.

### Regla de consistencia de votos

```
votosValidos = P1 + P2 + P3 + P4   (idealmente)
totalVotos   = votosValidos + votosBlancos + votosNulos
```

Si los datos del acta no satisfacen esta regla, el acta se marca `SOSPECHOSA` y requiere revisión manual.

---

## Cuándo se requiere revisión manual

El estado `PENDIENTE_REVISION` se asigna cuando el OCR no puede leer valores confiables:
- Imagen borrosa o mal iluminada.
- No se detectaron los 4 partidos.
- Valores fuera de rango (> 350) o incoherentes.

El estado `SOSPECHOSA` se asigna cuando los valores fueron leídos pero son inconsistentes:
- Suma de votos por partido ≠ votosValidos.
- Total incoherente con subtotales.
- Duplicado de acta para la misma mesa.

En ambos casos `validacion.requiereRevisionManual = true` y los resultados NO se publican automáticamente.

---

## Corrección manual de resultados

Cuando el OCR falla o el acta queda en `PENDIENTE_REVISION`, un operador puede ingresar los valores manualmente.

### Endpoint

```
PATCH /api/rrv/actas/{actaId}/resultados-manuales
```

### Body de ejemplo (JSON)

```json
{
  "votosPartidos": [
    { "partidoCodigo": "P1", "cantidadVotos": 10 },
    { "partidoCodigo": "P2", "cantidadVotos": 4 },
    { "partidoCodigo": "P3", "cantidadVotos": 9 },
    { "partidoCodigo": "P4", "cantidadVotos": 28 }
  ],
  "votosValidos": 128,
  "votosBlancos": 14,
  "votosNulos": 45,
  "operadorId": "OP-001",
  "observacion": "Lectura manual por fallo de OCR"
}
```

### Comportamiento esperado con los datos del ejemplo

- `suma(partidos)` = 10 + 4 + 9 + 28 = **51**
- `votosValidos` = **128**
- 51 ≠ 128 → inconsistencia detectada
- `estado` → **SOSPECHOSA**
- `inconsistencias` → `["SUMA_PARTIDOS_NO_COINCIDE_VALIDOS"]`
- `requiereRevisionManual` → `true`
- `totalVotos` → 128 + 14 + 45 = **187**
- Los valores **sí se almacenan** en `resultados.presidente` para trazabilidad.

### Validaciones aplicadas

| Regla | Error |
|-------|-------|
| Ningún valor puede ser negativo | HTTP 422 (Pydantic) |
| `suma(partidos) != votosValidos` | `SUMA_PARTIDOS_NO_COINCIDE_VALIDOS` → SOSPECHOSA |
| Corrección registrada en logs y eventos | siempre |

---

## Probar en Swagger paso a paso

1. Abrir `http://localhost:4001/docs`
2. `GET /api/rrv/health` → verificar que el servicio responde.
3. `POST /api/rrv/actas` → subir el archivo de prueba (`RRV-2026-F39E27D0.png`).
4. Copiar el `actaId` devuelto (ej. `RRV-2026-F39E27D0`).
5. `GET /api/rrv/actas/{actaId}` → ver el estado inicial (`RECIBIDA`).
6. `POST /api/rrv/actas/{actaId}/procesar-ocr` → ejecutar OCR.
7. `GET /api/rrv/actas/{actaId}` → ver estado resultante y `erroresOCR`.
8. Si el estado es `PENDIENTE_REVISION`, usar:
   `PATCH /api/rrv/actas/{actaId}/resultados-manuales` con el body de ejemplo.
9. `GET /api/rrv/logs` → ver trazabilidad completa.

---

## Archivos de debug OCR

Cada ejecución de OCR guarda imágenes de diagnóstico en:

```
storage/debug_ocr/{codigoMesa}/
  ALIGNED_ACTA_FALLBACK_RESIZE.png   # imagen redimensionada para OCR
  GLOBAL.png                          # región completa
  CANDIDATOS.png                      # zona de candidatos
  TOTALES.png                         # zona de totales
  boxed_votes/
    P1_full.png, P2_full.png, ...     # recortes de votos por partido
    VOTOS_VALIDOS_full.png            # recorte del total de votos válidos
    VOTOS_BLANCOS_full.png
    VOTOS_NULOS_full.png
    cells/                            # celdas individuales de dígitos
```

---

## Estados del acta

| Estado | Descripción |
|--------|-------------|
| `RECIBIDA` | Acta almacenada, pendiente de OCR |
| `PROCESANDO` | OCR en ejecución |
| `VALIDADA` | OCR confiable y datos consistentes |
| `SOSPECHOSA` | Valores detectados pero inconsistentes (o duplicado) |
| `PENDIENTE_REVISION` | OCR no pudo leer valores confiables |
| `RECHAZADA` | Datos imposibles (ej. total supera habilitados) |

---

## Acta de prueba conocida

```
actaId:      RRV-2026-F39E27D0
codigoMesa:  10101001001
Valores en la imagen:
  P1=10, P2=4, P3=9, P4=28
  votosValidos=128, votosBlancos=14, votosNulos=45
  totalVotos=187
Nota: suma(P1..P4)=51 ≠ votosValidos=128 → el acta es internamente inconsistente
      Estado esperado después de OCR o corrección manual: SOSPECHOSA
```
