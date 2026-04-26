-- =============================================================================
--  05-seed-demo-official.sql
--  Demo Official Electoral Data
--  Sistema Nacional de Cómputo Electoral Bolivia
--
--  Populates: recintos, mesas, csv_importaciones, actas_oficiales,
--             resultados_oficiales, validaciones_oficiales,
--             auditoria_oficial, revisiones_oficiales,
--             comparaciones_rrv_oficial, inconsistencias
--
--  CSV examples used:
--    Recintos: RecintoId, Recinto, Direccion, Mesas
--    Mesas: CodigoTerritorio, CodigoMesa, Mesa, NroVotantes
--
--  IDEMPOTENT: uses ON CONFLICT DO NOTHING.
-- =============================================================================

-- ── Recintos ─────────────────────────────────────────────────────────────────
-- From: RecintoId, Recinto, Direccion, Mesas
INSERT INTO recintos (codigo_recinto, codigo_territorial, municipio_id, nombre, direccion, cantidad_mesas, estado)
VALUES
  ('10101001', '10101',
   (SELECT id FROM municipios WHERE codigo = '10101'),
   'Instituto Particular Quillacollo',
   'Calle Gral. Pando entre Santa Cruz y Beni', 5, 'ACTIVO'),

  ('10101002', '10101',
   (SELECT id FROM municipios WHERE codigo = '10101'),
   'U.E. Aniceto Arce',
   'Av. Venezuela s/n, Zona Norte', 3, 'ACTIVO'),

  ('10101003', '10101',
   (SELECT id FROM municipios WHERE codigo = '10101'),
   'Colegio Nacional Pichincha',
   'Calle Pichincha 245', 4, 'ACTIVO'),

  ('10102001', '10102',
   (SELECT id FROM municipios WHERE codigo = '10102'),
   'U.E. Rumy Corral',
   'Comunidad Rumy Corral Centro', 2, 'ACTIVO'),

  ('20101001', '20101',
   (SELECT id FROM municipios WHERE codigo = '20101'),
   'Colegio Nacional Bolivar',
   'Calle Ingavi 123, La Paz', 4, 'ACTIVO')
ON CONFLICT (codigo_recinto) DO NOTHING;

-- ── Mesas ─────────────────────────────────────────────────────────────────────
-- From: CodigoTerritorio, CodigoMesa, Mesa, NroVotantes
INSERT INTO mesas (codigo_mesa, codigo_territorial, numero_mesa, recinto_id, cantidad_habilitada, estado)
VALUES
  ('10101001001', '10101', 1, (SELECT id FROM recintos WHERE codigo_recinto = '10101001'), 339,  'ACTIVA'),
  ('10101001002', '10101', 2, (SELECT id FROM recintos WHERE codigo_recinto = '10101001'), 920,  'ACTIVA'),
  ('10101001003', '10101', 3, (SELECT id FROM recintos WHERE codigo_recinto = '10101001'), 300,  'ACTIVA'),
  ('10101001004', '10101', 4, (SELECT id FROM recintos WHERE codigo_recinto = '10101001'), 315,  'ACTIVA'),
  ('10101001005', '10101', 5, (SELECT id FROM recintos WHERE codigo_recinto = '10101001'), 280,  'ACTIVA'),
  ('10101002001', '10101', 1, (SELECT id FROM recintos WHERE codigo_recinto = '10101002'), 412,  'ACTIVA'),
  ('10101002002', '10101', 2, (SELECT id FROM recintos WHERE codigo_recinto = '10101002'), 388,  'ACTIVA'),
  ('10101003001', '10101', 1, (SELECT id FROM recintos WHERE codigo_recinto = '10101003'), 275,  'ACTIVA'),
  ('10102001001', '10102', 1, (SELECT id FROM recintos WHERE codigo_recinto = '10102001'), 185,  'ACTIVA'),
  ('20101001001', '20101', 1, (SELECT id FROM recintos WHERE codigo_recinto = '20101001'), 520,  'ACTIVA')
ON CONFLICT (codigo_mesa) DO NOTHING;

-- ── CSV Import Record ─────────────────────────────────────────────────────────
-- Stage 1: Base structure CSV (territorial + mesas)
INSERT INTO csv_importaciones (
  nombre_archivo, hash_archivo, tipo_importacion,
  usuario_carga, rol_usuario_carga, ip_origen,
  fecha_carga, total_filas, filas_validas, filas_invalidas,
  estado, observacion
)
VALUES (
  'padron_electoral_2025_v1.csv',
  'sha256:f1e2d3c4b5a6978869504132231405162738495061728394a5b6c7d8e9f0a1b2c3',
  'MESAS',
  'operador_oep_01', 'OPERADOR_CSV', '10.0.0.3',
  '2025-10-18T09:00:00Z',
  10, 10, 0,
  'COMPLETADO', 'Carga inicial de padrón electoral. 10 mesas cargadas.'
),
-- Stage 2: Official results CSV (loaded after election day)
(
  'resultados_oficiales_2025_v1.csv',
  'sha256:a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8',
  'RESULTADOS_OFICIALES',
  'operador_oep_02', 'SUPERVISOR_CSV', '10.0.0.4',
  '2025-10-20T08:00:00Z',
  2, 2, 0,
  'COMPLETADO', 'Carga de resultados oficiales post-elección. 2 actas cargadas.'
)
ON CONFLICT (hash_archivo) DO NOTHING;

