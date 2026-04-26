# Guía de Pruebas de Failover

## Sistema Nacional de Cómputo Electoral Bolivia — Módulo 01

---

## Prerrequisitos

Todos los contenedores corriendo y saludables:

```bash
docker compose ps
```

Seed data cargada y health check pasando:

```bash
cd scripts && node health-check.js && cd ..
```

---

## Parte 1 — Failover MongoDB Replica Set

### 1.1 Verificar estado inicial

```bash
# Ver estado completo del replica set
docker exec mongo1 mongosh --quiet \
  --eval "rs.status().members.forEach(m => print(m.name + ' → ' + m.stateStr + ' | health: ' + m.health))"
```

Salida esperada:
```
mongo1:27017 → PRIMARY   | health: 1
mongo2:27017 → SECONDARY | health: 1
mongo3:27017 → SECONDARY | health: 1
```

### 1.2 Insertar datos de prueba antes del failover

```bash
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" --eval "
  db.rrv_logs.insertOne({
    logId: 'LOG-FAILOVER-TEST',
    tipo: 'CLUSTER',
    severidad: 'INFO',
    mensaje: 'Documento insertado antes del failover para verificar replicación',
    modulo: 'CLUSTER',
    fechaHora: new Date(),
    createdAt: new Date()
  });
  print('Inserted. Count: ' + db.rrv_logs.countDocuments());
"
```

### 1.3 Verificar que los secundarios tienen el dato

```bash
# Habilitar lectura en secundario
docker exec mongo2 mongosh --quiet \
  --eval "db.getMongo().setReadPref('secondaryPreferred'); use('oep_rrv'); db.rrv_logs.findOne({logId:'LOG-FAILOVER-TEST'})"
```

### 1.4 Simular caída del PRIMARY (mongo1)

```bash
docker stop mongo1
```

### 1.5 Observar la elección automática de nuevo PRIMARY

```bash
# Esperar ~10s y verificar — ejecutar varias veces hasta ver nuevo PRIMARY
docker exec mongo2 mongosh --quiet \
  --eval "rs.status().members.forEach(m => print(m.name + ' → ' + m.stateStr))"
```

Salida esperada (después de ~10-15 segundos):
```
mongo1:27017 → (not reachable/healthy)
mongo2:27017 → PRIMARY     ← o mongo3
mongo3:27017 → SECONDARY
```

### 1.6 Verificar que el sistema sigue funcionando

```bash
# Escribir en el nuevo primary
docker exec mongo2 mongosh "mongodb://mongo2:27017/oep_rrv?replicaSet=rs0" --eval "
  db.rrv_eventos.insertOne({
    eventId: 'EVT-FAILOVER-001',
    tipoEvento: 'NODO_MONGODB_CAIDO',
    codigoMesa: 'N/A',
    payload: { nodo: 'mongo1', motivo: 'Simulacion de falla para demo' },
    fechaEvento: new Date(),
    origen: 'CLUSTER',
    procesado: true,
    intentos: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  print('Write after failover succeeded. Events: ' + db.rrv_eventos.countDocuments());
"
```

### 1.7 Reiniciar mongo1 y verificar sincronización

```bash
docker start mongo1
```

Esperar ~15 segundos y verificar:

```bash
docker exec mongo1 mongosh --quiet \
  --eval "rs.status().members.forEach(m => print(m.name + ' → ' + m.stateStr))"
```

mongo1 debe mostrar `SECONDARY` (se sincronizó con el nuevo primary).

### 1.8 Verificar que mongo1 tiene los datos escritos durante su ausencia

```bash
docker exec mongo1 mongosh --quiet \
  --eval "use('oep_rrv'); db.rrv_eventos.findOne({eventId:'EVT-FAILOVER-001'})"
```

El documento debe estar presente — la replicación se completó.

---

## Parte 2 — Failover PostgreSQL Primary/Replica

### 2.1 Verificar estado inicial

```bash
# Verificar que la réplica está activa
docker exec postgres-primary psql -U oep_user -d oep_oficial \
  -c "SELECT client_addr, state, sync_state FROM pg_stat_replication;"
```

