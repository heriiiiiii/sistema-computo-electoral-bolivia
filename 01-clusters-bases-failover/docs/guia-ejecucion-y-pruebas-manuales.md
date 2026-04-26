# Guía de Ejecución y Pruebas Manuales — Módulo 01

## Sistema Nacional de Cómputo Electoral Bolivia

Esta guía documenta el proceso completo de inicio, configuración y prueba del módulo, basado en las pruebas reales ejecutadas. Incluye todos los problemas encontrados y sus soluciones.

---

## Prerequisitos

| Herramienta | Versión mínima | Verificar |
|-------------|----------------|-----------|
| Docker Desktop | 24+ | `docker --version` |
| Docker Compose | 2.20+ | `docker compose version` |
| Node.js | 18+ | `node --version` |
| Git Bash o WSL | — | Para scripts `.sh` en Windows |

> **Windows:** Docker Desktop debe estar en modo Linux containers.

---

## Paso 0 — Navegar al módulo

```bash
cd sistema-computo-electoral-bolivia/01-clusters-bases-failover
```

---

## Paso 1 — Reset limpio (opcional pero recomendado antes de la demo)

Para asegurarse de partir de un estado limpio:

```bash
# Si el monitor de failover fue usado anteriormente (recomendado):
docker compose --profile monitor down -v --remove-orphans

# Si solo se usaron los servicios base:
docker compose down -v
```

> `down -v` elimina los contenedores **y los volúmenes de datos**. Todo se recrea desde cero.
> `down` sin `-v` mantiene los volúmenes (los datos persisten).
> `--remove-orphans` elimina contenedores huérfanos del perfil `monitor` para evitar conflictos de red.

---

## Paso 2 — Corregir fin de línea de scripts `.sh` (solo Windows)

En Windows, Git puede agregar caracteres CRLF (`\r\n`) a los scripts bash, lo que los rompe dentro del contenedor Linux. Ejecutar **antes del primer inicio**:

**Opción A — Git Bash:**
```bash
sed -i 's/\r$//' postgres/replica-setup.sh scripts/*.sh
```

