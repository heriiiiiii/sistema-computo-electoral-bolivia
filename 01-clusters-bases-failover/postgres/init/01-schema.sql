-- =============================================================================
--  01-schema.sql
--  Official Electoral Database Schema
--  Sistema Nacional de Cómputo Electoral Bolivia
--
--  Creates 16 tables for the official count pipeline.
--  This file runs automatically on first start via /docker-entrypoint-initdb.d/
--
--  IDEMPOTENT: uses CREATE TABLE IF NOT EXISTS.
--
--  Vote consistency rule (enforced by backend validation, not by DB):
--    votosValidos = SUM(P1 + P2 + P3 + P4)
--    totalVotos   = votosValidos + votosBlancos + votosNulos
-- =============================================================================

-- Ensure we are in the correct database
\connect oep_oficial

-- ── 1. departamentos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departamentos (
  id     SERIAL       PRIMARY KEY,
  codigo VARCHAR(20)  UNIQUE,
  nombre VARCHAR(100) NOT NULL
);

-- ── 2. provincias ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provincias (
  id               SERIAL       PRIMARY KEY,
  departamento_id  INTEGER      NOT NULL REFERENCES departamentos(id),
  codigo           VARCHAR(20)  UNIQUE,
  nombre           VARCHAR(100) NOT NULL
);

-- ── 3. municipios ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS municipios (
  id           SERIAL       PRIMARY KEY,
  provincia_id INTEGER      NOT NULL REFERENCES provincias(id),
  codigo       VARCHAR(20)  UNIQUE,
  nombre       VARCHAR(100) NOT NULL
);

-- ── 4. recintos ───────────────────────────────────────────────────────────────
-- CSV mapping: RecintoId → codigo_recinto, Recinto → nombre
CREATE TABLE IF NOT EXISTS recintos (
  id                  SERIAL       PRIMARY KEY,
  codigo_recinto      VARCHAR(50)  UNIQUE NOT NULL,
  codigo_territorial  VARCHAR(50),
  municipio_id        INTEGER      REFERENCES municipios(id),
  nombre              VARCHAR(200) NOT NULL,
  direccion           TEXT,
  cantidad_mesas      INTEGER
);

-- ── 5. mesas ──────────────────────────────────────────────────────────────────
-- CSV mapping: CodigoMesa → codigo_mesa, Mesa → numero_mesa, NroVotantes → cantidad_habilitada
-- IMPORTANT: P1, P2, P3, P4 are NOT columns here. Votes are stored in resultados_oficiales.
CREATE TABLE IF NOT EXISTS mesas (
  id                  SERIAL      PRIMARY KEY,
  codigo_mesa         VARCHAR(50) UNIQUE NOT NULL,
  codigo_territorial  VARCHAR(50),
  numero_mesa         INTEGER     NOT NULL,
  recinto_id          INTEGER     REFERENCES recintos(id),
  cantidad_habilitada INTEGER     NOT NULL,
  CHECK (cantidad_habilitada >= 0)
);

-- ── 6. partidos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partidos (
  id     SERIAL      PRIMARY KEY,
  codigo VARCHAR(20) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  sigla  VARCHAR(20)
);

-- ── 7. candidatos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidatos (
  id         SERIAL       PRIMARY KEY,
  partido_id INTEGER      NOT NULL REFERENCES partidos(id),
  nombre     VARCHAR(150) NOT NULL,
  cargo      VARCHAR(50)  NOT NULL,
  CHECK (cargo IN ('PRESIDENTE', 'DIPUTADO_UNINOMINAL', 'OTRO'))
);

-- ── 8. csv_importaciones ─────────────────────────────────────────────────────
-- Records every CSV file loaded into the system.
-- CSV automation must NOT write directly to PostgreSQL — it must use the backend.
CREATE TABLE IF NOT EXISTS csv_importaciones (
  id                 SERIAL       PRIMARY KEY,
  nombre_archivo     VARCHAR(255) NOT NULL,
  hash_archivo       VARCHAR(255) UNIQUE NOT NULL,
  tipo_importacion   VARCHAR(50)  NOT NULL,
  usuario_carga      VARCHAR(150),
  rol_usuario_carga  VARCHAR(100),
  ip_origen          VARCHAR(100),
  fecha_carga        TIMESTAMP    DEFAULT now(),
  total_filas        INTEGER      DEFAULT 0,
  filas_validas      INTEGER      DEFAULT 0,
  filas_invalidas    INTEGER      DEFAULT 0,
  estado             VARCHAR(50)  NOT NULL,
  observacion        TEXT,
  CHECK (tipo_importacion IN ('TERRITORIAL', 'RECINTOS', 'MESAS', 'RESULTADOS_OFICIALES')),
  CHECK (estado IN ('PROCESANDO', 'COMPLETADO', 'COMPLETADO_CON_ERRORES', 'FALLIDO'))
);

