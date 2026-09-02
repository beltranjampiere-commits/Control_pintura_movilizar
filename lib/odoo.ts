// eslint-disable-next-line @typescript-eslint/no-require-imports
import xmlrpc from 'xmlrpc';

const url = process.env.ODOO_URL || '';
const db = process.env.ODOO_DB || '';
const username = process.env.ODOO_USERNAME || '';
const password = process.env.ODOO_PASSWORD || '';

const commonClient = xmlrpc.createSecureClient(`${url}/xmlrpc/2/common`);
const objectClient = xmlrpc.createSecureClient(`${url}/xmlrpc/2/object`);

export async function authenticateOdoo(): Promise<number> {
  return new Promise((resolve, reject) => {
    commonClient.methodCall('authenticate', [db, username, password, {}], (error: Error | null, value: unknown) => {
      if (error) {
        reject(error);
      } else if (!value) {
        reject(new Error('Authentication failed (wrong credentials).'));
      } else {
        resolve(value as number); // This is the user ID (uid)
      }
    });
  });
}

export interface StockQuant {
  id: number;
  product_id: [number, string];
  location_id: [number, string];
  quantity: number;
  available_quantity: number; // Often 'free_qty' in newer Odoos, but we'll fetch both if possible
  product_uom_id: [number, string];
}

export async function getStock(locations: string[]): Promise<StockQuant[]> {
  try {
    const uid = await authenticateOdoo();
    
    // Buscar los IDs de las ubicaciones basadas en el nombre completo (ej: VAR/Stock)
    const locationIds = await executeKw(uid, 'stock.location', 'search', [[
      ['complete_name', 'ilike', locations[0]] // Usamos ilike temporalmente para probar
    ]]);

    // Consultar el stock en esas ubicaciones
    let domain: any[] = [];
    if (locationIds && Array.isArray(locationIds) && locationIds.length > 0) {
       domain = [['location_id', 'in', locationIds]];
    } else {
       // Fallback en caso no encontremos la ubicacion por nombre completo, buscar por display_name
       const loc2 = await executeKw(uid, 'stock.location', 'search', [[
        ['display_name', 'ilike', locations[0]]
       ]]);
       if (loc2 && loc2.length > 0) {
         domain = [['location_id', 'in', loc2]];
       }
    }

    if (domain.length === 0) {
       console.log("No se encontraron las ubicaciones:", locations);
       return [];
    }

    const quants = await executeKw(uid, 'stock.quant', 'search_read', [
      domain, 
      ['product_id', 'location_id', 'quantity', 'available_quantity', 'product_uom_id']
    ]);

    return quants as StockQuant[];
  } catch (error) {
    console.error('Error al consultar stock en Odoo:', error);
    throw error;
  }
}

function executeKw(uid: number, model: string, method: string, args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    objectClient.methodCall('execute_kw', [db, uid, password, model, method, args], (error: Error | null, value: unknown) => {
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}
