import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const today = new Date().toISOString().split('T')[0];

  // ── GET: obtener trips del día / por movilizador ────────────────────
  if (req.method === 'GET') {
    const { fecha, movilizador } = req.query;
    let query = supabase
      .from('movilizador_trips')
      .select('*')
      .eq('fecha', (fecha as string) || today)
      .order('created_at', { ascending: true });

    if (movilizador) query = query.eq('movilizador_name', movilizador as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ trips: data || [] });
  }

  // ── POST: registrar nuevo trip (movilizador sale a buscar un carro) ──
  if (req.method === 'POST') {
    const body = req.body;
    const { data, error } = await supabase
      .from('movilizador_trips')
      .insert({
        ...body,
        fecha: body.fecha || today,
        hora_recojo: body.hora_recojo || new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // ── PATCH: actualizar trip (asignar pintor, hora entrega, etc.) ─────
  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: 'Se requiere id' });

    // Si se está asignando pintor y no hay hora_entrega, ponerla ahora
    if (updates.pintor_asignado && !updates.hora_entrega) {
      updates.hora_entrega = new Date().toISOString();
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('movilizador_trips')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── DELETE: eliminar un trip ────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Se requiere id' });
    const { error } = await supabase
      .from('movilizador_trips')
      .delete()
      .eq('id', id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
