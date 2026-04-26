# Resumen Técnico — Módulo 01

## Sistema Nacional de Cómputo Electoral Bolivia

Este documento describe cada componente técnico del módulo, las decisiones de diseño, y la estructura completa de ambas bases de datos.

---

## Decisiones de diseño

### ¿Por qué dos bases de datos?

| Criterio | MongoDB (flujo RRV) | PostgreSQL (flujo oficial) |
|----------|--------------------|-----------------------------|
| Estructura de datos | Semi-estructurada: OCR, SMS, imágenes | Estructurada, relacional, normalizada |
| Modelo de consistencia | Eventual (alta disponibilidad) | Fuerte (exactitud y auditoría) |
| Prioridad | Baja latencia, alto throughput | Integridad referencial, trazabilidad |
| Escalabilidad | Horizontal (sharding nativo) | Vertical + réplicas de lectura |
| Esquema | Flexible (útil para datos OCR imperfectos) | Rígido (garantiza validaciones) |

El flujo RRV necesita recibir datos con errores de OCR, formatos variables, y estructuras incompletas sin rechazarlos. MongoDB es ideal para esto porque no impone esquemas rígidos. El flujo oficial necesita integridad referencial, restricciones de unicidad, y un rastro de auditoría inmutable. PostgreSQL garantiza esto mediante claves foráneas, transacciones ACID, y CHECK constraints.

### ¿Por qué HAProxy como router?

- Provee un endpoint estable (`postgres-router:5432`) que nunca cambia.
- Los backends conectan siempre al router, no directamente a `postgres-primary`.
- Cuando ocurre un failover y la réplica es promovida, HAProxy redirige automáticamente en ~6s.
- Los backends no necesitan cambiar su configuración después de un failover.
- Limitación: HAProxy usa TCP checks, no puede detectar `pg_is_in_recovery()`. La detección del rol la hace el monitor.

### ¿Por qué un monitor de failover en Node.js?

- PostgreSQL no incluye failover automático por defecto.
- El monitor implementa una máquina de estados: `MONITORING → FAILOVER_PENDING → PROMOTING → PROMOTED`.
- Detecta 3 fallos consecutivos en el primary (~15s) antes de actuar, evitando falsos positivos por reinicios breves.
- Llama `SELECT pg_promote()` en la réplica para promoverla a primary.
- Incluye un guard de re-promoción: una vez promovida la réplica, el monitor entra en modo observación y no vuelve a intentar promover.

### ¿Por qué no reiniciar postgres-primary después de un failover?

Después de un failover, `postgres-primary` tiene una **línea de tiempo WAL divergente**. Si se reinicia sin reinicialización, cree que todavía es PRIMARY y comienza a aceptar escrituras. Al mismo tiempo, `postgres-replica` (el nuevo PRIMARY) también acepta escrituras. Esto se llama **split-brain**: datos distintos en dos nodos con la misma identidad de base de datos. La divergencia es irrecuperable sin intervención manual avanzada.

La solución segura es destruir el volumen de datos del primary antiguo y reinitiarlo desde el nuevo primary usando `pg_basebackup`.

---

## Estructura de archivos del módulo

```
01-clusters-bases-failover/
├── docker-compose.yml          Orquestación de los 8 servicios
├── .env.example                Variables de demo documentadas
│
├── mongo/
│   ├── init-replica.js         Inicialización idempotente del Replica Set rs0
│   ├── collections.js          7 colecciones con validadores JSON Schema
│   ├── indexes.js              Índices de rendimiento y unicidad
│   └── seed/
│       ├── seed-authorized-sms.js     10 números autorizados
│       ├── seed-rrv-sample-actas.js   5 actas (todos los estados posibles)
│       └── seed-rrv-sample-results.js SMS, resultados, eventos, logs
│
├── postgres/
│   ├── primary-hba.conf        pg_hba.conf: permite conexión de replicación
│   ├── replica-setup.sh        Entrypoint de la réplica: pg_basebackup + standby
│   ├── haproxy/
│   │   └── haproxy.cfg         Configuración HAProxy: balance first, TCP check
│   └── init/
│       ├── 00-create-replication-user.sql  Usuario replicator con privilegios WAL
│       ├── 01-schema.sql                   16 tablas del esquema oficial
│       ├── 02-indexes.sql                  Índices de rendimiento y unicidad
│       ├── 03-seed-territorial.sql         9 departamentos, 112 provincias, municipios de Bolivia
│       ├── 04-seed-parties-candidates.sql  4 partidos (P1-P4), candidatos de muestra
│       └── 05-seed-demo-official.sql       Recintos, mesas, actas, resultados, auditoría de muestra
│
└── scripts/
    ├── health-check.js                 Verifica estado de ambos clusters
    ├── postgres-failover-monitor.js    Monitor automático de failover (máquina de estados)
    ├── test-postgres-router.js         Test end-to-end del router HAProxy
    ├── test-postgres-failover.sh       Guía interactiva del failover PostgreSQL
    ├── postgres-promote-replica.sh     Promoción manual de la réplica
    ├── postgres-rejoin-old-primary.sh  Rejoin del primary antiguo como standby
    ├── backup-mongo.sh                 mongodump a ./mongo/backups/
    ├── backup-postgres.sh              pg_dump a ./postgres/backups/
    ├── restore-mongo.sh                mongorestore desde backup
    └── restore-postgres.sh             pg_restore desde backup
```

