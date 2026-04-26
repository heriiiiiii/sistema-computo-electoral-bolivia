# Advertencias Operativas — Módulo 01

## Sistema Nacional de Cómputo Electoral Bolivia

Este documento reúne todas las advertencias, limitaciones y soluciones a problemas frecuentes del módulo.

---

## ADVERTENCIA CRÍTICA — No reiniciar postgres-primary después de un failover

> **Nunca ejecutar `docker start postgres-primary` directamente después de un failover PostgreSQL.**

### ¿Por qué?

Después de un failover, `postgres-primary` tiene un **WAL timeline divergente**. Si se reinicia sin reinicialización, cree que todavía es el PRIMARY y empieza a aceptar escrituras. Al mismo tiempo, `postgres-replica` (el nuevo PRIMARY) también acepta escrituras.

Este estado se llama **split-brain**: dos nodos escriben datos diferentes con la misma identidad de base de datos. La divergencia de datos es **irrecuperable** sin intervención manual avanzada.

### ¿Qué hacer después de un failover?

**Opción A — Reset completo (recomendado para demo):**
```bash
docker compose down -v
# Luego seguir el inicio completo del módulo
```
Borra todos los datos pero restaura la topología original correctamente.

**Opción B — Rejoin del primary antiguo (avanzado):**
```bash
bash scripts/postgres-rejoin-old-primary.sh --force
```
Este script:
1. Detiene `postgres-primary`
2. **Destruye** su volumen de datos
3. Ejecuta `pg_basebackup` desde el nuevo primary (`postgres-replica`)
4. Configura `postgres-primary` como standby del nuevo primary
5. Inicia `postgres-primary` en modo recuperación

> **Nota post-rejoin:** Los hostnames quedan invertidos. `postgres-primary` es el standby y `postgres-replica` es el primary. Para restaurar la topología original, usar la Opción A.

---

## docker compose down vs docker compose down -v

| Comando | Efecto en contenedores | Efecto en datos |
|---------|----------------------|-----------------|
| `docker compose down` | Detiene y elimina contenedores | **Mantiene** volúmenes y datos |
| `docker compose down -v` | Detiene y elimina contenedores | **Elimina** volúmenes (pérdida total de datos) |
| `docker compose stop` | Solo detiene contenedores | Mantiene todo |

**Usar `down -v`** cuando se necesita un reset completo para la demo.
**Usar `down`** cuando solo se necesita reiniciar los servicios manteniendo los datos.

---

## Limitación HAProxy — no detecta pg_is_in_recovery()

El router HAProxy usa **verificaciones TCP** para detectar si un servidor PostgreSQL está disponible. HAProxy **no puede** verificar si un nodo es PRIMARY o STANDBY.

### Comportamiento:
1. Si `postgres-primary` falla el TCP check (~6s, 2 intentos), HAProxy lo marca como DOWN
2. HAProxy redirige al servidor de backup (`postgres-replica`)
3. En ese momento, `postgres-replica` todavía es STANDBY (solo lectura)
4. Las escrituras fallarán durante ~15s hasta que el monitor promueva la réplica

### ¿Cómo se resuelve?
El monitor de failover (`postgres-failover-monitor.js`) ejecuta `pg_promote()` en la réplica después de detectar 3 fallas consecutivas del primary (~15s total). Una vez promovida, las escrituras a través del router funcionan.

### Diagrama de tiempos durante failover:
```
t=0s   postgres-primary cae
t=6s   HAProxy detecta DOWN, redirige al backup (replica, aún en standby)
t=6-21s  Escrituras fallan (réplica aún no promovida)
t=21s  Monitor promueve réplica — escrituras exitosas
```

**Ventana de no disponibilidad de escrituras: ~15s** (normal para demo académico).

---

## Problema CRLF en Windows — scripts .sh

Git en Windows puede convertir automáticamente los saltos de línea a CRLF (`\r\n`). Los contenedores Linux esperan LF (`\n`).

### Síntoma
```
bash: /replica-setup.sh: /bin/bash^M: bad interpreter: No such file or directory
```
O bien: el script aparece como una sola línea larga en los logs.

