import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';
import { obtenerColaYDistribucion, buildConsolidado } from '../../lib/cola';

const WA_SERVICE_URL = process.env.WA_SERVICE_URL || 'https://wa-service-g048.onrender.com';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { movilizador_name, telefono, wa_secret, fecha } = req.body;

  if (!movilizador_name || !telefono || !wa_secret) {
    return res.status(400).json({ error: 'Se requiere movilizador_name, telefono y wa_secret' });
  }

  const today = fecha || new Date().toISOString().split('T')[0];

  // Obtener trips activos del movilizador para saber entregados vs pendientes de asignar
  const { data: trips, error } = await supabase
    .from('movilizador_trips')
    .select('*')
    .eq('estado', 'en_zona')
    .eq('movilizador_name', movilizador_name);

  if (error) return res.status(500).json({ error: error.message });

  const entregados = (trips || []).filter(t => t.pintor_asignado && t.pintor_asignado.trim() !== '').length;
  const pendientesAsignar = (trips || []).length - entregados;

  // Obtener cola actual
  const { distribucion } = await obtenerColaYDistribucion(today);
  const colaBuscador = (distribucion as Record<string, any[]>)[String(movilizador_name)] || [];

  const mensaje = buildConsolidado(movilizador_name, entregados, pendientesAsignar, colaBuscador);

  // Enviar via wa-service
  try {
    const waRes = await fetch(`${WA_SERVICE_URL}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${wa_secret}`,
      },
      body: JSON.stringify({ telefono, mensaje }),
    });

    let waData: unknown;
    try {
      waData = await waRes.json();
    } catch {
      waData = { raw: await waRes.text() };
    }

    if (!waRes.ok) {
      return res.status(500).json({ error: 'Error del wa-service', detalle: waData });
    }

    // Marcar trips pendientes como alertados si los hay
    const tripsPendientes = (trips || []).filter(t => !t.pintor_asignado || t.pintor_asignado.trim() === '');
    if (tripsPendientes.length > 0) {
      const ids = tripsPendientes.map((t: any) => t.id);
      await supabase
        .from('movilizador_trips')
        .update({ alerta_enviada: true, updated_at: new Date().toISOString() })
        .in('id', ids);
    }

    return res.status(200).json({
      ok: true,
      enviado: true,
      pendientes: pendientesAsignar,
      cola: colaBuscador.length,
      movilizador: movilizador_name,
      waResponse: waData,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error de red al contactar wa-service', detalle: String(e) });
  }
}