---

## Estructura de la base relacional PostgreSQL

Base de datos: `oep_oficial` | Motor: PostgreSQL 16 | Puerto host: 5432 (primary), 5433 (replica), 5434 (router)

### 1. departamentos

**Propósito:** Nivel territorial más alto. Los 9 departamentos de Bolivia.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `codigo` | VARCHAR(20) UNIQUE | Código territorial (ej. `CB` para Cochabamba) |
| `nombre` | VARCHAR(100) NOT NULL | Nombre del departamento |

**Módulo consumidor:** Backend Oficial (Módulo 03)
**Ejemplo:** `(1, 'LP', 'La Paz')`

---

### 2. provincias

**Propósito:** Subdivisión territorial de los departamentos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `departamento_id` | INTEGER FK → departamentos | Departamento al que pertenece |
| `codigo` | VARCHAR(20) UNIQUE | Código de provincia |
| `nombre` | VARCHAR(100) NOT NULL | Nombre de la provincia |

**Módulo consumidor:** Backend Oficial (Módulo 03)

---

### 3. municipios

**Propósito:** Subdivisión territorial de las provincias.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `provincia_id` | INTEGER FK → provincias | Provincia a la que pertenece |
| `codigo` | VARCHAR(20) UNIQUE | Código de municipio |
| `nombre` | VARCHAR(100) NOT NULL | Nombre del municipio |

**Módulo consumidor:** Backend Oficial (Módulo 03)

---

### 4. recintos

**Propósito:** Recintos electorales físicos (colegios, sedes) dentro de un municipio.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `codigo_recinto` | VARCHAR(50) UNIQUE NOT NULL | Código único del recinto |
| `codigo_territorial` | VARCHAR(50) | Código territorial del CSV |
| `municipio_id` | INTEGER FK → municipios | Municipio al que pertenece |
| `nombre` | VARCHAR(200) NOT NULL | Nombre del recinto |
| `direccion` | TEXT | Dirección física |
| `cantidad_mesas` | INTEGER | Número de mesas en el recinto |
| `estado` | VARCHAR(30) | `ACTIVO` / `INACTIVO` / `SUSPENDIDO` |

**Módulo consumidor:** Backend Oficial (Módulo 03), importación CSV tipo `RECINTOS`

---

### 5. mesas

**Propósito:** Mesas de votación individuales. **P1/P2/P3/P4 NO son columnas aquí.** Los votos por partido se almacenan como filas en `resultados_oficiales`.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `codigo_mesa` | VARCHAR(50) UNIQUE NOT NULL | Código único de la mesa (ej. `10101001001`) |
| `codigo_territorial` | VARCHAR(50) | Código territorial del CSV |
| `numero_mesa` | INTEGER NOT NULL | Número de mesa dentro del recinto |
| `recinto_id` | INTEGER FK → recintos | Recinto al que pertenece |
| `cantidad_habilitada` | INTEGER NOT NULL | Electores habilitados |
| `estado` | VARCHAR(30) | `ACTIVA` / `INACTIVA` / `SUSPENDIDA` |

**Módulo consumidor:** Backend Oficial (Módulo 03), importación CSV tipo `MESAS`
**Ejemplo:** `('10101001001', 1, recinto_id=5, 250, 'ACTIVA')`

---

### 6. partidos

**Propósito:** Partidos o agrupaciones políticas participantes.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `codigo` | VARCHAR(20) UNIQUE NOT NULL | Código del partido (ej. `P1`) |
| `nombre` | VARCHAR(100) NOT NULL | Nombre completo |
| `sigla` | VARCHAR(20) | Sigla |

