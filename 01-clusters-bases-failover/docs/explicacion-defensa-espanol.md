# Explicación para Defensa — Módulo 01

## Sistema Nacional de Cómputo Electoral Bolivia

Guía de respuestas para la defensa oral del módulo 01. Basada en las pruebas reales ejecutadas.

---

## ¿Qué implementaste en este módulo?

Implementé toda la **infraestructura de base de datos** del sistema electoral distribuido de Bolivia. El módulo provee dos clusters independientes y tolerantes a fallos:

1. **MongoDB Replica Set (3 nodos)** — para el flujo rápido RRV/TREP: recibe actas digitalizadas, resultados OCR, y SMS de mesas con conectividad limitada.
2. **PostgreSQL con replicación + router** — para el flujo oficial: almacena resultados electorales verificados, auditados, y con integridad referencial.

Además del almacenamiento, el módulo incluye:
- Un router HAProxy que provee un endpoint estable para los backends aunque el nodo primary de PostgreSQL falle.
- Un monitor de failover automático en Node.js que detecta la caída del primary y promueve la réplica en ~15 segundos.
- Scripts de backup y restore.
- Scripts de health check.
- Toda la documentación de integración para los equipos backend.

---

## ¿Por qué dos bases de datos diferentes?

Porque los dos flujos del sistema tienen requerimientos fundamentalmente distintos:

| Criterio | MongoDB (flujo RRV) | PostgreSQL (flujo oficial) |
|----------|--------------------|-----------------------------|
| Estructura | Semi-estructurada, flexible | Relacional, normalizada |
| Consistencia | Eventual (alta disponibilidad) | Fuerte (exactitud y auditoría) |
| Prioridad | Baja latencia, seguir recibiendo datos aunque haya errores | Integridad referencial, trazabilidad legal |
| Esquema | Flexible: útil para OCR imperfecto | Rígido: garantiza validaciones |

El flujo RRV necesita recibir datos con errores de OCR, formatos variables, e información incompleta, sin rechazarlos. Si el OCR extrae un valor inconsistente (por ejemplo, `P1+P2+P3+P4 = 250` pero `votosValidos OCR = 255`), el sistema debe preservar esa discrepancia para análisis posterior, no descartarla. MongoDB es ideal para esto.

El flujo oficial necesita integridad referencial: una acta no puede existir sin una mesa, una mesa no puede existir sin un recinto, y todas las acciones deben quedar registradas en un rastro de auditoría inmutable. PostgreSQL garantiza esto mediante claves foráneas, transacciones ACID, y CHECK constraints.

---

## ¿Cómo funciona la replicación en MongoDB?

El sistema usa un **Replica Set de 3 nodos** (`rs0`):

```
mongo1:27017  →  PRIMARY  (escribe aquí)
mongo2:27017  →  SECONDARY (recibe réplica)
mongo3:27017  →  SECONDARY (recibe réplica)
```

1. Todas las escrituras van al PRIMARY (`mongo1` inicialmente).
2. El PRIMARY registra cada operación en su **oplog** (log de operaciones circular).
3. Los dos SECONDARY se conectan al PRIMARY y replican el oplog de forma continua.
4. Si el PRIMARY cae, los nodos restantes hacen una **elección**: el nodo con el oplog más actualizado gana.
5. La elección toma aproximadamente 10-15 segundos.
6. Cuando el nodo caído se restaura, se reincorpora automáticamente como SECONDARY y sincroniza.

**Quórum:** Con 3 nodos, el cluster puede perder 1 nodo y seguir operando (quórum de 2 de 3). Si caen 2 nodos, no hay quórum y el cluster no elige PRIMARY.

**Prueba realizada:**
```bash
docker stop mongo1
# ~12s después: mongo2 fue elegido PRIMARY
docker exec mongo2 mongosh --quiet --eval "rs.isMaster().ismaster"
# Resultado: true
docker start mongo1
# mongo1 se reincorporó automáticamente como SECONDARY
```

