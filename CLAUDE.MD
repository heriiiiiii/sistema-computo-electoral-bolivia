# CLAUDE.md — Project Context

## Project Name

Sistema Nacional de Cómputo Electoral Bolivia

This is a university project for the Distributed Systems course. The goal is to design and implement a distributed, fault-tolerant electoral counting system for Bolivia.

The project is not only about coding. It must demonstrate architectural reasoning, distributed system design, fault tolerance, data consistency, resilience, separation of responsibilities, and the ability to handle real-world electoral scenarios such as poor connectivity, duplicate records, inconsistent data, image-based tally sheets, SMS transmission, CSV imports, and database node failures.

---

## General Problem Context

The Bolivian electoral authority needs a distributed system capable of processing national election results under realistic conditions.

The system must support:

- 5,368 electoral precincts.
- 35,000 voting tables.
- Unstable or limited connectivity in some locations.
- High concurrent demand during election night.
- Transmission of tally sheet images.
- Alternative SMS-based result reporting.
- Official result processing from CSV files.
- Comparison between preliminary and official results.
- Analytical visualization through a dashboard.
- Database fault tolerance and recovery.

The project must implement two independent but coherent data-processing pipelines:

1. **RRV / TREP / Quick Vote Count**
2. **Official Count**

Both pipelines must be integrated at the analytical and visualization level, but their internal responsibilities must remain separated.

---

## Main Objective

Design and implement a distributed architecture based on two decoupled pipelines that allows the system to:

1. Process preliminary results in near real time.
2. Generate official, auditable, traceable results.
3. Compare preliminary and official results through an analytical dashboard.
4. Continue operating under partial system failures.
5. Demonstrate fault tolerance at the database level.
6. Support realistic electoral scenarios such as duplicate actas, inconsistent results, SMS reports, OCR errors, invalid files, and node failures.

---

## Project Repository Structure

The repository is organized by team responsibility. Each team member must work only inside their assigned folder unless explicitly instructed otherwise.

Current structure:

