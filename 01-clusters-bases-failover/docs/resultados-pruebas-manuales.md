# Resultados de Pruebas Manuales — Módulo 01

## Sistema Nacional de Cómputo Electoral Bolivia

Registro de las pruebas ejecutadas manualmente. Estado final: **LISTO PARA INTEGRACIÓN / LISTO PARA DEMO**.

---

## Resumen ejecutivo

| Componente | Estado |
|-----------|--------|
| MongoDB Replica Set | ✅ APROBADO |
| MongoDB colecciones e índices | ✅ APROBADO |
| MongoDB seed data | ✅ APROBADO |
| MongoDB failover automático | ✅ APROBADO |
| PostgreSQL primary | ✅ APROBADO |
| PostgreSQL replica (replicación WAL) | ✅ APROBADO (con corrección de encoding) |
| PostgreSQL router (HAProxy) | ✅ APROBADO |
| PostgreSQL failover automático | ✅ APROBADO |
| Health check | ✅ APROBADO (con corrección de hosts) |
| Backup scripts | ✅ APROBADO |

---

## Prueba 1: MongoDB Replica Set

### Proceso
1. `docker compose up -d mongo1 mongo2 mongo3`
2. Esperar ~40s
3. `docker compose run --rm mongo-init`

### Resultado

```
[INFO] rs.initiate() OK. Waiting for PRIMARY election...
[OK] PRIMARY elected after 4s.
  mongo1:27017 → PRIMARY
  mongo2:27017 → SECONDARY
  mongo3:27017 → SECONDARY
```

**Estado:** ✅ Replica Set rs0 inicializado correctamente. mongo1 elegido como PRIMARY.

---

## Prueba 2: Colecciones, índices y seed MongoDB

### Proceso
```bash
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/indexes.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-authorized-sms.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-actas.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-results.js
```

### Resultado

| Colección | Documentos |
|-----------|-----------|
| rrv_actas | 5 (PUBLICADA, VALIDADA, SOSPECHOSA, RECHAZADA, RECIBIDA) |
| rrv_sms | 5 (2 VALIDO, 1 SOSPECHOSO, 1 INVALIDO, 1 DUPLICADO) |
| sms_numeros_autorizados | 10 (9 activos, 1 inactivo) |
| rrv_resultados_preliminares | 4 (OCR × 3, SMS × 1) |
| rrv_eventos | 8 |
| rrv_logs | 6 |

**Estado:** ✅ Todos los documentos insertados correctamente.

**Verificaciones adicionales:**
- Acta SOSPECHOSA (ACTA-RRV-003): OCR extrajo `votosValidos=255` pero `P1+P2+P3+P4=250`. El sistema preservó el valor OCR sin corregirlo y marcó el acta como SOSPECHOSA. ✅
- SMS no autorizado (SMS-004, número +59171999999): rechazado con estado INVALIDO. No existe campo `token` en ningún documento. ✅
- SMS duplicado (SMS-005): guardado con estado DUPLICADO (no sobreescribe SMS-001). ✅

---

## Prueba 3: Failover MongoDB

### Proceso
```bash
docker stop mongo1
# Esperar ~15s
docker exec mongo2 mongosh --quiet --eval "rs.isMaster().ismaster"
docker exec mongo2 mongosh "mongodb://mongo2:27017/oep_rrv?replicaSet=rs0" \
  --eval "db.rrv_cluster_status.insertOne({test: 'mongo-failover', ts: new Date()})"
docker start mongo1
sleep 15
docker exec mongo1 mongosh --quiet --eval "rs.isMaster().ismaster"
```

### Resultado
- Falla de mongo1: ✅ detectada
- Elección de nuevo PRIMARY (mongo2): ✅ completada en ~12s
- Escritura en nuevo PRIMARY: ✅ exitosa
- Reincorporación de mongo1 como SECONDARY: ✅ automática
- Datos sincronizados después de reincorporación: ✅

**Estado:** ✅ Failover MongoDB aprobado.

---

## Prueba 4: PostgreSQL primary + replica

### Proceso
```bash
docker compose up -d postgres-primary
# Esperar ~45s (healthcheck)
docker compose up -d postgres-replica
```

### Problema encontrado: encoding CRLF en replica-setup.sh

`postgres-replica` falló al iniciar con error en bash. El archivo `postgres/replica-setup.sh` fue guardado con codificación Windows (CRLF / BOM), lo que hizo que bash lo tratara como una sola línea inválida.

**Corrección aplicada:**
```bash
sed -i 's/\r$//' postgres/replica-setup.sh
docker compose rm -f postgres-replica
docker compose up -d postgres-replica
```

### Resultado después de la corrección
- pg_basebackup ejecutado correctamente desde postgres-primary
- `pg_is_in_recovery()` en postgres-replica: `t` ✅
- `pg_stat_replication` en postgres-primary: 1 fila con `state=streaming` ✅
- Lag de replicación: <100ms ✅

**Estado:** ✅ Replicación PostgreSQL activa (con corrección de encoding).

---

## Prueba 5: PostgreSQL Router (HAProxy)

### Proceso
```bash
docker compose up -d postgres-router
cd scripts && node test-postgres-router.js && cd ..
```

### Resultado