**Opción B — PowerShell:**
```powershell
(Get-Content postgres\replica-setup.sh -Raw) -replace "`r`n", "`n" | Set-Content postgres\replica-setup.sh -NoNewline
```

**Opción C — dos2unix (si está instalado):**
```bash
dos2unix postgres/replica-setup.sh scripts/*.sh
```

> **Síntoma si no se corrige:** `postgres-replica` falla al iniciar con errores como `/bin/bash^M: bad interpreter` o el script aparece como una sola línea en los logs.

---

## Paso 3 — Iniciar MongoDB y PostgreSQL Primary

```bash
docker compose up -d mongo1 mongo2 mongo3 postgres-primary
```

Esperar ~40 segundos para que los contenedores sean `healthy`.

```bash
# Verificar estado
docker compose ps
```

Todos deben mostrar estado `healthy` (no `starting`).

---

## Paso 4 — Inicializar el Replica Set MongoDB

```bash
docker compose run --rm mongo-init
```

**Salida esperada:**
```
[INFO] rs.initiate() OK. Waiting for PRIMARY election...
[OK] PRIMARY elected after Xs.
  mongo1:27017 → PRIMARY
  mongo2:27017 → SECONDARY
  mongo3:27017 → SECONDARY
```

> Este comando es idempotente. Si el replica set ya está inicializado, muestra el estado actual y sale sin errores.

---

## Paso 5 — Crear colecciones MongoDB con validadores

**Opción A — docker exec (requiere que mongo1 esté corriendo):**
```bash
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js
```

**Opción B — docker run (contenedor temporal, scripts montados desde el host):**
```powershell
# PowerShell (desde el directorio del módulo):
docker run --rm --network 01-clusters-bases-failover_oep-network `
  -v "${PWD}\mongo:/scripts" mongo:7 `
  mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js
```

**Salida esperada:**
```
[OK] Created collection: rrv_actas
[OK] Created collection: rrv_sms
[OK] Created collection: sms_numeros_autorizados
[OK] Created collection: rrv_resultados_preliminares
[OK] Created collection: rrv_eventos
[OK] Created collection: rrv_logs
[OK] Created collection: rrv_cluster_status
```

---

## Paso 6 — Crear índices MongoDB

```bash
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/indexes.js
```

**Salida esperada:** `[OK] rrv_actas indexes created.` para cada colección.

---

## Paso 7 — Cargar seed de números SMS autorizados

```bash
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-authorized-sms.js
```

**Resultado esperado:** 10 documentos insertados (9 activos, 1 inactivo).

---

## Paso 8 — Cargar seed de actas RRV de muestra

```bash
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-actas.js
```

**Resultado esperado:** 5 actas insertadas:
- ACTA-RRV-001 → PUBLICADA
- ACTA-RRV-002 → VALIDADA
- ACTA-RRV-003 → SOSPECHOSA (OCR inconsistente, datos OCR preservados sin corrección)
- ACTA-RRV-004 → RECHAZADA
- ACTA-RRV-005 → RECIBIDA

---

## Paso 9 — Cargar seed de SMS, resultados, eventos y logs

```bash
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-results.js
```

**Resultado esperado:**
- 5 SMS (2 VALIDO, 1 SOSPECHOSO, 1 INVALIDO, 1 DUPLICADO)
- 4 resultados preliminares (OCR + SMS)
- 8 eventos
- 6 logs

---

## Paso 10 — Iniciar la réplica PostgreSQL

```bash
docker compose up -d postgres-replica
```

La réplica ejecuta `pg_basebackup` automáticamente en el primer inicio. Puede tardar 30-60 segundos dependiendo del tamaño de la base de datos.

```bash
# Verificar que la réplica está en modo standby
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery();"
# Resultado esperado: t
```

### Solución si replica-setup.sh falla (problema de encoding Windows)

Si `postgres-replica` falla con errores de bash o se ve el script como una sola línea larga en los logs:

```bash
# El problema: replica-setup.sh fue guardado con CRLF o BOM Windows

# Solución desde Git Bash:
sed -i 's/\r$//' postgres/replica-setup.sh

# Verificar que el fix funcionó:
file postgres/replica-setup.sh
# Resultado esperado: "ASCII text executable" (no "CRLF line terminators")

# Recrear el contenedor:
docker compose rm -f postgres-replica
docker volume rm 01-clusters-bases-failover_postgres_replica_data 2>/dev/null || true
docker compose up -d postgres-replica
```

---

## Paso 11 — Iniciar el router HAProxy

```bash
docker compose up -d postgres-router
```

Verificar:
```bash
docker compose ps postgres-router
```
Estado esperado: `healthy`.

Dashboard HAProxy: `http://localhost:8404/stats`

---

## Paso 12 — Instalar dependencias Node.js

```bash
cd scripts
npm install
cd ..
```

### Solución si npm está bloqueado por PowerShell (Windows)

PowerShell puede bloquear `npm` con error de política de ejecución:

```powershell
# Opción A — usar npm.cmd explícitamente:
cd scripts
npm.cmd install
cd ..

# Opción B — cambiar política de ejecución temporalmente:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
npm install
```

---

## Paso 13 — Solución para health-check en Windows (hosts file)

El health-check conecta a MongoDB usando los nombres internos de los contenedores (`mongo1`, `mongo2`, `mongo3`). En Windows, estos nombres no resuelven por defecto.

**Síntoma:** `health-check.js` falla con `getaddrinfo ENOTFOUND mongo1`.

**Solución:** Abrir `C:\Windows\System32\drivers\etc\hosts` **como administrador** y agregar:

```
127.0.0.1 mongo1
127.0.0.1 mongo2
127.0.0.1 mongo3
```

**Comando PowerShell (como administrador):**
```powershell
Add-Content -Path "C:\Windows\System32\drivers\etc\hosts" -Value "`n127.0.0.1 mongo1`n127.0.0.1 mongo2`n127.0.0.1 mongo3"
```

---

## Paso 14 — Ejecutar health check

```bash
cd scripts && node health-check.js && cd ..
```

**Resultado esperado:**
```json
{
  "success": true,
  "status": "OK",
  "services": { "nosql": "OK", "relacional": "OK" }
}
```

---

## Paso 15 — Probar el router PostgreSQL

```bash
cd scripts && node test-postgres-router.js && cd ..
```

**Resultado esperado:**
```
RESULT: PASS — router connected to writable primary
```

---

## Prueba de failover MongoDB

### Simular falla del PRIMARY

```bash
# 1. Verificar estado inicial
docker exec mongo1 mongosh --quiet --eval "rs.isMaster().ismaster"
# Resultado esperado: true (mongo1 es PRIMARY)

# 2. Detener el PRIMARY
docker stop mongo1

# 3. Esperar ~15s y verificar elección del nuevo PRIMARY
docker exec mongo2 mongosh --quiet --eval "rs.isMaster().ismaster"
# Resultado esperado: true (mongo2 es ahora PRIMARY)

# 4. Verificar escritura en el nuevo PRIMARY
docker exec mongo2 mongosh "mongodb://mongo2:27017/oep_rrv?replicaSet=rs0" \
  --quiet --eval "
    db.rrv_cluster_status.insertOne({test: 'failover-mongo', ts: new Date()});
    print('Escritura exitosa');"

# 5. Restaurar mongo1 (se reincorpora como SECONDARY automáticamente)
docker start mongo1
sleep 15
docker exec mongo1 mongosh --quiet --eval "rs.isMaster().ismaster"
# Resultado esperado: false (mongo1 es SECONDARY)
```

---

## Prueba de failover PostgreSQL automático

### Con el monitor automático (recomendado)

```bash
# 1. Verificar estado inicial
docker exec postgres-primary psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery();"
# Resultado esperado: f

docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery();"
# Resultado esperado: t

# 2. Verificar replicación activa
docker exec postgres-primary psql -U oep_user -d oep_oficial \
  -c "SELECT client_addr, application_name, state FROM pg_stat_replication;"
# Resultado esperado: 1 fila con state=streaming

# 3. Iniciar el monitor
docker compose --profile monitor up -d postgres-failover-monitor

# 4. Abrir los logs del monitor en otra terminal
docker logs -f postgres-failover-monitor

# 5. Detener el PRIMARY
docker stop postgres-primary

# 6. Observar los logs del monitor (en la otra terminal):
#    WARN: postgres-primary unreachable (1/3)
#    WARN: postgres-primary unreachable (2/3)
#    WARN: postgres-primary unreachable (3/3)
#    CRIT: Threshold reached...
#    CRIT: AUTOMATIC FAILOVER COMPLETE — New PRIMARY: postgres-replica:5432

# 7. Verificar promoción (~15s después)
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT pg_is_in_recovery();"
# Resultado esperado: f

# 8. Probar escritura en el nuevo PRIMARY
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "INSERT INTO cluster_status (cluster_nombre, motor, nodo, rol, estado, observacion)
      VALUES ('oep-postgresql', 'POSTGRESQL', 'post-failover-test', 'PRIMARY', 'ACTIVO',
              'Escritura post-failover exitosa');"
# Resultado esperado: INSERT 0 1

# 9. Verificar el router después del failover
cd scripts && node test-postgres-router.js && cd ..
# Resultado esperado: PASS — router connected to writable primary
```

### Script guiado completo

```bash
# Script interactivo con pasos guiados:
bash scripts/test-postgres-failover.sh
```

---

## Recuperación después del failover PostgreSQL

### Opción A — Reset completo (recomendado para demo)

```bash
docker compose down -v
docker compose up -d mongo1 mongo2 mongo3 postgres-primary
# Esperar ~40s
docker compose run --rm mongo-init
# Volver a ejecutar seed MongoDB (Pasos 5-9)
docker compose up -d postgres-replica postgres-router
```

### Opción B — Rejoin del primary antiguo como standby

```bash
# Solo si postgres-replica está corriendo como PRIMARY (pg_is_in_recovery() = f)
bash scripts/postgres-rejoin-old-primary.sh --force
```

El script:
1. Detiene postgres-primary
2. Destruye su volumen de datos
3. Ejecuta `pg_basebackup` desde postgres-replica
4. Configura postgres-primary como standby
5. Inicia postgres-primary en modo recuperación

> **Advertencia:** Después del rejoin, los hostnames quedan **invertidos**: `postgres-primary` es el standby y `postgres-replica` es el primary. Para restaurar la topología original, usar la Opción A.

---

## Reset completo del entorno

```bash
docker compose down -v
docker compose up -d mongo1 mongo2 mongo3 postgres-primary
# Esperar ~40s
docker compose run --rm mongo-init
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/indexes.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-authorized-sms.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-actas.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-results.js
docker compose up -d postgres-replica postgres-router
cd scripts && node health-check.js && cd ..
```
