# Manual de Usuario
## Sistema de Registro de Actas Electorales — Módulo 05

**Versión:** 1.0  
**Audiencia:** Delegados de mesa, personal de cómputo electoral  
**Plataforma:** Android / iOS

---

## Índice

1. [Descripción general del sistema](#1-descripción-general-del-sistema)
2. [Pantalla de inicio — Selección de flujo](#2-pantalla-de-inicio--selección-de-flujo)
3. [Flujo A — Envío de foto al sistema](#3-flujo-a--envío-de-foto-al-sistema)
4. [Flujo B — Envío de datos por SMS](#4-flujo-b--envío-de-datos-por-sms)
5. [Comparación entre flujos](#5-comparación-entre-flujos)
6. [Preguntas frecuentes](#6-preguntas-frecuentes)

---

## 1. Descripción general del sistema

El módulo 05 contiene **dos aplicaciones independientes** dentro de una misma app móvil. Cada una tiene un propósito distinto, una tecnología diferente y opera sin interferir con la otra.

```
┌─────────────────────────────────────────────────────────────────┐
│                    APP MÓVIL — MÓDULO 05                        │
│                                                                 │
│   ┌──────────────────────────┐  ┌──────────────────────────┐   │
│   │      FLUJO A             │  │      FLUJO B             │   │
│   │  Foto + Datos → Backend  │  │  Datos → SMS → Receptor  │   │
│   │  (requiere internet)     │  │  (funciona sin internet)  │   │
│   └──────────────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### ¿Cuál usar?

| Situación | Usar |
|---|---|
| Tienes conexión a internet (WiFi o datos móviles) | **Flujo A** |
| No tienes internet pero tienes señal de voz/SMS | **Flujo B** |
| Quieres registrar con la mayor cantidad de datos | **Flujo A** |
| Quieres un respaldo rápido en emergencia | **Flujo B** |

> **Importante:** Los dos flujos son **completamente independientes**.  
> Puedes usar uno, el otro, o ambos, sin que interfieran entre sí.

---

## 2. Pantalla de inicio — Selección de flujo

Al abrir la app, aparece la **pantalla de inicio**. Desde aquí se elige el modo de operación.

```
┌─────────────────────────────────┐
│   Registro de Actas RRV         │
│   Selecciona el modo de envío   │
│                                 │
│  ╔═════════════════════════╗    │
│  ║  ☁  Enviar foto         ║    │
│  ║     al sistema          ║    │
│  ║  Requiere internet  WiFi ║   │
│  ╚═════════════════════════╝    │
│                                 │
│  ╔═════════════════════════╗    │
│  ║  💬 Enviar por SMS       ║   │
│  ║                          ║   │
│  ║  Sin internet    📵      ║    │
│  ╚═════════════════════════╝    │
└─────────────────────────────────┘
```

**Acción:** Toca la tarjeta del flujo que necesitas. La app navega directamente a ese módulo.

---

## 3. Flujo A — Envío de foto al sistema

### Qué hace este flujo

Permite fotografiar el acta electoral y enviar la imagen junto con los datos de la mesa directamente al servidor de cómputo. El servidor integra la foto en el PDF oficial del sistema RRV.

### Qué se envía

- ✅ Foto del acta (archivo de imagen JPEG)
- ✅ Código de mesa
- ✅ Número de mesa
- ✅ Código de recinto
- ✅ Fecha y hora del registro

### Qué NO se envía

- ❌ La foto NO va por SMS
- ❌ No se guardan los datos en el dispositivo de forma permanente

### Pantallas del Flujo A

---

#### Pantalla A-1: Captura de foto y formulario

**Propósito:** Tomar la foto del acta y completar los datos mínimos.

```
┌──────────────────────────────┐
│ ← Captura de Acta Electoral  │
├──────────────────────────────┤
│                              │
│  ┌──────────────────────┐    │
│  │                      │    │
│  │   [Toca para tomar   │    │  ← Área de foto
│  │    la foto]          │    │
│  │        📷            │    │
│  └──────────────────────┘    │
│                              │
│  Datos de la mesa            │
│  ┌──────────────────────┐    │
│  │ Código de mesa       │    │  ← Campo 1
│  │ Ej: CM-001           │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │ Número de mesa       │    │  ← Campo 2
│  │ Ej: 42               │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │ Código de recinto    │    │  ← Campo 3
│  │ Ej: RC-005           │    │
│  └──────────────────────┘    │
│                              │
│  [  Siguiente → Revisar  ]   │  ← Botón principal
└──────────────────────────────┘
```

**Pasos:**

1. Toca el área oscura con el ícono de cámara para abrir la cámara.
2. Apunta al acta electoral y toma la foto.
3. Revisa la previsualización. Si la foto no es nítida, toca **"Repetir foto"**.
4. Completa los tres campos de texto.
5. Toca **"Siguiente → Revisar"**.

**Validaciones que hace la app:**
- La foto es obligatoria antes de continuar.
- Los tres campos de texto son obligatorios.
- El número de mesa debe ser un número entero positivo.

---

#### Pantalla A-2: Confirmación antes del envío

**Propósito:** Revisar la foto y los datos antes de enviar definitivamente. Es el último momento para corregir.

```
┌──────────────────────────────┐
│ ← Confirmar envío            │
├──────────────────────────────┤
│  Foto del acta               │
│  ┌──────────────────────┐    │
│  │   [Foto tomada]      │    │  ← Previsualización
│  └──────────────────────┘    │
│                              │
│  Datos registrados           │
│  Código de mesa  CM-001      │
│  Número de mesa  42          │
│  Código de recinto  RC-005   │
│  Fecha y hora  20/10/24 ...  │
│                              │
│  ℹ La validación final       │
│    la realiza el servidor.   │
│                              │
│  [      Enviar acta      ]   │  ← Botón de envío
└──────────────────────────────┘
```

**Pasos:**

1. Verifica que la foto es nítida y muestra el acta correcta.
2. Verifica que los tres campos tienen los valores correctos.
3. Si necesitas corregir algo, toca la flecha ← para volver.
4. Si todo está bien, toca **"Enviar acta"**.

> Durante el envío aparece una pantalla de carga. No cierres la app.

---

#### Pantalla A-3: Resultado del envío

Aparece automáticamente después del envío. Tiene cuatro estados posibles:

**Estado 1 — Éxito ✅**
```
┌──────────────────────────────┐
│  ✅ Acta enviada              │
│     correctamente            │
│                              │
│  El acta fue recibida por    │
│  el servidor y será          │
│  procesada.                  │
│                              │
│  Mesa: CM-001  Num: 42       │
│  Recinto: RC-005             │
│                              │
│  [  Capturar otro acta  ]    │
└──────────────────────────────┘
```

**Estado 2 — Sin conexión 📵**
```
┌──────────────────────────────┐
│  📵 Sin conexión             │
│     Guardada en cola         │
│                              │
│  El acta está guardada en    │
│  tu dispositivo. Se enviará  │
│  automáticamente cuando      │
│  vuelva la conexión.         │
│                              │
│  [  Reintentar ahora  ]      │
│  [  Capturar otro acta ]     │
└──────────────────────────────┘
```

**Estado 3 — Error de red 📶**

La app guarda el acta y la reintenta automáticamente al recuperar señal. También puedes tocar **"Reintentar ahora"** manualmente.

**Estado 4 — Error del servidor ⚠️**

El servidor rechazó el envío. Toca **"Guardar en cola y reintentar"** para intentarlo más tarde.

---

### Cola offline del Flujo A

Si el envío falla por falta de conexión:

1. La imagen se copia a una carpeta segura del dispositivo.
2. Los datos se guardan en la memoria local de la app.
3. Cuando la conexión vuelve, la app detecta la reconexión automáticamente.
4. Los actas pendientes se envían sin que tengas que hacer nada.

El contador de actas pendientes aparece en la esquina superior derecha de la pantalla de captura.

---

## 4. Flujo B — Envío de datos por SMS

### Qué hace este flujo

Permite enviar un mensaje de texto con los datos del acta al número receptor predefinido **71440740** (Bolivia), usando la app de mensajes que ya tienes instalada en tu teléfono. La app genera el texto automáticamente con un formato oficial y lo deja listo para que solo tengas que pulsar "Enviar" en tu app de SMS.

### Qué se envía

- ✅ Código de mesa (texto)
- ✅ Número de mesa (número)
- ✅ Código de recinto (texto)
- ✅ Fecha y hora del registro (texto)

### Qué NO se envía

- ❌ La foto **NO** se envía por SMS (el protocolo SMS no soporta imágenes en este contexto)
- ❌ La app **NO** envía el SMS automáticamente
- ❌ La app **NO** modifica el mensaje una vez generado
- ❌ La app **NO** copia el mensaje al portapapeles

> La foto que se toma en este flujo queda guardada **solo en tu dispositivo**  
> como evidencia local de que fotografiaste el acta. No sale de tu teléfono.

### Formato del mensaje generado

El texto que se enviará al número receptor tiene siempre este formato exacto:

```
[ACTA-RRV]
Mesa: CM-001
Num: 42
Recinto: RC-005
20/10/2024 14:35
```

Este formato es oficial y fijo. No puede modificarse desde la app.

### Número receptor

El SMS se dirige siempre al número predefinido:

```
71440740  (Bolivia — cómputo electoral)
```

No es posible cambiar el destinatario desde la app.

---

### Pantallas del Flujo B

#### Pantalla B-1: Registro de datos y foto

**Propósito:** Fotografiar el acta (como evidencia local) y completar los datos que irán en el SMS.

```
┌──────────────────────────────┐
│ ← Registro por SMS           │
├──────────────────────────────┤
│ 📵 Modo sin conexión —       │
│    El mensaje se enviará     │
│    desde tu app de SMS.      │
├──────────────────────────────┤
│  Foto del acta (obligatoria) │
│  ┌──────────────────────┐    │
│  │                      │    │
│  │  Toca para fotografiar│   │  ← Área de foto
│  │  el acta        📷   │    │
│  └──────────────────────┘    │
│                              │
│  Datos de la mesa            │
│  ┌──────────────────────┐    │
│  │ Código de mesa       │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │ Número de mesa       │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │ Código de recinto    │    │
│  └──────────────────────┘    │
│                              │
│  [    Generar SMS →     ]    │  ← Botón principal
└──────────────────────────────┘
```

**Pasos:**

1. Toca el área de foto y fotografía el acta (queda como evidencia en tu teléfono).
2. Si la foto no sirve, toca **"Repetir foto"**.
3. Completa los tres campos.
4. Toca **"Generar SMS →"**.

**Validaciones:**
- La foto es obligatoria.
- Los tres campos son obligatorios.
- El número de mesa debe ser un entero positivo.
- Si falta algo, la app muestra todos los errores al mismo tiempo en los campos correspondientes.

---

#### Pantalla B-2: Vista previa del mensaje (solo lectura)

**Propósito:** Mostrar el mensaje generado antes de abrir la app de SMS. Esta pantalla es de **solo lectura**. No se puede modificar ningún dato.

```
┌──────────────────────────────┐
│ ← Mensaje listo para enviar  │
├──────────────────────────────┤
│  Evidencia local (foto)      │
│  ┌──────┐                    │
│  │ 📷  │ La foto quedará     │  ← Miniatura local
│  │      │ en tu dispositivo. │
│  └──────┘ No se envía por SMS│
│                              │
│  Destinatario:  +59171440740 │🔒│  ← No editable
│                              │
│  Mensaje que se enviará  🔒  │
│  ┌──────────────────────┐    │
│  │ [ACTA-RRV]           │    │
│  │ Mesa: CM-001         │    │  ← Solo lectura
│  │ Num: 42              │    │
│  │ Recinto: RC-005      │    │
│  │ 20/10/2024 14:35     │    │
│  └──────────────────────┘    │
│                              │
│ ⚠ El mensaje tiene formato   │
│   oficial y no puede         │
│   modificarse.               │
│                              │
│  [ ↗  Abrir app de SMS  ]   │  ← Botón principal
│  [    Corregir datos    ]    │
└──────────────────────────────┘
```

**Pasos:**

1. Revisa que el destinatario y el mensaje son correctos.
2. Si necesitas corregir los datos, toca **"Corregir datos"** para volver.
3. Cuando todo esté correcto, toca **"Abrir app de SMS"**.

---

#### Lo que pasa al tocar "Abrir app de SMS"

La app de mensajes de tu teléfono se abre automáticamente con:
- El número **71440740** ya escrito en el campo de destinatario.
- El mensaje con el formato oficial ya escrito en el campo de texto.

Solo tienes que tocar el botón de **Enviar** en tu app de SMS.

```
┌──────────────────────────────┐
│  App de SMS de tu teléfono   │
│                              │
│  Para: 71440740         ✓    │
│  ┌──────────────────────┐    │
│  │ [ACTA-RRV]           │    │
│  │ Mesa: CM-001         │    │
│  │ Num: 42              │    │
│  │ Recinto: RC-005      │    │
│  │ 20/10/2024 14:35     │    │
│  └──────────────────────┘    │
│                   [ Enviar ] │  ← Toca aquí para enviar
└──────────────────────────────┘
```

> **La app electoral no envía el SMS por ti.** Solo lo prepara.  
> Tú decides cuándo pulsar Enviar en tu app de mensajes.

---

#### Errores posibles en Flujo B

**No se encontró app de SMS:**
Tu teléfono no tiene una app de mensajes de texto instalada o configurada.
Solución: instala una app de SMS (ej: Mensajes de Google) y vuelve a intentar.

**Error inesperado al abrir SMS:**
Reinicia la app y vuelve a intentar. Si persiste, verifica que la app de SMS tiene permisos activados en la configuración del teléfono.

---

## 5. Comparación entre flujos

| | Flujo A — Foto al sistema | Flujo B — SMS |
|---|---|---|
| **¿Qué envía?** | Foto JPEG + datos | Solo texto |
| **¿Cómo envía?** | HTTP al servidor (backend) | App de SMS del teléfono |
| **¿Necesita internet?** | Sí | No (solo señal SMS) |
| **¿La foto sale del teléfono?** | Sí, va al servidor | No, queda en el dispositivo |
| **¿El mensaje es editable?** | Los datos sí, antes de confirmar | No, nunca |
| **¿Quién envía?** | La app envía automáticamente | Tú envías desde tu app de SMS |
| **¿Tiene cola offline?** | Sí, reintenta automáticamente | No aplica |
| **¿Qué hace el servidor?** | Integra la foto en el PDF oficial | Parsea el SMS y registra los datos |
| **Número destino** | URL del servidor | 71440740 |

---

## 6. Preguntas frecuentes

**¿Puedo usar los dos flujos para la misma acta?**  
Sí. Son independientes y el servidor puede recibir ambos. Es recomendable si quieres máxima cobertura de registro.

**¿La foto que tomo en el Flujo B se envía por SMS?**  
No. El protocolo SMS solo transporta texto. La foto queda guardada en tu teléfono como evidencia local.

**¿Puedo editar el mensaje SMS antes de enviarlo?**  
No. El texto está bloqueado con un formato oficial para garantizar que el sistema receptor pueda procesarlo automáticamente. Si editas el mensaje manualmente en tu app de SMS, el backend no podrá interpretarlo.

**¿Qué pasa si cierro la app antes de que termine el envío del Flujo A?**  
El acta queda en la cola pendiente. La próxima vez que abras la app y tengas conexión, se reintentará automáticamente.

**¿Qué pasa si el SMS del Flujo B se envía desde un número no autorizado?**  
El backend lo recibe pero lo descarta silenciosamente. Comunícate con el responsable del sistema para agregar tu número a la lista de autorizados.

**¿La app guarda mis datos entre sesiones?**  
La cola offline del Flujo A sí persiste entre sesiones. Los formularios se limpian al cerrar la app.