**Módulo consumidor:** Backend Oficial (Módulo 03)
**Ejemplo:** `('P1', 'Movimiento al Socialismo', 'MAS')`

---

### 7. candidatos

**Propósito:** Candidatos por partido y cargo electoral.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `partido_id` | INTEGER FK → partidos | Partido al que pertenece |
| `nombre` | VARCHAR(150) NOT NULL | Nombre del candidato |
| `cargo` | VARCHAR(50) NOT NULL | `PRESIDENTE` / `DIPUTADO_UNINOMINAL` / `OTRO` |

**Módulo consumidor:** Backend Oficial (Módulo 03)

---

### 8. csv_importaciones

**Propósito:** Registro de cada archivo CSV cargado al sistema. Garantiza idempotencia mediante hash del archivo.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `nombre_archivo` | VARCHAR(255) NOT NULL | Nombre del archivo |
| `hash_archivo` | VARCHAR(255) UNIQUE NOT NULL | Hash SHA256 del archivo |
| `tipo_importacion` | VARCHAR(50) NOT NULL | `TERRITORIAL` / `RECINTOS` / `MESAS` / `RESULTADOS_OFICIALES` |
| `usuario_carga` | VARCHAR(150) | Usuario que cargó el archivo |
| `rol_usuario_carga` | VARCHAR(100) | Rol del usuario |
| `ip_origen` | VARCHAR(100) | IP de origen |
| `fecha_carga` | TIMESTAMP | Fecha de carga |
| `total_filas` | INTEGER | Total de filas procesadas |
| `filas_validas` | INTEGER | Filas procesadas correctamente |
| `filas_invalidas` | INTEGER | Filas con error |
| `estado` | VARCHAR(50) NOT NULL | `PROCESANDO` / `COMPLETADO` / `COMPLETADO_CON_ERRORES` / `FALLIDO` |
| `observacion` | TEXT | Notas sobre el proceso |

**Importación en 2 etapas:**
- Etapa 1 (`MESAS`): estructura territorial y mesas (antes de las elecciones)
- Etapa 2 (`RESULTADOS_OFICIALES`): votos por partido (post-elección)

**Módulo consumidor:** Backend Oficial (Módulo 03), automatización CSV (n8n o similar)

---

### 9. actas_oficiales

**Propósito:** Una fila por mesa + franja electoral. Almacena totales de votos del acta oficial. Los campos de votos son nullable hasta que el backend los valide.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `mesa_id` | INTEGER FK → mesas NOT NULL | Mesa de votación |
| `csv_importacion_id` | INTEGER FK → csv_importaciones | CSV de origen |
| `codigo_acta` | VARCHAR(100) UNIQUE NOT NULL | Formato: `OF-{codigoMesa}-{franja}` |
| `franja` | VARCHAR(50) NOT NULL | `PRESIDENTE` / `DIPUTADO_UNINOMINAL` |
| `votos_validos` | INTEGER nullable | Suma de votos por partido |
| `votos_blancos` | INTEGER nullable | Votos en blanco |
| `votos_nulos` | INTEGER nullable | Votos nulos |
| `total_votos` | INTEGER nullable | `votos_validos + blancos + nulos` |
| `papeletas_en_anfora` | INTEGER nullable | Papeletas en ánfora |
| `papeletas_no_utilizadas` | INTEGER nullable | Papeletas no utilizadas |
| `estado` | VARCHAR(50) NOT NULL | `IMPORTADA` → `VALIDANDO` → `VALIDADA` → `OFICIALIZADA` |
| `usuario_importacion` | VARCHAR(150) | Usuario que importó |
| `fecha_importacion` | TIMESTAMP | Fecha de importación |
| `usuario_validacion` | VARCHAR(150) | Usuario que validó |
| `observacion` | TEXT | Observaciones |

**Restricciones importantes:**
- `UNIQUE (mesa_id, franja)` — solo un acta oficial por mesa y franja
- Los campos de votos son nullable porque la estructura se puede cargar antes que los resultados
- Los votos se validan en el backend, no en la base de datos (para preservar datos OCR incorrectos)

**Regla de consistencia (aplicada por el backend):**
```
votos_validos = SUM(resultados_oficiales.cantidad_votos)
total_votos   = votos_validos + votos_blancos + votos_nulos
```

**Módulo consumidor:** Backend Oficial (Módulo 03), Dashboard (Módulo 04 vía API)

