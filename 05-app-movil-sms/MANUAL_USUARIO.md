# Manual de Usuario
## Sistema de Registro de Actas Electorales — App Movil

**Version:** 2.0  
**Audiencia:** Delegados de mesa, personal de computo electoral  
**Plataforma:** Android

---

## Indice

1. [Que hace esta app](#1-que-hace-esta-app)
2. [Pantalla de inicio — elegir modo](#2-pantalla-de-inicio--elegir-modo)
3. [Flujo A — Enviar foto del acta al sistema](#3-flujo-a--enviar-foto-del-acta-al-sistema)
4. [Flujo B — Registrar votos por SMS](#4-flujo-b--registrar-votos-por-sms)
5. [Preguntas frecuentes](#5-preguntas-frecuentes)

---

## 1. Que hace esta app

La app tiene **dos modos de envio** independientes. Puedes usar cualquiera de los dos, o ambos.

| | Flujo A — Foto | Flujo B — SMS |
|---|---|---|
| Que envia | Foto del acta convertida a PDF | Votos en mensaje de texto |
| Requiere | WiFi (misma red que la PC) | Solo señal de voz/SMS |
| Destino | PC del centro de computo | Numero +59171440740 y servidor |
| La foto sale del telefono | Si, va al servidor como PDF | No |

---

## 2. Pantalla de inicio — elegir modo

Al abrir la app aparecen dos opciones. Toca la que necesitas.

```
┌─────────────────────────────────┐
│   Registro de Actas Electorales │
│                                 │
│  ┌───────────────────────────┐  │
│  │  📷  Enviar foto al       │  │  ← Flujo A
│  │      sistema              │  │
│  │  Requiere WiFi            │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │  💬  Registro por SMS     │  │  ← Flujo B
│  │                           │  │
│  │  Modo sin conexion        │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

---

## 3. Flujo A — Enviar foto del acta al sistema

### Para que sirve

Fotografias el acta y la app la convierte automaticamente a PDF y la envia a la PC del centro de computo por WiFi. El personal del centro recibe el archivo en su computadora.

### Requisitos

- El telefono y la PC deben estar conectados a la **misma red WiFi**
- El servidor en la PC debe estar corriendo

### Pasos

**Paso 1 — Tomar la foto**

Al entrar al Flujo A verás la pantalla de captura. Toca el area de camara.

```
┌──────────────────────────────┐
│ ← Captura de Acta            │
├──────────────────────────────┤
│                              │
│  ┌────────────────────────┐  │
│  │                        │  │
│  │   Toca para tomar      │  │
│  │   la foto del acta     │  │
│  │         📷             │  │
│  └────────────────────────┘  │
│                              │
│  Servidor: 192.168.1.5:3000  │
│                              │
│  [  Abrir camara  ]          │
└──────────────────────────────┘
```

- Apunta la camara al acta, enfoca bien y toma la foto.
- Si la foto no quedo nitida, puedes **repetir** antes de enviar.

**Paso 2 — Enviar**

Una vez tomada la foto, toca **Enviar acta**.

- Aparecera una barra de progreso mientras se sube el archivo.
- El archivo se convierte a PDF automaticamente (no tienes que hacer nada).

**Paso 3 — Resultado**

Si todo salio bien:
```
┌──────────────────────────────┐
│  ✅ Acta enviada             │
│     correctamente            │
│                              │
│  Archivo guardado en la PC   │
│  Carpeta: ACTAS_COACH        │
│                              │
│  [  Tomar otro acta  ]       │
└──────────────────────────────┘
```

Si hay error de conexion: verificar que el telefono esta en la misma WiFi que la PC y que el servidor esta corriendo. Ver seccion de problemas en GUIA_INICIO.md.

---

## 4. Flujo B — Registrar votos por SMS

### Para que sirve

Ingresas los votos de cada partido manualmente y la app genera un mensaje de texto con formato oficial. Luego abre tu app de SMS con el mensaje listo para enviar con un toque. No necesitas internet.

### Que NO hace este flujo

- **No toma foto** — el Flujo B solo maneja datos numericos
- **No envia el SMS automaticamente** — lo envia el delegado desde su app de mensajes
- **No permite editar el mensaje** — el formato es oficial y fijo

### Pasos

**Paso 1 — Llenar el formulario**

```
┌──────────────────────────────┐
│ ← Registro por SMS           │
├──────────────────────────────┤
│ 📵 Modo sin conexion —       │
│    El mensaje se enviara     │
│    desde tu app de SMS.      │
├──────────────────────────────┤
│  Identificacion de la mesa   │
│  ┌─────────┐  ┌───────────┐  │
│  │  MESA   │  │  RECINTO  │  │
│  │ CM-001  │  │  RC-005   │  │
│  └─────────┘  └───────────┘  │
│                              │
│  Votos por partido           │
│  ┌───────┐  ┌───────┐        │
│  │  P1   │  │  P2   │        │
│  │  142  │  │   87  │        │
│  └───────┘  └───────┘        │
│  ┌───────┐  ┌───────┐        │
│  │  P3   │  │  P4   │        │
│  │   23  │  │   11  │        │
│  └───────┘  └───────┘        │
│                              │
│  Votos especiales            │
│  ┌─────────┐  ┌──────┐       │
│  │ BLANCOS │  │ NULOS│       │
│  │    4    │  │   2  │       │
│  └─────────┘  └──────┘       │
│                              │
│  [    Generar SMS    ]       │
└──────────────────────────────┘
```

Campos a completar:

| Campo | Descripcion | Ejemplo |
|---|---|---|
| MESA | Codigo de la mesa electoral | CM-001 |
| RECINTO | Codigo del recinto | RC-005 |
| P1 | Votos partido 1 | 142 |
| P2 | Votos partido 2 | 87 |
| P3 | Votos partido 3 | 23 |
| P4 | Votos partido 4 | 11 |
| BLANCOS | Votos en blanco | 4 |
| NULOS | Votos nulos | 2 |

Todos los campos son obligatorios. Los votos deben ser numeros enteros mayores o iguales a 0.

**Paso 2 — Revisar el mensaje generado**

Despues de tocar **Generar SMS** aparece la pantalla de previsualización:

```
┌──────────────────────────────┐
│ ← Mensaje listo para enviar  │
├──────────────────────────────┤
│  Destinatario:               │
│  +59171440740           🔒   │
├──────────────────────────────┤
│  Mensaje que se enviara  🔒  │
│  ┌────────────────────────┐  │
│  │MESA:CM-001;RECINTO:    │  │
│  │RC-005;P1:142;P2:87;    │  │
│  │P3:23;P4:11;BLANCOS:4;  │  │
│  │NULOS:2                 │  │
│  └────────────────────────┘  │
│                              │
│  ⚠ Formato oficial fijo.    │
│    Al pulsar el boton, tu   │
│    app de SMS se abrira con │
│    el texto listo.          │
│                              │
│  [  ↗ Abrir app de SMS  ]   │
│  [    Corregir datos    ]   │
└──────────────────────────────┘
```

- El mensaje y el destinatario tienen candado — no se pueden editar desde aqui.
- Si los datos son incorrectos, toca **Corregir datos** para volver al formulario.

**Paso 3 — Enviar el SMS**

Toca **Abrir app de SMS**. Tu app de mensajes se abre con todo listo:

```
┌──────────────────────────────┐
│  App de Mensajes             │
│                              │
│  Para: +59171440740     ✓    │
│  ┌────────────────────────┐  │
│  │MESA:CM-001;RECINTO:    │  │
│  │RC-005;P1:142;P2:87;    │  │
│  │P3:23;P4:11;BLANCOS:4;  │  │
│  │NULOS:2                 │  │
│  └────────────────────────┘  │
│                          [►] │  ← Toca aqui para enviar
└──────────────────────────────┘
```

Solo toca el boton de **Enviar** en tu app de mensajes.

**Paso 4 — Estado del registro en el servidor**

Mientras se abre la app de SMS, la app tambien intenta registrar los datos en el servidor PC (si hay WiFi). Volviendo a la app electoral veras un badge:

| Badge | Significado |
|---|---|
| Verde: "Registrado en el servidor" | Los datos llegaron al servidor correctamente |
| Rojo: "Numero no autorizado" | Tu numero no esta en la lista de autorizados — avisale al tecnico |
| Rojo: "Sin conexion al servidor" | No hay WiFi o el servidor no esta corriendo — normal si no hay WiFi |
| Azul: "Registrando en servidor..." | Procesando, espera un momento |

> El badge rojo de "Sin conexion" NO significa que el SMS fallo. El SMS se envia por la red celular independientemente. El badge solo indica si el registro WiFi al servidor tambien funciono.

---

## 5. Preguntas frecuentes

**¿Tengo que tomar foto en el Flujo B?**  
No. El Flujo B solo necesita los datos de votos en el formulario. No hay camara en este flujo.

**¿Puedo usar los dos flujos para la misma acta?**  
Si. Son independientes. Puedes enviar la foto por el Flujo A y tambien registrar los votos por el Flujo B para tener doble respaldo.

**¿Puedo editar el mensaje SMS antes de enviarlo?**  
No debes hacerlo. Si editas el texto en tu app de mensajes, el servidor no podra interpretarlo y el registro fallara. Si los datos son incorrectos, cierra la app de SMS y usa **Corregir datos** en la app electoral.

**El badge dice "Numero no autorizado" — que hago?**  
Avisa al responsable tecnico del sistema para que agregue tu numero a la lista de autorizados. El SMS por la red celular igual se envio — el badge solo indica el registro WiFi al servidor.

**La app de SMS no se abre — que hago?**  
Verifica que tienes una app de mensajes instalada (ej: Mensajes de Google). Si ya tienes una, verifica que tenga permisos en Configuracion → Aplicaciones → Mensajes → Permisos.

**¿Que pasa si no tengo WiFi al usar el Flujo B?**  
El SMS se envia igual por la red celular. El badge en la app mostrara "Sin conexion al servidor" (rojo), lo cual es normal sin WiFi. El registro en el servidor no se realiza, pero el SMS llego al destinatario.

**¿Como se que el SMS llego?**  
En tu app de mensajes aparecera el mensaje enviado con la marca de confirmacion de tu operadora celular (igual que cualquier SMS normal).
