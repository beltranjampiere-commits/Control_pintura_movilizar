import { google } from 'googleapis';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credenciales.json');
const SHEET_SEGUIMIENTO = '1LR0QO7X2R2vPlNZXC-KSYiJMI7F0yJcQ_bK7SYNucXQ';

const COL = {
  DIAS: 'dias',
  VIN: 'VIN',
  ELIMINADO: 'Eliminado',
};

async function test() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SCOPES,
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_SEGUIMIENTO,
    range: 'Hoja 1!A:Z',
  });

  const rows = response.data.values || [];
  console.log(`Total rows fetched: ${rows.length}`);

  if (rows.length < 2) {
    console.log('Not enough rows.');
    return;
  }

  const headers = rows[0].map(h => h?.trim() || '');
  console.log('Headers:', headers);

  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i]?.trim() || '';
    });
    return obj;
  });

  console.log(`Total parsed data objects: ${data.length}`);
  
  const validos = data.filter(row => {
    const vin = row[COL.VIN] || '';
    const eliminado = (row[COL.ELIMINADO] || '').toLowerCase();
    return vin.length > 5 && eliminado !== 'si' && eliminado !== 'sí' && eliminado !== '1' && eliminado !== 'true';
  });

  console.log(`Total valid cars: ${validos.length}`);
  if (validos.length === 0) {
    console.log('First 3 raw objects:');
    console.log(data.slice(0, 3));
  } else {
    console.log('First valid car:', validos[0]);
  }
}

test().catch(console.error);
