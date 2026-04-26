-- =============================================================================
--  03-seed-territorial.sql
--  Bolivian Territorial Data Seed
--  Sistema Nacional de Cómputo Electoral Bolivia
--
--  Populates: departamentos, provincias, municipios
--  Based on real Bolivian territorial structure.
--
--  CSV format supported:
--    CodigoTerritorial, Departamento, Municipio, Provincia
--    10101, Chuquisaca, Oropeza, Sucre
--
--  IDEMPOTENT: uses ON CONFLICT DO NOTHING.
-- =============================================================================

-- ── Departamentos (9 departments of Bolivia) ─────────────────────────────────
INSERT INTO departamentos (codigo, nombre) VALUES
  ('CH', 'Chuquisaca'),
  ('LP', 'La Paz'),
  ('CB', 'Cochabamba'),
  ('OR', 'Oruro'),
  ('PT', 'Potosí'),
  ('TJ', 'Tarija'),
  ('SC', 'Santa Cruz'),
  ('BN', 'Beni'),
  ('PD', 'Pando')
ON CONFLICT (codigo) DO NOTHING;

-- ── Provincias ────────────────────────────────────────────────────────────────
-- Chuquisaca (id=1 after insert, but use subquery for FK)
INSERT INTO provincias (departamento_id, codigo, nombre) VALUES
  ((SELECT id FROM departamentos WHERE codigo = 'CH'), 'CH-ORP', 'Oropeza'),
  ((SELECT id FROM departamentos WHERE codigo = 'CH'), 'CH-AZE', 'Azero'),
  ((SELECT id FROM departamentos WHERE codigo = 'CH'), 'CH-ZUD', 'Zudáñez')
ON CONFLICT (codigo) DO NOTHING;

-- La Paz
INSERT INTO provincias (departamento_id, codigo, nombre) VALUES
  ((SELECT id FROM departamentos WHERE codigo = 'LP'), 'LP-MUR', 'Murillo'),
  ((SELECT id FROM departamentos WHERE codigo = 'LP'), 'LP-INQ', 'Ingavi'),
  ((SELECT id FROM departamentos WHERE codigo = 'LP'), 'LP-LOS', 'Los Andes')
ON CONFLICT (codigo) DO NOTHING;

-- Cochabamba
INSERT INTO provincias (departamento_id, codigo, nombre) VALUES
  ((SELECT id FROM departamentos WHERE codigo = 'CB'), 'CB-CER', 'Cercado'),
  ((SELECT id FROM departamentos WHERE codigo = 'CB'), 'CB-QUI', 'Quillacollo'),
  ((SELECT id FROM departamentos WHERE codigo = 'CB'), 'CB-CAP', 'Capinota')
ON CONFLICT (codigo) DO NOTHING;

-- ── Municipios ────────────────────────────────────────────────────────────────
-- Chuquisaca — Oropeza
INSERT INTO municipios (provincia_id, codigo, nombre) VALUES
  ((SELECT id FROM provincias WHERE codigo = 'CH-ORP'), '10101', 'Sucre'),
  ((SELECT id FROM provincias WHERE codigo = 'CH-ORP'), '10102', 'Yotala'),
  ((SELECT id FROM provincias WHERE codigo = 'CH-ORP'), '10103', 'Poroma')
ON CONFLICT (codigo) DO NOTHING;

-- Chuquisaca — Azero
INSERT INTO municipios (provincia_id, codigo, nombre) VALUES
  ((SELECT id FROM provincias WHERE codigo = 'CH-AZE'), '10201', 'Camiri'),
  ((SELECT id FROM provincias WHERE codigo = 'CH-AZE'), '10202', 'Charagua')
ON CONFLICT (codigo) DO NOTHING;

-- La Paz — Murillo
INSERT INTO municipios (provincia_id, codigo, nombre) VALUES
  ((SELECT id FROM provincias WHERE codigo = 'LP-MUR'), '20101', 'La Paz'),
  ((SELECT id FROM provincias WHERE codigo = 'LP-MUR'), '20102', 'Palca')
ON CONFLICT (codigo) DO NOTHING;

-- La Paz — Ingavi
INSERT INTO municipios (provincia_id, codigo, nombre) VALUES
  ((SELECT id FROM provincias WHERE codigo = 'LP-INQ'), '20201', 'Viacha'),
  ((SELECT id FROM provincias WHERE codigo = 'LP-INQ'), '20202', 'Guaqui')
ON CONFLICT (codigo) DO NOTHING;

-- Cochabamba — Cercado
INSERT INTO municipios (provincia_id, codigo, nombre) VALUES
  ((SELECT id FROM provincias WHERE codigo = 'CB-CER'), '30101', 'Cochabamba')
ON CONFLICT (codigo) DO NOTHING;

-- Cochabamba — Quillacollo
INSERT INTO municipios (provincia_id, codigo, nombre) VALUES
  ((SELECT id FROM provincias WHERE codigo = 'CB-QUI'), '30201', 'Quillacollo'),
  ((SELECT id FROM provincias WHERE codigo = 'CB-QUI'), '30202', 'Sipe Sipe')
ON CONFLICT (codigo) DO NOTHING;

-- Cochabamba — Capinota
INSERT INTO municipios (provincia_id, codigo, nombre) VALUES
  ((SELECT id FROM provincias WHERE codigo = 'CB-CAP'), '30301', 'Capinota')
ON CONFLICT (codigo) DO NOTHING;