---

### 10. resultados_oficiales

**Propósito:** Una fila por partido por acta. **P1, P2, P3, P4 son filas, no columnas.** Este diseño permite cualquier número de partidos sin cambiar el esquema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `acta_oficial_id` | INTEGER FK → actas_oficiales NOT NULL | Acta a la que pertenece |
| `partido_id` | INTEGER FK → partidos NOT NULL | Partido |
| `candidato_id` | INTEGER FK → candidatos nullable | Candidato específico |
| `franja` | VARCHAR(50) NOT NULL | `PRESIDENTE` / `DIPUTADO_UNINOMINAL` |
| `cantidad_votos` | INTEGER NOT NULL ≥ 0 | Cantidad de votos |

**Restricción:** `UNIQUE (acta_oficial_id, partido_id, franja)` — un partido tiene un solo resultado por acta y franja.

**Por qué no columnas P1/P2/P3/P4:**
```sql
-- Correcto: escalable, funciona con cualquier cantidad de partidos
SELECT partido_id, cantidad_votos FROM resultados_oficiales
WHERE acta_oficial_id = 1 AND franja = 'PRESIDENTE';

-- Incorrecto: hardcodeado, rompe si hay más partidos
-- SELECT p1_votos, p2_votos, p3_votos FROM actas_oficiales WHERE ...
```

**Módulo consumidor:** Backend Oficial (Módulo 03), Dashboard (Módulo 04 vía API)

---

### 11. validaciones_oficiales

**Propósito:** Registro de cada regla de validación aplicada a un acta oficial. Una fila por regla por acta.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `acta_oficial_id` | INTEGER FK → actas_oficiales NOT NULL | Acta validada |
| `regla` | VARCHAR(100) NOT NULL | Nombre de la regla (ej. `SUMA_VOTOS_VALIDOS`) |
| `resultado` | VARCHAR(30) NOT NULL | `OK` / `WARNING` / `ERROR` |
| `mensaje` | TEXT | Detalle del resultado |
| `severidad` | VARCHAR(30) NOT NULL | `BAJA` / `MEDIA` / `ALTA` / `CRITICA` |
| `ejecutado_por` | VARCHAR(150) | Usuario o proceso que ejecutó la validación |
| `fecha_validacion` | TIMESTAMP | Fecha de la validación |

**Módulo consumidor:** Backend Oficial (Módulo 03)

---

### 12. auditoria_oficial

**Propósito:** Rastro de auditoría estricto e inmutable. Registra quién hizo qué, cuándo, desde dónde, y los valores antes/después de cualquier cambio.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `entidad` | VARCHAR(50) NOT NULL | Tabla afectada (ej. `actas_oficiales`) |
| `entidad_id` | INTEGER | ID del registro afectado |
| `usuario_accion` | VARCHAR(150) | Usuario que ejecutó la acción |
| `rol_usuario` | VARCHAR(100) | Rol del usuario |
| `tipo_accion` | VARCHAR(50) NOT NULL | Tipo de acción (ej. `VALIDACION`, `OFICIALIZACION`) |
| `detalle` | TEXT | Descripción de la acción |
| `valor_anterior` | JSONB | Estado del registro antes del cambio |
| `valor_nuevo` | JSONB | Estado del registro después del cambio |
| `ip_origen` | VARCHAR(100) | IP de origen |
| `user_agent` | TEXT | User agent del cliente |
| `fecha_hora` | TIMESTAMP | Fecha y hora de la acción |

**Sin restricciones de actualización:** este registro es de solo escritura (append-only) por diseño.

**Módulo consumidor:** Backend Oficial (Módulo 03), Dashboard (Módulo 04 vía API)

---

### 13. revisiones_oficiales

**Propósito:** Registro de cada revisión humana de un acta oficial. Un revisor revisa el formulario físico y toma una decisión.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `acta_oficial_id` | INTEGER FK → actas_oficiales NOT NULL | Acta revisada |
| `usuario_revisor` | VARCHAR(150) NOT NULL | Revisor |
| `rol_revisor` | VARCHAR(100) | Rol del revisor |
| `decision` | VARCHAR(50) NOT NULL | `ACEPTADA` / `OBSERVADA` / `RECHAZADA` / `CORREGIDA` / `EN_REVISION` |
| `formulario_correcto` | BOOLEAN | Si el formulario físico es correcto |
| `requiere_correccion` | BOOLEAN | Si se requiere corrección |
| `observacion` | TEXT | Notas del revisor |
| `fecha_revision` | TIMESTAMP | Fecha de revisión |

