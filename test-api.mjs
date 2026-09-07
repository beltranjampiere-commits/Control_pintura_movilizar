import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credenciales.json');

async function testApi() {
  let auth;
  if (process.env.GOOGLE_CREDENTIALS) {
    console.log('Using GOOGLE_CREDENTIALS env var');
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  } else {
    console.log('Using credenciales.json file');
    auth = new google.auth.GoogleAuth({ keyFile: CREDENTIALS_PATH, scopes: SCOPES });
  }

  const sheets = google.sheets({ version: 'v4', auth });
  let rows;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_SEGUIMIENTO,
      range: 'Hoja 1!A:Z'
    });
    rows = res.data.values || [];
  } catch (e) {
    console.error('Error in sheets API:', e.message);
    return;
  }

  console.log(`Fetched ${rows.length} rows`);

  const headers = rows[0].map(h => h?.trim() || '');
  const COL = {
    DIAS: 'dias',
    VIN: 'VIN',
    ELIMINADO: 'Eliminado',
    FECHA_PLAN: 'Feha Planificacion',
    FECHA_PLAN_ALT: 'Fecha Planificacion'
  };

  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]?.trim() || ''; });
    return obj;
  });

  const validos = data.filter(row => {
    const vin = row[COL.VIN] || '';
    const eliminado = (row[COL.ELIMINADO] || '').toLowerCase();
    return vin.length > 5 && eliminado !== 'si' && eliminado !== 'sí' && eliminado !== '1' && eliminado !== 'true';
  });
  console.log(`Validos: ${validos.length}`);

  const today = new Date().toISOString().split('T')[0];
  const { data: tripsHoy } = await supabase.from('movilizador_trips').select('vin').eq('fecha', today);
  const vinsEnTrip = new Set((tripsHoy || []).map(t => t.vin));
  console.log(`Trips hoy: ${vinsEnTrip.size}`);

  const vehiculos = validos.filter(row => !vinsEnTrip.has(row[COL.VIN]));
  console.log(`Vehiculos listos para cola: ${vehiculos.length}`);

  const { data: config } = await supabase
    .from('movilizador_config')
    .select('movilizador_name, rol')
    .eq('fecha', today)
    .eq('rol', 'buscador');
  
  const buscadores = (config || []).map(c => c.movilizador_name);
  console.log(`Buscadores hoy:`, buscadores);
}

testApi();
