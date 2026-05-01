# Documentación — Flujo Oficial (Conteo Oficial)

> Pipeline oficial del **Sistema Nacional de Cómputo Electoral Bolivia**.
> Procesa los CSV transcritos del OEP, los valida según las reglas de la Ley 026
> y expone los datos para el dashboard de comparación RRV vs. Oficial.

---

## 1. Arquitectura

```
                           ┌─────────────────────────┐
                           │  CSV (Transcripciones,  │
                           │  Recintos, Mesas, Terr.)│
                           └────────────┬────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────┐
                  │  csv-automation (Node + axios)         │
                  │  - lee CSVs                            │
                  │  - normaliza (encoding latin1/utf8)    │
                  │  - chunks de 200 filas                 │
                  │  - POST a backend                      │
                  └────────────┬───────────────────────────┘
                               │ HTTP JSON
                               ▼
                ┌──────────────────────────────────────────┐
                │  oficial-backend (NestJS)                │
                │  - validación R1..R7, H1..H4, OBS_*      │
                │  - persistencia + auditoría              │
                │  - endpoints REST                        │
                └────┬─────────────────────────┬───────────┘
                     │                         │
                     ▼                         ▼
             ┌───────────────┐          ┌─────────────────┐
             │  PostgreSQL   │          │  Logs (archivo) │
             │  (cluster 01) │          │  inconsistencias│
             └───────┬───────┘          └─────────────────┘
                     │
                     ▼
            ┌─────────────────────────────────────┐
            │  oficial-frontend (React + Vite)    │
            │  Dashboard, listas, detalle de acta │
            └─────────────────────────────────────┘
```

Componentes en este módulo (`03-flujo-oficial/`):

| Carpeta | Qué hace |
|---|---|
| `backend/` | API NestJS — endpoints, validación, persistencia. |
| `frontend/` | Vista React — Dashboard, lista de actas, detalle, carga manual y CSV. |
| `automation/` | Script Node que envía los CSV al backend (no escribe a la DB). |
| `cvs/` | CSVs de entrada (Territorio, Recintos, Actas, Transcripciones). |
| `logs/` | Logs de carga e inconsistencias (`carga-errores-*.log`, `inconsistencias-*.log`). |
| `docker-compose.yml` | Orquesta backend + frontend + automation. |

La base de datos vive en **`01-clusters-bases-failover/`** (PostgreSQL primario+réplica con HAProxy router). Este módulo se conecta vía la red Docker compartida.

---

## 2. Reglas de validación

Toda acta importada pasa por **`ValidacionService`** (`backend/src/oficial/validacion.service.ts`). Si **cualquier** regla devuelve `ERROR`, el acta queda en estado **`OBSERVADA`**. Si sólo hay `WARNING` o todo `OK`, queda **`VALIDADA`**.

### Reglas numéricas (R1..R7)

| Regla | Descripción | Severidad si rota |
|---|---|---|
| **R1** | `P1, P2, P3, P4 ≥ 0` | ERROR / ALTA |
| **R2** | `VotosValidos = P1 + P2 + P3 + P4` | ERROR / CRÍTICA |
| **R3** | `TotalVotos = VotosValidos + Blancos + Nulos` (identidad derivada) | OK silencioso |
| **R4** | `TotalVotos ≤ VotantesHabilitados` | ERROR / CRÍTICA |
| **R5** | `TotalVotos = PapeletasAnfora` | ERROR / ALTA |
| **R6** | `Habilitados, Anfora, NoUtilizadas, Blancos, Nulos, Validos ≥ 0` | ERROR / ALTA |
| **R7** | `PapeletasAnfora + PapeletasNoUtilizadas = Habilitados` | WARNING / MEDIA |

### Reglas horarias (H1..H4)

| Regla | Descripción | Severidad |
|---|---|---|
| **H1** | Apertura/Cierre con formato válido (0–23 / 0–59) | WARNING / MEDIA |
| **H2** | Cierre estrictamente posterior a apertura | WARNING / ALTA |
| **H3** | Apertura dentro del rango legal `07:00–10:59` | WARNING / MEDIA |
| **H4** | Duración de votación ≥ 8 h (tolerancia 5 min) | WARNING / MEDIA |

### Observaciones del CSV (OBS_*)

