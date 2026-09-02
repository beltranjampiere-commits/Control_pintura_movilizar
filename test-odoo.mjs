import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import xmlrpc from 'xmlrpc';

const url = process.env.ODOO_URL || '';
const db = process.env.ODOO_DB || '';
const username = process.env.ODOO_USERNAME || '';
const password = process.env.ODOO_PASSWORD || '';

const commonClient = xmlrpc.createSecureClient(`${url}/xmlrpc/2/common`);
const objectClient = xmlrpc.createSecureClient(`${url}/xmlrpc/2/object`);

async function authenticateOdoo() {
  return new Promise((resolve, reject) => {
    commonClient.methodCall('authenticate', [db, username, password, {}], (error, value) => {
      if (error) {
        reject(error);
      } else if (!value) {
        reject(new Error('Authentication failed (wrong credentials).'));
      } else {
        resolve(value); 
      }
    });
  });
}

function executeKw(uid, model, method, args) {
  return new Promise((resolve, reject) => {
    objectClient.methodCall('execute_kw', [db, uid, password, model, method, args], (error, value) => {
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
}

async function run() {
  try {
    console.log("Autenticando...");
    const uid = await authenticateOdoo();
    console.log("Autenticado con éxito. UID:", uid);

    console.log("Buscando ID de ubicacion 'VENT/Stock' (CSI)...");
    const locIdsCsi = await executeKw(uid, 'stock.location', 'search', [[['complete_name', 'ilike', 'VENT/Stock']]]);
    console.log("IDs encontrados (VENT/Stock):", locIdsCsi);

    if (locIdsCsi && locIdsCsi.length > 0) {
      console.log("Buscando stock de CSI...");
      const quants = await executeKw(uid, 'stock.quant', 'search_read', [
        [['location_id', 'in', locIdsCsi]], 
        ['product_id', 'location_id', 'quantity', 'available_quantity', 'product_uom_id'],
        0, // offset
        5  // limit to 5
      ]);
      console.log("Resultados CSI (Top 5):");
      console.log(JSON.stringify(quants, null, 2));
    }

    console.log("-----------------------------------------");

    console.log("Buscando ID de ubicacion 'VAR/Stock' (SUM)...");
    const locIdsSum = await executeKw(uid, 'stock.location', 'search', [[['complete_name', 'ilike', 'VAR/Stock']]]);
    console.log("IDs encontrados (VAR/Stock):", locIdsSum);

    if (locIdsSum && locIdsSum.length > 0) {
      console.log("Buscando stock de SUM...");
      const quantsSum = await executeKw(uid, 'stock.quant', 'search_read', [
        [['location_id', 'in', locIdsSum]], 
        ['product_id', 'location_id', 'quantity', 'available_quantity', 'product_uom_id'],
        0, // offset
        5  // limit to 5
      ]);
      console.log("Resultados SUM (Top 5):");
      console.log(JSON.stringify(quantsSum, null, 2));
    }

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