-- ── 9. actas_oficiales ────────────────────────────────────────────────────────
-- One row per mesa + franja. Vote fields are nullable during import/validation.
-- Format: OF-{codigoMesa}-{franja}  e.g. OF-10101001001-PRESIDENTE
CREATE TABLE IF NOT EXISTS actas_oficiales (
  id                   SERIAL       PRIMARY KEY,
  mesa_id              INTEGER      NOT NULL REFERENCES mesas(id),
  csv_importacion_id   INTEGER      REFERENCES csv_importaciones(id),
  codigo_acta          VARCHAR(100) UNIQUE NOT NULL,
  codigo_acta_csv      VARCHAR(100),
  franja               VARCHAR(50)  NOT NULL,
  -- Vote totals (nullable until backend validation clears them)
  votos_validos        INTEGER,
  votos_blancos        INTEGER,
  votos_nulos          INTEGER,
  total_votos          INTEGER,
  papeletas_en_anfora  INTEGER,
  papeletas_no_utilizadas INTEGER,
  -- Horarios reales (vienen del CSV de transcripciones)
  apertura_hora        SMALLINT,
  apertura_minutos     SMALLINT,
  cierre_hora          SMALLINT,
  cierre_minutos       SMALLINT,
  estado               VARCHAR(50)  NOT NULL,
  fuente               VARCHAR(30)  DEFAULT 'CSV',
  recalculado          BOOLEAN      DEFAULT FALSE,
  -- Trazabilidad de personas reales que tocan el acta
  usuario_importacion  VARCHAR(150),
  fecha_importacion    TIMESTAMP    DEFAULT now(),
  usuario_validacion   VARCHAR(150),
  fecha_validacion     TIMESTAMP,
  usuario_revision     VARCHAR(150),
  fecha_revision       TIMESTAMP,
  observacion          TEXT,
  -- A mesa can only have one official acta per electoral section (franja)
  UNIQUE (mesa_id, franja),
  CHECK (franja IN ('PRESIDENTE', 'DIPUTADO_UNINOMINAL')),
  CHECK (estado IN ('IMPORTADA', 'VALIDANDO', 'VALIDADA', 'OBSERVADA', 'RECHAZADA', 'OFICIALIZADA')),
  CHECK (votos_validos          IS NULL OR votos_validos          >= 0),
  CHECK (votos_blancos          IS NULL OR votos_blancos          >= 0),
  CHECK (votos_nulos            IS NULL OR votos_nulos            >= 0),
  CHECK (total_votos            IS NULL OR total_votos            >= 0),
  CHECK (papeletas_en_anfora    IS NULL OR papeletas_en_anfora    >= 0),
  CHECK (papeletas_no_utilizadas IS NULL OR papeletas_no_utilizadas >= 0)
);

-- ── 10. resultados_oficiales ──────────────────────────────────────────────────
-- One row per party per acta. P1/P2/P3/P4 are rows, NOT columns.
CREATE TABLE IF NOT EXISTS resultados_oficiales (
  id              SERIAL   PRIMARY KEY,
  acta_oficial_id INTEGER  NOT NULL REFERENCES actas_oficiales(id) ON DELETE CASCADE,
  partido_id      INTEGER  NOT NULL REFERENCES partidos(id),
  candidato_id    INTEGER  REFERENCES candidatos(id),
  franja          VARCHAR(50) NOT NULL,
  cantidad_votos  INTEGER  NOT NULL,
  CHECK (cantidad_votos >= 0),
  CHECK (franja IN ('PRESIDENTE', 'DIPUTADO_UNINOMINAL')),
  UNIQUE (acta_oficial_id, partido_id, franja)
);

