# CSVs de entrada — Flujo Oficial

Exportá desde Excel con: **Guardar como → CSV (delimitado por comas) (\*.csv)**.
NO necesitás "CSV UTF-8". El backend autodetecta UTF-8 / Windows-1252 / Latin-1.

## DistribucionTerritorial.csv

| Col | Cabecera | Contenido | Notas |
|----:|----------|-----------|-------|
| A | CodigoTerritorial | 5 dígitos (ddpmm) |  |
| B | Departamento | nombre | debe ser uno de los 9 oficiales |
| C | Municipio | **contiene Provincia** | (header invertido en la fuente) |
| D | Provincia | **contiene Municipio** | (header invertido en la fuente) |

## RecintosElectorales.csv

| Col | Cabecera | Contenido | Notas |
|----:|----------|-----------|-------|
| A | (vacía) | NroAsiento | **se ignora** |
| B | CodigoTerritorial | 5 dígitos | FK lógica con DistribucionTerritorial |
| C | CodigoRecinto | 10 dígitos | UNIQUE |
| D | RecintoNombre | texto |  |
| E | RecintoDireccion | texto |  |
| F | NumMesas | entero |  |

## ActasImpresas.csv

| Col | Cabecera | Contenido |
|----:|----------|-----------|
| A | CodigoRecinto | 10 dígitos (FK a recintos) |
| B | CodigoActa | 13 dígitos |
| C | NroMesa | entero |
| D | VotantesHabilitados | entero |

## Transcripciones.csv

| Col | Cabecera | Contenido | Notas |
|----:|----------|-----------|-------|
| A | CodigoTerritorial | redundante (no se usa) |  |
| B | Departamento | redundante |  |
| C | Provincia | redundante |  |
| D | Municipio | redundante |  |
| E | CodigoRecinto | FK a recintos |  |
| F | RecintoNombre | redundante |  |
| G | RecintoDireccion | redundante |  |
| H | NumMesas | redundante |  |
| I | CodigoActa | 13 dígitos |  |
| J | NroMesa | entero |  |
| K | VotantesHabilitados | entero |  |
| L | PapeletasAnfora | entero |  |
| M | PapeltasNoUtilizadas | entero | (sic — typo en la fuente, lo aceptamos) |
| N..Q | P1..P4 | votos por partido |  |
| R | VotosValidos | entero | si difiere de P1+P2+P3+P4 → acta queda OBSERVADA |
| S | VotosBlancos | entero |  |
| T | VotosNulos | entero |  |
| U | Observaciones | texto |  |
| V | (vacía) | — | **columna sin nombre, se ignora** |
| W | AperturaHora | 0..23 |  |
| X | AperturaMinutos | 0..59 |  |
| Y | CierreHora | 0..23 | debe ser > apertura |
| Z | CierreMinutos | 0..59 |  |

## Reglas de validación (backend)

- R1: P1..P4 ≥ 0
- R2: VotosValidos = P1 + P2 + P3 + P4
- R3: TotalVotos = VotosValidos + VotosBlancos + VotosNulos
- R4: TotalVotos ≤ VotantesHabilitados
- R5: TotalVotos = PapeletasAnfora

Acta con cualquier ERROR → estado **OBSERVADA** + entrada en `inconsistencias` y en `logs/inconsistencias-*.log`.

## Si querés validar una acta OBSERVADA

Desde el frontend: pestaña **Actas** → clic en una fila → botón **Recalcular y validar**.
Toma `P1+P2+P3+P4` como verdad y reaplica las reglas.




cd 01-clusters-bases-failover
docker compose down -v   # ⚠️ borrar volumen para que el cambio en 01-schema (no hubo nuevo, pero sí cambió la lógica de inserts) quede limpio
docker compose up -d
# espera ~30s

cd ../03-flujo-oficial
docker compose build oficial-backend oficial-frontend
docker compose up -d
docker compose run --rm csv-automation