# Módulo 01 — Clusters, Bases de Datos y Tolerancia a Fallos

## Sistema Nacional de Cómputo Electoral Bolivia

---

## ¿Qué hace este módulo?

Este módulo provee toda la **infraestructura de base de datos** para el sistema electoral distribuido.
Implementa dos clusters independientes y tolerantes a fallos:

| Cluster | Tecnología | Flujo |
|---------|-----------|-------|
| MongoDB Replica Set (3 nodos) | MongoDB 7 | Flujo rápido RRV / TREP |
| PostgreSQL Primary + Replica + Router | PostgreSQL 16 + HAProxy 2.8 | Flujo oficial |

---

## Arquitectura general

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│  Backend RRV (Módulo 02)        │     │  Backend Oficial (Módulo 03)    │
│  NestJS + Mongoose              │     │  NestJS + TypeORM               │
└──────────────┬──────────────────┘     └──────────────┬──────────────────┘
               │ escritura/lectura                      │ escritura (via router)
               ▼                                        ▼
┌──────────────────────────────────┐   ┌────────────────────────────────────┐
│  MongoDB Replica Set (rs0)       │   │  postgres-router:5432 (HAProxy)    │
│  mongo1:27017  PRIMARY           │   │    │                               │
│  mongo2:27017  SECONDARY         │   │    ├─► postgres-primary:5432       │
│  mongo3:27017  SECONDARY         │   │    └─► postgres-replica:5432       │
│  Base de datos: oep_rrv          │   │  Base de datos: oep_oficial        │
└──────────────────────────────────┘   └────────────────────────────────────┘
```

El dashboard (Módulo 04) **no conecta directamente** a ninguna base de datos. Solo consume endpoints de los backends.

---

## Servicios incluidos

| Servicio | Puerto host | Descripción |
|----------|------------|-------------|
| `mongo1` | 27017 | Nodo MongoDB PRIMARY |
| `mongo2` | 27018 | Nodo MongoDB SECONDARY |
| `mongo3` | 27019 | Nodo MongoDB SECONDARY |
| `postgres-primary` | 5432 | PostgreSQL PRIMARY (escritura + lectura) |
| `postgres-replica` | 5433 | PostgreSQL STANDBY (solo lectura, hot standby) |
| `postgres-router` | 5434 | HAProxy — endpoint estable, enruta al PRIMARY actual |
| HAProxy stats | 8404 | Dashboard de monitoreo HAProxy |
| `postgres-failover-monitor` | — | Monitor automático de failover (perfil: `monitor`) |

---

## Estructura del módulo

```
01-clusters-bases-failover/
├── README.md                              ← Este archivo
├── docker-compose.yml
├── .env.example
│
├── mongo/
│   ├── init-replica.js                    ← Inicializa rs0 (idempotente)
│   ├── collections.js                     ← 7 colecciones con validadores
│   ├── indexes.js                         ← Índices recomendados
│   └── seed/
│       ├── seed-authorized-sms.js         ← 10 números autorizados
│       ├── seed-rrv-sample-actas.js       ← 5 actas (todos los estados)
│       └── seed-rrv-sample-results.js     ← SMS, resultados, eventos, logs
│
├── postgres/
│   ├── primary-hba.conf                   ← pg_hba.conf personalizado
│   ├── replica-setup.sh                   ← Entrypoint de la réplica
│   ├── haproxy/
│   │   └── haproxy.cfg                    ← Configuración HAProxy
│   ├── init/                              ← Scripts que corren en primer inicio
│   │   ├── 00-create-replication-user.sql
│   │   ├── 01-schema.sql                  ← 16 tablas
│   │   ├── 02-indexes.sql
│   │   ├── 03-seed-territorial.sql        ← Departamentos, provincias, municipios de Bolivia
│   │   ├── 04-seed-parties-candidates.sql ← P1-P4 y candidatos
│   │   └── 05-seed-demo-official.sql      ← Recintos, mesas, actas, resultados, auditoría
│   ├── replication/
│   │   └── README.md                      ← Guía técnica de replicación
│   └── backups/                           ← Salida de pg_dump
│
├── scripts/
│   ├── package.json
│   ├── health-check.js
│   ├── test-mongo-connection.js
│   ├── test-postgres-connection.js
│   ├── postgres-failover-monitor.js
│   ├── test-postgres-router.js
│   ├── postgres-promote-replica.sh
│   ├── postgres-rejoin-old-primary.sh
│   ├── test-postgres-failover.sh
│   ├── backup-mongo.sh
│   ├── backup-postgres.sh
│   ├── restore-mongo.sh
│   └── restore-postgres.sh
│
└── docs/
    ├── guia-ejecucion-y-pruebas-manuales.md  ← Guía paso a paso completa
    ├── guia-integracion-backend.md            ← Para equipos de backend
    ├── resumen-tecnico-modulo-01.md           ← Descripción técnica de cada archivo
    ├── comandos-rapidos.md                    ← Chuleta de comandos
    ├── resultados-pruebas-manuales.md         ← Resultado de las pruebas reales
    ├── advertencias-operativas.md             ← Advertencias importantes
    ├── explicacion-defensa-espanol.md         ← Para defensa en español
    └── explicacion-defensa-ingles.md          ← Para defensa individual en inglés
```

---

## Strings de conexión para equipos backend

### MongoDB (dentro de la red Docker)
```
mongodb://mongo1:27017,mongo2:27017,mongo3:27017/oep_rrv?replicaSet=rs0
```

### MongoDB (desde el host / Windows)
```
mongodb://localhost:27017,localhost:27018,localhost:27019/oep_rrv?replicaSet=rs0
```

### PostgreSQL — Router estable (recomendado, dentro de Docker)
```
postgresql://oep_user:oep_password@postgres-router:5432/oep_oficial
```

### PostgreSQL — Router estable (desde el host)
```
postgresql://oep_user:oep_password@localhost:5434/oep_oficial
```

> **Usar siempre el router**, no `postgres-primary` directamente. El router redirige automáticamente al PRIMARY actual después de un failover.

---

## Inicio rápido

```bash
# 1. Navegar al módulo
cd sistema-computo-electoral-bolivia/01-clusters-bases-failover