```bash
# Verificar que la réplica está en modo standby
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery() AS es_replica, now() - pg_last_xact_replay_timestamp() AS lag;"
```

### 2.2 Insertar dato de prueba en el primario

```bash
docker exec postgres-primary psql -U oep_user -d oep_oficial -c "
INSERT INTO auditoria_oficial (entidad, tipo_accion, detalle, fecha_hora)
VALUES ('CLUSTER', 'FALLO_CLUSTER', 'Registro de prueba antes del failover', now());
"
```

### 2.3 Verificar que la réplica tiene el dato

```bash
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT id, tipo_accion, detalle, fecha_hora FROM auditoria_oficial ORDER BY id DESC LIMIT 1;"
```

El mismo registro debe aparecer en la réplica.

### 2.4 Simular caída del primario

```bash
docker stop postgres-primary
```

### 2.5 Verificar que la réplica sigue disponible para lectura

```bash
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT count(*) AS total_mesas FROM mesas;"
```

La réplica sigue respondiendo en modo lectura.

```bash
# Intentar escritura — debe FALLAR en standby
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "INSERT INTO auditoria_oficial (entidad, tipo_accion) VALUES ('TEST', 'TEST');"
```

Salida esperada: `ERROR: cannot execute INSERT in a read-only transaction`

Esto es el comportamiento correcto — la réplica protege la integridad de datos.

### 2.6 Promover la réplica — opción A: script manual

```bash
bash scripts/postgres-promote-replica.sh
```

El script verifica el estado actual, pide confirmación, ejecuta `pg_promote()` y verifica el resultado.

O directamente con psql:

```bash
docker exec postgres-replica psql -U oep_user -c "SELECT pg_promote();"
```

Salida esperada: `pg_promote ----------- t`

### 2.7 Verificar que la réplica promovida acepta escrituras

```bash
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery() AS es_replica;"
```

Salida esperada: `es_replica = f` (ya no es réplica — es primario).

```bash
# Escribir en el nuevo primario
docker exec postgres-replica psql -U oep_user -d oep_oficial -c "
INSERT INTO auditoria_oficial (entidad, tipo_accion, detalle, fecha_hora)
VALUES ('CLUSTER', 'RECUPERACION_CLUSTER', 'Réplica promovida a primario por failover', now());
"
```

### 2.8 Reintegrar el primario original como standby

Después del failover, el primario original tiene un timeline WAL diferente.
Reiniciarlo sin resincronización causa **split-brain** (dos nodos creyendo ser primario).
El script `postgres-rejoin-old-primary.sh` realiza la resincronización de forma segura:

```bash
bash scripts/postgres-rejoin-old-primary.sh
```

O sin confirmación interactiva (modo automático):

```bash
bash scripts/postgres-rejoin-old-primary.sh --force
```

El script realiza:
1. Para el contenedor `postgres-primary`
2. Elimina su volumen de datos (previene split-brain)
3. Ejecuta `pg_basebackup` desde `postgres-replica` (nuevo primario)
4. Escribe `standby.signal` y `primary_conninfo` apuntando a `postgres-replica`
5. Arranca `postgres-primary` como standby del nuevo primario

Verificar que quedó como standby:

```bash
docker exec postgres-primary psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery();"
# Esperado: t

docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT application_name, client_addr, state FROM pg_stat_replication;"
# Esperado: 1 fila con state = streaming
```

> **Nota**: Después del rejoin, los hostnames quedan invertidos (postgres-primary es el standby, postgres-replica es el primario). Para recuperar la topología original: `docker compose down -v` y reiniciar desde cero.

---

## Parte 3 — Pruebas del Router PostgreSQL (postgres-router)

### 3.0 Iniciar el router

```bash
docker compose up -d postgres-router
```

### 3.1 Verificar que el router está activo

```bash
docker compose ps postgres-router
```

Ver el dashboard HAProxy (muestra estado de servidores en tiempo real):
```
http://localhost:8404/stats
```

### 3.2 Conectar al router y verificar que apunta al primario

```bash
cd scripts && npm install
node test-postgres-router.js
```

Salida esperada:
```
OK: Router is pointing to a WRITABLE PRIMARY (pg_is_in_recovery = false).
OK: Read queries work through the router
OK: Write queries work through the router
```

