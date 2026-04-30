# Guía de Inicio Rápido
## Módulo 05 — App Móvil + Backend SMS

**Audiencia:** Desarrolladores, integradores, personal técnico  
**Prerrequisitos:** Flutter ≥ 3.10, Node.js ≥ 18, Android SDK o Xcode

---

## Índice

1. [Visión técnica del sistema](#1-visión-técnica-del-sistema)
2. [Estructura del repositorio](#2-estructura-del-repositorio)
3. [Inicio rápido — App móvil (Flutter)](#3-inicio-rápido--app-móvil-flutter)
4. [Inicio rápido — Backend SMS (Node.js)](#4-inicio-rápido--backend-sms-nodejs)
5. [Configuración de cada flujo](#5-configuración-de-cada-flujo)
6. [Integración entre módulos](#6-integración-entre-módulos)
7. [Verificar que todo funciona](#7-verificar-que-todo-funciona)
8. [Resolución de problemas](#8-resolución-de-problemas)

---

## 1. Visión técnica del sistema

El módulo 05 implementa **dos flujos completamente independientes**. Cada uno tiene su propia pila tecnológica, sus propios endpoints y sus propias pantallas. No comparten estado ni se llaman entre sí.

```
╔══════════════════════════════════════════════════════════════════════╗
║                        FLUJO A — FOTO AL BACKEND                    ║
║                                                                      ║
║  App Flutter          Internet           Backend (módulo 03 o 06)   ║
║  ┌─────────┐   POST /api/rrv/actas   ┌──────────────────────┐       ║
║  │CaptureScreen  multipart/form-data │ Procesa foto + datos  │       ║
║  │ + foto   │ ─────────────────────► │ Integra al PDF        │       ║
║  │ + datos  │                        │ Sistema de cómputo    │       ║
║  └─────────┘                         └──────────────────────┘       ║
║                                                                      ║
║  • La foto JPEG viaja por internet al servidor                       ║
║  • Requiere conexión activa (WiFi o datos móviles)                   ║
║  • Tiene cola offline: guarda y reintenta si no hay conexión         ║
╚══════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════╗
║                        FLUJO B — SMS                                 ║
║                                                                      ║
║  App Flutter      Red GSM/SMS         Backend SMS (este módulo)     ║
║  ┌──────────┐   SMS a 71440740   ┌─────────────────────────────┐    ║
║  │SmsData   │ ─────────────────► │ Gateway SMS (webhook POST)  │    ║
║  │Screen    │  texto predefinido │ ↓ numberValidator           │    ║
║  │ + datos  │                    │ ↓ messageValidator          │    ║
║  └──────────┘                    │ ↓ smsParser                 │    ║
║       ↓                          │ ↓ actaService               │    ║
║  SmsPreviewScreen                └─────────────────────────────┘    ║
║       ↓                                                              ║
║  App SMS del SO → usuario envía                                      ║
║                                                                      ║
║  • La foto queda en el dispositivo (NO viaja por SMS)                ║
║  • Solo viajan los campos de texto en formato predefinido            ║
║  • Funciona sin internet (solo necesita señal de voz/SMS)            ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 2. Estructura del repositorio

```
05-app-movil-sms/
│
├── MANUAL_USUARIO.md           ← Manual para delegados de mesa
├── GUIA_INICIO.md              ← Este archivo (para desarrolladores)
│
├── pubspec.yaml                ← Dependencias Flutter
├── analysis_options.yaml
├── .gitignore
│
├── lib/                        ← Código Dart de la app móvil
│   ├── main.dart               ← Punto de entrada → HomeScreen
│   ├── config/
│   │   └── app_config.dart     ← URLs y constantes configurables
│   ├── models/
│   │   ├── acta_model.dart     ← Modelo del Flujo A (foto)
│   │   └── sms_acta_model.dart ← Modelo del Flujo B (SMS)
│   ├── validators/
│   │   └── sms_validator.dart  ← Validaciones del Flujo B
│   ├── services/
│   │   ├── api_service.dart          ← HTTP multipart (Flujo A)
│   │   ├── offline_queue_service.dart ← Cola offline (Flujo A)
│   │   └── sms_service.dart          ← Generación y lanzamiento SMS (Flujo B)
│   ├── utils/
│   │   └── connectivity_helper.dart  ← Detección de red
│   └── screens/
│       ├── home_screen.dart           ← Selector de flujo
│       ├── capture_screen.dart        ← A-1: foto + formulario
│       ├── confirmation_screen.dart   ← A-2: revisar antes de enviar
│       ├── result_screen.dart         ← A-3: resultado del envío
│       └── sms/
│           ├── sms_data_screen.dart   ← B-1: datos + foto evidencia
│           └── sms_preview_screen.dart ← B-2: mensaje solo lectura
│
├── android/                    ← Configuración Android
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/main/
│   │       ├── AndroidManifest.xml    ← Permisos + FileProvider + queries SMS
│   │       ├── kotlin/.../MainActivity.kt
│   │       └── res/xml/file_paths.xml
│   ├── build.gradle
│   ├── settings.gradle
│   └── gradle/wrapper/gradle-wrapper.properties
│
├── ios/                        ← Configuración iOS
│   ├── Runner/
│   │   ├── Info.plist          ← Permisos cámara + LSApplicationQueriesSchemes
│   │   └── AppDelegate.swift
│   └── Podfile
│
└── backend/                    ← Servidor Node.js para Flujo B
    ├── .env.example
    ├── package.json
    └── src/
        ├── app.js              ← Express + middlewares
        ├── server.js           ← Entrada HTTP
        ├── config/config.js    ← Variables de entorno
        ├── data/
        │   └── authorized_numbers.json  ← Números autorizados a enviar SMS
        ├── middleware/
        │   └── gatewayNormalizer.js     ← Normaliza Twilio / AT / genérico
        ├── parsers/
        │   └── smsParser.js             ← Extrae campos del formato predefinido
        ├── validators/
        │   ├── numberValidator.js       ← Verifica número remitente
        │   └── messageValidator.js      ← Verifica estructura del texto
        ├── services/
        │   └── actaService.js           ← Lógica de negocio
        └── routes/
            └── smsRoutes.js             ← POST /api/sms/incoming
```

---

## 3. Inicio rápido — App móvil (Flutter)

### 3.1 Requisitos

```
Flutter SDK  ≥ 3.10   → https://docs.flutter.dev/get-started/install
Dart SDK     ≥ 3.0    (incluido en Flutter)
Android SDK  ≥ API 34 (para Android)
Xcode        ≥ 14     (para iOS, solo en macOS)
```

Verificar instalación:
```bash
flutter doctor
# Todos los checks deben estar en verde para Android o iOS
```

### 3.2 Configurar local.properties (Android)

```bash
cd 05-app-movil-sms/android
cp local.properties.example local.properties
```

Editar `android/local.properties`:
```properties
sdk.dir=C:\Users\TU_USUARIO\AppData\Local\Android\sdk
flutter.sdk=C:\src\flutter
flutter.versionName=1.0.0
flutter.versionCode=1
flutter.minSdkVersion=21
flutter.compileSdkVersion=34
flutter.targetSdkVersion=34
```

### 3.3 Instalar dependencias

```bash
cd 05-app-movil-sms
flutter pub get
```

Paquetes que se instalan:

| Paquete | Usado en |
|---|---|
| `image_picker` | Captura de foto (Flujo A y B) |
| `http` | Envío multipart al backend (Flujo A) |
| `http_parser` | Tipo MIME de la imagen (Flujo A) |
| `shared_preferences` | Cola offline (Flujo A) |
| `connectivity_plus` | Detección de red (Flujo A) |
| `path_provider` | Persistencia de imagen (Flujo A) |
| `path` | Rutas de archivo |
| `url_launcher` | Abrir app de SMS (Flujo B) |

### 3.4 Configurar las URLs y número SMS

Editar `lib/config/app_config.dart`:

```dart
class AppConfig {
  // ── Flujo A: URL del servidor de fotos ──────────────────────────────────
  // Emulador Android:    http://10.0.2.2:3000
  // Dispositivo físico:  http://192.168.1.X:3000   (IP del servidor en la LAN)
  // Producción:          https://api.tu-servidor.bo
  static const String baseUrl = 'http://10.0.2.2:3000';
  static const String actasEndpoint = '/api/rrv/actas';
  static const int timeoutSeconds = 30;

  // ── Flujo B: número receptor del SMS ───────────────────────────────────
  // Formato E.164 obligatorio para el URI scheme sms:
  static const String smsRecipientNumber = '+59171440740';
}
```

### 3.5 Ejecutar la app

```bash
# Ver dispositivos disponibles
flutter devices

# Correr en el dispositivo conectado o emulador
flutter run

# Correr en un dispositivo específico
flutter run -d <device-id>

# Build APK de debug para instalar manualmente
flutter build apk --debug
# APK resultante: build/app/outputs/flutter-apk/app-debug.apk
```

### 3.6 Permisos requeridos (ya configurados)

**Android** (`android/app/src/main/AndroidManifest.xml`):
```xml
INTERNET                    ← Flujo A: envío al servidor
ACCESS_NETWORK_STATE        ← Flujo A: detección de conectividad
CAMERA                      ← Flujos A y B: captura de foto
READ_MEDIA_IMAGES           ← Android 13+
READ_EXTERNAL_STORAGE       ← Android ≤ 12
FileProvider                ← image_picker necesita compartir URI con la cámara

<queries>                   ← Flujo B: url_launcher necesita
  sms + smsto               ← consultar apps SMS en Android 11+
```

**iOS** (`ios/Runner/Info.plist`):
```xml
NSCameraUsageDescription         ← Acceso a cámara
NSPhotoLibraryUsageDescription   ← Acceso a galería
LSApplicationQueriesSchemes: sms ← Flujo B: url_launcher
```

---

## 4. Inicio rápido — Backend SMS (Node.js)

El backend del Flujo B recibe los SMS del gateway y aplica toda la lógica de procesamiento. Es completamente independiente del servidor del Flujo A.

### 4.1 Requisitos

```
Node.js  ≥ 18   → https://nodejs.org
npm      ≥ 9
```

### 4.2 Instalar y configurar

```bash
cd 05-app-movil-sms/backend

# 1. Copiar configuración
cp .env.example .env

# 2. Instalar dependencias
npm install
```

### 4.3 Variables de entorno (`.env`)

```env
PORT=3001
NODE_ENV=development

# Tipo de gateway: 'twilio' | 'africastalking' | 'generic'
SMS_GATEWAY_TYPE=generic

# Número que recibe los SMS (coincide con app Flutter)
SMS_RECIPIENT_NUMBER=+59171440740

# Secreto del gateway para verificar webhook (vacío en desarrollo)
SMS_WEBHOOK_SECRET=

# Desactivar en desarrollo, activar en producción
ENFORCE_WEBHOOK_SIGNATURE=false
```

### 4.4 Configurar números autorizados

Editar `src/data/authorized_numbers.json`:

```json
{
  "numbers": [
    "+59171440740",
    "+59176000001",
    "+59176000002"
  ]
}
```

Formatos aceptados (todos se normalizan a E.164 internamente):

| Formato ingresado | Se normaliza a |
|---|---|
| `71440740` | `+59171440740` |
| `071440740` | `+59171440740` |
| `59171440740` | `+59171440740` |
| `+59171440740` | `+59171440740` |

Reiniciar el servidor después de cambiar la lista.

### 4.5 Iniciar el servidor

```bash
# Desarrollo (reinicio automático con nodemon)
npm run dev

# Producción
npm start
```

Salida esperada:
```
[SMS Backend] Servidor escuchando en http://localhost:3001
[SMS Backend] Endpoint SMS: POST http://localhost:3001/api/sms/incoming
[SMS Backend] Entorno: development
```

---

## 5. Configuración de cada flujo

### Flujo A — Configuración de red

| Entorno | `baseUrl` en `app_config.dart` |
|---|---|
| Emulador Android | `http://10.0.2.2:3000` |
| Dispositivo físico (LAN) | `http://192.168.X.X:3000` |
| Producción | `https://api.sistema-computo.bo` |

El endpoint del Flujo A es atendido por el backend del módulo 03 o 06, **no** por el backend de este módulo.

### Flujo B — Configuración del gateway SMS

Para que el backend reciba los SMS, necesita ser accesible públicamente. En desarrollo, usar ngrok:

```bash
# Instalar ngrok: https://ngrok.com/download
ngrok http 3001

# Copiar la URL pública, por ejemplo:
# https://abc123.ngrok-free.app
```

Configurar esa URL en el panel de tu gateway SMS:

**Twilio:**
```
Webhook URL: https://abc123.ngrok-free.app/api/sms/incoming
Method: HTTP POST
```

**Africa's Talking:**
```
Callback URL: https://abc123.ngrok-free.app/api/sms/incoming
```

**Genérico:**
Configurar según la documentación del proveedor local.

---

## 6. Integración entre módulos

### Qué integra el Flujo A con otros módulos del sistema

```
Módulo 05 (app)  →  POST /api/rrv/actas  →  Módulo 03 (flujo oficial)
                                              Módulo 06 (integración SQA)
```

El Flujo A envía `multipart/form-data` con los campos:
```
foto          → archivo JPEG
codigoMesa    → string
numeroMesa    → string
codigoRecinto → string
timestamp     → ISO-8601
```

El servidor receptor (módulo 03/06) se encarga de integrar la foto al PDF. El módulo 05 no sabe qué hace el servidor con los datos.

### Qué integra el Flujo B con otros módulos del sistema

```
Módulo 05 (backend SMS)  →  actaService._triggerDownstreamProcessing()
                               ↓
                           TODO: conectar a módulo 03 o 04
```

El stub `_triggerDownstreamProcessing` en `actaService.js` es el punto de integración. Para conectar con el dashboard o el flujo oficial:

```js
// src/services/actaService.js — función a completar
async function _triggerDownstreamProcessing(registro) {
  // Opción A: llamada HTTP al módulo 03
  await fetch('http://localhost:3000/api/rrv/actas-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registro),
  });

  // Opción B: insertar en la base de datos compartida
  // await db.query('INSERT INTO actas ...', [registro.codigoMesa, ...]);

  // Opción C: emitir un evento WebSocket al dashboard (módulo 04)
  // dashboardSocket.emit('nueva-acta-sms', registro);
}
```

### Independencia garantizada

Los flujos no se afectan mutuamente:

| Si falla el Flujo A | El Flujo B sigue funcionando |
|---|---|
| Si falla el Flujo B | El Flujo A sigue funcionando |
| Si el servidor del Flujo A está caído | El Flujo B puede usarse como respaldo |
| Si no hay internet | El Flujo A guarda en cola; el Flujo B opera normalmente |

---

## 7. Verificar que todo funciona

### 7.1 Verificar el backend SMS

```bash
# Health check
curl http://localhost:3001/health
# Esperado: {"status":"ok"}

# Enviar un SMS de prueba (número autorizado)
curl -X POST http://localhost:3001/api/sms/incoming \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+59176000001",
    "body": "[ACTA-RRV]\nMesa: CM-001\nNum: 42\nRecinto: RC-005\n20/10/2024 14:35",
    "to": "+59171440740"
  }'

# Respuesta esperada:
# {"status":"accepted","id":"SMS-...","codigoMesa":"CM-001","numeroMesa":42,...}

# Enviar con número no autorizado
curl -X POST http://localhost:3001/api/sms/incoming \
  -H "Content-Type: application/json" \
  -d '{"from":"+59199999999","body":"[ACTA-RRV]\nMesa: CM-001\nNum: 42\nRecinto: RC-005\n20/10/2024 14:35","to":"+59171440740"}'

# Respuesta esperada:
# {"status":"rejected","reason":"sender_not_authorized",...}

# Listar actas recibidas
curl http://localhost:3001/api/sms/actas
```

### 7.2 Verificar el Flujo A desde la app

1. Abre la app → toca **"Enviar foto al sistema"**
2. Toma una foto → completa los tres campos → toca **"Siguiente"**
3. Verifica los datos → toca **"Enviar acta"**
4. Debe aparecer la pantalla de **éxito** con el ID del registro

Si no hay servidor disponible, la pantalla debe mostrar **"Sin conexión — Guardada en cola"**.

### 7.3 Verificar el Flujo B desde la app

1. Abre la app → toca **"Enviar por SMS"**
2. Toma una foto → completa los tres campos → toca **"Generar SMS →"**
3. Verifica el mensaje en la pantalla de preview
4. Toca **"Abrir app de SMS"** → la app de mensajes debe abrirse con el número `+59171440740` y el mensaje ya escrito
5. **No envíes el SMS en pruebas** a menos que el número receptor esté configurado

---

## 8. Resolución de problemas

### App móvil

| Problema | Causa probable | Solución |
|---|---|---|
| `MissingPluginException` al abrir cámara | `flutter pub get` no se ejecutó | Ejecutar `flutter pub get` y reiniciar |
| La cámara no abre en Android | Falta permiso `CAMERA` en AndroidManifest | Verificar que el permiso está en el manifest y reinstalar la app |
| `canLaunchUrl` devuelve false (SMS) | Falta `<queries>` en AndroidManifest | Ya está configurado; limpiar build: `flutter clean && flutter run` |
| Error de SSL en Flujo A | El servidor usa HTTP en producción | Configurar HTTPS o añadir `network_security_config.xml` |
| La cola offline no se vacía | El servidor no está disponible | Verificar que `baseUrl` apunta al servidor correcto |
| `local.properties` no encontrado | Archivo no creado | Copiar `local.properties.example` a `local.properties` |

### Backend SMS

| Problema | Causa probable | Solución |
|---|---|---|
| Puerto 3001 en uso | Otro proceso escucha el mismo puerto | Cambiar `PORT` en `.env` o matar el proceso |
| Todos los SMS llegan como `rejected: sender_not_authorized` | El número no está en `authorized_numbers.json` | Añadir el número en formato E.164 y reiniciar |
| Error `Cannot find module` | `npm install` no ejecutado | `cd backend && npm install` |
| El gateway no llega al webhook | Backend no es accesible públicamente | Usar ngrok en desarrollo |
| Timestamp inválido en logs | Formato de fecha distinto al esperado | Verificar que la app genera `DD/MM/AAAA HH:MM` |
| `authorized_numbers.json` falla al cargar | JSON malformado | Validar JSON en `jsonlint.com` |

### Comandos útiles de diagnóstico

```bash
# Ver logs del backend en tiempo real
npm run dev

# Listar puertos en uso (Windows)
netstat -ano | findstr :3001

# Limpiar build de Flutter
flutter clean
flutter pub get
flutter run

# Ver dispositivos Flutter conectados
flutter devices

# Instalar APK debug en dispositivo Android conectado
flutter install --debug
```