Patrones de texto en la columna `Observaciones` del CSV. Se mapean a las causales de la Ley 026.

| Regla | Texto detectado | Tipo |
|---|---|---|
| `OBS_FORMULARIO_NO_OFICIAL` | "uso de formularios no oficiales" | **ERROR** CRÍTICA |
| `OBS_PAPELETAS_NO_AUTORIZADAS` | "papeletas no autorizadas" | **ERROR** ALTA |
| `OBS_ACTA_DUPLICADA_REPORTADA` | "acta duplicada" | **ERROR** ALTA |
| `OBS_INCONSISTENCIA_ARITMETICA` | "inconsistencia aritmética" | **ERROR** ALTA |
| `OBS_FECHA_INCORRECTA` | "fecha incorrecta", "fecha de elección" | **ERROR** ALTA |
| `OBS_TACHADURA_O_ENMIENDA` | "tachadura", "enmienda", "errores de transcripción" | **ERROR** MEDIA |
| `OBS_FALTA_FIRMAS_HUELLAS` | "falta de firmas/huellas" | **ERROR** MEDIA |
| `OBS_UBICACION_INCORRECTA` | "mesa en lugar distinto" | **ERROR** MEDIA |
| `OBS_DELEGADOS_AUSENTES` | "ausencia de delegados" | WARNING / MEDIA |
| `OBS_FALTA_DATOS_HORARIO` | "falta de datos de apertura/cierre" | WARNING / MEDIA |

> **Política**: el CSV es la verdad oficial transcrita por el OEP. Si reporta una causal de Ley 026, el acta va a **`OBSERVADA`** aunque los números calzen — fidelidad 100% al texto del CSV.

---

## 3. Endpoints REST

Base URL: `http://localhost:4000/api`

Todas las respuestas siguen el formato estándar:

```json
// éxito
{ "success": true,  "message": "...", "data": { ... } }
// error
{ "success": false, "message": "...", "codigoError": "CODIGO", "data": null }
```

### 3.1 Carga de catálogos (`/oficial/catalogos`)

| Método | Path | Body | Devuelve |
|---|---|---|---|
| `POST` | `/oficial/catalogos/territorio` | `{ rows: [...] }` filas de `DistribucionTerritorial.csv` | `{ insertadas, errores }` |
| `POST` | `/oficial/catalogos/recintos` | `{ rows: [...] }` filas de `RecintosElectorales.csv` | `{ insertados, errores }` |
| `POST` | `/oficial/catalogos/mesas` | `{ rows: [...] }` filas de `ActasImpresas.csv` | `{ insertadas, errores }` |

> Estos son requisitos previos. Sin territorio + recintos + mesas, las transcripciones fallan con `MESA_NO_ENCONTRADA`.

### 3.2 Actas (`/oficial`)

| Método | Path | Descripción |
|---|---|---|
| `POST` | `/oficial/actas/bulk` | Carga masiva (form manual y automation usan este endpoint). |
| `POST` | `/oficial/csv` | Sube un archivo CSV completo (multipart). El backend lo parsea y delega a bulk. |
| `GET`  | `/oficial/actas?limit=&offset=&estado=` | Lista paginada (filtra por estado: `VALIDADA`, `OBSERVADA`, ...). |
| `GET`  | `/oficial/actas/:id` | Detalle: votos por partido + validaciones. |
| `POST` | `/oficial/actas/:id/recalcular` | Toma `P1+P2+P3+P4` como verdad, reaplica reglas. |
| `POST` | `/oficial/comparar-rrv` | Compara una lista de mesas RRV contra el oficial. |

#### `POST /oficial/actas/bulk` — body

```json
{
  "rows": [
    {
      "codigoRecinto": "1010200001",
      "nroMesa": 1,
      "votantesHabilitados": 877,
      "papeletasAnfora": 788,
      "papeletasNoUtilizadas": 89,
      "p1": 140, "p2": 39, "p3": 124, "p4": 345,
      "votosValidos": 648,
      "votosBlancos": 76,
      "votosNulos": 64,
      "observaciones": "Tachaduras en P3",
      "aperturaHora": 8, "aperturaMinutos": 0,
      "cierreHora": 16, "cierreMinutos": 0
    }
  ],
  "franja": "PRESIDENTE",
  "usuarioCarga": "n8n",
  "ipOrigen": "n8n-flow"
}
```