---

## ¿Cómo funciona la replicación en PostgreSQL?

El sistema usa **replicación física WAL (streaming replication)**:

```
postgres-primary:5432  →  PRIMARY (escritura + lectura)
    │  WAL stream (Write-Ahead Log)
    ▼
postgres-replica:5433  →  STANDBY (hot standby, solo lectura)
```

1. `postgres-primary` escribe todos los cambios en el **WAL** antes de aplicarlos.
2. `postgres-replica` se conecta al primary usando el usuario `replicator` y transmite el WAL de forma continua.
3. La réplica reproduce el WAL, manteniendo sus datos sincronizados.
4. La réplica está en **hot standby**: está online y acepta consultas de solo lectura.
5. `SELECT pg_is_in_recovery()` → `t` (es standby) / `f` (es primary).

**pg_basebackup:** En el primer inicio, `postgres-replica` ejecuta automáticamente `pg_basebackup` para obtener una copia base del primary antes de comenzar el streaming.

---

## ¿Cómo funciona el failover automático de PostgreSQL?

El monitor (`scripts/postgres-failover-monitor.js`) implementa una **máquina de estados**:

```
MONITORING
    │  (3 fallos consecutivos del primary, ~15s)
    ▼
FAILOVER_PENDING
    │  (réplica accesible + pg_is_in_recovery() = true)
    ▼
PROMOTING
    │  (llama SELECT pg_promote())
    ▼
PROMOTED  (modo observación — no vuelve a promover)
```

**Secuencia durante el failover real (prueba ejecutada):**
```
t=0s    docker stop postgres-primary
t=5s    Monitor: WARN postgres-primary unreachable (1/3)
t=10s   Monitor: WARN postgres-primary unreachable (2/3)
t=15s   Monitor: WARN postgres-primary unreachable (3/3)
t=15s   Monitor: CRIT Calling SELECT pg_promote() on postgres-replica
t=15s   Monitor: CRIT AUTOMATIC FAILOVER COMPLETE — New PRIMARY: postgres-replica:5432
```

**Verificación:**
```bash
docker exec postgres-replica psql -U oep_user -d oep_oficial -c "SELECT pg_is_in_recovery();"
# Resultado: f  (ahora es PRIMARY)
```

**Guard de re-promoción:** Una vez que el monitor entra en estado `PROMOTED`, nunca vuelve a intentar promover. Esto evita un segundo failover accidental.

---

## ¿Qué hace el router HAProxy?

El router `postgres-router` (HAProxy) provee un **endpoint estable** para los backends:

```
Backend NestJS  →  postgres-router:5432  →  postgres-primary:5432  (normal)
                                         →  postgres-replica:5432   (después del failover)
```

**Antes del failover:**
- El router enruta al `postgres-primary` activo.
- Los backends nunca necesitan cambiar su string de conexión.

**Cuando el primary cae:**
1. HAProxy hace chequeos TCP cada 3 segundos.
2. Después de 2 chequeos fallidos (~6s), marca el primary como DOWN.
3. HAProxy redirige al backup (`postgres-replica`).
4. Durante ~15s, la réplica aún no fue promovida → escrituras fallan.
5. El monitor promueve la réplica → escrituras exitosas.

**¿Por qué usarlo?** Si los backends conectaran directamente a `postgres-primary`, después de un failover necesitarían actualizar su configuración para apuntar a `postgres-replica`. Con el router, **no hay nada que cambiar**.

**Stats en tiempo real:** `http://localhost:8404/stats`

---

## ¿Qué pasa si reinicio postgres-primary después de un failover?

Esto crea **split-brain**: el nodo más peligroso para un sistema electoral.

Después de un failover, `postgres-primary` tiene una línea de tiempo WAL divergente del nuevo primary (`postgres-replica`). Si se reinicia directamente:
- `postgres-primary` cree que sigue siendo PRIMARY y comienza a aceptar escrituras.
- `postgres-replica` también es PRIMARY y también acepta escrituras.
- Dos nodos escriben datos distintos con la misma identidad de base de datos.
- La divergencia es **irrecuperable** sin intervención manual avanzada.