**Módulo consumidor:** Backend Oficial (Módulo 03)

---

### 14. comparaciones_rrv_oficial

**Propósito:** Comparaciones campo a campo entre resultados preliminares RRV y resultados oficiales. Permite detectar diferencias entre los dos flujos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `codigo_mesa` | VARCHAR(50) NOT NULL | Mesa comparada |
| `resultado_rrv_id` | VARCHAR(100) | ID del resultado en MongoDB |
| `acta_rrv_id` | VARCHAR(100) | ID del acta RRV en MongoDB |
| `acta_oficial_id` | INTEGER FK → actas_oficiales | Acta oficial |
| `franja` | VARCHAR(50) | Franja electoral |
| `campo` | VARCHAR(100) NOT NULL | Campo comparado (ej. `votos_validos`) |
| `valor_rrv` | INTEGER | Valor del flujo RRV |
| `valor_oficial` | INTEGER | Valor del flujo oficial |
| `diferencia` | INTEGER | `valor_rrv - valor_oficial` |
| `estado` | VARCHAR(50) NOT NULL | `COINCIDE` / `DIFERENCIA_LEVE` / `INCONSISTENCIA` / `CRITICA` |
| `fecha_comparacion` | TIMESTAMP | Fecha de la comparación |

**Módulo consumidor:** Backend Oficial (Módulo 03), Dashboard (Módulo 04 vía API)

---

### 15. inconsistencias

**Propósito:** Registro de todas las inconsistencias detectadas en el sistema, ya sea dentro de un mismo flujo o entre flujos RRV y oficial.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `origen` | VARCHAR(50) NOT NULL | Módulo que detectó la inconsistencia |
| `codigo_mesa` | VARCHAR(50) | Mesa involucrada |
| `acta_rrv_id` | VARCHAR(100) | Acta RRV relacionada (de MongoDB) |
| `resultado_rrv_id` | VARCHAR(100) | Resultado RRV relacionado |
| `acta_oficial_id` | INTEGER | Acta oficial relacionada |
| `tipo` | VARCHAR(100) NOT NULL | Tipo (ej. `SUMA_VOTOS_INVALIDA`, `DUPLICADO_DETECTADO`) |
| `descripcion` | TEXT | Descripción del problema |
| `severidad` | VARCHAR(30) NOT NULL | `BAJA` / `MEDIA` / `ALTA` / `CRITICA` |
| `estado` | VARCHAR(50) NOT NULL | `ABIERTA` / `EN_REVISION` / `RESUELTA` / `DESCARTADA` |
| `detectado_por` | VARCHAR(150) | Usuario o proceso que detectó |
| `fecha_deteccion` | TIMESTAMP | Fecha de detección |
| `fecha_resolucion` | TIMESTAMP nullable | Fecha de resolución |
| `resuelto_por` | VARCHAR(150) | Usuario que resolvió |
| `observacion_resolucion` | TEXT | Nota de resolución |

**Módulo consumidor:** Backend Oficial (Módulo 03), Dashboard (Módulo 04 vía API)

---

### 16. cluster_status

**Propósito:** Estado técnico de los nodos de base de datos. Actualizado por el health check. Permite al dashboard mostrar el estado del cluster en tiempo real.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | SERIAL PK | Identificador interno |
| `cluster_nombre` | VARCHAR(100) NOT NULL | Nombre del cluster (ej. `oep-postgresql`) |
| `motor` | VARCHAR(50) NOT NULL | `POSTGRESQL` / `MONGODB` |
| `nodo` | VARCHAR(100) NOT NULL | Nombre del nodo (ej. `postgres-primary`) |
| `host` | VARCHAR(100) | Hostname o IP |
| `puerto` | INTEGER | Puerto de conexión |
| `rol` | VARCHAR(50) | `PRIMARY` / `REPLICA` / `SECONDARY` / `ARBITER` / `UNKNOWN` |
| `estado` | VARCHAR(50) | `ACTIVO` / `CAIDO` / `RECUPERANDO` / `SINCRONIZANDO` / `DESCONOCIDO` |
| `ultima_verificacion` | TIMESTAMP | Última vez que se verificó |
| `latencia_ms` | INTEGER | Latencia en milisegundos |
| `observacion` | TEXT | Columna en singular (`observacion`, sin 's') |

