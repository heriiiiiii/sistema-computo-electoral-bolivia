# Guía Técnica de Despliegue
## Módulo 05 — App Móvil SMS + Servidor PC

**Audiencia:** Personal técnico, desarrolladores, integradores  
**Ultima actualizacion:** Mayo 2026  
**Estado actual:** Produccion (APK generado, servidor activo)

---

## Indice

1. [Vision general del sistema](#1-vision-general-del-sistema)
2. [Archivos de configuracion — donde cambiar cada parametro](#2-archivos-de-configuracion--donde-cambiar-cada-parametro)
3. [Configurar y arrancar el servidor PC](#3-configurar-y-arrancar-el-servidor-pc)
4. [Generar el APK](#4-generar-el-apk)
5. [Instalar el APK en el telefono](#5-instalar-el-apk-en-el-telefono)
6. [Errores conocidos y como resolverlos](#6-errores-conocidos-y-como-resolverlos)
7. [Verificar que todo funciona](#7-verificar-que-todo-funciona)
8. [Estructura de archivos](#8-estructura-de-archivos)

---

## 1. Vision general del sistema

El modulo 05 tiene **dos flujos independientes** que comparten el mismo servidor PC en la red WiFi local.

```
╔══════════════════════════════════════════════════════════════════╗
║  FLUJO A — FOTO al PC (requiere WiFi)                            ║
║                                                                  ║
║  Telefono           WiFi local            PC (servidor Node.js)  ║
║  ┌─────────┐   POST /upload (PDF)    ┌──────────────────────┐   ║
║  │ Toma    │ ──────────────────────► │ Guarda PDF en        │   ║
║  │ foto    │    multipart/form-data  │ ACTAS_COACH/         │   ║
║  │ ──►PDF  │                         └──────────────────────┘   ║
║  └─────────┘                                                     ║
║                                                                  ║
║  • App convierte la foto a PDF automaticamente                   ║
║  • PC y telefono deben estar en la MISMA red WiFi                ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║  FLUJO B — SMS (funciona sin internet)                           ║
║                                                                  ║
║  Telefono           Red GSM          Receptor SMS                ║
║  ┌─────────┐   SMS predefinido   ┌──────────────────────┐       ║
║  │ Llena   │ ──────────────────► │ +59171440740         │       ║
║  │ form    │   MESA:X;P1:X;...  └──────────────────────┘       ║
║  └────┬────┘                                                     ║
║       │ POST /sms/incoming (si hay WiFi)                         ║
║       ▼                                                          ║
║  ┌──────────────────────┐                                        ║
║  │ Servidor PC          │ valida numero + campos + guarda sms.json║
║  └──────────────────────┘                                        ║
║                                                                  ║
║  • El SMS se envia desde la app de mensajes del telefono         ║
║  • Simultaneamente, si hay WiFi, registra en el servidor PC      ║
╚══════════════════════════════════════════════════════════════════╝
```

**Formato exacto del SMS generado:**
```
MESA:{codigoMesa};RECINTO:{codigoRecinto};P1:{votosP1};P2:{votosP2};P3:{votosP3};P4:{votosP4};BLANCOS:{votosBlancos};NULOS:{votosNulos}
```

Ejemplo real:
```
MESA:CM-001;RECINTO:RC-005;P1:142;P2:87;P3:23;P4:11;BLANCOS:4;NULOS:2
```

---

## 2. Archivos de configuracion — donde cambiar cada parametro

Hay **tres archivos** donde se concentra toda la configuracion. No hay que tocar nada mas.

---

### 2.1 IP del servidor y numero receptor SMS

**Archivo:** `lib/config/app_config.dart`

```dart
class AppConfig {
  // ── IP de la PC en la red WiFi ─────────────────────────────────────────────
  // Cambia esta IP cada vez que cambies de red WiFi o de PC.
  // Como obtenerla: abre CMD en la PC → ejecuta: ipconfig
  // Busca "Direccion IPv4" bajo "Adaptador de red inalambrica Wi-Fi"
  // Ejemplo: 192.168.1.5
  static const String pcServerUrl = 'http://192.168.1.5:3000';  // <-- CAMBIAR

  // Carpeta de destino en la PC (solo informativo)
  static const String pcSaveDir = r'C:\Users\iNTEL\Desktop\ACTAS_COACH';

  // Tiempo maximo de espera para envios HTTP (segundos)
  static const int timeoutSeconds = 30;

  // ── Numero que RECIBE el SMS (destinatario) ────────────────────────────────
  static const String smsRecipientNumber = '+59171440740';  // <-- CAMBIAR si cambia

  // ── Numero del DELEGADO que usa esta app (remitente) ──────────────────────
  // IMPORTANTE: debe estar en authorized_numbers.json del servidor
  // Cambiar por el numero real del delegado antes de distribuir el APK.
  static const String delegateNumber = '+59171440740';  // <-- CAMBIAR por delegado real
}
```

**Cuando cambiar este archivo:**
- La red WiFi cambia (IP diferente)
- Se distribuye el APK a un delegado diferente (cambiar `delegateNumber`)
- El numero receptor SMS cambia

**Despues de cambiar:** hay que regenerar el APK (ver seccion 4).

---

### 2.2 Carpeta donde se guardan los PDFs en la PC

**Archivo:** `servidor-pc/server.js`, linea 10

```js
const SAVE_DIR = 'C:\\Users\\iNTEL\\Desktop\\ACTAS_COACH';  // <-- CAMBIAR
```

**Reglas al editar esta linea:**
- Usar doble barra invertida `\\` (NO barra simple `\`)
- La carpeta se crea automaticamente si no existe
- Correcto: `'C:\\Users\\MiUsuario\\Desktop\\ACTAS'`
- Incorrecto: `'C:\Users\MiUsuario\Desktop\ACTAS'` ← causara error de ruta

**Cuando cambiar este archivo:**
- La carpeta de destino cambia
- El usuario de Windows cambia

**Despues de cambiar:** reiniciar el servidor (ver seccion 3).

---

### 2.3 Numeros de telefono autorizados para enviar SMS

**Archivo:** `servidor-pc/authorized_numbers.json`

```json
[
  "+59171440740",
  "+59172345678",
  "+59173456789"
]
```

**Reglas:**
- Formato E.164 obligatorio: `+591` seguido de 8 digitos
- Un numero por linea, separados por coma
- El servidor tambien acepta formatos sin `+` o sin `591` — los normaliza internamente

**Cuando cambiar este archivo:**
- Se agrega un delegado nuevo
- Se revoca el acceso de un numero

**Despues de cambiar:** reiniciar el servidor (ver seccion 3).

---

## 3. Configurar y arrancar el servidor PC

El servidor es un proceso Node.js que corre en la PC y recibe tanto los PDFs (Flujo A) como los datos SMS (Flujo B).

### 3.1 Requisitos

```
Node.js >= 18   →  descargar en nodejs.org
```

Verificar: abrir CMD y ejecutar `node --version`. Debe mostrar `v18.x.x` o superior.

### 3.2 Instalar dependencias (solo la primera vez)

```cmd
cd 05-app-movil-sms\servidor-pc
npm install
```

### 3.3 Arrancar el servidor

```cmd
cd 05-app-movil-sms\servidor-pc
node server.js
```

Salida esperada al arrancar correctamente:

```
Numeros autorizados cargados: 3

=========================================
  Servidor ACTAS_COACH iniciado
=========================================
  Puerto   : 3000
  PDFs     : C:\Users\iNTEL\Desktop\ACTAS_COACH
  SMS JSON : ...\servidor-pc\sms.json
  Nums auth: 3
=========================================
  POST /upload        <- PDFs
  POST /sms/incoming  <- datos SMS
  GET  /sms/data      <- ver registros
=========================================
```

### 3.4 Ver los registros SMS guardados

Abrir en el navegador de la PC:
```
http://localhost:3000/sms/data
```

O desde cualquier dispositivo en la misma red:
```
http://192.168.1.5:3000/sms/data
```

### 3.5 Detener el servidor

En la ventana CMD donde corre, presionar `Ctrl + C`.

---

## 4. Generar el APK

### 4.1 Requisitos previos

| Herramienta | Version usada | Ruta en este equipo |
|---|---|---|
| Flutter SDK | 3.41.9 | `D:\flutter` |
| Android SDK | API 34 | `D:\Android\sdk` |
| JDK | 17 (Temurin) | `D:\jdk17\jdk-17.0.11+9` |

### 4.2 Comando de build

Abrir PowerShell y ejecutar:

```powershell
$env:ANDROID_HOME = "D:\Android\sdk"
$env:ANDROID_SDK_ROOT = "D:\Android\sdk"
$env:JAVA_HOME = "D:\jdk17\jdk-17.0.11+9"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Set-Location "d:\sd\sistema-computo-electoral-bolivia\05-app-movil-sms"
& "D:\flutter\bin\flutter.bat" build apk --release
```

El build tarda aproximadamente **60-90 segundos**.

### 4.3 Ubicacion del APK generado

```
05-app-movil-sms\build\app\outputs\flutter-apk\app-release.apk
```

Copiar a la carpeta de distribucion:
```powershell
Copy-Item "build\app\outputs\flutter-apk\app-release.apk" "apks\actas-sms-v2.apk"
```

### 4.4 Configuracion especial de Gradle en este equipo

El proyecto esta en `D:\` pero Kotlin intenta usar cache en `C:\`. Eso causa fallos en la compilacion incremental. Ya esta resuelto con esta linea en `android/gradle.properties`:

```properties
kotlin.incremental=false
```

**No eliminar esta linea** o el build fallara con errores de ruta cruzada.

---

## 5. Instalar el APK en el telefono

### Opcion A — Cable USB

1. Conectar el telefono a la PC con cable USB
2. En el telefono: activar **Opciones de desarrollador** → **Depuracion USB**
3. Abrir CMD y ejecutar:
   ```cmd
   D:\Android\sdk\platform-tools\adb.exe install apks\actas-sms-v2.apk
   ```

### Opcion B — Transferir por WiFi o cable y abrir directamente

1. Copiar el archivo `actas-sms-v2.apk` al telefono (por USB, WhatsApp, carpeta compartida, etc.)
2. En el telefono: abrir el administrador de archivos
3. Tocar el archivo `.apk`
4. Permitir la instalacion desde fuentes desconocidas si lo solicita
5. Instalar

### Si ya habia una version anterior instalada

Desinstalar primero la version anterior desde **Configuracion → Aplicaciones** o instalar encima (el sistema lo pregunta).

---

## 6. Errores conocidos y como resolverlos

### Error: la app muestra "Error al enviar" o timeout

**Causa mas comun:** el Firewall de Windows bloquea el puerto 3000.

**Sintoma:** el servidor esta corriendo, el telefono esta en la misma WiFi, pero la app no puede conectarse.

**Solucion — opcion 1 (CMD como administrador):**
```cmd
netsh advfirewall firewall add rule name="Servidor ACTAS 3000" dir=in action=allow protocol=TCP localport=3000
```

**Solucion — opcion 2 (interfaz grafica):**
1. Abrir **Panel de control → Sistema y seguridad → Firewall de Windows Defender**
2. Click en **Configuracion avanzada** (lado izquierdo)
3. Click en **Reglas de entrada** → **Nueva regla...**
4. Seleccionar **Puerto** → Siguiente
5. **TCP**, puerto especifico: `3000` → Siguiente
6. **Permitir la conexion** → Siguiente → Siguiente
7. Nombre: `Servidor ACTAS 3000` → Finalizar

**Verificacion:** desde el telefono (en la misma WiFi), abrir el navegador y entrar a:
```
http://192.168.1.5:3000/health
```
Debe mostrar `{"ok":true,...}`.

---

### Error: "EADDRINUSE: address already in use :::3000"

**Causa:** ya habia un proceso node corriendo en ese puerto (de una sesion anterior).

**Solucion:**
```powershell
Stop-Process -Name "node" -Force
```
Luego arrancar el servidor de nuevo.

---

### Error: los PDFs se guardan en la carpeta equivocada

**Causa:** la ruta en `server.js` tiene barras simples `\` en vez de dobles `\\`.

**Solucion:** abrir `servidor-pc/server.js` linea 10 y corregir:
```js
// INCORRECTO — barra simple:
const SAVE_DIR = 'C:\Users\iNTEL\Desktop\ACTAS_COACH';

// CORRECTO — doble barra:
const SAVE_DIR = 'C:\\Users\\iNTEL\\Desktop\\ACTAS_COACH';
```
Reiniciar el servidor despues de corregir.

---

### Error: "Numero no autorizado" en el badge de la app

**Causa:** el numero del delegado (`delegateNumber` en `app_config.dart`) no esta en `authorized_numbers.json`.

**Solucion:**
1. Abrir `servidor-pc/authorized_numbers.json`
2. Agregar el numero en formato `+591XXXXXXXX`
3. Reiniciar el servidor
4. No es necesario regenerar el APK

---

### Error al build: "No Android SDK found"

**Causa:** la variable de entorno `ANDROID_HOME` no esta configurada.

**Solucion:** usar el comando completo de la seccion 4.2 que incluye las tres variables de entorno (`ANDROID_HOME`, `ANDROID_SDK_ROOT`, `JAVA_HOME`).

---

### Error al build: "JAVA_HOME is not set"

**Causa:** JDK no encontrado.

**Solucion:** verificar que existe `D:\jdk17\jdk-17.0.11+9\bin\javac.exe`. Si la ruta es diferente, actualizar `$env:JAVA_HOME` en el comando de build.

---

### Error al build: errores de Kotlin compilacion incremental

**Causa:** el proyecto esta en `D:\` y Kotlin intenta escribir cache en `C:\Users\...\.kotlin`.

**Solucion ya aplicada:** `android/gradle.properties` contiene `kotlin.incremental=false`. Si ese archivo se elimina o se resetea, volver a agregar esa linea.

---

### La IP cambio (nueva red WiFi o DHCP reasigno)

**Causa:** el router asigno una IP diferente a la PC.

**Solucion:**
1. En la PC: abrir CMD → `ipconfig` → buscar "Direccion IPv4" del adaptador WiFi
2. Actualizar la IP en `lib/config/app_config.dart` → `pcServerUrl`
3. Regenerar el APK (seccion 4) y reinstalar

Para evitar este problema, configurar IP fija en el router para la MAC address de la PC.

---

## 7. Verificar que todo funciona

### 7.1 Verificar el servidor

Desde la PC, abrir en el navegador:
```
http://localhost:3000/health
```
Respuesta esperada:
```json
{"ok":true,"directorio":"C:\\Users\\iNTEL\\Desktop\\ACTAS_COACH","timestamp":"..."}
```

### 7.2 Verificar Flujo A (PDF)

1. Abrir la app → **Flujo A**
2. Tomar foto → tocar **Abrir app de SMS... (error)**. Espera, eso es Flujo B.

Para Flujo A:
1. Abrir la app → primera opcion (camara/foto)
2. Tomar foto → tocar enviar
3. Debe aparecer **"Acta enviada correctamente"**
4. En la PC, verificar que aparecio un archivo `.pdf` en `C:\Users\iNTEL\Desktop\ACTAS_COACH`

### 7.3 Verificar Flujo B (SMS)

1. Abrir la app → **Registro por SMS**
2. Llenar los 8 campos (MESA, RECINTO, P1, P2, P3, P4, BLANCOS, NULOS)
3. Tocar **Generar SMS**
4. Verificar el mensaje en la pantalla de previsualización
5. Tocar **Abrir app de SMS**
   - La app de mensajes debe abrirse con el texto ya escrito
   - En la app electoral debe aparecer badge verde **"Registrado en el servidor"**
6. En el servidor, verificar `servidor-pc/sms.json` — debe aparecer el registro

### 7.4 Ver todos los registros SMS

```
http://localhost:3000/sms/data
```

---

## 8. Estructura de archivos

```
05-app-movil-sms/
│
├── apks/
│   └── actas-sms-v2.apk          ← APK listo para instalar
│
├── servidor-pc/                   ← Servidor Node.js (corre en la PC)
│   ├── server.js                  ← Servidor principal (aqui esta SAVE_DIR)
│   ├── authorized_numbers.json    ← Numeros autorizados para SMS
│   ├── sms.json                   ← Base de datos de registros SMS (se crea automaticamente)
│   ├── package.json
│   └── node_modules/
│
├── lib/
│   ├── config/
│   │   └── app_config.dart        ← IP servidor, numero SMS, numero delegado
│   ├── models/
│   │   └── sms_acta_model.dart    ← Modelo datos SMS
│   ├── services/
│   │   ├── sms_service.dart       ← Genera mensaje y abre app SMS
│   │   ├── sms_backend_service.dart ← POST al servidor (paralelo al SMS)
│   │   ├── pdf_service.dart       ← Convierte foto a PDF
│   │   └── upload_service.dart    ← Sube PDF al servidor
│   ├── validators/
│   │   └── sms_validator.dart     ← Valida campos del formulario
│   └── screens/
│       ├── home_screen.dart
│       ├── capture_screen.dart    ← Flujo A: foto → PDF → PC
│       └── sms/
│           ├── sms_data_screen.dart    ← Flujo B: formulario
│           └── sms_preview_screen.dart ← Flujo B: preview + envio
│
└── android/
    ├── local.properties           ← Rutas SDK/JDK (NO subir a git)
    └── gradle.properties          ← kotlin.incremental=false (importante)
```

---

## Resumen de configuracion rapida para nuevo entorno

| Que hacer | Donde | Cuando |
|---|---|---|
| Cambiar IP del servidor | `lib/config/app_config.dart` → `pcServerUrl` | Al cambiar de red WiFi |
| Cambiar carpeta PDFs | `servidor-pc/server.js` → linea `SAVE_DIR` | Al cambiar carpeta destino |
| Agregar numero delegado | `servidor-pc/authorized_numbers.json` | Al agregar delegado nuevo |
| Cambiar numero delegado en app | `lib/config/app_config.dart` → `delegateNumber` | Al distribuir APK a otro delegado |
| Abrir firewall puerto 3000 | CMD admin → `netsh advfirewall firewall add...` | En cada PC nueva |
| Arrancar servidor | CMD → `cd servidor-pc && node server.js` | Cada vez que se necesite recibir datos |
