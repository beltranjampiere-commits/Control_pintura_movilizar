// Script para crear la tabla paint_assignments en Supabase
// Ejecutar con: node create-table.mjs

const SUPABASE_URL = 'https://ytjnrteaeehdbfdnwxay.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0am5ydGVhZWVoZGJmZG53eGF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMDI3MDksImV4cCI6MjA4ODc3ODcwOX0.zBrjGC86iPxhsqyxpUIFt24cd9aczqHiulNXG4ur33Y';

const SQL = `
CREATE TABLE IF NOT EXISTS paint_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vin TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  color TEXT,
  fecha_planificacion DATE,
  work_type TEXT NOT NULL,
  num_panos NUMERIC(4,1),
  seccion TEXT,
  technician_name TEXT NOT NULL,
  technician_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pa_date ON paint_assignments(work_date);
CREATE INDEX IF NOT EXISTS idx_pa_vin ON paint_assignments(vin);
CREATE INDEX IF NOT EXISTS idx_pa_tech ON paint_assignments(technician_name);
CREATE INDEX IF NOT EXISTS idx_pa_status ON paint_assignments(status);

ALTER TABLE paint_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'paint_assignments' AND policyname = 'allow_anon_all'
  ) THEN
    CREATE POLICY "allow_anon_all" ON paint_assignments 
    FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

async function createTable() {
  console.log('🔧 Creando tabla paint_assignments en Supabase...');
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  });

  if (!response.ok) {
    // La RPC exec_sql no existe — usamos el endpoint de migration
    console.log('⚠️ RPC no disponible, intentando vía migrations...');
    
    // Intentamos insertar un registro de prueba para ver si la tabla existe
    const testResp = await fetch(`${SUPABASE_URL}/rest/v1/paint_assignments?limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    
    if (testResp.ok) {
      console.log('✅ La tabla paint_assignments YA EXISTE y está accesible!');
      const data = await testResp.json();
      console.log('Registros actuales:', data.length);
      return;
    }
    
    const errText = await testResp.text();
    console.log('❌ La tabla no existe. Error:', errText);
    console.log('\n📋 Para crearla manualmente:');
    console.log('1. Ve a: https://supabase.com/dashboard');
    console.log('2. Inicia sesión con tu cuenta');
    console.log('3. Abre el proyecto ytjnrteaeehdbfdnwxay');
    console.log('4. SQL Editor > New Query');
    console.log('5. Pega el contenido de supabase-setup.sql y ejecuta');
    return;
  }
  
  console.log('✅ Tabla creada exitosamente!');
}

createTable().catch(console.error);
