import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Assignment = {
  id?: string;
  work_date: string;
  vin: string;
  marca?: string;
  modelo?: string;
  color?: string;
  fecha_planificacion?: string;
  work_type: string;
  num_panos?: number;
  seccion?: string;
  technician_name: string;
  technician_role: string;
  status: 'pendiente' | 'en_proceso' | 'completado' | 'pausado';
  started_at?: string;
  completed_at?: string;
  duration_minutes?: number;
  notes?: string;
  created_at?: string;
};