### Solución
```bash
# Git Bash:
sed -i 's/\r$//' postgres/replica-setup.sh scripts/*.sh

# PowerShell:
(Get-Content postgres\replica-setup.sh -Raw) -replace "`r`n", "`n" | Set-Content postgres\replica-setup.sh -NoNewline
```

### Prevención
Configurar Git para no convertir saltos de línea:
```bash
git config --global core.autocrlf false
```

---

## Problema MongoDB hostnames en Windows

El health-check y otros scripts Node.js que conectan a MongoDB desde fuera de Docker usan los hostnames internos de los contenedores (`mongo1`, `mongo2`, `mongo3`). En Windows, estos nombres no resuelven por defecto.

### Síntoma
```
MongoServerSelectionError: getaddrinfo ENOTFOUND mongo1
```

### Solución
Agregar al archivo `C:\Windows\System32\drivers\etc\hosts` (como administrador):
```
127.0.0.1 mongo1
127.0.0.1 mongo2
127.0.0.1 mongo3
```

```powershell
# PowerShell como administrador:
Add-Content -Path "C:\Windows\System32\drivers\etc\hosts" -Value "`n127.0.0.1 mongo1`n127.0.0.1 mongo2`n127.0.0.1 mongo3"
```

> Esta solución es solo para pruebas desde el host Windows. Los backends en Docker usan la red interna y no necesitan esta configuración.

---

## Problema npm bloqueado en PowerShell

PowerShell puede bloquear la ejecución de `npm` por política de ejecución.

### Síntoma
```
npm: The term 'npm' is not recognized as the name of a cmdlet...
```
O:
```
File cannot be loaded because running scripts is disabled on this system.
```

### Solución
```powershell
# Opción A — usar npm.cmd explícitamente:
npm.cmd install

# Opción B — cambiar política de ejecución:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

> Los scripts `.sh` de este módulo deben ejecutarse desde **Git Bash** o **WSL**, no desde PowerShell.

---

## Ventana de escrituras no disponibles durante failover PostgreSQL

Durante un failover PostgreSQL hay una ventana donde las escrituras fallan:

| Fase | Duración | Causa |
|------|----------|-------|
| HAProxy detecta falla del primary | ~6s | 2 TCP checks fallidos × 3s |
| Réplica disponible pero en STANDBY | ~15s | El monitor aún no promovió |
| **Total de no disponibilidad** | **~21s** | Combinado |

### Mitigación en producción
En producción se usaría **Patroni** con etcd/Consul para elección distribuida del líder, reduciendo el tiempo a ~5s. Para este demo académico, ~21s es aceptable.

### Impacto en backends conectados vía router
- TypeORM y el driver `pg` reintentan conexiones automáticamente
- Las escrituras que fallan durante la ventana recibirán un error de conexión
- Después de la promoción, las reconexiones automáticas restauran el servicio

---

## Limitación de un solo standby PostgreSQL

El setup actual tiene un solo nodo standby. Si tanto el primary como el standby fallan simultáneamente, no hay promoción posible.

En producción: múltiples standbys con Patroni + cascading replication.

---

## Hostnames invertidos después del rejoin

Después de ejecutar `postgres-rejoin-old-primary.sh`, los hostnames quedan en topología inversa:
- `postgres-primary` = STANDBY del nuevo primary
- `postgres-replica` = PRIMARY

Esto es **comportamiento esperado y seguro**. Para la demo, funciona correctamente. Para restaurar la topología original (postgres-primary = PRIMARY), ejecutar `docker compose down -v` y reiniciar desde cero.

---

## Variables de entorno — .env.example vs .env real

El archivo `.env.example` está versionado en Git porque contiene **variables de demo** sin datos sensibles reales.

- Copiar a `.env` si se necesita: `cp .env.example .env`
- El `.env` real no debe contener credenciales reales para producción
- Docker Compose en este módulo ya tiene las variables definidas directamente, por lo que `.env` es opcional

---

## Backup y restore — solo Git Bash o WSL en Windows

Los scripts `backup-mongo.sh`, `backup-postgres.sh`, `restore-mongo.sh` y `restore-postgres.sh` usan sintaxis bash. En Windows deben ejecutarse desde **Git Bash** o **WSL**:

```bash
# Git Bash:
bash scripts/backup-mongo.sh
bash scripts/backup-postgres.sh
```

No ejecutar desde PowerShell directamente.
