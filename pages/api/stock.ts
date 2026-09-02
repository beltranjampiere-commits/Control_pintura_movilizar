import { NextApiRequest, NextApiResponse } from 'next';
import { getStock } from '../../lib/odoo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Definimos las ubicaciones que nos interesan
    const sumLocation = 'VAR/Stock'; // Almacén SUM
    const csiLocation = 'VENT/Stock'; // Almacén CSI

    // Traemos todo el stock de ambas ubicaciones
    const stock = await getStock([sumLocation, csiLocation]);

    // Opcional: Podríamos filtrar o agrupar la respuesta aquí
    const sumStock = stock.filter(item => item.location_id[1].includes(sumLocation));
    const csiStock = stock.filter(item => item.location_id[1].includes(csiLocation));

    return res.status(200).json({
      success: true,
      total_items: stock.length,
      data: {
        sum: sumStock,
        csi: csiStock
      }
    });

  } catch (error: any) {
    console.error('API Route Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al consultar el stock en Odoo',
      error: error.message 
    });
  }
}
