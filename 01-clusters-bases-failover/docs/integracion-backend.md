# Guía de Integración para Equipos Backend

## Sistema Nacional de Cómputo Electoral Bolivia — Módulo 01

Este documento contiene todo lo que los equipos de backend necesitan para conectarse
a las bases de datos provistas por el Módulo 01.

---

## Reglas de integración (crítico)

| Regla | Descripción |
|---|---|
| El dashboard NO conecta a bases de datos directamente | Solo consume endpoints de backend |
| La app móvil NO escribe en MongoDB directamente | Solo envía datos al backend RRV |
| La automatización CSV NO escribe en PostgreSQL directamente | Solo envía datos al backend oficial |
| El flujo RRV NO escribe en la base de datos oficial | Pipelines completamente separados |
| El flujo oficial NO modifica registros del flujo RRV | Solo escribe en PostgreSQL |

---

## 1. Módulo 02 — Backend RRV (flujo rápido)

### Variables de entorno necesarias

```env
# MongoDB — Replica Set
MONGO_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/oep_rrv?replicaSet=rs0
MONGO_DB=oep_rrv

# Para pruebas desde el host (fuera de Docker)
MONGO_URI_HOST=mongodb://localhost:27017,localhost:27018,localhost:27019/oep_rrv?replicaSet=rs0
```

### Colecciones disponibles

| Colección | Propósito | Operaciones |
|---|---|---|
| `rrv_actas` | Actas recibidas (imágenes/PDF) | Read/Write |
| `rrv_sms` | Mensajes SMS recibidos | Read/Write |
| `sms_numeros_autorizados` | Whitelist de números autorizados | Read only |
| `rrv_resultados_preliminares` | Resultados preliminares unificados (OCR + SMS) | Read/Write |
| `rrv_eventos` | Event sourcing del flujo RRV | Write only |
| `rrv_logs` | Logs operacionales | Write only |
| `rrv_cluster_status` | Estado técnico del cluster (health check) | Read/Write |

### Conexión NestJS con Mongoose

```typescript
// app.module.ts
MongooseModule.forRoot(process.env.MONGO_URI, {
  replicaSet: 'rs0',
  readPreference: 'primaryPreferred',
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
})
```

### Idempotencia — campos clave

Para evitar duplicados, el backend debe verificar estos campos antes de insertar:

| Colección | Campo de idempotencia |
|---|---|
| `rrv_actas` | `actaId`, `archivo.hashArchivo` |
| `rrv_sms` | `smsId`, `numeroOrigen + codigoMesa` |
| `rrv_resultados_preliminares` | `resultadoId` |
| `rrv_eventos` | `eventId` |

### Campos con valores permitidos (estados uppercase)

**rrv_actas.estado:**
`RECIBIDA | PROCESANDO | VALIDADA | SOSPECHOSA | RECHAZADA | PUBLICADA | PENDIENTE_REVISION`

**rrv_actas.fuente:**
`APP_MOVIL | CARGA_WEB`  *(SMS no crea actas completas)*

**rrv_sms.estado:**
`RECIBIDO | VALIDO | INVALIDO | SOSPECHOSO | DUPLICADO`

**rrv_resultados_preliminares.fuente:**
`OCR | SMS`

**rrv_resultados_preliminares.franja:**
`PRESIDENTE | DIPUTADO_UNINOMINAL`

### Regla de consistencia de votos

```typescript
// El backend debe aplicar esta regla antes de marcar un resultado como VALIDO
votosValidos === votosPartidos.reduce((s, p) => s + p.cantidadVotos, 0)
totalVotos   === votosValidos + votosBlancos + votosNulos
```

Si la regla falla → estado `SOSPECHOSA` o `PENDIENTE_REVISION`. **No corregir silenciosamente.**

---

## 2. Módulo 03 — Backend Oficial (flujo oficial)

### Variables de entorno necesarias

