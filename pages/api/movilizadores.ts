import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

const MOVILIZADORES_DEFAULT = [
  { name: 'Paul',   telefono: '51928358170' },
  { name: 'Santos', telefono: '51937550237' },
  { name: 'Marcos', telefono: '51924374906' },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const today = new Date().toISOString().split('T')[0];

  // ── GET: obtener config del día ─────────────────────────────────────
  if (req.method === 'GET') {
    const fecha = (req.query.fecha as string) || today;

    // Obtener config guardada para ese día
    const { data: config, error } = await supabase
      .from('movilizador_config')
      .select('*')
      .eq('fecha', fecha)
      .order('movilizador_name');

    if (error) return res.status(500).json({ error: error.message });

    // Si no hay config del día, devolver defaults
    if (!config || config.length === 0) {
      return res.status(200).json({
        fecha,
        config: MOVILIZADORES_DEFAULT.map(m => ({
          movilizador_name: m.name,
          telefono: m.telefono,
          rol: 'buscador',  // por defecto todos son buscadores
          fecha,
        })),
        trips: [],
        sinConfig: true,
      });
    }

    // Obtener trips activos en zona
    const { data: trips } = await supabase
      .from('movilizador_trips')
      .select('*')
      .eq('estado', 'en_zona')
      .order('created_at', { ascending: true });

    return res.status(200).json({ fecha, config, trips: trips || [], sinConfig: false });
  }

  // ── POST: guardar/actualizar config del día ────────────────────────
  if (req.method === 'POST') {
    const { fecha, movilizadores } = req.body;
    // movilizadores: [{ movilizador_name, telefono, rol }]
    if (!Array.isArray(movilizadores)) {
      return res.status(400).json({ error: 'Se requiere movilizadores[]' });
    }

    const fechaFinal = fecha || today;
    const upserts = movilizadores.map((m: any) => ({
      fecha: fechaFinal,
      movilizador_name: m.movilizador_name,
      telefono: m.telefono,
      rol: m.rol,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('movilizador_config')
      .upsert(upserts, { onConflict: 'fecha,movilizador_name' })
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, data });
  }

  return res.status(405).end();
}
