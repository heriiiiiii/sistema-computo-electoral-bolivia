# Integracion segura con RRV

Este modulo conserva los dos flujos existentes de la app movil y agrega un puente
desde el servidor PC hacia `02-flujo-rapido-rrv`.

## Flujo A: PDF/foto

1. La app toma una foto del acta.
2. La app convierte la foto a PDF.
3. La app envia el PDF al servidor PC con `POST /upload`.
4. El servidor PC guarda el PDF localmente en `SAVE_DIR` o, por defecto, en
   `Desktop/ACTAS_COACH`.
5. Despues del guardado local, el servidor PC reenvia el PDF a:
   `POST ${RRV_BASE_URL}${RRV_PDF_ENDPOINT}`.
6. El endpoint RRV usado por defecto es `/api/rrv/actas/auto`.
7. OCR, extraccion de texto PDF, validaciones y persistencia de actas siguen
   siendo responsabilidad exclusiva de RRV.

## Flujo B: SMS numerico

1. La app genera el texto SMS fijo:
   `MESA:X;RECINTO:Y;P1:n;P2:n;P3:n;P4:n;BLANCOS:n;NULOS:n`.
2. La app abre la aplicacion SMS del telefono.
3. Si hay WiFi, la app tambien registra el mensaje en el servidor PC con
   `POST /sms/incoming`.
4. El servidor PC valida el telefono contra `authorized_numbers.json`.
5. El servidor PC guarda el registro local en `servidor-pc/sms.json`.
6. Despues del guardado local, el servidor PC reenvia el JSON numerico a:
   `POST ${RRV_BASE_URL}${RRV_SMS_ENDPOINT}`.
7. El endpoint RRV usado por defecto es `/api/rrv/sms`.

Nota tecnica importante: que el SMS llegue al telefono no hace que MongoDB se
actualice automaticamente. El backend no puede leer la bandeja SMS del telefono.
Para guardar en `oep_rrv.rrv_sms`, SMS Forwarder, la app movil o el servidor PC
deben enviar el contenido al backend mediante HTTP POST.

Endpoint real que escribe en MongoDB:

```text
POST http://<IP-PC>:4001/api/rrv/sms
```

Alias del servidor PC, util si SMS Forwarder ya apunta al puerto 3000:

```text
POST http://<IP-PC>:3000/api/rrv/sms
```

El alias `:3000/api/rrv/sms` no escribe directo en MongoDB; reenvia el payload
al backend RRV configurado en `RRV_BASE_URL` y conserva una cola pendiente si RRV
no responde.

El flujo SMS no usa OCR, no sube PDFs, no escribe en `storage/actas`, no crea
actas OCR y no modifica los resultados dashboard de actas PDF/OCR.

## Configuracion

Crear opcionalmente `servidor-pc/.env` a partir de `servidor-pc/.env.example`.

Variables soportadas:

```env
RRV_BASE_URL=http://localhost:4001
RRV_PDF_ENDPOINT=/api/rrv/actas/auto
RRV_SMS_ENDPOINT=/api/rrv/sms
RRV_FORWARD_ENABLED=true
RRV_FORWARD_TIMEOUT_MS=30000
SAVE_DIR=
```

Si `SAVE_DIR` queda vacio, el servidor usa `Desktop/ACTAS_COACH` del usuario
actual, sin rutas personales hardcodeadas en el codigo.

## Instalacion y arranque

Servidor RRV:

```powershell
cd 02-flujo-rapido-rrv
uvicorn app.main:app --host 0.0.0.0 --port 4001
```

Servidor PC:

```powershell
cd 05-app-movil-sms\servidor-pc
npm install
node server.js
```

## Pruebas rapidas

Health del servidor PC:

```powershell
curl.exe http://localhost:3000/health
```

Health de RRV:

```powershell
curl.exe http://localhost:4001/api/rrv/health
```

SMS por el servidor PC:

```powershell
$body = @{
  from = "+59170000000"
  message = "MESA:1010200001001;RECINTO:1010200001;P1:10;P2:20;P3:30;P4:40;BLANCOS:5;NULOS:2"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/sms/incoming" -Method Post -ContentType "application/json" -Body $body
```

SMS Forwarder directo al alias compatible con `/api/rrv/sms`:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/rrv/sms" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"from":"+59170000000","message":"RRV MESA 1010200001001 P1 10 P2 20 P3 30 P4 40 BLANCOS 2 NULOS 1"}'
```

Reintentar pendientes:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/sync/pending" -Method Post
```

Estado de pendientes:

```powershell
curl.exe http://localhost:3000/sync/status
```

PDF por el servidor PC:

```powershell
curl.exe -F "file=@C:\ruta\al\acta.pdf;type=application/pdf" http://localhost:3000/upload
```

## Colas pendientes

Si RRV esta caido o no responde, el servidor PC no falla el guardado local.

- PDFs pendientes: `servidor-pc/pending_rrv_uploads.json`
- SMS pendientes: `servidor-pc/pending_rrv_sms.json`

`POST /sync/pending` reintenta los elementos con `status=PENDING` y marca
`SENT` cuando RRV confirma la recepcion. Los rechazos semanticos de SMS se
marcan como `FAILED` para evitar reintentos infinitos.

## MongoDB a verificar

```javascript
db.rrv_sms.find().sort({createdAt:-1}).limit(5).pretty()

db.rrv_actas.find({
  $or: [
    { "source.canal": "SMS_APP_MOVIL" },
    { "fuente": "APP_MOVIL_SMS" }
  ]
}).count()
```

El segundo resultado debe ser `0` para SMS. Los PDFs reenviados desde la app si
entran en `rrv_actas` por el flujo OCR/PDF normal.

`rrv_resultados_preliminares` no se usa en esta integracion porque el proyecto
actual no tiene un repositorio o servicio existente para esa coleccion.

## APK

Si solo cambia `servidor-pc`, no hace falta reconstruir el APK. Si se modifican
archivos en `lib/`, `android/` o configuracion Flutter, reconstruir:

```powershell
cd 05-app-movil-sms
flutter pub get
flutter build apk --release
Copy-Item "build\app\outputs\flutter-apk\app-release.apk" "apks\actas-sms-v2.apk"
```