-- ── Official Actas ────────────────────────────────────────────────────────────
-- Format: OF-{codigoMesa}-{franja}
-- Vote fields: votosValidos = P1+P2+P3+P4, totalVotos = votosValidos+blancos+nulos

-- Acta 1: Mesa 10101001001, PRESIDENTE — OFICIALIZADA
INSERT INTO actas_oficiales (
  mesa_id, csv_importacion_id, codigo_acta, franja,
  votos_validos, votos_blancos, votos_nulos, total_votos,
  papeletas_en_anfora, papeletas_no_utilizadas,
  estado, fuente,
  usuario_importacion, fecha_importacion,
  usuario_validacion, fecha_validacion,
  usuario_revision, fecha_revision,
  observacion
)
VALUES (
  (SELECT id FROM mesas WHERE codigo_mesa = '10101001001'),
  (SELECT id FROM csv_importaciones WHERE nombre_archivo = 'resultados_oficiales_2025_v1.csv'),
  'OF-10101001001-PRESIDENTE', 'PRESIDENTE',
  -- 145+88+32+10 = 275 ✓ (matches RRV OCR result)
  275, 7, 3, 285,
  285, 54,
  'OFICIALIZADA', 'CSV',
  'operador_oep_02', '2025-10-20T08:05:00Z',
  'validador_oep_01', '2025-10-20T09:00:00Z',
  'supervisor_oep_01', '2025-10-20T10:00:00Z',
  NULL
)
ON CONFLICT (mesa_id, franja) DO NOTHING;

-- Acta 2: Mesa 10101001002, PRESIDENTE — VALIDADA
INSERT INTO actas_oficiales (
  mesa_id, csv_importacion_id, codigo_acta, franja,
  votos_validos, votos_blancos, votos_nulos, total_votos,
  papeletas_en_anfora, papeletas_no_utilizadas,
  estado, fuente,
  usuario_importacion, fecha_importacion,
  usuario_validacion, fecha_validacion,
  observacion
)
VALUES (
  (SELECT id FROM mesas WHERE codigo_mesa = '10101001002'),
  (SELECT id FROM csv_importaciones WHERE nombre_archivo = 'resultados_oficiales_2025_v1.csv'),
  'OF-10101001002-PRESIDENTE', 'PRESIDENTE',
  -- 380+240+85+22 = 727 ✓
  727, 9, 5, 741,
  741, 179,
  'VALIDADA', 'CSV',
  'operador_oep_02', '2025-10-20T08:06:00Z',
  'validador_oep_01', '2025-10-20T09:10:00Z',
  'Acta con tachado en P3 corregida y refrendada por jurados. Totales coherentes.'
)
ON CONFLICT (mesa_id, franja) DO NOTHING;

-- ── Official Results (votes by party — rows, NOT columns) ─────────────────────