#### Respuesta

```json
{
  "success": true,
  "message": "Bulk actas processed",
  "data": {
    "total": 200,
    "validadas": 187,
    "observadas": 11,
    "erroresCriticos": 2,
    "errores": [{ "row": "1010200001-7", "error": "Mesa no encontrada" }]
  }
}
```

### 3.3 Lectura para dashboard

| Método | Path | Para qué sirve en el dashboard |
|---|---|---|
| `GET` | `/oficial/resumen` | **KPIs principales**: total actas por estado, votos por partido, importaciones, inconsistencias, cluster status. |
| `GET` | `/oficial/validaciones?actaId=` | Listado de reglas rotas — alimenta tabla "Reglas con observación". |
| `GET` | `/oficial/importaciones` | Historial de cargas CSV (cuántas filas válidas/inválidas por archivo). |
| `GET` | `/oficial/auditoria?limit=` | Bitácora de acciones (importar, recalcular, validar). |

#### Ejemplo: `GET /oficial/resumen`

```json
{
  "success": true,
  "data": {
    "actas": {
      "total": 4500,
      "porEstado": { "VALIDADA": 4350, "OBSERVADA": 150 }
    },
    "votos": { "validos": 1800000, "blancos": 90000, "nulos": 60000 },
    "porPartido": [
      { "codigo": "P1", "nombre": "Partido Primero", "total_votos": 720000 },
      { "codigo": "P2", "nombre": "Partido Segundo", "total_votos": 540000 }
    ],
    "importaciones": [{ "estado": "COMPLETADO", "total": 1 }],
    "inconsistencias": [{ "severidad": "ALTA", "estado": "ABIERTA", "total": 38 }],
    "clusterStatus": [
      { "cluster_nombre": "oep_oficial", "motor": "POSTGRES", "nodo": "primary", "rol": "PRIMARY", "estado": "ONLINE" }
    ]
  }
}
```

---

## 4. Datos esperados por cada CSV

Detalle completo en [`README.md`](./README.md). Resumen:

| Archivo | Columnas clave | Endpoint destino |
|---|---|---|
| `DistribucionTerritorial.csv` | CodigoTerritorial, Departamento, Provincia, Municipio | `POST /oficial/catalogos/territorio` |
| `RecintosElectorales.csv` | CodigoRecinto, RecintoNombre, NumMesas | `POST /oficial/catalogos/recintos` |
| `ActasImpresas.csv` | CodigoActa, NroMesa, VotantesHabilitados | `POST /oficial/catalogos/mesas` |
| `Transcripciones.csv` | P1..P4, VotosValidos/Blancos/Nulos, horarios, Observaciones | `POST /oficial/actas/bulk` |

---

## 5. Cómo iniciar todo (guía rápida)

> Todos los comandos desde **PowerShell en la raíz del repo**.

### 5.1 Pre-requisitos

- Docker Desktop corriendo.
- Puertos libres: `4000` (backend), `5173` (frontend), `5432` (PostgreSQL), `8404` (HAProxy stats).

### 5.2 Levantar el cluster de bases (módulo 01)

```powershell
cd 01-clusters-bases-failover
docker compose down -v          # limpia volúmenes (BORRA datos)
docker compose up -d
# esperar ~30s a que el cluster termine de inicializar
```

| Comando | Qué hace |
|---|---|
| `docker compose down -v` | Apaga contenedores **y borra volúmenes** (deja la BD limpia). |
| `docker compose up -d` | Levanta PostgreSQL primario+réplica, HAProxy router y MongoDB replica set. |

### 5.3 Levantar el backend y el frontend del flujo oficial

```powershell
cd ..\03-flujo-oficial
docker compose build oficial-backend oficial-frontend
docker compose up -d oficial-backend oficial-frontend
```

| Comando | Qué hace |
|---|---|
| `docker compose build` | Re-compila las imágenes (necesario después de cambios en código). |
| `docker compose up -d oficial-backend oficial-frontend` | Arranca API NestJS (puerto 4000) y UI React (puerto 5173). |

Verificá que el backend está vivo:

```powershell
curl http://localhost:4000/api/oficial/resumen
```

### 5.4 Cargar los CSV con la automation

