import type { NextApiRequest, NextApiResponse } from 'next';
import { obtenerColaYDistribucion } from '../../lib/cola';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const today = new Date().toISOString().split('T')[0];
    const { vehiculos, distribucion, buscadores, error } = await obtenerColaYDistribucion(today);
    
    if (error) {
      return res.status(200).json({ vehiculos: [], distribucion: {}, error_debug: error });
    }

    return res.status(200).json({
      vehiculos,
      total: vehiculos.length,
      buscadores,
      distribucion,
      actualizadoEn: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error en /api/seguimiento:', error);
    return res.status(500).json({ error: 'Error al obtener seguimiento', detalle: String(error) });
  }
}