**Nota crítica:** No existe índice UNIQUE en `(motor, nodo)`. Los INSERTs a esta tabla deben ser INSERT simples, **no** `ON CONFLICT (motor, nodo)`. Si se intenta usar `ON CONFLICT (motor, nodo)`, PostgreSQL devolverá un error porque no existe ese índice único.

**Módulo consumidor:** Script `health-check.js`, Dashboard (Módulo 04 vía API)

---

## Estructura de la base NoSQL MongoDB

Base de datos: `oep_rrv` | Motor: MongoDB 7 | Replica Set: `rs0` | Puertos host: 27017, 27018, 27019

### 1. rrv_actas

**Propósito:** Un documento por acta recibida (imagen o PDF). No almacena archivos binarios — solo metadatos, resultados OCR, y estado de validación. Una misma mesa puede tener múltiples actas (duplicados se preservan para auditoría).

**Campos principales:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `actaId` | String | ID único del acta (ej. `ACTA-RRV-001`) |
| `codigoMesa` | String | Código de la mesa electoral |
| `fuente` | String | `APP_MOVIL` / `CARGA_WEB` / `SISTEMA` |
| `estado` | String | `RECIBIDA` / `PROCESANDO` / `VALIDADA` / `SOSPECHOSA` / `RECHAZADA` / `PUBLICADA` / `PENDIENTE_REVISION` |
| `createdAt` | Date | Fecha de creación |

**Objetos anidados:**

```javascript
// Datos del acta (campos del formulario físico)
datosActa: {
  codigoMesa, numeroMesa, codigoRecinto, codigoTerritorial,
  codigoVerificacion, qr, barcode,
  departamento, provincia, municipio, localidad,
  nombreRecinto,
  horaApertura, horaCierre,
  cantidadElectoresHabilitados,
  papeletasEnAnfora, papeletasNoUtilizadas
}

// Resultados OCR
resultadosOCR: {
  P1, P2, P3, P4,         // Votos por partido
  votosValidos,            // OCR puede extraer valor inconsistente — se preserva tal cual
  votosBlancos, votosNulos, totalVotos,
  confianzaOCR,            // 0.0 – 1.0
  textoOCRRaw,             // Texto crudo extraído
  erroresOCR               // Lista de errores
}

// Metadata del archivo
archivo: {
  nombreArchivo, tipoArchivo, tamanoBytes, hashArchivo,
  urlAlmacenamiento
}
```

**Regla clave:** Si `P1+P2+P3+P4 ≠ votosValidos` → estado `SOSPECHOSA`. El sistema **no corrige** el valor OCR silenciosamente.

**Índices:** `actaId` (único), `codigoMesa`, `estado`, `createdAt`

**Módulo consumidor:** Backend RRV (Módulo 02)

---

### 2. rrv_sms

**Propósito:** Un documento por SMS recibido. La seguridad se basa en números autorizados (`sms_numeros_autorizados`), **no en tokens**.

**Campos principales:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `smsId` | String | ID único del SMS |
| `codigoMesa` | String | Mesa identificada en el SMS |
| `numeroOrigen` | String | Número de teléfono del remitente |
| `contenidoOriginal` | String | Texto original del SMS |
| `estado` | String | `RECIBIDO` / `VALIDO` / `INVALIDO` / `SOSPECHOSO` / `DUPLICADO` |
| `createdAt` | Date | Fecha de recepción |

**Objetos anidados:**

```javascript
// Datos parseados del contenido
datosParseados: {
  codigoMesa, codigoRecinto,
  P1, P2, P3, P4,
  blancos, nulos
}

// Resultado de validación
validacion: {
  numeroAutorizado: Boolean,
  formatoValido: Boolean,
  codigoMesaExiste: Boolean,
  errores: [String]
}
```

**Formato SMS esperado:**
```
MESA:{codigoMesa};RECINTO:{codigoRecinto};P1:{n};P2:{n};P3:{n};P4:{n};BLANCOS:{n};NULOS:{n}
```

**Sin tokens:** No existen campos `token`, `tokenRecibido`, `tokenValido`, ni `tokensInvalidos`. La autorización es por número de origen.

**Índices:** `smsId` (único), `codigoMesa`, `numeroOrigen`, `estado`

**Módulo consumidor:** Backend RRV (Módulo 02)

---

### 3. sms_numeros_autorizados

**Propósito:** Whitelist de números de teléfono autorizados para enviar resultados por SMS. Cada número está asociado a una mesa específica.