```txt
sistema-computo-electoral-bolivia/
├── 01-clusters-bases-failover/
├── 02-flujo-rapido-rrv/
├── 03-flujo-oficial/
├── 04-dashboard-avanzado/
├── 05-app-movil-sms/
├── 06-integracion-sqa-carga/
├── docs/
├── shared/
├── .gitignore
└── README.md
Important rule:

Do not modify another team member’s folder unless explicitly requested.
Do not modify shared project files unless explicitly requested.
Each module must be independent enough to be developed separately and integrated later through documented APIs, formats, and configuration.
Main System Architecture

The system follows a distributed architecture with two separate processing flows.

                         ┌──────────────────────────────┐
                         │        DASHBOARD WEB          │
                         │ Metrics, KPIs, comparison     │
                         │ RRV vs Official, system state │
                         └──────────────▲───────────────┘
                                        │
                             Query / read APIs
                                        │
              ┌─────────────────────────┴─────────────────────────┐
              │                                                   │
    ┌─────────▼─────────┐                              ┌──────────▼──────────┐
    │   Quick Flow      │                              │   Official Flow     │
    │   RRV / TREP      │                              │   Official Count    │
    └─────────▲─────────┘                              └──────────▲──────────┘
              │                                                   │
    ┌─────────┴─────────┐                              ┌──────────┴──────────┐
    │ Mobile App / PDF  │                              │ Official CSV         │
    │ Image / SMS       │                              │ Automation           │
    └───────────────────┘                              └─────────────────────┘
              │                                                   │
    ┌─────────▼─────────┐                              ┌──────────▼──────────┐
    │ RRV Backend       │                              │ Official Backend    │
    │ OCR + validations │                              │ CSV + auditing      │
    └─────────▼─────────┘                              └──────────▼──────────┘
              │                                                   │
    ┌─────────▼─────────┐                              ┌──────────▼──────────┐
    │ NoSQL Cluster     │                              │ Relational Cluster  │
    │ Quick count       │                              │ Official count      │
    └───────────────────┘                              └─────────────────────┘

The dashboard consumes data only through backend endpoints. It must not connect directly to databases.

Pipeline 1: RRV / TREP / Quick Vote Count

The RRV pipeline is responsible for preliminary results.

It receives:

Photographs of electoral tally sheets.
PDF files of tally sheets.
SMS messages from precincts with limited connectivity.

It performs:

Image/PDF reception.
Image preprocessing.
OCR extraction.
QR or barcode reading when available.
SMS interpretation.
Basic validation.
Duplicate detection.
Suspicious case detection.
Error logging.
Preliminary result storage.
Publication of preliminary data for the dashboard.

This pipeline prioritizes:

Low latency.
High availability.
Fast processing.
Eventual consistency.
Fault tolerance.
Ability to keep receiving data even if other modules fail.

The RRV flow is not official. It is used for early public visualization and analytical comparison.

Pipeline 2: Official Count

The Official Count pipeline is responsible for exact and auditable results.

It receives:

A CSV file containing the official transcription of tally sheets.
Rows may be processed by n8n or an equivalent automation mechanism.
The automation must send normalized data to the backend. It must not write directly to the database.

It performs:

CSV reception.
CSV reading and automation.
Data normalization.
Rigorous validation.
Consistency checks.
Audit trail registration.
Official result storage.
Preparation of data for comparison against RRV.

This pipeline prioritizes:

Strong consistency.
Accuracy.
Traceability.
Auditing.
Referential integrity.
Official result generation.

The official pipeline must be able to work even if the RRV pipeline is unavailable.

Analytical Dashboard

The dashboard is the visualization and analysis layer of the system.

It must show:

RRV preliminary results.
Official results.
RRV vs Official comparison.
Electoral metrics.
KPIs.
Acta status.
Received, processed, pending, rejected, and suspicious actas.
Votes by candidate or party.
Valid, blank, and null votes.
Participation rate.
Candidate percentages.
Victory margin.
Processing speed.
Differences between quick count and official count.
Geographic analysis by department, province, municipality, and precinct.
Territorial vote distribution.
Traceability of processing.
Access to digitized actas.
Technical metrics such as latency, throughput, availability, and security alerts.
Cluster status.
Inconsistencies.
Common errors.

The dashboard must not implement critical business validation by itself. It must consume processed information from backend endpoints.

Mobile App

The mobile app belongs to the RRV flow.

It must:

Capture a photo of the acta.
Attach minimum information such as table and precinct.
Send the image to the RRV backend.
Support or assist SMS-based reporting.
Show the sending status to the user.

The mobile app must not:

Write directly to any database.
Decide whether an acta is official.
Validate fraud by itself.
Modify results directly.
SMS Channel

SMS is an alternative channel for low-connectivity areas.

It must:

Receive a message.
Interpret the content.
Validate the format.
Associate the SMS with a voting table and precinct.
Register valid, invalid, duplicate, or suspicious SMS messages.
Feed preliminary information into the RRV pipeline.

SMS is part of the RRV flow. It is not part of the official count.

SMS security must be handled by system rules such as authorized origin numbers, expected format, table/precinct association, and logging of suspicious attempts.

Official CSV Automation

CSV automation belongs to the official flow.

It may use:

n8n.
A script.
A backend service.
A simple ETL mechanism.

It must:

Read the CSV file.
Process rows.
Normalize data.
Send data to the official backend.
Register reading or processing errors.

It must not:

Write directly to the relational database.
Decide by itself whether results are official.
Skip backend validations.
Architectural Principles
1. Separation of Responsibilities

Each module has a clear responsibility:

Mobile App: capture and send actas.
SMS: alternative input channel.
RRV Backend: preliminary processing.
OCR: data extraction from images.
Official Backend: CSV validation and official processing.
Database Clusters: persistence and availability.
Dashboard: visualization and analysis.
Integration/SQA: testing, integration, load simulation, and validation.
Logs/Auditing: traceability and error tracking.

No module should take over responsibilities from another module.

2. Two Decoupled Pipelines

The architecture is based on two independent pipelines:

RRV / Quick Count.
Official Count.

Rules:

If the quick count fails, the official count must continue.
If the official count fails, the quick count must continue receiving actas.
The quick count must not modify official data.
The official count must not depend on RRV to work.
Both flows are integrated only through services, endpoints, and the dashboard.
3. CQRS

The project applies Command Query Responsibility Segregation.

Write operations include:

Receiving actas.
Processing OCR.
Receiving SMS.
Importing CSV data.
Executing validations.
Registering logs and audit trails.
Registering inconsistencies.

Read operations include:

Dashboard queries.
Reports.
Metrics.
Comparisons.
Cluster status.
Public or analytical visualization.

The goal is to keep write logic controlled and make read/query operations easier to optimize.

4. Event Sourcing

Important processing steps must be registered as events.

Examples:

ActaRRVReceived.
OCRProcessed.
ActaRRVValidated.
ActaRRVRejected.
SMSReceived.
CSVImported.
OfficialActaValidated.
InconsistencyDetected.
DatabaseNodeDown.
RetryExecuted.

The goal is to preserve traceability and allow reconstruction or auditing of what happened in the system.

5. Idempotency

The system must avoid corrupting data when the same event is received more than once.

Idempotency is important for:

Duplicate acta uploads.
Repeated SMS messages.
CSV re-uploads.
Automatic retries.
Network timeouts.
Backend retry logic.

The system should use identifiers such as:

actaId.
codigoMesa.
codigoRecinto.
hashArchivo.
smsId.
csvBatchId.
eventId.
idempotencyKey.
6. Fault Tolerance

The system must support partial failures.

It must include:

Database clusters.
Replication.
Retry mechanisms.
Error logs.
Pending states.
Recovery processes.
Continuity when one node fails.
Dashboard visibility of system health.

A database node failure must not immediately stop the full system.

7. Asynchronous Processing

Slow or heavy tasks should be processed asynchronously when possible.

Examples:

OCR processing.
Image preprocessing.
CSV bulk import.
Official validations.
RRV vs Official comparison.
Dashboard metric generation.
Retry operations.

The system should avoid blocking complete workflows due to a single heavy task.

Fault Tolerance Requirements

The system must demonstrate database fault tolerance.

For the quick RRV flow:

If a NoSQL database node fails, another node should remain available or the system should recover.
The failure must be logged.
The node should synchronize again when restored.

For the official flow:

If a relational database node fails, the system should continue using an available node or recover through a documented strategy.
The failure must be logged.
The dashboard should be able to show the cluster state.

For the dashboard:

If one service is down, the whole interface should not crash.
The dashboard should show controlled errors and the affected module.
Integration Rules

To avoid integration conflicts:

The mobile app sends data only to the RRV backend.
SMS enters only through the RRV backend or SMS receiver service.
CSV automation sends data only to the official backend.
The dashboard consumes only backend endpoints.
The dashboard does not write electoral results.
The dashboard does not query databases directly.
RRV does not write official results.
Official Count does not modify RRV records.
Critical actions must be logged or audited.
All modules must use consistent identifiers for table, precinct, acta, candidate/party, and source.
Write endpoints should support idempotency where applicable.
Final tests must include failures, duplicates, invalid data, and concurrent or bulk loads.
Standard API Response Format

Whenever possible, backend endpoints should return a standard format.

Success response:

{
  "success": true,
  "message": "Data retrieved successfully",
  "data": {}
}

Error response:

{
  "success": false,
  "message": "Could not retrieve the information",
  "codigoError": "ERROR_CODE",
  "data": null
}
Main Data Sources

The system will work with different inputs:

RRV Inputs
Acta image.
Acta PDF.
SMS message.
Metadata from the mobile app or upload mechanism.
OCR output.
QR/barcode output when available.
Official Inputs
CSV file with official transcribed data.
Territorial data.
Voting centers.
Voting tables.
Candidate/party results.
User or process that performed the import.
Dashboard Inputs
Processed RRV results.
Processed official results.
Comparison records.
Cluster status.
Logs or summarized errors.
Metrics and KPIs.
Real Acta / Tally Sheet Context

The system will process Bolivian-style electoral tally sheets.

A typical acta may contain:

Verification code.
QR code.
Barcode.
codigoMesa.
numeroMesa.
department.
province.
municipality.
locality.
recinto name.
voting opening time.
voting closing time.
cantidadElectoresHabilitados.
papeletasEnAnfora.
papeletasNoUtilizadas.
candidate/party vote counts.
votosValidos.
votosBlancos.
votosNulos.
observations.
juror/delegate signature and fingerprint areas.

For the prototype, candidates or parties may be normalized as:

P1.
P2.
P3.
P4.

Even if the image shows specific candidate names, the system may internally map them to P1, P2, P3, and P4.

The OCR pipeline may extract imperfect or inconsistent data. The system must not blindly trust OCR output. Inconsistent actas must be marked as suspicious or pending review.

Vote Consistency Rule

The project must use one consistent rule for votes:

votosValidos = sum of votes by parties/candidates
totalVotos = votosValidos + votosBlancos + votosNulos

This rule must be applied consistently in:

RRV processing.
SMS interpretation.
Official CSV validation.
Dashboard comparison.
Inconsistency detection.

If extracted data does not satisfy the rule, the record should not be silently corrected. It should be marked as suspicious, rejected, or pending review depending on the module.

Duplicate and Fraud Handling Principles

The system must not automatically overwrite records when duplicates appear.

If a second acta arrives for the same voting table:

Do not automatically replace the previous one.
Keep both records.
Mark the case as a conflict.
Compare available evidence such as hash, image, OCR output, metadata, source, timestamps, QR/barcode, and chain of custody.
Require human review or official evidence before deciding which one is valid.

If SMS and OCR results exist for the same table and do not match:

Register an inconsistency.
Do not automatically decide which one is true.
Keep traceability of both sources.

If a CSV official result differs from RRV:

Register the difference.
Show it in comparison.
Do not modify RRV records directly.
Do not modify official records from the RRV module.
State Naming Convention

All states must be uppercase.

RRV Acta States

Use:

RECIBIDA
PROCESANDO
VALIDADA
SOSPECHOSA
RECHAZADA
PUBLICADA
PENDIENTE_REVISION

Do not use PROCESADA.

Official Acta States

Use:

IMPORTADA
VALIDANDO
VALIDADA
OBSERVADA
RECHAZADA
OFICIALIZADA
SMS States

Use:

RECIBIDO
VALIDO
INVALIDO
SOSPECHOSO
DUPLICADO
Allowed Source Values
RRV Sources

Use:

APP_MOVIL
CARGA_WEB
SMS
Official Source

Use:

CSV
System Source

Use:

SISTEMA

Avoid undefined source names.

Official Technology Stack

The agreed technology stack is:

Backend

NestJS + TypeScript

Used for:

RRV API.
Official API.
Dashboard API.
Health endpoints.
Validations.
Database connections.
CSV processing.
OCR integration.
NoSQL Database

MongoDB Replica Set

Used for:

RRV quick flow.
Actas received.
OCR output.
SMS records.
RRV logs.
RRV events.
Preliminary states.
Relational Database

PostgreSQL with replication or a simulated relational cluster

Used for:

Official count.
CSV imports.
Official results.
Auditing.
Traceability.
Comparisons.
Inconsistencies.
Dashboard

React + Vite + TypeScript

Recommended libraries:

Recharts.
Axios.
React Router.
Mobile App

React Native with Expo

Used for:

Acta photo capture.
Sending actas to the RRV backend.
SMS support or SMS form.
OCR / Image Tools

Recommended tools:

Tesseract.js.
Sharp.
ZXing or jsQR.
CSV Automation

Recommended:

n8n.

Fallback:

Node.js script or equivalent automated mechanism.

Important:

Automation must not write directly to PostgreSQL.
It must send data to the official backend.
Containers

Docker Compose

Used for:

MongoDB Replica Set.
PostgreSQL primary/replica.
Backend services.
Dashboard.
n8n if used in container.
Testing

Recommended:

Postman.
k6.
Node.js scripts.

Used for:

Endpoint tests.
Integration tests.
Load tests.
Failure tests.
Duplicate tests.
Required Demonstration Scenarios

The final project should demonstrate:

Receiving an acta from the mobile app or upload mechanism.
Processing an acta through OCR.
Receiving or simulating an SMS report.
Loading official CSV data through automation.
Validating official results.
Showing RRV results.
Showing official results.
Comparing RRV vs Official.
Detecting inconsistent actas.
Detecting duplicate actas.
Showing dashboard KPIs.
Showing geographic results.
Showing cluster status.
Simulating a database node failure.
Showing that the system continues or recovers.
Registering logs, audit trails, and technical errors.
Project Evaluation Criteria

The project will be evaluated on:

Correct distributed architecture.
Separation between RRV and Official Count.
Database fault tolerance.
Scalability and resilience.
Dashboard visualization and analysis.
Handling of real-world scenarios such as SMS, failures, duplicates, and inconsistent data.
Architectural decisions.
Problems found and how they were solved.
Screenshots of important implementation parts.
Functional demonstration.
Individual defense in English.
Development Behavior Rules for Claude

When assisting with this project:

First analyze before modifying files.
Do not modify files outside the requested folder.
Keep the module boundaries clear.
Prefer simple, demonstrable solutions over overly complex enterprise setups.
Make everything easy to run in a classroom/demo environment.
Use Docker Compose where appropriate.
Document commands clearly.
Keep scripts and configuration understandable.
Avoid breaking integration contracts.
Use uppercase states.
Respect the separation between RRV, Official Count, Dashboard, Mobile App, and database modules.
Do not invent hidden requirements.
If something is ambiguous, propose a safe default and explain it before implementing.
Prioritize compatibility with NestJS integration.
Prioritize a clean README for every module.
Important Reminder

This project must show that the team understands distributed systems.

The key idea is not just to store votes. The key idea is to show:

Decoupled pipelines.
Fault-tolerant databases.
Clear data ownership.
Event traceability.
Idempotency.
Recovery from failures.
Consistency rules.
Analytical comparison.
Realistic handling of unreliable inputs.