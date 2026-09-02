import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

const WA_SERVICE_URL = process.env.WA_SERVICE_URL || 'https://wa-service-g048.onrender.com';

function buildMensaje(movilizador: string, pendientes: any[]): string {
  const lineas = pendientes.map((v, i) => {
    const fecha = v.fecha_planificacion
      ? new Date(v.fecha_planificacion + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Sin fecha';
    const atraso = v.dias_atraso > 0 ? ` | ⚠️ ${v.dias_atraso}d atraso` : '';
    return `${i + 1}. VIN: *${v.vin}* | ${v.marca} ${v.modelo} | Ubic: ${v.ubicacion_gps || 'sin GPS'} | Plan: ${fecha}${atraso}`;
  });

  return [
    `🚗 *Alerta Movilizador – Área de Pintura*`,
    `Hola *${movilizador}*, tienes *${pendientes.length}* carro(s) sin pintor asignado:`,
    '',
    ...lineas,
    '',
    `⏰ Por favor confirma a qué pintor le dejaste cada uno.`,
  ].join('\n');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { movilizador_name, telefono, wa_secret, fecha } = req.body;

  if (!movilizador_name || !telefono || !wa_secret) {
    return res.status(400).json({ error: 'Se requiere movilizador_name, telefono y wa_secret' });
  }

  const today = fecha || new Date().toISOString().split('T')[0];

  // Obtener trips pendientes (sin pintor asignado) del movilizador
  const { data: trips, error } = await supabase
    .from('movilizador_trips')
    .select('*')
    .eq('fecha', today)
    .eq('movilizador_name', movilizador_name)
    .is('pintor_asignado', null)
    .order('dias_atraso', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  if (!trips || trips.length === 0) {
    return res.status(200).json({ ok: true, enviado: false, mensaje: 'No hay pendientes' });
  }

  const mensaje = buildMensaje(movilizador_name, trips);

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

    // Marcar trips como alertados
    const ids = trips.map((t: any) => t.id);
    await supabase
      .from('movilizador_trips')
      .update({ alerta_enviada: true, updated_at: new Date().toISOString() })
      .in('id', ids);

    return res.status(200).json({
      ok: true,
      enviado: true,
      pendientes: trips.length,
      movilizador: movilizador_name,
      waResponse: waData,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error de red al contactar wa-service', detalle: String(e) });
  }
}
