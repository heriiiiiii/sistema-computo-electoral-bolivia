# Guía de Inicio — Módulo 01 Clusters y Bases de Datos

## Sistema Nacional de Cómputo Electoral Bolivia

---

## Requisitos Previos

| Requisito      | Versión mínima | Verificar con           |
|----------------|----------------|-------------------------|
| Docker Desktop | 24+            | `docker --version`      |
| Docker Compose | 2.20+          | `docker compose version`|
| Node.js        | 18+            | `node --version`        |
| Git Bash / WSL | —              | Para scripts `.sh`      |

> **Windows**: asegúrate de que Docker Desktop esté corriendo y en modo Linux containers.

---

## Paso 1 — Clonar y navegar al módulo

```bash
cd sistema-computo-electoral-bolivia/01-clusters-bases-failover
```

---

## Paso 2 — Copiar variables de entorno

```bash
# Windows PowerShell
Copy-Item .env.example .env

# Git Bash / Linux
cp .env.example .env
```

Los valores por defecto del `.env.example` funcionan directamente con el `docker-compose.yml`.

---

## Paso 3 — Corregir fin de línea del script de réplica (solo Windows)

El archivo `postgres/replica-setup.sh` debe tener saltos de línea Unix (LF).
Si usas Git en Windows puede haberse convertido a CRLF.

```bash
# Opción A — con Git Bash
sed -i 's/\r$//' postgres/replica-setup.sh

# Opción B — con dos2unix (si está instalado)
dos2unix postgres/replica-setup.sh

# Opción C — en PowerShell
(Get-Content postgres/replica-setup.sh -Raw) -replace "`r`n", "`n" | Set-Content postgres/replica-setup.sh -NoNewline
```

---

## Paso 4 — Iniciar los nodos de base de datos

Primero inicia solo MongoDB y el primario de PostgreSQL. Espera que estén saludables antes de continuar.

```bash
docker compose up -d mongo1 mongo2 mongo3 postgres-primary
```

Espera ~30-40 segundos para que los contenedores estén listos.

```bash
# Verificar que todos están saludables
docker compose ps
```

Todos deben mostrar estado `healthy` (no `starting`).

---

## Paso 5 — Inicializar el Replica Set de MongoDB

```bash
docker compose run --rm mongo-init
```

Deberías ver:

```
[OK] PRIMARY elected after Xs.
  mongo1:27017 → PRIMARY
  mongo2:27017 → SECONDARY
  mongo3:27017 → SECONDARY
```

> Este comando es idempotente. Si el replica set ya está inicializado, imprime el estado actual y sale sin errores.

---

## Paso 6 — Crear colecciones e índices en MongoDB

```bash
# Crear las 7 colecciones con validadores
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js

# Crear los índices recomendados
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/indexes.js
```

---

## Paso 7 — Cargar seed data en MongoDB

```bash
# Números de teléfono autorizados para SMS
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-authorized-sms.js

# 5 actas de muestra (PUBLICADA, VALIDADA, SOSPECHOSA, RECHAZADA, RECIBIDA)
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-actas.js

# SMS, resultados preliminares, eventos y logs
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-results.js
```

---

## Paso 8 — Iniciar la réplica de PostgreSQL

```bash
docker compose up -d postgres-replica
```

La réplica correrá `pg_basebackup` automáticamente en su primer inicio.
Espera ~60 segundos para que termine.

```bash
docker compose logs postgres-replica
```

Deberías ver:

```
[REPLICA] pg_basebackup complete.
[REPLICA] Starting PostgreSQL (hot standby on)...
```

---

## Paso 9 — Instalar dependencias de los scripts

```bash
cd scripts
npm install
cd ..
```

---

## Paso 10 — Verificar conectividad

```bash
# Test MongoDB
cd scripts && node test-mongo-connection.js && cd ..

# Test PostgreSQL (primario + réplica)
cd scripts && node test-postgres-connection.js && cd ..

# Health check completo
cd scripts && node health-check.js && cd ..
```

---

## Resumen de comandos para inicio completo

```bash
# Primer inicio (secuencial)
docker compose up -d mongo1 mongo2 mongo3 postgres-primary
# esperar ~40s
docker compose run --rm mongo-init
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/indexes.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-authorized-sms.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-actas.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-results.js
docker compose up -d postgres-replica
# esperar ~60s
cd scripts && npm install && node health-check.js && cd ..
```

---

## Reset completo (borra todos los datos)

```bash
docker compose down -v
# Luego volver al Paso 4
```

---

## Puertos expuestos

| Servicio           | Puerto host | Puerto contenedor |
|--------------------|-------------|-------------------|
| MongoDB node 1     | 27017       | 27017             |
| MongoDB node 2     | 27018       | 27017             |
| MongoDB node 3     | 27019       | 27017             |
| PostgreSQL primary | 5432        | 5432              |
| PostgreSQL replica | 5433        | 5432              |

---

## Conexión desde herramientas externas

**MongoDB Compass:**
```
mongodb://localhost:27017,localhost:27018,localhost:27019/oep_rrv?replicaSet=rs0
```

**pgAdmin / DBeaver (Primary):**
```
Host: localhost  Port: 5432  Database: oep_oficial  User: oep_user  Password: oep_password
```

**pgAdmin / DBeaver (Replica - read-only):**
```
Host: localhost  Port: 5433  Database: oep_oficial  User: oep_user  Password: oep_password
```

---

## Comandos de verificación rápida

```bash
# Estado del replica set MongoDB
mongosh "mongodb://localhost:27017?replicaSet=rs0" --eval "rs.status().members.map(m => m.name + ' → ' + m.stateStr)"

# Verificar réplica PostgreSQL
docker exec postgres-primary psql -U oep_user -d oep_oficial \
  -c "SELECT client_addr, state FROM pg_stat_replication;"

# Ver conteo de colecciones MongoDB
mongosh "mongodb://localhost:27017/oep_rrv?replicaSet=rs0" \
  --eval "db.getCollectionNames().forEach(c => print(c + ': ' + db[c].countDocuments()))"

# Ver tablas PostgreSQL
docker exec postgres-primary psql -U oep_user -d oep_oficial -c "\dt"
```
