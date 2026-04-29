# Official Flow Backend - Implementation Notes

This document summarizes what has been implemented in the official flow backend (module 03), plus audit coverage and known NestJS/TypeScript issues.

## What Was Implemented

### Backend Structure (NestJS)
Modules and responsibilities:
- DatabaseModule: Global pg pool. Connects through HAProxy router (module 01) on port 5434.
- CatalogosModule: Loads catalogs (territory, recintos, mesas) with idempotent upserts.
- OficialModule: CSV import, bulk actas processing, validations, queries, RRV comparison.
- AuditoriaModule: Inserts audit, validation, and inconsistency records.

### Endpoints
Base prefix: /api

Catalogs:
- POST /api/oficial/catalogos/territorio
- POST /api/oficial/catalogos/recintos
- POST /api/oficial/catalogos/mesas

Official flow:
- POST /api/oficial/csv
- POST /api/oficial/actas/bulk
- GET /api/oficial/actas
- GET /api/oficial/actas/:id
- GET /api/oficial/importaciones
- GET /api/oficial/auditoria
- GET /api/oficial/validaciones
- GET /api/oficial/resumen
- POST /api/oficial/comparar-rrv

### CSV Automation
Script: 03-flujo-oficial/automation/load-csvs.js
- Loads the 4 CSVs in order.
- Uses Latin1 encoding.
- Sends data in chunks of 200 rows.
- Continues on errors and reports summary.

Load order:
1) DistribucionTerritorial.csv -> /oficial/catalogos/territorio
2) RecintosElectorales.csv -> /oficial/catalogos/recintos
3) ActasImpresas.csv -> /oficial/catalogos/mesas
4) Transcripciones.csv -> /oficial/actas/bulk

### Validation Rules (Oficial)
Applied per acta:
- P1 + P2 + P3 + P4 = VotosValidos (CRITICA if fails)
- All votes >= 0 (ALTA if fails)
- TotalVotos <= VotantesHabilitados (CRITICA if fails)
- TotalVotos = PapeletasAnfora (WARNING if differs)

Acta with errors -> estado OBSERVADA + inconsistencia.
Acta without errors -> estado VALIDADA.

### Audit Coverage
Auditing is recorded in:
- auditoria_oficial (critical actions)
- validaciones_oficiales (all validation rules per acta)
- inconsistencias (critical validation failures)

Catalog imports now also write audit summary records:
- IMPORTACION_TERRITORIO
- IMPORTACION_RECINTOS
- IMPORTACION_MESAS

### Availability
- Backend connects through HAProxy router at localhost:5434.
- Pool retries transient failures (db.util.ts).
- This supports failover without changing backend config.

## CSV Column Mapping
Transcripciones.csv uses P1..P4 as party votes. These are mapped to resultados_oficiales (one row per party).
Manual labels like "Jirado 90 grados" in the CSV are ignored for now.

## How To Run
Backend:
- cd backend
- npm install
- npm run start:dev

Automation:
- cd automation
- npm install
- node load-csvs.js

Environment defaults:
- PORT=4000
- DATABASE_URL=postgresql://oep_user:oep_password@localhost:5434/oep_oficial

## Known NestJS/TypeScript Issues
If you see errors like "Cannot find module '@nestjs/common'" or missing Express types:
- Ensure node_modules is installed in backend (npm install).
- @types/express was added to devDependencies.

If TypeScript warns about rootDir or baseUrl deprecation:
- tsconfig.json now includes rootDir and ignoreDeprecations.

## Notes
- Direct SQL loads are not allowed by Documento 5.
- All CSV writes must go through the backend to preserve validation and audit.