**Opciones seguras:**
1. **Reset completo:** `docker compose down -v` y reiniciar desde cero.
2. **Rejoin avanzado:** `bash scripts/postgres-rejoin-old-primary.sh --force` — destruye el volumen del primary antiguo y lo reinicializa desde el nuevo primary usando `pg_basebackup`.

---

## ¿Qué es el rejoin?

El rejoin es el proceso de reintegrar el primary antiguo al cluster como standby del nuevo primary, sin perder datos del nuevo primary.

El script `postgres-rejoin-old-primary.sh --force`:
1. Detiene `postgres-primary`.
2. **Destruye** su volumen de datos (para eliminar el WAL divergente).
3. Ejecuta `pg_basebackup` desde `postgres-replica` (el nuevo primary).
4. Configura `postgres-primary` como standby del nuevo primary.
5. Inicia `postgres-primary` en modo recuperación.

**Advertencia:** Después del rejoin, los hostnames quedan invertidos:
- `postgres-primary` = STANDBY del nuevo primary
- `postgres-replica` = PRIMARY

Para restaurar la topología original, usar `docker compose down -v`.

---

## ¿Por qué los votos NO son columnas P1/P2/P3/P4 en la tabla mesas?

Porque ese diseño es inflexible y viola la normalización relacional.

**Diseño incorrecto (hardcoded):**
```sql
-- Si hay un quinto partido, hay que modificar el esquema
SELECT p1_votos, p2_votos, p3_votos, p4_votos FROM mesas WHERE ...;
```

**Diseño correcto (normalizado):**
```sql
-- Funciona con cualquier número de partidos sin cambiar el esquema
SELECT partido_id, cantidad_votos FROM resultados_oficiales
WHERE acta_oficial_id = X AND franja = 'PRESIDENTE';
```

Los votos se almacenan como **filas** en `resultados_oficiales` (una fila por partido por acta). La tabla `mesas` solo almacena la estructura geográfica y administrativa de la mesa.

---

## ¿Por qué los campos de votos son nullable en actas_oficiales?

Porque el CSV oficial se puede cargar en **dos etapas**:

1. **Etapa 1 (antes de las elecciones):** CSV con estructura territorial y mesas. Los votos aún no existen → campos nullable.
2. **Etapa 2 (post-elección):** CSV con resultados por mesa. Se completan los campos de votos.

Esta separación permite cargar y validar la estructura territorial meses antes de las elecciones, y luego cargar solo los resultados el día de la elección.

---

## ¿Cómo funciona la seguridad SMS?

La seguridad SMS **no usa tokens**. Usa números autorizados.

**Colección `sms_numeros_autorizados`:** lista de números de teléfono autorizados, cada uno asociado a una mesa específica.

Cuando llega un SMS:
1. El backend RRV busca `numeroOrigen` en `sms_numeros_autorizados` con `activo: true`.
2. Si no está autorizado → guarda en `rrv_sms` con estado `INVALIDO` y registra en `rrv_logs` tipo `SMS_NUMERO_NO_AUTORIZADO`.
3. Si está autorizado → parsea el contenido, valida el formato, y guarda con estado `VALIDO` o `SOSPECHOSO`.

**No existen** campos `token`, `tokenRecibido`, `tokenValido` en ningún documento de la base de datos.

---

## ¿Cómo se manejan los duplicados?

El sistema **no sobreescribe** los duplicados automáticamente.

**En MongoDB (actas RRV):**
- Si llega una segunda acta para la misma mesa, ambas se guardan.
- Se registra un evento `DUPLICADO_DETECTADO` en `rrv_eventos`.
- El backend marca el caso como conflicto.
- Se requiere revisión humana para determinar cuál es válida.

