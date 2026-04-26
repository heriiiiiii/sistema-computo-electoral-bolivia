-- =============================================================================
--  02-indexes.sql
--  PostgreSQL Index Creation
--  Sistema Nacional de Cómputo Electoral Bolivia
--
--  IDEMPOTENT: uses CREATE INDEX IF NOT EXISTS.
--  Runs after 01-schema.sql via /docker-entrypoint-initdb.d/
-- =============================================================================

-- ── Territorial hierarchy ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_provincias_departamento_id   ON provincias(departamento_id);
CREATE INDEX IF NOT EXISTS idx_municipios_provincia_id      ON municipios(provincia_id);

-- ── Recintos ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recintos_codigo_recinto      ON recintos(codigo_recinto);
CREATE INDEX IF NOT EXISTS idx_recintos_municipio_id        ON recintos(municipio_id);
CREATE INDEX IF NOT EXISTS idx_recintos_codigo_territorial  ON recintos(codigo_territorial);

-- ── Mesas ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mesas_codigo_mesa            ON mesas(codigo_mesa);
CREATE INDEX IF NOT EXISTS idx_mesas_recinto_id             ON mesas(recinto_id);
CREATE INDEX IF NOT EXISTS idx_mesas_codigo_territorial     ON mesas(codigo_territorial);

-- ── CSV Importaciones ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_csv_tipo_importacion         ON csv_importaciones(tipo_importacion);
CREATE INDEX IF NOT EXISTS idx_csv_estado                   ON csv_importaciones(estado);
CREATE INDEX IF NOT EXISTS idx_csv_fecha_carga              ON csv_importaciones(fecha_carga DESC);

-- ── Actas Oficiales ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_actas_oficiales_mesa_id           ON actas_oficiales(mesa_id);
CREATE INDEX IF NOT EXISTS idx_actas_oficiales_codigo_acta       ON actas_oficiales(codigo_acta);
CREATE INDEX IF NOT EXISTS idx_actas_oficiales_estado            ON actas_oficiales(estado);
CREATE INDEX IF NOT EXISTS idx_actas_oficiales_csv_importacion   ON actas_oficiales(csv_importacion_id);
CREATE INDEX IF NOT EXISTS idx_actas_oficiales_franja            ON actas_oficiales(franja);
-- Compound: dashboard queries by state + franja
CREATE INDEX IF NOT EXISTS idx_actas_estado_franja               ON actas_oficiales(estado, franja);

-- ── Resultados Oficiales ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_resultados_acta             ON resultados_oficiales(acta_oficial_id);
CREATE INDEX IF NOT EXISTS idx_resultados_partido          ON resultados_oficiales(partido_id);
CREATE INDEX IF NOT EXISTS idx_resultados_candidato        ON resultados_oficiales(candidato_id);
CREATE INDEX IF NOT EXISTS idx_resultados_franja           ON resultados_oficiales(franja);

-- ── Validaciones ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_validaciones_acta           ON validaciones_oficiales(acta_oficial_id);
CREATE INDEX IF NOT EXISTS idx_validaciones_resultado      ON validaciones_oficiales(resultado);
CREATE INDEX IF NOT EXISTS idx_validaciones_severidad      ON validaciones_oficiales(severidad);
CREATE INDEX IF NOT EXISTS idx_validaciones_regla          ON validaciones_oficiales(regla);

-- ── Auditoría ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad           ON auditoria_oficial(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tipo_accion       ON auditoria_oficial(tipo_accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha             ON auditoria_oficial(fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario           ON auditoria_oficial(usuario_accion);

-- ── Revisiones ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_revisiones_acta             ON revisiones_oficiales(acta_oficial_id);
CREATE INDEX IF NOT EXISTS idx_revisiones_decision         ON revisiones_oficiales(decision);

-- ── Comparaciones ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_comparaciones_codigo_mesa   ON comparaciones_rrv_oficial(codigo_mesa);
CREATE INDEX IF NOT EXISTS idx_comparaciones_estado        ON comparaciones_rrv_oficial(estado);
CREATE INDEX IF NOT EXISTS idx_comparaciones_fecha         ON comparaciones_rrv_oficial(fecha_comparacion DESC);
CREATE INDEX IF NOT EXISTS idx_comparaciones_acta_oficial  ON comparaciones_rrv_oficial(acta_oficial_id);

-- ── Inconsistencias ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inconsistencias_codigo_mesa ON inconsistencias(codigo_mesa);
CREATE INDEX IF NOT EXISTS idx_inconsistencias_tipo        ON inconsistencias(tipo);
CREATE INDEX IF NOT EXISTS idx_inconsistencias_severidad   ON inconsistencias(severidad);
CREATE INDEX IF NOT EXISTS idx_inconsistencias_estado      ON inconsistencias(estado);
CREATE INDEX IF NOT EXISTS idx_inconsistencias_origen      ON inconsistencias(origen);

-- ── Cluster Status ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cluster_motor               ON cluster_status(motor);
CREATE INDEX IF NOT EXISTS idx_cluster_estado              ON cluster_status(estado);
CREATE INDEX IF NOT EXISTS idx_cluster_nodo                ON cluster_status(nodo);
