# Comandos Rápidos — Módulo 01

## Sistema Nacional de Cómputo Electoral Bolivia

Chuleta de comandos para operación diaria. Todos los comandos se ejecutan desde el directorio `01-clusters-bases-failover/`.

---

## Inicio limpio del entorno

```bash
# Con monitor de failover activo (recomendado si se usó anteriormente):
docker compose --profile monitor down -v --remove-orphans

# Sin monitor:
docker compose down -v
```

---

## Iniciar servicios

```bash
# MongoDB + PostgreSQL primary
docker compose up -d mongo1 mongo2 mongo3 postgres-primary

# PostgreSQL replica (después de ~40s)
docker compose up -d postgres-replica

# HAProxy router
docker compose up -d postgres-router

# Monitor de failover automático (opt-in)
docker compose --profile monitor up -d postgres-failover-monitor

# Todo junto (después de inicializar MongoDB)
docker compose up -d
```

---

## Inicializar MongoDB Replica Set

```bash
# Ejecutar después de que mongo1/2/3 estén healthy (~40s)
docker compose run --rm mongo-init
```

---

## Seed MongoDB

```bash
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/indexes.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-authorized-sms.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-actas.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-results.js
```

---

## Instalar dependencias Node.js

```bash
cd scripts && npm install && cd ..

# Si npm está bloqueado en PowerShell:
cd scripts
npm.cmd install
cd ..
```

---

## Health check

```bash
cd scripts && node health-check.js && cd ..
```

---

## Test del router PostgreSQL

```bash
cd scripts && node test-postgres-router.js && cd ..
```

---

## Estado del cluster MongoDB

```bash
# Estado del replica set
docker exec mongo1 mongosh --quiet --eval "rs.status().members.forEach(m => print(m.name, '->', m.stateStr))"

# ¿Quién es el PRIMARY?
docker exec mongo1 mongosh --quiet --eval "rs.isMaster().primary"

# Contar documentos por colección
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" --quiet \
  --eval "['rrv_actas','rrv_sms','sms_numeros_autorizados','rrv_resultados_preliminares','rrv_eventos','rrv_logs'].forEach(c => print(c+':', db[c].countDocuments()))"
```

---

## Estado del cluster PostgreSQL

```bash
# ¿Es primary o standby?
docker exec postgres-primary psql -U oep_user -d oep_oficial -c "SELECT pg_is_in_recovery();"
docker exec postgres-replica psql -U oep_user -d oep_oficial -c "SELECT pg_is_in_recovery();"

# Replicación activa (desde el primary)
docker exec postgres-primary psql -U oep_user -d oep_oficial \
  -c "SELECT client_addr, application_name, state, sync_state FROM pg_stat_replication;"

# Lag de replicación (desde la réplica)
docker exec postgres-replica psql -U oep_user -d oep_oficial \
  -c "SELECT now() - pg_last_xact_replay_timestamp() AS lag;"
```

---

## HAProxy stats

```
http://localhost:8404/stats
```

---

## Failover MongoDB

```bash
docker stop mongo1
# Esperar ~15s
docker exec mongo2 mongosh --quiet --eval "rs.isMaster().ismaster"
# Restaurar:
docker start mongo1
```

---

## Failover PostgreSQL — automático

```bash
# 1. Iniciar monitor
docker compose --profile monitor up -d postgres-failover-monitor
docker logs -f postgres-failover-monitor &

# 2. Simular falla
docker stop postgres-primary

# 3. Verificar promoción (~15s)
docker exec postgres-replica psql -U oep_user -d oep_oficial -c "SELECT pg_is_in_recovery();"
# Resultado esperado: f
```

---

## Failover PostgreSQL — manual

```bash
bash scripts/postgres-promote-replica.sh
```

---

## Rejoin del primary antiguo

```bash
bash scripts/postgres-rejoin-old-primary.sh --force
```

---

## Script de failover guiado

```bash
bash scripts/test-postgres-failover.sh
```

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

---

## Backup MongoDB

```bash
bash scripts/backup-mongo.sh
# Resultado: ./mongo/backups/YYYY-MM-DD_HH-MM-SS/
```

---

## Backup PostgreSQL

```bash
bash scripts/backup-postgres.sh
# Resultado: ./postgres/backups/YYYY-MM-DD_HH-MM-SS.dump
```

---

## Fix CRLF en Windows

```bash
# Git Bash:
sed -i 's/\r$//' postgres/replica-setup.sh scripts/*.sh

# PowerShell:
(Get-Content postgres\replica-setup.sh -Raw) -replace "`r`n", "`n" | Set-Content postgres\replica-setup.sh -NoNewline
```

---

## Fix hosts file en Windows (para health-check MongoDB)

Abrir `C:\Windows\System32\drivers\etc\hosts` como administrador y agregar:

```
127.0.0.1 mongo1
127.0.0.1 mongo2
127.0.0.1 mongo3
```

```powershell
# PowerShell como administrador:
Add-Content -Path "C:\Windows\System32\drivers\etc\hosts" -Value "`n127.0.0.1 mongo1`n127.0.0.1 mongo2`n127.0.0.1 mongo3"
```

---

## Logs de contenedores

```bash
docker logs -f postgres-failover-monitor
docker logs -f postgres-primary
docker logs -f postgres-replica
docker logs -f postgres-router
docker logs -f mongo1
```

---

## Verificar todos los contenedores

```bash
docker compose ps
```
