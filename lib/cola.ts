import { supabase } from './supabase';
import { readSheet } from './google-sheets';

const SHEET_SEGUIMIENTO = process.env.SHEET_SEGUIMIENTO!;

const COL = {
  DIAS: 'dias',
  VIN: 'VIN',
  MODELO: 'Modelo',
  COLOR: 'Color',
  CONCESIONARIO: 'Concesionario',
  OBSERVACIONES: 'Observaciones',
  FECHA_SOLICITUD: 'Fecha de solicitud',
  FECHA_PLAN: 'Feha Planificacion',
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
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
  const parts = s.split('/');
  if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  return null;
}

function toISODate(raw: string): string | null {
  const d = parseDate(raw);
  if (!d || isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function distribuirBalanceado<T extends { fecha_planificacion: string | null }>(
  items: T[],
  buscadores: string[]
): Record<string, T[]> {
  if (buscadores.length === 0) return {};

  const resultado: Record<string, T[]> = {};
  buscadores.forEach(b => { resultado[b] = []; });

  const porFecha: Record<string, T[]> = {};
  items.forEach(item => {
    const key = item.fecha_planificacion || 'sin_fecha';
    if (!porFecha[key]) porFecha[key] = [];
    porFecha[key].push(item);
  });

  const fechasOrdenadas = Object.keys(porFecha).sort((a, b) => {
    if (a === 'sin_fecha') return 1;
    if (b === 'sin_fecha') return -1;
    return a.localeCompare(b);
  });

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

export async function obtenerColaYDistribucion(today: string) {
  const rows = await readSheet(SHEET_SEGUIMIENTO, 'Hoja 1!A:Z');
  if (!rows || rows.length < 2) {
    return { vehiculos: [], distribucion: {}, error: 'Sin datos en Google Sheets' };
  }

  const headers = rows[0].map(h => h?.trim() || '');
  const data = rows.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i]?.trim() || '';
    });
    return obj;
  });

  const validos = data.filter(row => {
    const vin = row[COL.VIN] || '';
    const eliminado = (row[COL.ELIMINADO] || '').toLowerCase();
    return vin.length > 5 && eliminado !== 'si' && eliminado !== 'sí' && eliminado !== '1' && eliminado !== 'true';
  });

  const { data: tripsHoy } = await supabase
    .from('movilizador_trips')
    .select('vin')
    .eq('fecha', today);
  const vinsEnTrip = new Set((tripsHoy || []).map((t: any) => t.vin));

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
    .sort((a, b) => {
      if (b.dias_atraso !== a.dias_atraso) return b.dias_atraso - a.dias_atraso;
      const fa = a.fecha_planificacion || '9999';
      const fb = b.fecha_planificacion || '9999';
      return fa.localeCompare(fb);
    });

  const { data: config } = await supabase
    .from('movilizador_config')
    .select('movilizador_name, rol')
    .eq('fecha', today)
    .eq('rol', 'buscador');
  const buscadores = (config || []).map((c: any) => c.movilizador_name);

  const distribucion = distribuirBalanceado(vehiculos, buscadores);

  return { vehiculos, distribucion, buscadores };
}

export function buildConsolidado(movilizador: string, entregados: number, pendientesAsignar: number, cola: any[]): string {
  const lineasCola = cola.slice(0, 5).map((v, i) => {
    const fecha = v.fecha_planificacion
      ? new Date(v.fecha_planificacion + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Sin fecha';
    const atraso = v.dias_atraso > 0 ? ` | ⚠️ ${v.dias_atraso}d atraso` : '';
    return `${i + 1}. VIN: *${v.vin}* | ${v.marca} ${v.modelo} | Ubic: ${v.ubicacion_gps || 'sin GPS'}${atraso}`;
  });

  const hayMas = cola.length > 5 ? `\n...y ${cola.length - 5} carros más.` : '';

  let resumenAsignar = '';
  if (pendientesAsignar > 0) {
    resumenAsignar = `\n⚠️ *Tienes ${pendientesAsignar} carro(s) traído(s) sin asignar pintor.* ¡Por favor asígnalos!`;
  }

  return [
    `🚗 *Resumen Área de Pintura*`,
    `Hola *${movilizador}*, aquí está tu estado actual:`,
    '',
    `📊 *TU PROGRESO HOY:*`,
    `✅ Carros entregados a pintores: *${entregados}*`,
    `📋 Carros pendientes en tu cola: *${cola.length}*`,
    resumenAsignar,
    '',
    ...(cola.length > 0 ? [
      `🎯 *PRÓXIMOS CARROS A TRAER (Más atrasados):*`,
      ...lineasCola,
      hayMas,
    ] : [
      `🎉 ¡No tienes carros en cola asignados a ti!`
    ])
  ].join('\n');
}