```
Step 1 — Connect to postgres-router
  OK: Connection established through postgres-router

Step 2 — Identify backend node and primary/standby state
  Backend IP   : 172.28.0.X
  pg_is_in_recovery(): false
  OK: Router is pointing to a WRITABLE PRIMARY

Step 3 — Read test
  mesas        : 10 rows
  partidos     : 4 rows
  departamentos: 9 rows
  OK: Read queries work through the router

Step 4 — Write test
  OK: Write succeeded.

Step 5 — Replication status
  Standby: replica1 | 172.28.0.X | streaming | lag: 0 bytes
  OK: Replication stream active

RESULT: PASS — router connected to writable primary
```

**Estado:** ✅ Router HAProxy funcionando correctamente antes del failover.

---

## Prueba 6: Failover PostgreSQL automático

### Proceso
```bash
docker compose --profile monitor up -d postgres-failover-monitor
docker stop postgres-primary
# Observar logs del monitor
docker logs -f postgres-failover-monitor
```

### Logs del monitor observados
```
INFO  [MONITORING] Initial state — monitoring postgres-primary every 5000ms
WARN  [FAILOVER_PENDING] postgres-primary unreachable (1/3)
WARN  [FAILOVER_PENDING] postgres-primary unreachable (2/3)
WARN  [FAILOVER_PENDING] postgres-primary unreachable (3/3)
CRIT  [PROMOTING] Threshold reached after 3 consecutive failures. Checking replica...
CRIT  [PROMOTING] Calling SELECT pg_promote() on postgres-replica...
CRIT  [PROMOTED] ═══════════════════════════════════════════════════
CRIT  [PROMOTED]   AUTOMATIC FAILOVER COMPLETE
CRIT  [PROMOTED]   New PRIMARY: postgres-replica:5432
CRIT  [PROMOTED]   Promoted at: 2026-XX-XXTXX:XX:XX.XXXZ
```

### Verificación post-failover
```bash
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery();"
```
**Resultado:** `f` ✅ (postgres-replica es ahora PRIMARY)

```bash
cd scripts && node test-postgres-router.js && cd ..
```
**Resultado:** `PASS — router connected to writable primary` ✅

**Nota sobre replicación post-failover:** No había standbys conectados porque postgres-primary estaba detenido. Esto es comportamiento esperado.

**Estado:** ✅ Failover PostgreSQL automático aprobado. Tiempo total: ~21s.

---

## Prueba 7: Health check

### Primer intento (fallido)
```bash
cd scripts && node health-check.js
```

**Error:**
```
MongoServerSelectionError: getaddrinfo ENOTFOUND mongo1
```

**Causa:** El health-check se ejecutó desde Windows y los nombres de contenedores Docker (`mongo1`, `mongo2`, `mongo3`) no resuelven en la red del host.

### Corrección aplicada

Se agregó al archivo `C:\Windows\System32\drivers\etc\hosts` (como administrador):
```
127.0.0.1 mongo1
127.0.0.1 mongo2
127.0.0.1 mongo3
```

### Resultado después de la corrección
```json
{
  "success": true,
  "status": "OK",
  "services": { "nosql": "OK", "relacional": "OK" },
  "details": {
    "mongodb": { "status": "OK", "replicaSet": "rs0", "primary": "mongo1:27017" },
    "postgresql": {
      "primary": { "status": "OK", "isReplica": false },
      "replica":  { "status": "OK", "isReplica": true, "replicationLagMs": 0 }
    }
  }
}
```

**Estado:** ✅ Health check aprobado (con corrección de hosts en Windows).

---

## Prueba 8: npm bloqueado en PowerShell

### Error
```
npm: The term 'npm' is not recognized as the name of a cmdlet...
```
O bien: error de política de ejecución en PowerShell.

### Corrección aplicada
```powershell
cd scripts
npm.cmd install
cd ..
```

**Estado:** ✅ Dependencias instaladas correctamente con `npm.cmd`.

---

## Errores encontrados y correcciones aplicadas

| # | Error | Causa | Corrección |
|---|-------|-------|-----------|
| 1 | `postgres-replica` no arranca | CRLF/BOM en `replica-setup.sh` (Windows) | `sed -i 's/\r$//' postgres/replica-setup.sh` |
| 2 | `health-check.js` falla con `ENOTFOUND mongo1` | Hostnames Docker no resuelven en Windows | Agregar mongo1/2/3 al `hosts` file como admin |
| 3 | `npm` bloqueado en PowerShell | Política de ejecución de Windows | Usar `npm.cmd install` |
| 4 | Scripts de test: `observaciones` inválido | Typo en columna (debe ser `observacion`) | Corregido en `test-postgres-router.js` y `test-postgres-failover.sh` |
| 5 | Scripts de test: `ON CONFLICT (motor, nodo)` | No existe índice único en cluster_status | Reemplazado por INSERT simple |

---

## Estado final

| Módulo | Estado |
|--------|--------|
| **MongoDB Replica Set** | ✅ LISTO PARA INTEGRACIÓN |
| **PostgreSQL primary/replica** | ✅ LISTO PARA INTEGRACIÓN |
| **PostgreSQL Router (HAProxy)** | ✅ LISTO PARA INTEGRACIÓN |
| **Monitor de failover** | ✅ LISTO PARA DEMO |
| **Health check** | ✅ LISTO (requiere hosts fix en Windows) |
| **Scripts de backup** | ✅ LISTOS |
| **Documentación** | ✅ COMPLETA |

**Conclusión:** El módulo 01 está **listo para integración con los backends** (módulos 02 y 03) y **listo para la demo en clase**.
