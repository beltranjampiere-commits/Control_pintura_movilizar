-- ============================================================
-- EJECUTAR EN: https://ytjnrteaeehdbfdnwxay.supabase.co
-- SQL Editor > New Query > Pegar y ejecutar
-- ============================================================

-- Tabla de configuración diaria de movilizadores
CREATE TABLE IF NOT EXISTS movilizador_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  movilizador_name TEXT NOT NULL,
  telefono TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('fijo', 'buscador', 'ausente')),
  wa_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fecha, movilizador_name)
);

CREATE INDEX IF NOT EXISTS idx_mc_fecha ON movilizador_config(fecha);
CREATE INDEX IF NOT EXISTS idx_mc_rol ON movilizador_config(rol);

-- Tabla de viajes / traslados registrados por los buscadores
CREATE TABLE IF NOT EXISTS movilizador_trips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  movilizador_name TEXT NOT NULL,
  vin TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  color TEXT,
  concesionario TEXT,
  ubicacion_gps TEXT,
  fecha_planificacion DATE,
  dias_atraso INTEGER,
  panos_total NUMERIC(4,1),
  tipo TEXT,
  hora_recojo TIMESTAMPTZ,
  pintor_asignado TEXT,
  hora_entrega TIMESTAMPTZ,
  alerta_enviada BOOLEAN DEFAULT false,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mt_fecha ON movilizador_trips(fecha);
CREATE INDEX IF NOT EXISTS idx_mt_vin ON movilizador_trips(vin);
CREATE INDEX IF NOT EXISTS idx_mt_movilizador ON movilizador_trips(movilizador_name);
CREATE INDEX IF NOT EXISTS idx_mt_pintor ON movilizador_trips(pintor_asignado);

-- RLS para movilizador_config
ALTER TABLE movilizador_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_anon_all_mc" ON movilizador_config;
CREATE POLICY "allow_anon_all_mc" ON movilizador_config
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- RLS para movilizador_trips
ALTER TABLE movilizador_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_anon_all_mt" ON movilizador_trips;
CREATE POLICY "allow_anon_all_mt" ON movilizador_trips
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Vista resumen del día
CREATE OR REPLACE VIEW movilizador_daily_summary AS
SELECT
  mt.fecha,
  mt.movilizador_name,
  mc.rol,
  COUNT(*) as total_asignados,
  COUNT(mt.pintor_asignado) as entregados,
  COUNT(*) - COUNT(mt.pintor_asignado) as pendientes,
  SUM(mt.panos_total) as total_panos,
  MIN(mt.fecha_planificacion) as fecha_mas_antigua,
  MAX(mt.dias_atraso) as max_dias_atraso
FROM movilizador_trips mt
LEFT JOIN movilizador_config mc ON mc.fecha = mt.fecha AND mc.movilizador_name = mt.movilizador_name
GROUP BY mt.fecha, mt.movilizador_name, mc.rol
ORDER BY mt.fecha DESC;

SELECT 'OK: Tablas movilizador_config y movilizador_trips listas' as resultado;
