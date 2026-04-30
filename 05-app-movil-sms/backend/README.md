# Backend SMS — Sistema de Cómputo Electoral Bolivia

Recibe, valida y procesa los SMS enviados por delegados de mesa desde la app móvil.

---

## Arquitectura del sistema completo

```
┌──────────────────────────────────────────────────────────────┐
│                        APP FLUTTER                           │
│                                                              │
│  SmsDataScreen  →  SmsPreviewScreen  →  App SMS del SO       │
│  (datos + foto)    (mensaje fijo,         (usuario pulsa     │
│                     solo lectura)          "Enviar")         │
└───────────────────────────┬──────────────────────────────────┘
                            │ SMS al número +59171440740
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    GATEWAY SMS (proveedor)                   │
│        Twilio / Africa's Talking / Operadora local           │
│        Recibe el SMS y hace POST al webhook del backend      │
└───────────────────────────┬──────────────────────────────────┘
                            │ POST /api/sms/incoming
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                       BACKEND (este módulo)                  │
│                                                              │
│  gatewayNormalizer → numberValidator → messageValidator      │
│         ↓                                                    │
│     smsParser   →   actaService   →   [DB / downstream]     │
└──────────────────────────────────────────────────────────────┘
```

**Separación estricta de responsabilidades:**

| Capa | Qué hace | Qué NO hace |
|---|---|---|
| App Flutter | Genera el mensaje con formato fijo, abre la app de SMS | No envía, no valida negocio |
| Gateway SMS | Recibe el SMS y notifica al backend via webhook | No valida lógica |
| `gatewayNormalizer` | Unifica el formato de distintos gateways | No valida negocio |
| `numberValidator` | Solo verifica si el número está autorizado | No parsea el mensaje |
| `messageValidator` | Solo verifica la estructura del texto | No extrae valores |
| `smsParser` | Solo extrae y tipifica los campos | No toma decisiones |
| `actaService` | Toda la lógica de negocio (deduplicación, persistencia) | No parsea |

---

## Estructura de archivos

```
backend/
├── .env.example
├── package.json
├── README.md
└── src/
    ├── app.js                          ← Express + middlewares globales
    ├── server.js                       ← Entrada HTTP
    ├── config/
    │   └── config.js                   ← Variables de entorno + constantes
    ├── data/
    │   └── authorized_numbers.json     ← Lista de remitentes autorizados
    ├── middleware/
    │   └── gatewayNormalizer.js        ← Normaliza Twilio/AT/genérico + verifica firma
    ├── parsers/
    │   └── smsParser.js                ← Extrae campos del formato predefinido
    ├── validators/
    │   ├── numberValidator.js          ← Valida número remitente contra lista
    │   └── messageValidator.js         ← Pre-valida estructura del texto
    ├── services/
    │   └── actaService.js              ← Lógica de negocio (deduplicación, persistencia)
    └── routes/
        └── smsRoutes.js                ← POST /api/sms/incoming + GET /api/sms/actas
```

---

## Instalación y arranque

```bash
cd backend
cp .env.example .env
# editar .env con los valores reales

npm install
npm run dev        # desarrollo con nodemon
npm start          # producción
```

---

## Endpoints

### `POST /api/sms/incoming`

Webhook que llama el gateway SMS cuando se recibe un mensaje en el número `+59171440740`.

**Request — formato genérico (JSON):**
```json
{
  "from": "+59176000001",
  "body": "[ACTA-RRV]\nMesa: CM-001\nNum: 42\nRecinto: RC-005\n20/10/2024 14:35",
  "to": "+59171440740"
}
```

**Request — formato Twilio (URL-encoded):**
```
From=%2B59176000001&Body=%5BACTA-RRV%5D...&To=%2B59171440740
```

**Respuestas posibles:**
```json
{ "status": "accepted",   "id": "SMS-ABC123", "codigoMesa": "CM-001", ... }
{ "status": "duplicate",  "id": "SMS-ABC123", "message": "Acta ya registrada." }
{ "status": "rejected",   "reason": "sender_not_authorized" }
{ "status": "rejected",   "reason": "invalid_message_structure", "message": "..." }
{ "status": "rejected",   "reason": "parse_error", "message": "..." }
```

> **Importante:** el endpoint siempre devuelve HTTP 200 para evitar que el gateway
> reintente el envío. El resultado real va en el campo `status` del JSON.

### `GET /api/sms/actas`

Lista todas las actas recibidas (diagnóstico interno). Proteger con auth en producción.

### `GET /health`

Health check. Devuelve `{ "status": "ok" }`.

---

## Formato del SMS esperado

Generado por `SmsService.dart` en la app Flutter:

```
[ACTA-RRV]
Mesa: CM-001
Num: 42
Recinto: RC-005
20/10/2024 14:35
```

### Reglas de parseo

| Campo | Extracción | Conversión |
|---|---|---|
| Cabecera | Primera línea debe ser exactamente `[ACTA-RRV]` | — |
| `Mesa:` | Texto después de `Mesa:` | String |
| `Num:` | Número después de `Num:` | **int** (≥ 1) |
| `Recinto:` | Texto después de `Recinto:` | String |
| Timestamp | Línea con formato `DD/MM/AAAA HH:MM` | **Date** (UTC-4 Bolivia) |

---

## Autorización de remitentes

Editar `src/data/authorized_numbers.json`:

```json
{
  "numbers": ["+59171440740", "+59176000001"]
}
```

Formatos aceptados (todos se normalizan a E.164 internamente):
- `+59171440740` (E.164, recomendado)
- `59171440740` (sin +)
- `71440740` (local boliviano)
- `071440740` (con 0 de prefijo)

Reiniciar el servidor tras cambiar la lista.

---

## Configurar el gateway SMS

El backend necesita ser accesible públicamente para que el gateway haga el POST.
En desarrollo usar ngrok:

```bash
ngrok http 3001
# Copiar la URL pública (ej: https://abc123.ngrok.io)
# Configurar en el panel del gateway como webhook URL:
# https://abc123.ngrok.io/api/sms/incoming
```

### Prueba con curl (modo genérico, sin firma):

```bash
curl -X POST http://localhost:3001/api/sms/incoming \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+59176000001",
    "body": "[ACTA-RRV]\nMesa: CM-001\nNum: 42\nRecinto: RC-005\n20/10/2024 14:35",
    "to": "+59171440740"
  }'
```

### Prueba con Twilio format:

```bash
curl -X POST http://localhost:3001/api/sms/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "From=+59176000001" \
  --data-urlencode "Body=[ACTA-RRV]
Mesa: CM-001
Num: 42
Recinto: RC-005
20/10/2024 14:35" \
  --data-urlencode "To=+59171440740"
```
(Cambiar `SMS_GATEWAY_TYPE=twilio` en `.env`)
