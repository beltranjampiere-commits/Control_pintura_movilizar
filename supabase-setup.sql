-- ============================================================
-- EJECUTAR EN: https://ytjnrteaeehdbfdnwxay.supabase.co
-- SQL Editor > New Query > Pegar y ejecutar
-- ============================================================

CREATE TABLE IF NOT EXISTS paint_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Vehículo
  vin TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  color TEXT,
  fecha_planificacion DATE,
  
  -- Trabajo
  work_type TEXT NOT NULL,
  num_panos NUMERIC(4,1),
  seccion TEXT,
  
  -- Técnico
  technician_name TEXT NOT NULL,
  technician_role TEXT NOT NULL,
  
  -- Estado y tiempos
  status TEXT NOT NULL DEFAULT 'pendiente',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pa_date ON paint_assignments(work_date);
CREATE INDEX IF NOT EXISTS idx_pa_vin ON paint_assignments(vin);
CREATE INDEX IF NOT EXISTS idx_pa_tech ON paint_assignments(technician_name);
CREATE INDEX IF NOT EXISTS idx_pa_status ON paint_assignments(status);

-- RLS
ALTER TABLE paint_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_anon_all" ON paint_assignments;
CREATE POLICY "allow_anon_all" ON paint_assignments
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Vista resumen por técnico y día
CREATE OR REPLACE VIEW paint_daily_summary AS
SELECT 
  work_date,
  technician_name,
  technician_role,
  COUNT(*) as total_trabajos,
  COUNT(CASE WHEN status = 'completado' THEN 1 END) as completados,
  COUNT(CASE WHEN status = 'en_proceso' THEN 1 END) as en_proceso,
  COUNT(CASE WHEN status = 'pendiente' THEN 1 END) as pendientes,
  ROUND(AVG(duration_minutes) FILTER (WHERE status = 'completado'), 1) as avg_min_por_trabajo,
  SUM(duration_minutes) FILTER (WHERE status = 'completado') as total_min_trabajados
FROM paint_assignments
GROUP BY work_date, technician_name, technician_role
ORDER BY work_date DESC, completados DESC;

SELECT 'OK: Tabla paint_assignments lista' as resultado;
