# 05 — App Móvil: Captura de Actas Electorales

App Flutter que permite a los delegados de mesa fotografiar el acta electoral
y enviarla al backend para su integración en el PDF del sistema de cómputo.

---

## Flujo de la aplicación

```
CaptureScreen ──► ConfirmationScreen ──► ResultScreen
  (foto + form)      (revisar antes        (éxito / offline /
                      de enviar)            error + reintentos)
```

---

## Estructura completa del proyecto

```
05-app-movil-sms/
├── pubspec.yaml
├── analysis_options.yaml
├── .gitignore
│
├── lib/
│   ├── main.dart
│   ├── config/
│   │   └── app_config.dart              ← URL base y constantes
│   ├── models/
│   │   └── acta_model.dart              ← Datos del acta (sin lógica de negocio)
│   ├── services/
│   │   ├── api_service.dart             ← POST multipart/form-data al backend
│   │   └── offline_queue_service.dart   ← Cola local con SharedPreferences
│   ├── utils/
│   │   └── connectivity_helper.dart     ← Detección de red
│   └── screens/
│       ├── capture_screen.dart          ← Cámara + formulario
│       ├── confirmation_screen.dart     ← Previsualización + envío
│       └── result_screen.dart           ← Éxito / offline / error / reintentos
│
├── android/
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/main/
│   │       ├── AndroidManifest.xml      ← Permisos cámara + internet + FileProvider
│   │       ├── kotlin/.../MainActivity.kt
│   │       └── res/
│   │           ├── xml/file_paths.xml   ← Requerido por image_picker
│   │           ├── values/styles.xml
│   │           └── drawable/launch_background.xml
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties
│   ├── gradle/wrapper/gradle-wrapper.properties
│   └── local.properties.example        ← Copiar a local.properties y ajustar
│
└── ios/
    ├── Runner/
    │   ├── Info.plist                   ← Permisos cámara (NSCameraUsageDescription)
    │   └── AppDelegate.swift
    └── Podfile
```

---

## Instalación paso a paso

### 1. Requisitos previos

- [Flutter SDK](https://docs.flutter.dev/get-started/install) ≥ 3.10
- Android Studio con Android SDK ≥ 34, o Xcode ≥ 14 para iOS
- Dispositivo físico o emulador Android (API 21+) / Simulador iOS 12+

### 2. Configurar local.properties (Android)

```bash
cd android
cp local.properties.example local.properties
```

Editar `android/local.properties` con las rutas reales:

```properties
sdk.dir=C:\Users\TU_USUARIO\AppData\Local\Android\sdk
flutter.sdk=C:\src\flutter
flutter.versionName=1.0.0
flutter.versionCode=1
flutter.minSdkVersion=21
flutter.compileSdkVersion=34
flutter.targetSdkVersion=34
```

### 3. Instalar dependencias

```bash
cd 05-app-movil-sms
flutter pub get
```

### 4. Ajustar URL del backend

Editar `lib/config/app_config.dart`:

```dart
// Emulador Android (localhost de la máquina host)
static const String baseUrl = 'http://10.0.2.2:3000';

// Dispositivo físico (IP real del servidor en la red local)
// static const String baseUrl = 'http://192.168.1.X:3000';
```

### 5. Ejecutar

```bash
# Ver dispositivos disponibles
flutter devices

# Correr en dispositivo/emulador
flutter run

# Build APK de debug para instalar manualmente
flutter build apk --debug
# El APK queda en: build/app/outputs/flutter-apk/app-debug.apk
```

---

## Endpoint esperado en el backend

```
POST /api/rrv/actas
Content-Type: multipart/form-data

Campos:
  foto           → archivo JPEG (campo "foto")
  codigoMesa     → string
  numeroMesa     → string
  codigoRecinto  → string
  timestamp      → ISO-8601 (ej: "2024-10-20T14:35:00.000")

Respuesta exitosa: HTTP 200 o 201
Respuesta error:   HTTP 4xx / 5xx  (la app muestra el código al usuario)
```

---

## Comportamiento offline

| Situación | Comportamiento |
|---|---|
| Sin red al pulsar Enviar | La imagen se copia a `Documents/`, el acta se guarda en `SharedPreferences` |
| Red recuperada (automático) | Stream de `connectivity_plus` detecta reconexión y reintenta la cola |
| Botón "Reintentar ahora" | Fuerza el reintento manual desde `ResultScreen` |
| Imagen borrada del dispositivo | Se descarta de la cola sin error |

---

## Permisos configurados

### Android (`AndroidManifest.xml`)
- `INTERNET` — envío al backend
- `ACCESS_NETWORK_STATE` — detección de conectividad
- `CAMERA` — captura de foto
- `READ_MEDIA_IMAGES` — Android 13+
- `READ_EXTERNAL_STORAGE` (maxSdkVersion 32) — Android ≤ 12
- `FileProvider` — requerido internamente por `image_picker` para compartir URI

### iOS (`Info.plist`)
- `NSCameraUsageDescription`
- `NSPhotoLibraryUsageDescription`
- `NSPhotoLibraryAddUsageDescription`

---

## Decisiones de diseño

| Decisión | Razón |
|---|---|
| `image_picker` en vez de `camera` | API más simple, maneja permisos automáticamente en ambas plataformas |
| `SharedPreferences` para la cola offline | Sin dependencias extra; la cola es pequeña (< 100 actas en casos extremos) |
| Sin base de datos local | Requerimiento explícito del proyecto |
| Sin OCR ni validación antifraude | Responsabilidad exclusiva del backend |
| `setState` sin Provider/Bloc | App lineal de 3 pantallas; agregar state management sería sobreingeniería |
| Imagen copiada a `Documents/` para la cola | El directorio de caché puede limpiarse; `Documents/` persiste entre reinicios |
| HTTP en debug, HTTPS en producción | `android/app/src/debug/AndroidManifest.xml` habilita cleartext solo en debug |