**Campos principales:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `numeroOrigen` | String | Número de teléfono (ej. `+59171234567`) |
| `codigoMesa` | String | Mesa a la que está autorizado |
| `nombreAutorizado` | String | Nombre del jurado o responsable |
| `activo` | Boolean | Si el número está activo |
| `createdAt` | Date | Fecha de registro |

**Validación en el backend:**
```typescript
const autorizado = await smsNumerosAutorizadosCollection.findOne({
  numeroOrigen: sms.from,
  activo: true,
});
if (!autorizado) {
  // Guardar con estado INVALIDO y registrar en rrv_logs
}
```

**Índices:** `(numeroOrigen, codigoMesa)` (único), `activo`

**Módulo consumidor:** Backend RRV (Módulo 02)

---

### 4. rrv_resultados_preliminares

**Propósito:** Resultados preliminares unificados de OCR y SMS. El dashboard consulta esta colección en lugar de cruzar `rrv_actas` + `rrv_sms` directamente.

**Campos principales:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `resultadoId` | String | ID único |
| `codigoMesa` | String | Mesa de votación |
| `fuente` | String | `OCR` / `SMS` |
| `franja` | String | `PRESIDENTE` / `DIPUTADO_UNINOMINAL` |
| `estado` | String | `VALIDO` / `SOSPECHOSO` / `RECHAZADO` / `PENDIENTE_REVISION` / `PUBLICADO` |
| `createdAt` | Date | Fecha de creación |

**Objetos anidados:**

```javascript
resultados: {
  P1, P2, P3, P4,
  votosValidos, votosBlancos, votosNulos, totalVotos
}

metadata: {
  actaRrvId,         // Referencia al rrv_actas._id si fuente=OCR
  smsRrvId,          // Referencia al rrv_sms._id si fuente=SMS
  confianzaOCR,
  numeroOrigen
}
```

**Índices:** `resultadoId` (único), `codigoMesa`, `fuente`, `estado`

**Módulo consumidor:** Backend RRV (Módulo 02), Dashboard (Módulo 04 vía API del backend RRV)

---

### 5. rrv_eventos

**Propósito:** Event sourcing del flujo RRV. Cada acción significativa genera un evento. Permite reconstruir el historial completo del sistema y auditar lo que ocurrió.

**Campos principales:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `eventId` | String | ID único del evento |
| `tipoEvento` | String | Tipo (ej. `ACTA_RECIBIDA`, `OCR_PROCESADO`, `INCONSISTENCIA_DETECTADA`) |
| `fechaEvento` | Date | Fecha del evento |
| `procesado` | Boolean | Si el evento fue procesado |
| `intentos` | Int | Número de intentos de procesamiento |
| `createdAt` | Date | Fecha de inserción |

**Objetos anidados:**

```javascript
payload: {
  // Contexto específico del evento
  actaId, codigoMesa, estado, fuente, ...
}

metadata: {
  origen,      // Módulo que generó el evento
  version,     // Versión del schema del evento
  correlationId
}
```

**Flujo de eventos:**
```
ACTA_RECIBIDA → OCR_PROCESADO → ACTA_VALIDADA → RESULTADO_PUBLICADO
                              → INCONSISTENCIA_DETECTADA → REVISION_REQUERIDA
                              → DUPLICADO_DETECTADO
```

**Índices:** `eventId` (único), `tipoEvento`, `fechaEvento`, `procesado`

**Módulo consumidor:** Backend RRV (Módulo 02)

---

### 6. rrv_logs

**Propósito:** Logs operacionales del flujo RRV. Incluye errores de imagen, errores OCR, intentos de fraude, SMS no autorizados, e inconsistencias.

**Campos principales:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `logId` | String | ID único |
| `tipo` | String | `ERROR_IMAGEN` / `ERROR_OCR` / `FRAUDE` / `DUPLICADO` / `SMS_INVALIDO` / `SMS_NUMERO_NO_AUTORIZADO` / `INCONSISTENCIA` / `SISTEMA` / `CLUSTER` |
| `severidad` | String | `INFO` / `WARNING` / `ERROR` / `CRITICAL` |
| `mensaje` | String | Mensaje del log |
| `createdAt` | Date | Fecha |

**Objetos anidados:**

```javascript
contexto: {
  actaId, codigoMesa, smsId, numeroOrigen,
  // Contexto específico según el tipo de log
}
```

**Índices:** `logId` (único), `tipo`, `severidad`, `createdAt`

**Módulo consumidor:** Backend RRV (Módulo 02), Dashboard (Módulo 04 vía API)

