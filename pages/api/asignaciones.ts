import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase, Assignment } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const today = new Date().toISOString().split('T')[0];

  if (req.method === 'GET') {
    const { fecha, vin, technician } = req.query;
    let query = supabase.from('paint_assignments').select('*').order('created_at', { ascending: false });
    
    if (fecha) query = query.eq('work_date', fecha as string);
    else query = query.eq('work_date', today);
    if (vin) query = query.eq('vin', vin as string);
    if (technician) query = query.eq('technician_name', technician as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ asignaciones: data, total: data?.length || 0 });
  }

  if (req.method === 'POST') {
    const body = req.body;
    
    if (Array.isArray(body)) {
      const itemsToInsert = body.map(b => ({ ...b, work_date: b.work_date || today }));
      const { data, error } = await supabase
        .from('paint_assignments')
        .insert(itemsToInsert)
        .select();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    } else {
      const { data, error } = await supabase
        .from('paint_assignments')
        .insert({ ...body, work_date: body.work_date || today })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: 'Se requiere id' });
    
    // Calcular duración si se completa
    if (updates.status === 'completado' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
    }
    if (updates.status === 'en_proceso' && !updates.started_at) {
      updates.started_at = new Date().toISOString();
    }
    if (updates.completed_at && updates.started_at) {
      const mins = Math.round(
        (new Date(updates.completed_at).getTime() - new Date(updates.started_at).getTime()) / 60000
      );
      updates.duration_minutes = mins;
    }
    
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('paint_assignments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    
    if (id === 'all') {
      const { error } = await supabase.from('paint_assignments').delete().not('id', 'is', null);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (!id) return res.status(400).json({ error: 'Se requiere id' });
    
    const { error } = await supabase.from('paint_assignments').delete().eq('id', id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
