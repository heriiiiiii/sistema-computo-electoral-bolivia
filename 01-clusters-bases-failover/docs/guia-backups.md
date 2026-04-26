# Guía de Backups y Restauración

## Sistema Nacional de Cómputo Electoral Bolivia — Módulo 01

---

## MongoDB Backup

### Ejecutar backup

```bash
# Desde la raíz del módulo
bash scripts/backup-mongo.sh
```

El backup se guarda en `./mongo/backups/YYYY-MM-DD_HH-MM-SS/`

### Qué se respalda

Las 7 colecciones del flujo RRV:
- `rrv_actas`
- `rrv_sms`
- `sms_numeros_autorizados`
- `rrv_resultados_preliminares`
- `rrv_eventos`
- `rrv_logs`
- `rrv_cluster_status`

### Verificar backup

```bash
ls -lh mongo/backups/
ls -lh mongo/backups/2025-10-19_18-00-00/oep_rrv/
```

### Restaurar MongoDB

```bash
bash scripts/restore-mongo.sh ./mongo/backups/2025-10-19_18-00-00
```

> **Advertencia**: La restauración usa `--drop`. Reemplazará las colecciones existentes.

### Backup manual desde dentro del contenedor

```bash
docker exec mongo1 mongodump \
  --host "localhost:27017" \
  --db oep_rrv \
  --out /tmp/backup_manual
docker cp mongo1:/tmp/backup_manual ./mongo/backups/manual/
```

---

## PostgreSQL Backup

### Ejecutar backup

```bash
bash scripts/backup-postgres.sh
```

El backup se guarda en `./postgres/backups/YYYY-MM-DD_HH-MM-SS.dump`

El formato es **custom** de `pg_dump` (binario comprimido, más eficiente que SQL plano).

### Qué se respalda

El schema completo `oep_oficial`, incluyendo todas las 16 tablas:

`departamentos, provincias, municipios, recintos, mesas, partidos, candidatos, csv_importaciones, actas_oficiales, resultados_oficiales, validaciones_oficiales, auditoria_oficial, revisiones_oficiales, comparaciones_rrv_oficial, inconsistencias, cluster_status`

### Verificar backup

```bash
ls -lh postgres/backups/
```

### Restaurar PostgreSQL

```bash
bash scripts/restore-postgres.sh ./postgres/backups/2025-10-19_18-00-00.dump
```

> **Advertencia**: La restauración **elimina y recrea** la base de datos `oep_oficial`. Solo usar en desarrollo/demo.

### Backup manual (SQL plano — más fácil de inspeccionar)

```bash
docker exec postgres-primary pg_dump \
  -U oep_user \
  -d oep_oficial \
  --format=plain \
  -f /tmp/backup_plain.sql

docker cp postgres-primary:/tmp/backup_plain.sql ./postgres/backups/backup_plain.sql
```

### Listar contenido de un backup .dump

```bash
docker exec postgres-primary pg_restore \
  --list /tmp/backup.dump
```

---

## Recomendaciones para el Demo

1. **Tomar un backup después del seed** para poder restaurar rápidamente entre pruebas:
   ```bash
   bash scripts/backup-mongo.sh
   bash scripts/backup-postgres.sh
   ```

2. **Antes de una prueba de failover destructiva**, tomar backup:
   ```bash
   bash scripts/backup-postgres.sh
   ```

3. **Si la demo falla**, restaurar desde backup:
   ```bash
   bash scripts/restore-postgres.sh ./postgres/backups/<timestamp>.dump
   ```

---

## Estructura de Directorios de Backup

```
01-clusters-bases-failover/
├── mongo/
│   └── backups/
│       └── 2025-10-19_18-00-00/
│           └── oep_rrv/
│               ├── rrv_actas.bson
│               ├── rrv_actas.metadata.json
│               └── ...
└── postgres/
    └── backups/
        ├── .gitkeep
        └── 2025-10-20_09-00-00.dump
```

---

## Limitaciones

- Los scripts usan `docker cp` para transferir los archivos. Si el contenedor no está corriendo, el backup fallará.
- Los backups de MongoDB y PostgreSQL no están coordinados — si se toman en momentos distintos, puede haber inconsistencia entre los datos RRV y los datos oficiales.
- Para un entorno de producción real se recomendaría usar herramientas como `mongodump` con `--oplog` y `pg_basebackup` para backups consistentes en punto en el tiempo (PITR).
