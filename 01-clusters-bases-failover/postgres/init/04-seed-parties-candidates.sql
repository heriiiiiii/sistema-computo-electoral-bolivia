-- =============================================================================
--  04-seed-parties-candidates.sql
--  Parties and Candidates Seed
--  Sistema Nacional de Cómputo Electoral Bolivia
--
--  Uses normalized party codes P1–P4 as defined in the project spec.
--  In a real system these would map to actual party names.
--
--  IDEMPOTENT: uses ON CONFLICT DO NOTHING.
-- =============================================================================

-- ── Partidos ──────────────────────────────────────────────────────────────────
INSERT INTO partidos (codigo, nombre, sigla) VALUES
  ('P1', 'Partido Primero',  'PP'),
  ('P2', 'Partido Segundo',  'PS'),
  ('P3', 'Partido Tercero',  'PT'),
  ('P4', 'Partido Cuarto',   'PC')
ON CONFLICT (codigo) DO NOTHING;

-- ── Candidatos — PRESIDENTE ───────────────────────────────────────────────────
INSERT INTO candidatos (partido_id, nombre, cargo) VALUES
  ((SELECT id FROM partidos WHERE codigo = 'P1'), 'Candidato Uno Primer',    'PRESIDENTE'),
  ((SELECT id FROM partidos WHERE codigo = 'P2'), 'Candidato Dos Segundo',   'PRESIDENTE'),
  ((SELECT id FROM partidos WHERE codigo = 'P3'), 'Candidato Tres Tercero',  'PRESIDENTE'),
  ((SELECT id FROM partidos WHERE codigo = 'P4'), 'Candidato Cuatro Cuarto', 'PRESIDENTE')
ON CONFLICT DO NOTHING;

-- ── Candidatos — DIPUTADO_UNINOMINAL ─────────────────────────────────────────
-- One candidate per party per uninominal district (simplified for the demo)
INSERT INTO candidatos (partido_id, nombre, cargo) VALUES
  ((SELECT id FROM partidos WHERE codigo = 'P1'), 'Diputado P1 Circunscripción 1', 'DIPUTADO_UNINOMINAL'),
  ((SELECT id FROM partidos WHERE codigo = 'P2'), 'Diputado P2 Circunscripción 1', 'DIPUTADO_UNINOMINAL'),
  ((SELECT id FROM partidos WHERE codigo = 'P3'), 'Diputado P3 Circunscripción 1', 'DIPUTADO_UNINOMINAL'),
  ((SELECT id FROM partidos WHERE codigo = 'P4'), 'Diputado P4 Circunscripción 1', 'DIPUTADO_UNINOMINAL')
ON CONFLICT DO NOTHING;
