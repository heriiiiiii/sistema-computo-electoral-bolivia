# Module 03 — Official Count Flow

Backend NestJS para el flujo oficial de cómputo electoral.  
Recibe datos de actas mediante CSVs, los valida, registra auditoría y expone endpoints para el dashboard.

## Requisitos Previos

- **Módulo 01 activo** (PostgreSQL cluster + HAProxy corriendo en puerto 5434)
- Docker + Docker Compose
- Node.js 20+ (solo para desarrollo local)

## Estructura

```
03-flujo-oficial/
├── backend/          # NestJS API (puerto 4000)
├── automation/       # Script Node.js para cargar los CSVs
├── cvs/              # Archivos CSV con datos electorales
├── docker-compose.yml
└── .env
```

## Inicio Rápido (Docker)

```bash
# 1. Asegurarse que módulo 01 esté corriendo
cd ../01-clusters-bases-failover
docker compose up -d
# Esperar ~30s

# 2. Iniciar backend oficial
cd ../03-flujo-oficial
docker compose up -d oficial-backend

# 3. Esperar que el backend esté healthy, luego cargar CSVs
docker compose run --rm csv-automation
```

## Desarrollo Local (sin Docker)

```bash
# Terminal 1: backend
cd backend
npm install
npm run start:dev

# Terminal 2: automatización (después de que el backend esté arriba)
cd automation
npm install
node load-csvs.js
```

## Endpoints

| Método | URL | Descripción |
|--------|-----|-------------|
| POST | `/api/oficial/csv` | Importar CSV de transcripciones (multipart) |
| POST | `/api/oficial/actas/bulk` | Carga masiva de actas (JSON) |
| GET  | `/api/oficial/actas` | Listar actas (`?limit=100&offset=0&estado=VALIDADA`) |
| GET  | `/api/oficial/actas/:id` | Detalle de un acta con resultados y validaciones |
| GET  | `/api/oficial/importaciones` | Historial de importaciones CSV |
| GET  | `/api/oficial/auditoria` | Trazabilidad de acciones |
| GET  | `/api/oficial/validaciones` | Resultados de validaciones |
| GET  | `/api/oficial/resumen` | KPIs y resumen general |
| POST | `/api/oficial/comparar-rrv` | Comparar resultados con el flujo RRV |
| POST | `/api/oficial/catalogos/territorio` | Cargar catálogo territorial |
| POST | `/api/oficial/catalogos/recintos` | Cargar catálogo de recintos |
| POST | `/api/oficial/catalogos/mesas` | Cargar catálogo de mesas |

## Formato de Respuesta

```json
// Éxito
{ "success": true, "message": "OK", "data": {} }

// Error
{ "success": false, "message": "...", "codigoError": "ERROR_CODE", "data": null }
```

## Reglas de Validación

Aplicadas a cada acta en `POST /api/oficial/actas/bulk`:

1. `P1, P2, P3, P4 >= 0` — votos no negativos por partido
2. `VotosValidos = P1 + P2 + P3 + P4` — suma de partidos
3. `TotalVotos = VotosValidos + VotosBlancos + VotosNulos`
4. `TotalVotos <= VotantesHabilitados`
5. `TotalVotos = PapeletasAnfora`

Actas que fallan con resultado `ERROR` se marcan `OBSERVADA` y se registran en `inconsistencias`.  
Actas sin errores se marcan `VALIDADA`.

## Estados de Actas

`IMPORTADA` → `VALIDANDO` → `VALIDADA` | `OBSERVADA` → `RECHAZADA` | `OFICIALIZADA`

## Orden de Carga de CSVs

```
1. DistribucionTerritorial.csv → /api/oficial/catalogos/territorio
2. RecintosElectorales.csv     → /api/oficial/catalogos/recintos
3. ActasImpresas.csv           → /api/oficial/catalogos/mesas
4. Transcripciones.csv         → /api/oficial/actas/bulk
```

## Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://oep_user:oep_password@localhost:5434/oep_oficial` | Router PostgreSQL del módulo 01 |
| `PORT` | `4000` | Puerto del backend |
| `BACKEND_URL` | `http://localhost:4000/api` | URL del backend (para automation) |
| `CSV_DIR` | `./cvs` | Directorio de archivos CSV |
| `CHUNK_SIZE` | `200` | Filas por petición en automatización |

## Verificación

```bash
# Ver resumen después de cargar CSVs
curl http://localhost:4000/api/oficial/resumen

# Ver primeras 10 actas validadas
curl "http://localhost:4000/api/oficial/actas?limit=10&estado=VALIDADA"

# Ver inconsistencias detectadas
curl "http://localhost:4000/api/oficial/actas?estado=OBSERVADA"

# Ver trazabilidad
curl http://localhost:4000/api/oficial/auditoria
```

## Tolerancia a Fallos

- Backend conecta al router HAProxy del módulo 01 (`postgres-router:5432` desde Docker, `localhost:5434` desde host)
- Escrituras se reintentan hasta 3 veces en errores transitorios de conexión
- Si el primary de PostgreSQL cae, HAProxy redirige al replica automáticamente
- El flujo oficial no depende del flujo RRV para funcionar