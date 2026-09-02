// eslint-disable-next-line @typescript-eslint/no-require-imports
import { google } from 'googleapis';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credenciales.json');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedAuth: any = null;

export async function getGoogleAuth(): Promise<any> {
  if (cachedAuth) return cachedAuth;
  
  let auth;
  if (process.env.GOOGLE_CREDENTIALS) {
    // En Vercel usamos la variable de entorno
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });
  } else {
    // En local usamos el archivo
    auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: SCOPES,
    });
  }
  
  cachedAuth = auth;
  return auth;
}

export async function readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
  try {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    return (response.data.values as string[][]) || [];
  } catch (error) {
    console.error(`[DEBUG] Error reading sheet ${spreadsheetId} range ${range}:`);
    console.error(error);
    return [];
  }
}

export function rowsToObjects(rows: string[][], headerRow: number = 0): Record<string, string>[] {
  if (rows.length <= headerRow) return [];
  const headers = rows[headerRow];
  return rows.slice(headerRow + 1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h?.trim() || `col${i}`] = row[i]?.trim() || '';
    });
    return obj;
  });
}