-- Acta OF-10101001001-PRESIDENTE results
INSERT INTO resultados_oficiales (acta_oficial_id, partido_id, candidato_id, franja, cantidad_votos)
SELECT
  (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
  p.id,
  (SELECT id FROM candidatos WHERE partido_id = p.id AND cargo = 'PRESIDENTE'),
  'PRESIDENTE',
  v.votos
FROM (VALUES
  ('P1', 145),
  ('P2', 88),
  ('P3', 32),
  ('P4', 10)
) AS v(codigo, votos)
JOIN partidos p ON p.codigo = v.codigo
ON CONFLICT (acta_oficial_id, partido_id, franja) DO NOTHING;

-- Acta OF-10101001002-PRESIDENTE results
INSERT INTO resultados_oficiales (acta_oficial_id, partido_id, candidato_id, franja, cantidad_votos)
SELECT
  (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001002-PRESIDENTE'),
  p.id,
  (SELECT id FROM candidatos WHERE partido_id = p.id AND cargo = 'PRESIDENTE'),
  'PRESIDENTE',
  v.votos
FROM (VALUES
  ('P1', 380),
  ('P2', 240),
  ('P3', 85),
  ('P4', 22)
) AS v(codigo, votos)
JOIN partidos p ON p.codigo = v.codigo
ON CONFLICT (acta_oficial_id, partido_id, franja) DO NOTHING;

-- ── Validation Records ────────────────────────────────────────────────────────

-- Validations for OF-10101001001-PRESIDENTE
INSERT INTO validaciones_oficiales (acta_oficial_id, regla, resultado, mensaje, severidad, ejecutado_por, fecha_validacion)
SELECT
  (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
  r.regla, r.resultado, r.mensaje, r.severidad, 'validador_oep_01', '2025-10-20T09:00:00Z'
FROM (VALUES
  ('MESA_EXISTE',                   'OK', 'Mesa 10101001001 encontrada en el sistema.',     'BAJA'),
  ('RECINTO_EXISTE',                'OK', 'Recinto 10101001 encontrado.',                   'BAJA'),
  ('CAMPOS_OBLIGATORIOS',           'OK', 'Todos los campos requeridos están presentes.',   'MEDIA'),
  ('VOTOS_NO_NEGATIVOS',            'OK', 'Todos los valores de votos son no negativos.',   'ALTA'),
  ('SUMA_PARTIDOS_COINCIDE_VALIDOS','OK', 'P1+P2+P3+P4=275 coincide con votosValidos=275.','ALTA'),
  ('TOTAL_COINCIDE',                'OK', '275+7+3=285 coincide con totalVotos=285.',       'ALTA'),
  ('NO_DUPLICADO_OFICIAL',          'OK', 'No existe acta oficial previa para esta mesa.',  'ALTA'),
  ('CANTIDAD_NO_SUPERA_HABILITADOS','OK', 'totalVotos=285 ≤ habilitados=339.',              'MEDIA'),
  ('CSV_ORIGEN_VALIDO',             'OK', 'Importación CSV registrada y verificada.',       'MEDIA')
) AS r(regla, resultado, mensaje, severidad)
ON CONFLICT DO NOTHING;

-- Validations for OF-10101001002-PRESIDENTE
INSERT INTO validaciones_oficiales (acta_oficial_id, regla, resultado, mensaje, severidad, ejecutado_por, fecha_validacion)
SELECT
  (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001002-PRESIDENTE'),
  r.regla, r.resultado, r.mensaje, r.severidad, 'validador_oep_01', '2025-10-20T09:10:00Z'
FROM (VALUES
  ('MESA_EXISTE',                   'OK',      'Mesa 10101001002 encontrada.',                  'BAJA'),
  ('CAMPOS_OBLIGATORIOS',           'OK',      'Todos los campos requeridos presentes.',        'MEDIA'),
  ('SUMA_PARTIDOS_COINCIDE_VALIDOS','OK',      '380+240+85+22=727 coincide con votosValidos.', 'ALTA'),
  ('TOTAL_COINCIDE',                'OK',      '727+9+5=741 coincide con totalVotos.',          'ALTA'),
  ('NO_DUPLICADO_OFICIAL',          'OK',      'No existe acta oficial previa.',                'ALTA'),
  ('CSV_ORIGEN_VALIDO',             'WARNING', 'Tachado detectado en P3. Corregido y refrendado por jurados.', 'MEDIA')
) AS r(regla, resultado, mensaje, severidad)
ON CONFLICT DO NOTHING;

-- ── Audit Records ─────────────────────────────────────────────────────────────

INSERT INTO auditoria_oficial (entidad, entidad_id, usuario_accion, rol_usuario, tipo_accion, detalle, valor_anterior, valor_nuevo, ip_origen, fecha_hora)
VALUES
  -- CSV import event
  ('CSV',
   (SELECT id FROM csv_importaciones WHERE nombre_archivo = 'resultados_oficiales_2025_v1.csv'),
   'operador_oep_02', 'SUPERVISOR_CSV', 'IMPORTACION',
   'Carga inicial de resultados oficiales. 2 actas procesadas.',
   NULL,
   '{"archivo": "resultados_oficiales_2025_v1.csv", "filas": 2}'::jsonb,
   '10.0.0.4', '2025-10-20T08:00:00Z'),

  -- Validation event for acta 1
  ('ACTA',
   (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
   'validador_oep_01', 'VALIDADOR', 'VALIDACION',
   'Todas las reglas de validación pasaron. Acta lista para oficialización.',
   '{"estado": "IMPORTADA"}'::jsonb,
   '{"estado": "VALIDADA"}'::jsonb,
   '10.0.0.5', '2025-10-20T09:00:00Z'),

  -- Officialization event for acta 1
  ('ACTA',
   (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
   'supervisor_oep_01', 'SUPERVISOR', 'OFICIALIZACION',
   'Acta oficializada tras revisión y validación exitosa.',
   '{"estado": "VALIDADA"}'::jsonb,
   '{"estado": "OFICIALIZADA"}'::jsonb,
   '10.0.0.6', '2025-10-20T10:00:00Z'),

  -- Validation warning for acta 2
  ('ACTA',
   (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001002-PRESIDENTE'),
   'validador_oep_01', 'VALIDADOR', 'OBSERVACION',
   'Tachado en P3 corregido por jurados. Refrendado con firmas. Datos finales coherentes.',
   '{"estado": "IMPORTADA"}'::jsonb,
   '{"estado": "VALIDADA", "observacion": "Tachado corregido"}'::jsonb,
   '10.0.0.5', '2025-10-20T09:10:00Z');

-- ── Revision Records ──────────────────────────────────────────────────────────

INSERT INTO revisiones_oficiales (acta_oficial_id, usuario_revisor, rol_revisor, decision, formulario_correcto, requiere_correccion, observacion, fecha_revision)
VALUES
  ((SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
   'supervisor_oep_01', 'SUPERVISOR',
   'ACEPTADA', true, false,
   'Formulario completo y correcto. Todos los campos verificados. Acta oficializada.',
   '2025-10-20T10:00:00Z'),

  ((SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001002-PRESIDENTE'),
   'supervisor_oep_01', 'SUPERVISOR',
   'OBSERVADA', false, true,
   'Tachado en campo P3 detectado. Verificado y corregido con firmas de jurados. Aprobada con observación.',
   '2025-10-20T09:30:00Z')
ON CONFLICT DO NOTHING;

-- ── Comparison: RRV vs Official ───────────────────────────────────────────────
-- Comparing ACTA-RRV-001 (OCR) vs OF-10101001001-PRESIDENTE (official)
-- Tiny difference in P2: OCR=88, Official=88 → COINCIDE
-- But SMS-001 reported P1=143 vs Official P1=145 → DIFERENCIA_LEVE

INSERT INTO comparaciones_rrv_oficial (
  codigo_mesa, resultado_rrv_id, acta_rrv_id, acta_oficial_id, franja,
  campo, valor_rrv, valor_oficial, diferencia, estado, fecha_comparacion
)
VALUES
  ('10101001001', 'RESULT-OCR-001', 'ACTA-RRV-001',
   (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
   'PRESIDENTE', 'P1', 145, 145, 0, 'COINCIDE', '2025-10-20T11:00:00Z'),

  ('10101001001', 'RESULT-OCR-001', 'ACTA-RRV-001',
   (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
   'PRESIDENTE', 'P2', 88, 88, 0, 'COINCIDE', '2025-10-20T11:00:00Z'),

  ('10101001001', 'RESULT-OCR-001', 'ACTA-RRV-001',
   (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
   'PRESIDENTE', 'P3', 32, 32, 0, 'COINCIDE', '2025-10-20T11:00:00Z'),

  ('10101001001', 'RESULT-OCR-001', 'ACTA-RRV-001',
   (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
   'PRESIDENTE', 'P4', 10, 10, 0, 'COINCIDE', '2025-10-20T11:00:00Z'),

  -- SMS vs Official comparison for same mesa: P1 differs by 2
  ('10101001001', 'RESULT-SMS-001', NULL,
   (SELECT id FROM actas_oficiales WHERE codigo_acta = 'OF-10101001001-PRESIDENTE'),
   'PRESIDENTE', 'P1', 143, 145, 2, 'DIFERENCIA_LEVE', '2025-10-20T11:05:00Z'),

  -- Mesa 003 RRV vs official (official not yet loaded, RRV result is SOSPECHOSO)
  ('10101001003', 'RESULT-OCR-003', 'ACTA-RRV-003',
   NULL, 'PRESIDENTE', 'VALIDOS', 255, NULL, NULL, 'INCONSISTENCIA', '2025-10-20T11:10:00Z')
ON CONFLICT DO NOTHING;

-- ── Inconsistency Record ──────────────────────────────────────────────────────

INSERT INTO inconsistencias (
  origen, codigo_mesa, acta_rrv_id, resultado_rrv_id, acta_oficial_id,
  tipo, descripcion, severidad, estado,
  detectado_por, fecha_deteccion
)
VALUES
  ('COMPARACION', '10101001001', 'ACTA-RRV-001', 'RESULT-SMS-001', NULL,
   'DIFERENCIA_RESULTADOS',
   'SMS reportó P1=143 pero OCR y resultado oficial indican P1=145. Diferencia de 2 votos en partido P1.',
   'BAJA', 'ABIERTA',
   'SISTEMA', '2025-10-20T11:05:00Z'),

  ('OCR', '10101001003', 'ACTA-RRV-003', 'RESULT-OCR-003', NULL,
   'TOTAL_INCOHERENTE',
   'OCR extrajo votosValidos=255 pero suma P1+P2+P3+P4=250. Diferencia de 5. Acta marcada SOSPECHOSA, pendiente revisión manual.',
   'ALTA', 'EN_REVISION',
   'SISTEMA', '2025-10-19T18:57:20Z')
ON CONFLICT DO NOTHING;
