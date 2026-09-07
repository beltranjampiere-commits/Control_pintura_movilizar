import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';
import { obtenerColaYDistribucion, buildConsolidado } from '../../lib/cola';

const WA_SERVICE_URL = process.env.WA_SERVICE_URL || 'https://wa-service-g048.onrender.com';
const WA_SECRET_ENV  = process.env.WA_SERVICE_SECRET || '';
// Horas en las que se dispara el cron (hora de Lima, UTC-5)
const HORAS_ALERTA = [10, 12, 14, 16]; // 10am, 12pm, 2pm, 4pm

function buildMensaje(movilizador: string, pendientes: any[]): string {
  const lineas = pendientes.map((v, i) => {
    const fecha = v.fecha_planificacion
      ? new Date(v.fecha_planificacion + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Sin fecha';
    const atraso = v.dias_atraso > 0 ? ` | ⚠️ ${v.dias_atraso}d atraso` : '';
    return `${i + 1}. *${v.vin}* | ${v.marca || ''} ${v.modelo || ''} | ${v.ubicacion_gps || 'sin GPS'} | Plan: ${fecha}${atraso}`;
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
  if (req.method !== 'GET') return res.status(405).end();

  // Verificar si es hora de alertar (Lima = UTC-5)
  const ahoraUtc = new Date();
  const ahoraLima = new Date(ahoraUtc.getTime() - 5 * 60 * 60 * 1000);
  const horaActual = ahoraLima.getHours();
  const minActual = ahoraLima.getMinutes();

  // Sólo ejecutar en las horas configuradas (± 5 minutos de tolerancia)
  // O si se pasa ?force=1 en la URL
  const force = req.query.force === '1';
  const esHoraAlerta = HORAS_ALERTA.some(h => horaActual === h && minActual <= 5);

  if (!force && !esHoraAlerta) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      mensaje: `Hora actual Lima: ${horaActual}:${String(minActual).padStart(2,'0')}. Próximas alertas: ${HORAS_ALERTA.join('h, ')}h`,
    });
  }

  const today = new Date().toISOString().split('T')[0];

  // 1. Obtener buscadores configurados para hoy
  const { data: config, error: configError } = await supabase
    .from('movilizador_config')
    .select('movilizador_name, telefono, wa_secret')
    .eq('fecha', today)
    .eq('rol', 'buscador');

  if (configError) return res.status(500).json({ error: configError.message });
  if (!config || config.length === 0) {
    return res.status(200).json({ ok: true, enviados: 0, mensaje: 'No hay buscadores configurados hoy' });
  }

  // Obtener el wa_secret: primero desde config de Supabase, luego desde .env
  const wa_secret = (config.find((c: any) => c.wa_secret)?.wa_secret) || WA_SECRET_ENV;
  if (!wa_secret) {
    return res.status(200).json({ ok: false, mensaje: 'No hay WA_SECRET configurado. Agrégalo en .env.local como WA_SERVICE_SECRET.' });
  }

  const { distribucion } = await obtenerColaYDistribucion(today);

  const resultados: any[] = [];

  for (const buscador of config) {
    // 2. Obtener trips activos del movilizador
    const { data: trips } = await supabase
      .from('movilizador_trips')
      .select('*')
      .eq('estado', 'en_zona')
      .eq('movilizador_name', buscador.movilizador_name);

    const entregados = (trips || []).filter(t => t.pintor_asignado && t.pintor_asignado.trim() !== '').length;
    const pendientesAsignar = (trips || []).length - entregados;
    const colaBuscador = (distribucion as Record<string, any[]>)[String(buscador.movilizador_name)] || [];

    // Solo saltar si no ha entregado nada, no tiene pendientes de asignar y tampoco tiene cola.
    // O si quieres alertar siempre, quitamos el salto. Mejor enviarle si tiene cola o pendientes.
    if (pendientesAsignar === 0 && colaBuscador.length === 0) {
      resultados.push({ movilizador: buscador.movilizador_name, enviado: false, motivo: 'sin pendientes ni cola' });
      continue;
    }

    const mensaje = buildConsolidado(buscador.movilizador_name, entregados, pendientesAsignar, colaBuscador);

    try {
      const waRes = await fetch(`${WA_SERVICE_URL}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${wa_secret}`,
        },
        body: JSON.stringify({ telefono: buscador.telefono, mensaje }),
      });

      const ok = waRes.ok;
      if (ok) {
        // Marcar trips pendientes como alertados si los hay
        const tripsPendientes = (trips || []).filter(t => !t.pintor_asignado || t.pintor_asignado.trim() === '');
        if (tripsPendientes.length > 0) {
          const ids = tripsPendientes.map((t: any) => t.id);
          await supabase
            .from('movilizador_trips')
            .update({ alerta_enviada: true, updated_at: new Date().toISOString() })
            .in('id', ids);
        }
      }

      resultados.push({
        movilizador: buscador.movilizador_name,
        enviado: ok,
        pendientes_asignar: pendientesAsignar,
        cola: colaBuscador.length,
        status: waRes.status,
      });
    } catch (e) {
      resultados.push({ movilizador: buscador.movilizador_name, enviado: false, error: String(e) });
    }
  }

  return res.status(200).json({
    ok: true,
    hora_lima: `${horaActual}:${String(minActual).padStart(2, '0')}`,
    resultados,
  });
}