### 3.3 Test de failover a través del router

```bash
# 1. Verificar que las escrituras funcionan ANTES del failover
node test-postgres-router.js

# 2. Iniciar el monitor (en otra terminal)
docker compose --profile monitor up -d postgres-failover-monitor
docker logs -f postgres-failover-monitor

# 3. Simular la caída del primario
docker stop postgres-primary

# 4. Observar en el dashboard HAProxy (actualiza cada 5s):
#    http://localhost:8404/stats
#    postgres-primary: DOWN (rojo)
#    postgres-replica: UP (verde)

# 5. Esperar ~15s para la promoción automática, luego verificar:
node test-postgres-router.js
# Esperado: OK — Router is pointing to a WRITABLE PRIMARY (postgres-replica)
```

### 3.4 Comportamiento esperado por fase

| Fase | Tiempo | Estado del router | Escrituras |
|------|--------|-------------------|------------|
| Normal | — | → postgres-primary | ✓ |
| postgres-primary detenido | T+0 | → postgres-primary (aún en health check) | Fallan |
| HAProxy detecta fallo | T+6s | → postgres-replica (backup activo) | Fallan (aún standby) |
| Monitor promueve réplica | T+15s | → postgres-replica (primario) | ✓ |

> **Ventaja clave**: El backend no necesita cambiar su URL de conexión en ningún momento. Usa siempre `postgres-router:5432`.

---

## Parte 4 — Failover Automático PostgreSQL (monitor automático)

El script `scripts/postgres-failover-monitor.js` implementa un failover automático de nivel académico/demo. Detecta la caída del primario y promueve la réplica sin intervención manual.

### 3.1 Iniciar el monitor como servicio Docker Compose

```bash
# Iniciar el monitor (perfil 'monitor')
docker compose --profile monitor up -d postgres-failover-monitor

# Ver logs en tiempo real
docker logs -f postgres-failover-monitor
```

### 3.2 Iniciar el monitor manualmente (desde el host)

```bash
cd scripts && npm install
PG_REPLICA_PORT=5433 node postgres-failover-monitor.js
```

Variables de entorno opcionales:
- `CHECK_INTERVAL_MS` — intervalo de chequeo (default: 5000 ms)
- `FAILURE_THRESHOLD` — número de fallos consecutivos antes de promover (default: 3)

### 3.3 Observar el failover automático

```
# Logs esperados durante un failover:

2026-04-26T10:00:05Z [WARN ] [FAILOVER_PENDING] postgres-primary unreachable (1/3) ...
2026-04-26T10:00:10Z [WARN ] [FAILOVER_PENDING] postgres-primary unreachable (2/3) ...
2026-04-26T10:00:15Z [CRIT ] [FAILOVER_PENDING] Threshold reached after 3 consecutive failures...
2026-04-26T10:00:15Z [CRIT ] [PROMOTING] Starting automatic promotion of postgres-replica...
2026-04-26T10:00:15Z [CRIT ] [PROMOTING] Calling SELECT pg_promote() on postgres-replica...
2026-04-26T10:00:18Z [CRIT ] [PROMOTED] AUTOMATIC FAILOVER COMPLETE
2026-04-26T10:00:18Z [CRIT ] [PROMOTED] New PRIMARY: postgres-replica:5432
```

### 3.4 Test guiado completo

```bash
bash scripts/test-postgres-failover.sh
```

El script guía paso a paso: estado inicial → datos de prueba → monitor → simulación de falla → verificación → escritura en nuevo primario → instrucciones de rejoin.

### 3.5 Mecanismo anti-promoción repetida

El monitor verifica `pg_is_in_recovery()` antes de intentar cualquier promoción:
- Si ya es `false` al iniciar → entra en modo observación sin promover
- Si ya es `false` cuando se alcanza el threshold → bloquea la promoción y entra en modo observación

El monitor **nunca promueve dos veces** al mismo nodo.

### 3.6 Limitaciones del monitor automático de demo