-- ── 11. validaciones_oficiales ────────────────────────────────────────────────
-- One row per validation rule applied to an official acta.
CREATE TABLE IF NOT EXISTS validaciones_oficiales (
  id              SERIAL       PRIMARY KEY,
  acta_oficial_id INTEGER      NOT NULL REFERENCES actas_oficiales(id) ON DELETE CASCADE,
  regla           VARCHAR(100) NOT NULL,
  resultado       VARCHAR(30)  NOT NULL,
  mensaje         TEXT,
  severidad       VARCHAR(30)  NOT NULL,
  ejecutado_por   VARCHAR(150),
  fecha_validacion TIMESTAMP   DEFAULT now(),
  CHECK (resultado  IN ('OK', 'WARNING', 'ERROR')),
  CHECK (severidad  IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA'))
);

-- ── 12. auditoria_oficial ─────────────────────────────────────────────────────
-- Strict audit trail: who did what, when, from where, before/after values.
CREATE TABLE IF NOT EXISTS auditoria_oficial (
  id             SERIAL       PRIMARY KEY,
  entidad        VARCHAR(50)  NOT NULL,
  entidad_id     INTEGER,
  usuario_accion VARCHAR(150),
  rol_usuario    VARCHAR(100),
  tipo_accion    VARCHAR(50)  NOT NULL,
  detalle        TEXT,
  valor_anterior JSONB,
  valor_nuevo    JSONB,
  ip_origen      VARCHAR(100),
  user_agent     TEXT,
  fecha_hora     TIMESTAMP    DEFAULT now()
);

-- (revisiones_oficiales eliminada — auditoria_oficial cubre el mismo caso de uso.)

-- ── 13. comparaciones_rrv_oficial ─────────────────────────────────────────────
-- Stores field-level comparisons between preliminary RRV and official results.
CREATE TABLE IF NOT EXISTS comparaciones_rrv_oficial (
  id               SERIAL       PRIMARY KEY,
  codigo_mesa      VARCHAR(50)  NOT NULL,
  resultado_rrv_id VARCHAR(100),
  acta_rrv_id      VARCHAR(100),
  acta_oficial_id  INTEGER      REFERENCES actas_oficiales(id),
  franja           VARCHAR(50),
  campo            VARCHAR(100) NOT NULL,
  valor_rrv        INTEGER,
  valor_oficial    INTEGER,
  diferencia       INTEGER,
  estado           VARCHAR(50)  NOT NULL,
  fecha_comparacion TIMESTAMP   DEFAULT now(),
  CHECK (estado IN ('COINCIDE', 'DIFERENCIA_LEVE', 'INCONSISTENCIA', 'CRITICA'))
);

-- ── 15. inconsistencias ───────────────────────────────────────────────────────
-- Cross-pipeline inconsistencies detected in the system.
CREATE TABLE IF NOT EXISTS inconsistencias (
  id                     SERIAL       PRIMARY KEY,
  origen                 VARCHAR(50)  NOT NULL,
  codigo_mesa            VARCHAR(50),
  acta_rrv_id            VARCHAR(100),
  resultado_rrv_id       VARCHAR(100),
  acta_oficial_id        INTEGER,
  tipo                   VARCHAR(100) NOT NULL,
  descripcion            TEXT,
  severidad              VARCHAR(30)  NOT NULL,
  estado                 VARCHAR(50)  NOT NULL,
  detectado_por          VARCHAR(150),
  fecha_deteccion        TIMESTAMP    DEFAULT now(),
  fecha_resolucion       TIMESTAMP,
  resuelto_por           VARCHAR(150),
  observacion_resolucion TEXT,
  CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
  CHECK (estado    IN ('ABIERTA', 'EN_REVISION', 'RESUELTA', 'DESCARTADA'))
);

-- ── 16. cluster_status ────────────────────────────────────────────────────────
-- Technical status of database nodes (both MongoDB and PostgreSQL).
-- Updated by the health check script.
CREATE TABLE IF NOT EXISTS cluster_status (
  id                   SERIAL       PRIMARY KEY,
  cluster_nombre       VARCHAR(100) NOT NULL,
  motor                VARCHAR(50)  NOT NULL,
  nodo                 VARCHAR(100) NOT NULL,
  host                 VARCHAR(100),
  puerto               INTEGER,
  rol                  VARCHAR(50),
  estado               VARCHAR(50),
  ultima_verificacion  TIMESTAMP    DEFAULT now(),
  latencia_ms          INTEGER,
  observacion          TEXT,
  CHECK (motor  IN ('POSTGRESQL', 'MONGODB')),
  CHECK (rol    IN ('PRIMARY', 'REPLICA', 'SECONDARY', 'ARBITER', 'UNKNOWN')),
  CHECK (estado IN ('ACTIVO', 'CAIDO', 'RECUPERANDO', 'SINCRONIZANDO', 'DESCONOCIDO'))
);

-- Seed initial cluster_status rows (updated by health check script later)
INSERT INTO cluster_status (cluster_nombre, motor, nodo, host, puerto, rol, estado, observacion)
VALUES
  ('oep-postgresql', 'POSTGRESQL', 'postgres-primary', 'postgres-primary', 5432, 'PRIMARY',  'DESCONOCIDO', 'Initial placeholder'),
  ('oep-postgresql', 'POSTGRESQL', 'postgres-replica', 'postgres-replica', 5432, 'REPLICA',  'DESCONOCIDO', 'Initial placeholder'),
  ('oep-mongodb',    'MONGODB',    'mongo1',           'mongo1',           27017, 'PRIMARY',  'DESCONOCIDO', 'Initial placeholder'),
  ('oep-mongodb',    'MONGODB',    'mongo2',           'mongo2',           27017, 'SECONDARY','DESCONOCIDO', 'Initial placeholder'),
  ('oep-mongodb',    'MONGODB',    'mongo3',           'mongo3',           27017, 'SECONDARY','DESCONOCIDO', 'Initial placeholder')
ON CONFLICT DO NOTHING;