```powershell
docker compose run --rm csv-automation
```

| Lo que hace | Detalle |
|---|---|
| Lee los 4 CSV de `cvs/` | Detecta encoding (UTF-8 / Windows-1252 / latin1). |
| Normaliza columnas | Acepta typo `PapeltasNoUtilizadas` por compatibilidad. |
| Envía en chunks de 200 | Vía HTTP al backend (no escribe directo a la DB). |
| Imprime el resumen | `validadas / observadas / erroresCriticos` por chunk. |

> El flag `--rm` borra el contenedor al terminar (es una corrida one-shot).

### 5.5 Abrir el dashboard

Navegá a [http://localhost:5173](http://localhost:5173). Verás:

- **Dashboard**: KPIs (total actas, % validadas, votos por partido, cluster status).
- **Actas**: lista paginada con filtro por estado. Clic en una fila → detalle con reglas rotas.
- **Cargar CSV**: sube un Transcripciones.csv extra desde el navegador.
- **Cargar Acta**: form manual para registrar una transcripción a mano.

### 5.6 Comandos útiles del día a día

```powershell
# Ver logs del backend en vivo
docker logs -f oficial-backend

# Ver logs del frontend
docker logs -f oficial-frontend

# Reiniciar sólo el backend (después de un cambio menor de código)
cd 03-flujo-oficial
docker compose build oficial-backend
docker compose up -d oficial-backend

# Limpiar TODO y volver a empezar
cd 01-clusters-bases-failover; docker compose down -v
cd ..\03-flujo-oficial; docker compose down

# Inspeccionar la base oficial directamente
docker exec -it postgres-primary psql -U oep_user -d oep_oficial -c "SELECT estado, COUNT(*) FROM actas_oficiales GROUP BY estado;"
```

---

## 6. Implementación del Dashboard

> El dashboard ya existe en `frontend/`. Esta sección documenta cómo CONSUMIR los endpoints, por si querés re-implementarlo o construir uno externo (módulo 04).

### 6.1 Sección "Resumen general"

- **Endpoint**: `GET /oficial/resumen`
- **Tarjetas**: total de actas, % validadas, votos válidos/blancos/nulos.
- **Gráfico de barras**: `data.porPartido[]` → eje X = `codigo`, eje Y = `total_votos`.
- **Gráfico de torta**: `data.actas.porEstado` → segmentos por estado.

### 6.2 Sección "Estado del cluster"

- Mismo endpoint (`data.clusterStatus`).
- Tabla con: cluster, motor (POSTGRES/MONGO), nodo, rol (PRIMARY/REPLICA), estado (ONLINE/OFFLINE).
- Pinta filas en rojo si `estado != 'ONLINE'`.

### 6.3 Sección "Actas observadas"

- **Endpoint**: `GET /oficial/actas?estado=OBSERVADA&limit=50`
- Tabla con código de acta, recinto, mesa, total votos, fecha importación.
- Clic en fila → modal/ruta de detalle.

### 6.4 Detalle de acta

- **Endpoint**: `GET /oficial/actas/:id`
- Mostrar:
  - Datos básicos (recinto, mesa, horarios, fuente).
  - Tabla de votos por partido (`data.resultados[]`).
  - Totales calculados (`votos_validos`, `total_votos`, `papeletas_en_anfora`, `desfase = sumaP - votos_validos`).
  - Tabla de validaciones rotas (`data.validaciones[]` filtrado a `resultado != 'OK'`).
  - Botón "Recalcular y validar" → `POST /oficial/actas/:id/recalcular`.

### 6.5 Sección "Importaciones"

- **Endpoint**: `GET /oficial/importaciones`
- Tabla con archivo, usuario, fecha, total filas, válidas, inválidas, estado.

### 6.6 Sección "Auditoría"

- **Endpoint**: `GET /oficial/auditoria?limit=200`
- Bitácora de acciones (`IMPORTAR_ACTA`, `RECALCULAR_ACTA`, `CSV_IMPORT`).

### 6.7 Sección "Comparación RRV vs Oficial" (módulo 04)

- **Endpoint**: `POST /oficial/comparar-rrv`
- Body: `{ "mesas": [{ "codigoMesa": "...", "actaRrvId": "...", "votos": {...} }] }`
- Devuelve por cada campo (`votos_validos`, `votos_blancos`, `votos_nulos`, `total_votos`):
  - `valor_rrv`, `valor_oficial`, `diferencia`, `estado` (`COINCIDE` / `DIFERENCIA_LEVE` / `INCONSISTENCIA`).

### 6.8 Live updates (opcional)

No hay WebSocket. La UI hace **polling** cada 5s a `/oficial/resumen` (ver `frontend/src/components/LiveFeed.tsx`).

### 6.9 Ejemplo mínimo en JS / TS

```ts
const API = 'http://localhost:4000/api';

export async function getResumen() {
  const r = await fetch(`${API}/oficial/resumen`).then(r => r.json());
  if (!r.success) throw new Error(r.message);
  return r.data;
}

export async function getActas(estado?: string, limit = 100, offset = 0) {
  const url = new URL(`${API}/oficial/actas`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  if (estado) url.searchParams.set('estado', estado);
  const r = await fetch(url).then(r => r.json());
  return r.data;
}

export async function recalcularActa(id: number) {
  const r = await fetch(`${API}/oficial/actas/${id}/recalcular`, { method: 'POST' }).then(r => r.json());
  return r.data;
}
```

---

## 7. Estados del acta (referencia)

```
IMPORTADA   → recién entró al sistema (raro, las que pasan por bulk arrancan validando)
VALIDANDO   → se está procesando
VALIDADA    → todas las reglas pasaron, computa para el total oficial
OBSERVADA   → ≥1 regla ERROR; queda fuera del cómputo hasta recalcular o cerrarla
RECHAZADA   → no se computa (ej: mesa no encontrada)
OFICIALIZADA→ marca administrativa final (no usada por el bulk)
```

Sólo `VALIDADA` y `OFICIALIZADA` suman al total de `votos.validos / blancos / nulos` que devuelve `GET /oficial/resumen`.

---

## 8. Logs y archivos de salida

`03-flujo-oficial/logs/`

| Archivo | Contenido |
|---|---|
| `carga-errores-YYYY-MM-DD.log` | 1 línea por error crítico (mesa no encontrada, duplicado, check constraint). Incluye votos perdidos. |
| `inconsistencias-YYYY-MM-DD.log` | 1 línea por acta `OBSERVADA` con el listado de reglas rotas. |

Estos archivos son auditables — el sistema NO sobreescribe ni borra; sólo agrega.

---

## 9. Cheatsheet de troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `/oficial/resumen` da 502/timeout | Backend aún levantando | Esperar 30s. `docker logs oficial-backend`. |
| Todas las actas dan `MESA_NO_ENCONTRADA` | No cargaste catálogos antes de transcripciones | `docker compose run --rm csv-automation` carga los 4 en orden. |
| Cambié código y no se ve | No rebuildeaste la imagen | `docker compose build oficial-backend && docker compose up -d oficial-backend`. |
| Caracteres raros (Ã©, Ã±) | Encoding del CSV | El backend ya autodetecta UTF-8/latin1. Si persiste, abrí el CSV y guardá como UTF-8. |
| Quiero empezar de cero | Volúmenes con datos viejos | `cd 01-clusters-bases-failover; docker compose down -v; docker compose up -d`. |
| Frontend no carga (CORS) | Backend no expone CORS al puerto del UI | Revisar `backend/src/main.ts` → `app.enableCors()`. |

---

## 10. Resumen ejecutivo

- **4 endpoints de carga** (`territorio`, `recintos`, `mesas`, `actas/bulk`) — orden estricto.
- **5 endpoints de lectura** alimentan todo el dashboard (`resumen`, `actas`, `actas/:id`, `validaciones`, `importaciones`, `auditoria`).
- **17 reglas** de validación: R1..R7 (números), H1..H4 (horarios), 10× OBS_* (texto del CSV).
- **Cualquier ERROR → OBSERVADA**. Sólo `VALIDADA`/`OFICIALIZADA` cuentan en el total oficial.
- **Idempotencia**: el endpoint bulk usa `ON CONFLICT (codigo_acta) DO UPDATE`, podés reenviar el mismo CSV sin duplicar.
- **Auditoría completa**: cada importación, validación y recálculo queda en `auditoria_oficial` y en archivos `logs/*.log`.
