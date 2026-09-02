import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, 'credenciales.json');
const SHEET_MAPEO = process.env.SHEET_MAPEO || '1tZhx0aS_kDJLLPLYY2m9TWbHBC3XqJLlzh_dpA3ADoc';

async function test() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    console.log('Fetching Mapeo sheet...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_MAPEO,
      range: 'SCANS!A1:L5',
    });
    const rows = response.data.values || [];
    rows.forEach((row, i) => console.log(`Row ${i}:`, row));
  } catch (error) {
    console.error('Error:', error);
  }
}
test();
