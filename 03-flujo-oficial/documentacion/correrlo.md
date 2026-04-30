# Cómo correr el módulo 03 — Flujo Oficial

## Qué hay en este módulo

Este módulo implementa el **conteo oficial** del sistema electoral. Tiene 3 piezas:

1. **Backend NestJS** (`backend/`) — API que recibe CSVs y actas, valida y guarda en Postgres.
2. **Automatización CSV** (`automation/`) — script que carga CSVs masivos al backend.
3. **Frontend React** (`frontend/`) — interfaz gráfica para ver resultados en vivo y cargar actas.

### Backend NestJS

| Módulo            | Responsabilidad                                                                 |
|-------------------|---------------------------------------------------------------------------------|
| `DatabaseModule`  | Pool de conexiones `pg` global. Conecta al router HAProxy del módulo 01 (5434). |
| `CatalogosModule` | Carga catálogos: territorio, recintos, mesas. Upsert idempotente.               |
| `OficialModule`   | Importación CSV, bulk de actas, validaciones, queries, comparación con RRV.     |
| `AuditoriaModule` | Inserta en `auditoria_oficial`, `validaciones_oficiales`, `inconsistencias`.    |

### Frontend React

4 vistas accesibles desde la barra superior:

- **Dashboard** — KPIs, votos por partido (barras animadas), estado de actas, estado del cluster, auto-refresh cada 5s.
- **Cargar Acta** — formulario para registrar 1 o varias actas manualmente. Calcula `VotosValidos` automáticamente (P1+P2+P3+P4) y avisa si el total excede los habilitados.
- **Cargar CSV** — drag & drop para subir un CSV completo.
- **Listado** — tabla paginada con filtro por estado.

### Reglas de validación

- `P1 + P2 + P3 + P4 = VotosValidos` → CRÍTICA si falla
- Todos los votos `>= 0` → ALTA si falla
- `TotalVotos <= VotantesHabilitados` → CRÍTICA si falla
- `TotalVotos = PapeletasAnfora` → WARNING si difiere

Acta con error → `OBSERVADA` + registro en `inconsistencias`. Sin error → `VALIDADA`.

---

## Cómo correrlo (paso a paso)

### Pre-requisito: módulo 01 corriendo

El backend oficial NO tiene su propia DB; se conecta al cluster del módulo 01 vía HAProxy (puerto 5434). El módulo 01 tiene que estar arriba primero.

```powershell
# 1. Verificar que la red compartida existe
docker network ls | Select-String oep-network

# 2. Si no existe, levantar el módulo 01
cd C:\Users\Sebas\Documents\Github\sistema-computo-electoral-bolivia\01-clusters-bases-failover
docker compose up -d
# esperar ~30s a que el cluster esté healthy
```

### Opción A — Todo con Docker (recomendado)

```powershell
cd C:\Users\Sebas\Documents\Github\sistema-computo-electoral-bolivia\03-flujo-oficial

# 1. Construir y levantar backend + frontend
docker compose up -d oficial-backend oficial-frontend
# - oficial-backend → http://localhost:4000/api
# - oficial-frontend → http://localhost:5173

# 2. Ver logs hasta que el backend diga "Running on http://localhost:4000/api"
docker compose logs -f oficial-backend

# 3. Cargar los CSVs (corre una sola vez)
docker compose run --rm csv-automation
```

Luego abrí en el navegador: <http://localhost:5173>

### Opción B — Sin Docker (desarrollo local)

Útil para iterar rápido. Requiere Node.js 20+.

```powershell
# Terminal 1 — backend (requiere módulo 01 en :5434)
cd 03-flujo-oficial\backend
npm install
npm run build       # compila TypeScript a dist/
npm run start:dev   # arranca con hot-reload en :4000

# Terminal 2 — frontend
cd 03-flujo-oficial\frontend
npm install
npm run dev         # arranca Vite en :5173 con proxy a :4000

# Terminal 3 — cargar los CSVs (opcional, si querés data inicial)
cd 03-flujo-oficial\automation
npm install
node load-csvs.js
```

Abrí <http://localhost:5173> y deberías ver el dashboard.

---

## Cómo saber si está bien

### 1. El backend arrancó

```powershell
docker compose ps
# oficial-backend debe aparecer como "healthy"
```

En los logs debería verse:
```
[Nest] LOG [NestApplication] Nest application successfully started
[oficial-backend] Running on http://localhost:4000/api
```

### 2. El healthcheck responde

```powershell
curl http://localhost:4000/api/oficial/resumen
```

Debe devolver `{ "success": true, "data": { ... } }`.

> ⚠ **Importante:** la URL es `localhost:4000`, **no** `oficial-backend:4000`. Ese segundo nombre solo funciona dentro de la red de Docker. Y la ruta `/api` por sí sola da 404 porque solo es prefijo — tenés que hitearle a `/api/oficial/<ruta>`.

### 3. El frontend abre

<http://localhost:5173> — debería mostrar el dashboard con un indicador "EN VIVO" verde y la hora de última actualización.

### 4. La carga de CSVs terminó

`csv-automation` (o `node load-csvs.js`) imprime al final un resumen:

```
✔ territorio.csv → 9 filas insertadas
✔ recintos.csv  → 5368 filas insertadas
✔ mesas.csv     → 35000 filas insertadas
✔ actas.csv     → N filas (X validadas, Y observadas)
```

### 5. Datos en Postgres

```powershell
docker exec -it postgres-router psql -U oep_user -d oep_oficial

# dentro de psql
SELECT COUNT(*) FROM mesas;
SELECT COUNT(*), estado FROM actas_oficiales GROUP BY estado;
SELECT COUNT(*) FROM inconsistencias;
\q
```

### 6. La interfaz refleja los datos

Después de cargar el CSV, en el dashboard deberías ver:

- KPIs con números reales (Total Actas, Votos Válidos…).
- Las 4 barras de partido (P1, P2, P3, P4) con porcentajes y un badge de "Liderando".
- El bloque "Estado de Actas" con el desglose VALIDADA / OBSERVADA / etc.
- En **Listado**, todas las actas con su estado.

---

## Errores comunes

### `no configuration file provided: not found`
Estás en la carpeta equivocada. `cd 03-flujo-oficial` antes de `docker compose up`.

### `Invalid value for '--ignoreDeprecations'`
Era un bug en `tsconfig.json`. Ya está arreglado (`baseUrl` y `ignoreDeprecations` eliminados, no se usaban).

### `network 01-clusters-bases-failover_oep-network not found`
El módulo 01 no está corriendo. Levantarlo primero.

### `ECONNREFUSED postgres-router:5432` en logs del backend
El router del módulo 01 no está sano:

```powershell
docker compose -f 01-clusters-bases-failover/docker-compose.yml ps
docker compose -f 01-clusters-bases-failover/docker-compose.yml logs postgres-router
```

### El dashboard muestra "ERROR_CODE: ..."
- Si dice `GET_RESUMEN_ERROR` o similar: revisar logs del backend (`docker compose logs oficial-backend`).
- Si dice `Failed to fetch`: el backend no está corriendo o no se expuso el puerto 4000.

### El frontend abre pero sin datos
Probablemente todavía no cargaste los CSVs. Corré `docker compose run --rm csv-automation` o `node automation/load-csvs.js`. También podés cargar manualmente desde la pestaña **Cargar Acta** o **Cargar CSV**.