---

### 7. rrv_cluster_status

**Propósito:** Estado técnico de los nodos del Replica Set MongoDB. Actualizado por el health check script.

**Campos principales:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `clusterNombre` | String | Nombre del cluster (ej. `rrv-mongo-rs0`) |
| `nodo` | String | Nombre del nodo (ej. `mongo1`) |
| `tipoNodo` | String | `PRIMARY` / `SECONDARY` / `ARBITER` |
| `estado` | String | `ACTIVO` / `CAIDO` / `RECUPERANDO` / `SINCRONIZANDO` |
| `observacion` | String | Notas sobre el estado |
| `ultimaVerificacion` | Date | Última verificación |
| `latenciaMs` | Number | Latencia en ms |

**Módulo consumidor:** Script `health-check.js`, Dashboard (Módulo 04 vía API del backend RRV)

---

## Servicios del módulo

| Servicio | Puerto host | Imagen | Propósito |
|----------|------------|--------|-----------|
| `mongo1` | 27017 | mongo:7 | Nodo MongoDB PRIMARY |
| `mongo2` | 27018 | mongo:7 | Nodo MongoDB SECONDARY |
| `mongo3` | 27019 | mongo:7 | Nodo MongoDB SECONDARY |
| `postgres-primary` | 5432 | postgres:16 | PostgreSQL PRIMARY |
| `postgres-replica` | 5433 | postgres:16 | PostgreSQL STANDBY (hot standby) |
| `postgres-router` | 5434 / 8404 | haproxy:2.8 | Router TCP + stats dashboard |
| `postgres-failover-monitor` | — | node:20 | Monitor automático de failover (perfil: `monitor`) |
| `mongo-init` | — | mongo:7 | Inicialización del Replica Set (one-shot) |

---

## Configuración HAProxy

El archivo `postgres/haproxy/haproxy.cfg` configura:

```
frontend pg_frontend       → escucha en :5432
backend pg_backend
  balance first            → usa el primer servidor activo
  server primary postgres-primary:5432 check inter 3s fall 2 rise 2
  server replica postgres-replica:5432 check inter 3s fall 2 rise 2 backup
```

- `balance first` + `backup`: tráfico siempre al primary si está activo; solo usa la réplica cuando el primary falla.
- `fall 2`: marca como DOWN después de 2 chequeos fallidos (~6s).
- `rise 2`: marca como UP después de 2 chequeos exitosos (~6s de recuperación).
- Stats en `http://localhost:8404/stats`.

---

## Replicación WAL PostgreSQL

1. `postgres-primary` arranca con `wal_level=replica` y `max_wal_senders=5`.
2. El usuario `replicator` tiene privilegio `REPLICATION`.
3. `primary-hba.conf` permite conexión de replicación desde la réplica.
4. `postgres-replica` ejecuta `pg_basebackup` en el primer inicio y configura `primary_conninfo` para streaming continuo.
5. El archivo `standby.signal` señala al motor que debe arrancar en modo hot standby.
6. `SELECT pg_is_in_recovery()` → `t` (standby) / `f` (primary).

---

## Replicación MongoDB (oplog)

1. Los 3 nodos arrancan con `--replSet rs0`.
2. `mongo-init` ejecuta `rs.initiate()` para elegir el PRIMARY inicial.
3. El PRIMARY mantiene un oplog (log de operaciones).
4. Los SECONDARY conectan al PRIMARY y replican el oplog de forma continua.
5. Si el PRIMARY cae, los nodos restantes hacen una elección (quórum de 2/3).
6. La elección toma ~10-15s.

---

## Limitaciones conocidas del módulo

| Limitación | Impacto | Solución en producción |
|-----------|---------|----------------------|
| ~21s sin escrituras en failover PostgreSQL | Escrituras fallan durante la ventana de promoción | Patroni con etcd/Consul (~5s) |
| HAProxy no detecta `pg_is_in_recovery()` | El router puede redirigir a una réplica no promovida | Patroni + VIP |
| Un solo standby PostgreSQL | Si primary y replica caen simultáneamente, no hay promoción | Múltiples standbys con Patroni |
| ~10-15s sin escrituras en failover MongoDB | Elección de nuevo PRIMARY | Configuración de quórum extendida |
| Sin PgBouncer | Cada NestJS mantiene sus propias conexiones | Agregar PgBouncer para producción |
| Sin PITR | No se puede hacer rollback a un timestamp específico | Agregar `archive_command` para archivado WAL |
