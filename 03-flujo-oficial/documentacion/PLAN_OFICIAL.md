# Official Flow Backend (Module 03)

## Overview
This module implements the Official Count flow. It receives official CSV data, normalizes and validates it, records auditing and traceability, stores official results in the relational cluster, and exposes read endpoints for the dashboard and comparisons.

This module is independent from the RRV flow and must not write to the NoSQL cluster.

## Scope

### In Scope
- Backend for official CSV ingestion.
- CSV normalization and validation.
- Audit and traceability records.
- Storage in the relational cluster.
- Endpoints for dashboard queries.
- Preparation for RRV vs Official comparisons.

### Out of Scope
- OCR or image/PDF ingestion.
- Mobile app or SMS ingestion.
- Dashboard UI.
- NoSQL storage.
- Any write to RRV data.

## Architecture Notes
- Backend must use the PostgreSQL router (HAProxy) for availability.
- If the primary fails, HAProxy routes to the replica.
- Backend must retry transient DB write errors.
- All writes must pass through backend validations (no direct SQL loads).

## Configuration (Defaults)
- Backend URL: http://localhost:4000
- Database URL (router): postgresql://oep_user:oep_password@localhost:5434/oep_oficial

## Database Schema (Required Tables)
- departamentos
- provincias
- municipios
- recintos
- mesas
- partidos
- candidatos
- csv_importaciones
- actas_oficiales
- resultados_oficiales
- validaciones_oficiales
- auditoria_oficial
- comparaciones_rrv_oficial
- inconsistencias
- cluster_status

## Required Endpoints

### CSV Import
- POST /api/oficial/csv
  - multipart/form-data: archivo, usuarioCarga, ipOrigen

### Bulk Actas (from automation)
- POST /api/oficial/actas/bulk

### Queries
- GET /api/oficial/actas
- GET /api/oficial/actas/:id
- GET /api/oficial/importaciones
- GET /api/oficial/auditoria
- GET /api/oficial/validaciones
- GET /api/oficial/resumen

### Comparison
- POST /api/oficial/comparar-rrv

## CSV Automation (No n8n)

### CSV Files
1. DistribucionTerritorial.csv
2. RecintosElectorales.csv
3. ActasImpresas.csv
4. Transcripciones.csv

### CSV Columns (Observed)

DistribucionTerritorial.csv
- CodigoTerritorial
- Departamento
- Municipio
- Provincia

RecintosElectorales.csv
- CodigoTerritorial
- CodigoRecinto
- RecintoNombre
- RecintoDireccion
- NumMesas

ActasImpresas.csv
- CodigoRecinto
- CodigoActa
- NroMesa
- VotantesHabilitados

Transcripciones.csv
- CodigoTerritorial
- Departamento
- Provincia
- Municipio
- CodigoRecinto
- RecintoNombre
- RecintoDireccion
- NumMesas
- CodigoActa
- NroMesa
- VotantesHabilitados
- PapeletasAnfora
- PapeletasNoUtilizadas
- P1
- P2
- P3
- P4
- VotosValidos
- VotosBlancos
- VotosNulos
- Observaciones
- AperturaHora
- AperturaMinutos
- CierreHora
- CierreMinutos

Additional notes seen in the CSV (manual flags like "Jirado 90 grados", "Anulado", etc.) are not part of the official schema and will be ignored for now.

Note: P1..P4 are the party vote columns in the CSVs. The backend must map each Pn to a party/candidate record and create one row per party in resultados_oficiales.

### Load Order
1. Load territory catalog (departamentos, provincias, municipios).
2. Load recintos catalog.
3. Load mesas and habilitados.
4. Load official actas (transcripciones).

### Suggested Catalog Endpoints
- POST /api/oficial/catalogos/territorio
- POST /api/oficial/catalogos/recintos
- POST /api/oficial/catalogos/mesas

### Actas Bulk Endpoint
- POST /api/oficial/actas/bulk

The automation script (Node.js) must:
- Read CSVs.
- Normalize data.
- Send payloads to backend.
- Log errors and continue.

## Validation Rules (Must Implement)

### CSV File
- Exists and not empty.
- Has required columns.
- Hash not previously imported.

### Territorial Integrity
- Departamento, provincia, municipio, recinto, mesa must exist.
- Relationships must be consistent.

### Acta Official Rules
- codigo_acta unique.
- One official acta per mesa + franja.
- franja in {PRESIDENTE, DIPUTADO_UNINOMINAL}.

### Vote Rules
- All vote counts are non-negative.
- Sum of party votes equals votos_validos.
- votos_validos + blancos + nulos = total_votos.
- total_votos <= habilitados.
- total_votos = papeletas_en_anfora.

For the current CSVs, sum of party votes is P1 + P2 + P3 + P4.

## Acta States (Uppercase)
- IMPORTADA
- VALIDANDO
- VALIDADA
- OBSERVADA
- RECHAZADA
- OFICIALIZADA

## Auditing and Traceability
Every critical action must insert:
- validaciones_oficiales
- auditoria_oficial
- inconsistencias (when applicable)

## Availability / Failover
- Backend must use postgres-router for all DB connections.
- Writes must retry on transient failures.
- The official flow must continue if primary fails and router switches to replica.

## Execution Order (Minimal Runbook)
1. Start DB cluster (module 01).
2. Start official backend (module 03).
3. Load catalog CSVs (territory, recintos, mesas).
4. Load transcripciones CSV via automation.
5. Validate summaries via GET /api/oficial/resumen.

## Non-Scope Reminder
- Do not modify RRV data.
- Do not write to NoSQL.
- Do not bypass backend validations.

## Optional (Demo UI)
This is not required by Documento 5, but can be added for demo purposes:
- A simple frontend form to visualize acta-by-acta data entry.
- The automation tool can simulate filling this form and submit each acta visually.
- The form must still send data to the backend endpoints and must not implement critical validations.