**En PostgreSQL (actas oficiales):**
- La restricción `UNIQUE (mesa_id, franja)` impide dos actas oficiales para la misma mesa y franja.
- El CSV debe pasar por el backend antes de llegar a la base de datos.
- Si el backend intenta insertar un duplicado, usa `ON CONFLICT DO NOTHING` para idempotencia.

---

## ¿Qué pruebas ejecutaste?

Todas las pruebas se ejecutaron manualmente y todas pasaron:

| Prueba | Resultado |
|--------|-----------|
| MongoDB Replica Set inicializado | ✅ APROBADO |
| Colecciones e índices MongoDB | ✅ APROBADO |
| Seed de datos MongoDB | ✅ APROBADO |
| Failover MongoDB (mongo1 → mongo2) | ✅ APROBADO (~12s) |
| PostgreSQL primary + réplica WAL | ✅ APROBADO (con corrección de encoding) |
| Router HAProxy antes del failover | ✅ APROBADO |
| Failover PostgreSQL automático | ✅ APROBADO (~21s total) |
| Router HAProxy después del failover | ✅ APROBADO |
| Health check | ✅ APROBADO (con corrección de hosts Windows) |

**Errores encontrados durante las pruebas:**
1. `postgres/replica-setup.sh` tenía saltos de línea CRLF de Windows → bash lo leía como una sola línea → solucionado convirtiendo a LF.
2. `health-check.js` desde Windows no resolvía `mongo1`, `mongo2`, `mongo3` → solucionado agregando entradas en el archivo `hosts` del sistema.
3. `npm install` bloqueado en PowerShell → solucionado usando `npm.cmd install`.
4. Scripts de test tenían nombre de columna incorrecto (`observaciones` → `observacion`) → solucionado.

---

## ¿Cuáles son las limitaciones del módulo?

| Limitación | Impacto | Qué se usaría en producción |
|-----------|---------|----------------------------|
| Ventana de ~21s sin escrituras en failover PostgreSQL | Escrituras fallan durante la promoción | Patroni con etcd/Consul (~5s) |
| HAProxy no detecta `pg_is_in_recovery()` | Puede redirigir a standby antes de la promoción | Patroni + VIP o connection reconfiguration |
| Un solo standby PostgreSQL | Si caen ambos nodos, no hay recuperación automática | Múltiples standbys |
| ~10-15s de elección MongoDB | Escrituras no disponibles durante la elección | El driver NestJS reintenta automáticamente |
| Sin PgBouncer | Cada instancia NestJS usa sus propias conexiones | Agregar PgBouncer |

Estas limitaciones son **aceptables para un demo académico**. El módulo demuestra correctamente los conceptos de replicación, failover automático, y tolerancia a fallos. En producción se usaría Patroni con etcd/Consul para failover más rápido y robusto.

---

## Comandos de inicio rápido para la demo

```bash
# 1. Navegar al módulo
cd C:\Sistema-OEP\sistema-computo-electoral-bolivia\01-clusters-bases-failover

# 2. Reset limpio (recomendado antes de la demo)
docker compose --profile monitor down -v --remove-orphans

# 3. Iniciar bases de datos
docker compose up -d mongo1 mongo2 mongo3 postgres-primary

# 4. Esperar ~40s, luego inicializar MongoDB
docker compose run --rm mongo-init

# 5. Colecciones, índices y seed MongoDB
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/indexes.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-authorized-sms.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-actas.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-results.js

# 6. Iniciar réplica PostgreSQL y router
docker compose up -d postgres-replica postgres-router

# 7. Health check
cd scripts && npm.cmd install && node health-check.js && cd ..
```

**Verificación de estado:**
```bash
docker compose ps
```

**String de conexión para backends:**
```
MongoDB:    mongodb://mongo1:27017,mongo2:27017,mongo3:27017/oep_rrv?replicaSet=rs0
PostgreSQL: postgresql://oep_user:oep_password@postgres-router:5432/oep_oficial
```