# 2. Corregir fin de línea de scripts .sh (solo Windows)
# Git Bash:
sed -i 's/\r$//' postgres/replica-setup.sh scripts/*.sh

# 3. Iniciar MongoDB y PostgreSQL primary
docker compose up -d mongo1 mongo2 mongo3 postgres-primary

# 4. Esperar ~40s, luego inicializar el Replica Set MongoDB
docker compose run --rm mongo-init

# 5. Crear colecciones, índices y seed MongoDB
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/collections.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/indexes.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-authorized-sms.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-actas.js
docker exec mongo1 mongosh "mongodb://mongo1:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-rrv-sample-results.js

# 6. Iniciar réplica PostgreSQL (corre pg_basebackup automáticamente)
docker compose up -d postgres-replica

# 7. Iniciar el router HAProxy
docker compose up -d postgres-router

# 8. Instalar dependencias e instalar health check
cd scripts && npm install && node health-check.js && cd ..
```

---

## Health check rápido

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

> **Nota Windows:** Si el health check falla con error de hostname MongoDB, agregar al archivo `C:\Windows\System32\drivers\etc\hosts` (como administrador):
> ```
> 127.0.0.1 mongo1
> 127.0.0.1 mongo2
> 127.0.0.1 mongo3
> ```

---

## Checklist de demo

### MongoDB
- [ ] `docker compose ps` — los 3 nodos healthy
- [ ] `docker compose run --rm mongo-init` — PRIMARY elegido
- [ ] Verificar colecciones: 7 colecciones en `oep_rrv`
- [ ] Mostrar acta SOSPECHOSA (ACTA-RRV-003): P1+P2+P3+P4=250, votosValidos OCR=255
- [ ] `docker stop mongo1` — mongo2 o mongo3 se convierte en PRIMARY
- [ ] Escribir en el nuevo PRIMARY — exitoso
- [ ] `docker start mongo1` — mongo1 se reincorpora como SECONDARY

### PostgreSQL + Router
- [ ] `docker compose ps postgres-router` — healthy
- [ ] `node scripts/test-postgres-router.js` — PASS
- [ ] `http://localhost:8404/stats` — HAProxy muestra ambos servidores

### PostgreSQL — Failover automático
- [ ] `pg_stat_replication` muestra réplica conectada (state=streaming)
- [ ] Iniciar monitor: `docker compose --profile monitor up -d postgres-failover-monitor`
- [ ] `docker stop postgres-primary` — monitor detecta falla (~15s)
- [ ] Logs del monitor muestran: `AUTOMATIC FAILOVER COMPLETE`
- [ ] `SELECT pg_is_in_recovery()` en postgres-replica devuelve `f`
- [ ] Escritura en postgres-replica exitosa

---

## Limitaciones conocidas

| Limitación | Impacto |
|-----------|---------|
| Ventana de ~21s sin escrituras durante failover PostgreSQL | El router redirige en ~6s (HAProxy) + promoción ~15s (monitor) |
| HAProxy no detecta `pg_is_in_recovery()` | Enruta por disponibilidad TCP; la detección de rol la hace el monitor |
| Solo 1 réplica PostgreSQL | Un solo standby disponible para promoción |
| Hostnames invertidos tras rejoin | postgres-primary queda como standby después del rejoin |
| MongoDB: ~10-15s de no disponibilidad de escrituras durante elección | El driver NestJS reintenta automáticamente |
| Sin PgBouncer | Cada instancia NestJS mantiene sus propias conexiones |

---

## Advertencia crítica — PostgreSQL failover

> **NO ejecutar `docker start postgres-primary` después de un failover.**
> Hacerlo puede crear **split-brain**: dos nodos creyendo ser PRIMARY y aceptando escrituras simultáneas. Los datos divergen de forma irrecuperable.
>
> **Opciones seguras tras un failover:**
> 1. Reset completo: `docker compose down -v` y reiniciar desde cero
> 2. Rejoin avanzado: `bash scripts/postgres-rejoin-old-primary.sh --force`

---

## Documentación detallada

| Documento | Descripción |
|-----------|-------------|
| [docs/guia-ejecucion-y-pruebas-manuales.md](docs/guia-ejecucion-y-pruebas-manuales.md) | Guía paso a paso completa basada en pruebas reales |
| [docs/integracion-backend.md](docs/integracion-backend.md) | Para equipos backend: conexiones, variables, reglas |
| [docs/resumen-tecnico-modulo-01.md](docs/resumen-tecnico-modulo-01.md) | Descripción técnica de cada archivo del módulo |
| [docs/comandos-rapidos.md](docs/comandos-rapidos.md) | Chuleta de comandos para operación diaria |
| [docs/resultados-pruebas-manuales.md](docs/resultados-pruebas-manuales.md) | Registro de las pruebas ejecutadas y sus resultados |
| [docs/advertencias-operativas.md](docs/advertencias-operativas.md) | Advertencias, errores frecuentes y soluciones |
| [docs/explicacion-defensa-espanol.md](docs/explicacion-defensa-espanol.md) | Explicación del módulo para defensa en español |
| [docs/explicacion-defensa-ingles.md](docs/explicacion-defensa-ingles.md) | Individual defense explanation in English |
| [postgres/replication/README.md](postgres/replication/README.md) | Replicación WAL, failover, split-brain, rejoin |
