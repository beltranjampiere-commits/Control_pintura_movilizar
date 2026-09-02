import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, 'credenciales.json');
const SHEET_UBICACION = '15nEl-SJ1K6WqgPZikTLwQVaahTTEErZw_V13aLtBB9E';

async function test() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log('Fetching sheet...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_UBICACION,
      range: 'REPORTE_UBICACION_AUTO!A1:L5',
    });
    
    const rows = response.data.values || [];
    console.log('Total rows retrieved:', rows.length);
    rows.forEach((row, i) => {
      console.log(`Row ${i}:`, row);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