```env
# ─── Recommended: connect through the stable router endpoint ─────────────────
# postgres-router (HAProxy) always routes to the current writable PRIMARY.
# No reconfiguration needed after a failover.
POSTGRES_ROUTER_URL=postgresql://oep_user:oep_password@postgres-router:5432/oep_oficial

# ─── Direct connections (for special cases) ──────────────────────────────────
# PostgreSQL Primary (escritura y lectura normal)
POSTGRES_PRIMARY_URL=postgresql://oep_user:oep_password@postgres-primary:5432/oep_oficial

# PostgreSQL Replica (lectura pesada — opcional, para dashboards)
POSTGRES_REPLICA_URL=postgresql://oep_user:oep_password@postgres-replica:5432/oep_oficial

POSTGRES_DB=oep_oficial
POSTGRES_USER=oep_user
POSTGRES_PASSWORD=oep_password

# Para pruebas desde el host
POSTGRES_PRIMARY_URL_HOST=postgresql://oep_user:oep_password@localhost:5432/oep_oficial
POSTGRES_REPLICA_URL_HOST=postgresql://oep_user:oep_password@localhost:5433/oep_oficial
```

### Tablas disponibles

| Tabla | Propósito |
|---|---|
| `departamentos` | Estructura territorial — departamentos de Bolivia |
| `provincias` | Provincias (FK → departamentos) |
| `municipios` | Municipios (FK → provincias) |
| `recintos` | Recintos electorales (FK → municipios) |
| `mesas` | Mesas de votación (FK → recintos) |
| `partidos` | Partidos políticos (P1-P4 en el prototipo) |
| `candidatos` | Candidatos (FK → partidos) |
| `csv_importaciones` | Registro de cada CSV cargado |
| `actas_oficiales` | Actas oficiales por mesa+franja |
| `resultados_oficiales` | Votos por partido (filas, no columnas) |
| `validaciones_oficiales` | Reglas de validación aplicadas |
| `auditoria_oficial` | Auditoría estricta (quién/qué/cuándo) |
| `revisiones_oficiales` | Revisiones de formularios |
| `comparaciones_rrv_oficial` | Comparaciones RRV vs Oficial |
| `inconsistencias` | Inconsistencias detectadas |
| `cluster_status` | Estado técnico de los nodos |

### Conexión NestJS con TypeORM — usando el router (recomendado)

```typescript
// Usar el router como punto de entrada estable
TypeOrmModule.forRoot({
  type: 'postgres',
  url: process.env.POSTGRES_ROUTER_URL,   // postgres-router:5432
  synchronize: false,
  logging: false,
  entities: ['dist/**/*.entity.js'],
})
```

Con este setup, el backend **no necesita cambiar su configuración después de un failover**. El router (HAProxy) redirige automáticamente al nodo writable.

### Conexión directa (sin router) — requiere cambio manual después de failover

```typescript
TypeOrmModule.forRoot({
  type: 'postgres',
  url: process.env.POSTGRES_PRIMARY_URL,  // postgres-primary:5432
  synchronize: false,
  logging: false,
  entities: ['dist/**/*.entity.js'],
})
```

Si se usa conexión directa, después de un failover se debe actualizar `POSTGRES_PRIMARY_URL`:
```env
# Antes del failover
POSTGRES_PRIMARY_URL=postgresql://oep_user:oep_password@postgres-primary:5432/oep_oficial

# Después del failover (postgres-replica es ahora el primario)
POSTGRES_PRIMARY_URL=postgresql://oep_user:oep_password@postgres-replica:5432/oep_oficial
```

### postgres-router — endpoint estable (HAProxy)

```
Backend  →  postgres-router:5432 (HAProxy)  →  postgres-primary:5432 (normal)
                                             →  postgres-replica:5432 (después de failover)
```

**Comportamiento:**
- **Antes del failover**: postgres-router → postgres-primary (activo)
- **postgres-primary cae**: HAProxy detecta fallo en ~6s (2 chequeos × 3s)
- **Durante ~15s**: postgres-router → postgres-replica (aún en standby → escrituras fallan)
- **Después de la promoción**: postgres-router → postgres-replica (primario) → escrituras exitosas
- **Reconexión**: TypeORM reconnects automáticamente al reestablecer la conexión

**Variables de entorno del router:**
```env
POSTGRES_ROUTER_URL=postgresql://oep_user:oep_password@postgres-router:5432/oep_oficial
POSTGRES_ROUTER_HOST_URL=postgresql://oep_user:oep_password@localhost:5434/oep_oficial
```

**Test del router:**
```bash
cd scripts && npm install
node test-postgres-router.js
```

**Stats dashboard (HAProxy):** `http://localhost:8404/stats`

### Flujo de importación CSV (2 etapas)