| Limitación | Impacto | Solución en producción |
|---|---|---|
| No redirige conexiones de aplicación | El backend sigue apuntando al primario caído | HAProxy, Pgpool-II, o VIP |
| No gestiona split-brain activamente | El old primary puede arrancarse accidentalmente | `postgres-rejoin-old-primary.sh --force` |
| No reinicia el monitor si el proceso cae | El servicio `restart: unless-stopped` en Docker lo relanza | Patroni / systemd |
| Un solo nodo de failover | Solo hay 1 réplica disponible | Multiple standbys con Patroni |

---

## Checklist de Demostración

### MongoDB

| Paso | Verificación | Estado |
|------|-------------|--------|
| Cluster con 3 nodos | `rs.status()` muestra PRIMARY + 2 SECONDARY | ⬜ |
| Replicación activa | Dato en mongo1 aparece en mongo2 | ⬜ |
| Caída del PRIMARY | mongo2 o mongo3 asume PRIMARY | ⬜ |
| Escritura post-failover | Insert exitoso en nuevo PRIMARY | ⬜ |
| Resincronización | mongo1 reiniciado muestra SECONDARY | ⬜ |
| Datos sincronizados | mongo1 tiene los datos escritos en su ausencia | ⬜ |

### PostgreSQL — Automatic Failover

| Paso | Verificación | Estado |
|------|-------------|--------|
| Replicación activa | `pg_stat_replication` muestra replica conectada | ⬜ |
| Dato replicado | Insert en primario aparece en réplica (WAL) | ⬜ |
| Monitor iniciado | `docker logs postgres-failover-monitor` muestra INFO | ⬜ |
| Caída del primario | `docker stop postgres-primary` | ⬜ |
| Detección automática | Monitor muestra WARN 1/3, 2/3, 3/3 en ~15s | ⬜ |
| Promoción automática | Monitor muestra CRIT: AUTOMATIC FAILOVER COMPLETE | ⬜ |
| Verificación | `pg_is_in_recovery()` en postgres-replica retorna `f` | ⬜ |
| Escritura en nuevo primario | INSERT exitoso en postgres-replica | ⬜ |
| Rejoin del viejo primario | `bash scripts/postgres-rejoin-old-primary.sh` | ⬜ |

### PostgreSQL — Manual Failover (fallback si no hay monitor)

| Paso | Verificación | Estado |
|------|-------------|--------|
| Caída del primario | Réplica sigue respondiendo lecturas | ⬜ |
| Protección de escritura | INSERT en réplica retorna error esperado | ⬜ |
| Promoción manual | `bash scripts/postgres-promote-replica.sh` exitoso | ⬜ |
| Verificación | `pg_is_in_recovery()` retorna `f` | ⬜ |
| Escritura en nuevo primario | INSERT exitoso después de promoción | ⬜ |

---

## Notas para la Defensa

1. **¿Por qué MongoDB usa Replica Set y no un único nodo?**
   El flujo RRV necesita alta disponibilidad. Con 3 nodos, puede perder 1 y seguir operando. El quórum (mayoría de votos) garantiza que solo un nodo puede ser PRIMARY.

2. **¿Por qué el monitor de failover es "de nivel demo" y no de producción?**
   El monitor (`postgres-failover-monitor.js`) demuestra los principios correctos: detección por heartbeat, threshold de fallos consecutivos, `pg_promote()`, verificación post-promoción, y modo observación anti-re-promoción. Sin embargo, no redirige conexiones de aplicación automáticamente (requeriría HAProxy/VIP) ni gestiona múltiples réplicas. Para producción se usan Patroni, repmgr o Pgpool-II. Para este prototipo universitario, el monitor demuestra exactamente los mismos conceptos fundamentales.

3. **¿Qué garantiza la consistencia durante el failover de MongoDB?**
   El protocolo de elección de Raft garantiza que solo el candidato con el oplog más actualizado puede ganar la elección. Los datos escritos y confirmados antes de la caída del PRIMARY están garantizados en la mayoría de los nodos.

4. **¿El sistema electoral puede seguir recibiendo actas durante el failover?**
   Sí. Durante la elección de MongoDB (~10s), el driver de NestJS (Mongoose) hace retry automático de las operaciones. En PostgreSQL, la réplica sigue disponible para lectura durante toda la caída del primario.
