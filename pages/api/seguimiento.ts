import type { NextApiRequest, NextApiResponse } from 'next';
import { readSheet } from '../../lib/google-sheets';
import { supabase } from '../../lib/supabase';

const SHEET_SEGUIMIENTO = process.env.SHEET_SEGUIMIENTO!;

// Columnas confirmadas del sheet de seguimiento (Hoja 1)
const COL = {
  DIAS: 'dias',
  VIN: 'VIN',
  MODELO: 'Modelo',
  COLOR: 'Color',
  CONCESIONARIO: 'Concesionario',
  OBSERVACIONES: 'Observaciones',
  FECHA_SOLICITUD: 'Fecha de solicitud',
  FECHA_PLAN: 'Feha Planificacion', // typo en el sheet original, lo manejamos así
  FECHA_PLAN_ALT: 'Fecha Planificacion',
  FECHA_LLEGADA: 'Fecha de Llegada',
  UBICACION: 'Ubicación',
  MARCA: 'Marca',
  UBICACION_ESUM: 'Ubicación eSum',
  VARI: '¿VARI?',
  CC1: 'CC1',
  ELIMINADO: 'Eliminado',
  TIPO: 'TIPO',
  GPS: 'GPS',
  DIA_GPS: 'DÍA DE GPS',
  USUARIO_GPS: 'USUARIO GPS',
  PANOS_TOTAL: 'PAÑOS TOTAL',
};

function parseDate(raw: string): Date | null {
  if (!raw || raw.trim() === '') return null;
  const s = raw.trim();
  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
  // Formato DD/MM/YYYY
  const parts = s.split('/');
  if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  return null;
}

function toISODate(raw: string): string | null {
  const d = parseDate(raw);
  if (!d || isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/**
 * Algoritmo de distribución balanceada por fecha:
 * Agrupa VINs por fecha de planificación, luego reparte en round-robin
 * entre los buscadores. Esto asegura que cada buscador trabaje carros
 * de todas las fechas, no sólo de un período.
 */
function distribuirBalanceado<T extends { fecha_planificacion: string | null }>(
  items: T[],
  buscadores: string[]
): Record<string, T[]> {
  if (buscadores.length === 0) return {};

  const resultado: Record<string, T[]> = {};
  buscadores.forEach(b => { resultado[b] = []; });

  // Agrupar por fecha (null va al final)
  const porFecha: Record<string, T[]> = {};
  items.forEach(item => {
    const key = item.fecha_planificacion || 'sin_fecha';
    if (!porFecha[key]) porFecha[key] = [];
    porFecha[key].push(item);
  });

  // Ordenar fechas: más antiguas primero, sin_fecha al final
  const fechasOrdenadas = Object.keys(porFecha).sort((a, b) => {
    if (a === 'sin_fecha') return 1;
    if (b === 'sin_fecha') return -1;
    return a.localeCompare(b);
  });

  // Round-robin dentro de cada grupo de fecha
  let turno = 0;
  fechasOrdenadas.forEach(fecha => {
    const grupo = porFecha[fecha];
    grupo.forEach(item => {
      const buscador = buscadores[turno % buscadores.length];
      resultado[buscador].push(item);
      turno++;
    });
  });

  return resultado;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Leer el sheet de seguimiento
    const rows = await readSheet(SHEET_SEGUIMIENTO, 'Hoja 1!A:Z');
    if (!rows || rows.length < 2) {
      return res.status(200).json({ vehiculos: [], distribucion: {} });
    }

    const headers = rows[0].map(h => h?.trim() || '');
    const data = rows.slice(1).map(row => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i]?.trim() || '';
      });
      return obj;
    });

    // 2. Filtrar filas válidas (tienen VIN, no están eliminadas)
    const validos = data.filter(row => {
      const vin = row[COL.VIN] || '';
      const eliminado = (row[COL.ELIMINADO] || '').toLowerCase();
      return vin.length > 5 && eliminado !== 'si' && eliminado !== 'sí' && eliminado !== '1' && eliminado !== 'true';
    });

    // 3. Obtener VINs que ya tienen trip registrado hoy (evitar duplicados)
    const { data: tripsHoy } = await supabase
      .from('movilizador_trips')
      .select('vin')
      .eq('fecha', today);
    const vinsEnTrip = new Set((tripsHoy || []).map((t: any) => t.vin));

    // 4. Construir lista de vehículos pendientes
    const vehiculos = validos
      .filter(row => !vinsEnTrip.has(row[COL.VIN]))
      .map(row => ({
        vin: row[COL.VIN] || '',
        modelo: row[COL.MODELO] || '',
        color: row[COL.COLOR] || '',
        concesionario: row[COL.CONCESIONARIO] || '',
        marca: row[COL.MARCA] || '',
        observaciones: row[COL.OBSERVACIONES] || '',
        ubicacion_gps: row[COL.GPS] || row[COL.UBICACION] || '',
        ubicacion_esum: row[COL.UBICACION_ESUM] || '',
        fecha_plan_raw: row[COL.FECHA_PLAN] || row[COL.FECHA_PLAN_ALT] || '',
        fecha_planificacion: toISODate(row[COL.FECHA_PLAN] || row[COL.FECHA_PLAN_ALT] || ''),
        dias_atraso: parseInt(row[COL.DIAS] || '0', 10) || 0,
        panos_total: parseFloat(row[COL.PANOS_TOTAL] || '0') || 0,
        tipo: row[COL.TIPO] || '',
        dia_gps: row[COL.DIA_GPS] || '',
        usuario_gps: row[COL.USUARIO_GPS] || '',
        es_vari: (row[COL.VARI] || '').toLowerCase().startsWith('s'),
      }))
      // Ordenar: mayor días de atraso primero, luego fecha más antigua
      .sort((a, b) => {
        if (b.dias_atraso !== a.dias_atraso) return b.dias_atraso - a.dias_atraso;
        const fa = a.fecha_planificacion || '9999';
        const fb = b.fecha_planificacion || '9999';
        return fa.localeCompare(fb);
      });

    // 5. Obtener buscadores del día
    const { data: config } = await supabase
      .from('movilizador_config')
      .select('movilizador_name, rol')
      .eq('fecha', today)
      .eq('rol', 'buscador');
    const buscadores = (config || []).map((c: any) => c.movilizador_name);

    // 6. Distribuir balanceado
    const distribucion = distribuirBalanceado(vehiculos, buscadores);

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