**Etapa 1 — Datos base (territorial + mesas):**
CSV: `CodigoTerritorio, CodigoMesa, Mesa, NroVotantes`
Pobla: `mesas` (→ `recintos` → `municipios` → ...)
Registrar en: `csv_importaciones` con `tipo_importacion = 'MESAS'`

**Etapa 2 — Resultados oficiales (post-elección):**
CSV: `CodigoMesa, P1, P2, P3, P4, BLANCOS, NULOS, VALIDOS, TOTAL`
Pobla: `actas_oficiales` + `resultados_oficiales`
Registrar en: `csv_importaciones` con `tipo_importacion = 'RESULTADOS_OFICIALES'`

### Reglas de validación oficial

Antes de marcar un acta como `VALIDADA` u `OFICIALIZADA`:

```
1. mesa_id existe en la tabla mesas
2. recinto_id existe en la tabla recintos
3. csv_importacion_id referencia una importación COMPLETADO
4. votos_validos, votos_blancos, votos_nulos, total_votos son NOT NULL y >= 0
5. SUM(resultados_oficiales.cantidad_votos WHERE franja=X) === acta.votos_validos
6. acta.votos_validos + acta.votos_blancos + acta.votos_nulos === acta.total_votos
7. No existe acta oficial previa para (mesa_id, franja) con estado OFICIALIZADA
8. Registrar cada regla en validaciones_oficiales
9. Registrar la acción en auditoria_oficial
```

### Estados del acta oficial (uppercase, en orden)

```
IMPORTADA → VALIDANDO → VALIDADA → OFICIALIZADA
                     ↘ OBSERVADA ↗
                     ↘ RECHAZADA
```

### Idempotencia — campos clave

| Tabla | Campo de idempotencia |
|---|---|
| `csv_importaciones` | `hash_archivo` |
| `actas_oficiales` | `codigo_acta` (formato: `OF-{codigoMesa}-{franja}`) |
| `resultados_oficiales` | `(acta_oficial_id, partido_id, franja)` |
| `mesas` | `codigo_mesa` |
| `recintos` | `codigo_recinto` |

---

## 3. Módulo 04 — Dashboard

El dashboard **no conecta directamente a ninguna base de datos**.
Consume endpoints de los backends RRV y Oficial.

### Datos disponibles para el dashboard (vía backend)

**Desde backend RRV (MongoDB):**
- Resultados preliminares: `GET /api/rrv/resultados?departamento=X&franja=Y`
- Estado de actas: `GET /api/rrv/actas?estado=SOSPECHOSA`
- Eventos recientes: `GET /api/rrv/eventos?limit=50`
- Estado del cluster: `GET /api/health/nosql`

**Desde backend Oficial (PostgreSQL):**
- Resultados oficiales: `GET /api/oficial/resultados?municipio=X`
- Comparaciones: `GET /api/comparaciones?mesa=X`
- Inconsistencias: `GET /api/inconsistencias?estado=ABIERTA`
- Estado del cluster: `GET /api/health/relacional`

**Endpoint de salud combinado:**
```json
GET /api/health

{
  "success": true,
  "status": "OK",
  "services": {
    "nosql": "OK",
    "relacional": "OK"
  }
}
```

---

## 4. Módulo 05 — App Móvil / SMS

- La app móvil envía imágenes/PDFs al **backend RRV** únicamente.
- Los SMS entran al sistema solo a través del **backend RRV** o un receptor SMS dedicado.
- Ni la app ni los SMS escriben directamente en MongoDB.

### Validación de SMS en el backend RRV

```typescript
// Antes de procesar un SMS
const autorizado = await smsNumerosAutorizadosCollection.findOne({
  numeroOrigen: sms.from,
  activo: true,
});

if (!autorizado) {
  // Guardar en rrv_sms con estado INVALIDO
  // Registrar en rrv_logs tipo SMS_NUMERO_NO_AUTORIZADO
  return;
}
```

### Formato SMS esperado

```
MESA:{codigoMesa};RECINTO:{codigoRecinto};P1:{n};P2:{n};P3:{n};P4:{n};BLANCOS:{n};NULOS:{n}
```

Ejemplo:
```
MESA:10101001001;RECINTO:10101001;P1:120;P2:90;P3:30;P4:10;BLANCOS:5;NULOS:3
```

---

## Respuesta estándar de APIs

```json
// Éxito
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": {}
}

// Error
{
  "success": false,
  "message": "Could not process the request",
  "codigoError": "ERROR_CODE",
  "data": null
}
```
