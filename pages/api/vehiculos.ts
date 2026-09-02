import type { NextApiRequest, NextApiResponse } from 'next';
import { readSheet } from '../../lib/google-sheets';

const SHEET_UBICACION = process.env.SHEET_UBICACION!;
const SHEET_PLANIFICACION = process.env.SHEET_PLANIFICACION!;
const SHEET_HISTORIAL = process.env.SHEET_HISTORIAL_PINTURA!;
const SHEET_MAPEO = process.env.SHEET_MAPEO!;

// Procesos que indican que el vehículo está en o entra a pintura
const PROCESOS_PINTURA = [
  'ZONA DE ESPERA PINTURA',
  'PINTURA',
  'BOCAMAZA',
  'PROCESO PDi',
  'PROCESO PDI',
];

function isFechaPinturaVencida(fechaPlan: string): 'vencido' | 'hoy' | 'manana' | 'ok' | 'sin_fecha' {
  if (!fechaPlan) return 'sin_fecha';
  
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  // La fecha límite de pintura es 2 días antes de planificación
  const partes = fechaPlan.includes('-') ? fechaPlan.split('-') : fechaPlan.split('/');
  let fechaLimite: Date;
  
  if (fechaPlan.includes('-') && partes[0].length === 4) {
    // formato YYYY-MM-DD
    fechaLimite = new Date(fechaPlan);
  } else {
    // formato DD/MM/YYYY
    fechaLimite = new Date(`${partes[2]}-${partes[1]}-${partes[0]}`);
  }
  
  fechaLimite.setDate(fechaLimite.getDate() - 2);
  fechaLimite.setHours(0, 0, 0, 0);
  
  const diffMs = fechaLimite.getTime() - hoy.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDias < 0) return 'vencido';
  if (diffDias === 0) return 'hoy';
  if (diffDias === 1) return 'manana';
  return 'ok';
}

function formatDateLimit(fechaPlan: string): string {
  if (!fechaPlan) return '';
  const partes = fechaPlan.includes('-') ? fechaPlan.split('-') : fechaPlan.split('/');
  let d: Date;
  if (fechaPlan.includes('-') && partes[0].length === 4) {
    d = new Date(fechaPlan);
  } else {
    d = new Date(`${partes[2]}-${partes[1]}-${partes[0]}`);
  }
  d.setDate(d.getDate() - 2);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getDiasRestantes(fechaPlan: string): number | null {
  if (!fechaPlan) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const partes = fechaPlan.includes('-') ? fechaPlan.split('-') : fechaPlan.split('/');
  let fechaLimite: Date;
  if (fechaPlan.includes('-') && partes[0].length === 4) {
    fechaLimite = new Date(fechaPlan);
  } else {
    fechaLimite = new Date(`${partes[2]}-${partes[1]}-${partes[0]}`);
  }
  fechaLimite.setDate(fechaLimite.getDate() - 2);
  fechaLimite.setHours(0, 0, 0, 0);
  return Math.ceil((fechaLimite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    // 1) Leer sheet de ubicaciones (hoja REPORTE_UBICACION_AUTO)
    const ubicRows = await readSheet(SHEET_UBICACION, 'REPORTE_UBICACION_AUTO!A:L');
    
    // Fila 0: Título, Fila 1: Actualizado, Fila 2: vacía, Fila 3: Headers
    const ubicHeaders = ubicRows[3] || [];
    const ubicData = ubicRows.slice(4).map(row => {
      const obj: Record<string, string> = {};
      ubicHeaders.forEach((h, i) => { obj[h?.trim() || `c${i}`] = row[i]?.trim() || ''; });
      return obj;
    });

    // Filtrar solo vehículos en zona de pintura
    const vehiculosPintura = ubicData.filter(v => {
      const proceso = v['PROCESO'] || '';
      return PROCESOS_PINTURA.some(p => proceso.toUpperCase().includes(p.toUpperCase()));
    });

    // 2) Leer sheet de planificación para cruzar fechas
    const planRows = await readSheet(SHEET_PLANIFICACION, 'A:F');
    const planHeaders = planRows[0] || [];
    const planData = planRows.slice(1).map(row => {
      const obj: Record<string, string> = {};
      planHeaders.forEach((h, i) => { obj[h?.trim() || `c${i}`] = row[i]?.trim() || ''; });
      return obj;
    });

    // Índice de planificación por CHASIS
    const planIndex: Record<string, string> = {};
    planData.forEach(p => {
      const chasis = p['CHASIS'] || p['VIN'] || '';
      const fecha = p['FECHA\n PLANIFICACION'] || p['FECHA PLANIFICACION'] || p['FECHA_PLANIFICACION'] || '';
      if (chasis) planIndex[chasis.trim()] = fecha.trim();
    });

    // 3) Leer historial de pintura para trabajos por VIN
    const histRows = await readSheet(SHEET_HISTORIAL, 'HISTORIAL_PINTURA!A:K');
    const histHeaders = histRows[0] || [];
    const histData = histRows.slice(1).map(row => {
      const obj: Record<string, string> = {};
      histHeaders.forEach((h, i) => { obj[h?.trim() || `c${i}`] = row[i]?.trim() || ''; });
      return obj;
    });

    // Índice de trabajos por VIN
    const trabajosPorVin: Record<string, typeof histData> = {};
    histData.forEach(h => {
      const vin = h['VIN'] || h['Vin'] || '';
      if (!vin) return;
      if (!trabajosPorVin[vin]) trabajosPorVin[vin] = [];
      trabajosPorVin[vin].push(h);
    });

    // 4) Leer mapeo (sheet de ubicaciones GPS / escaneos)
    const mapeoRows = await readSheet(SHEET_MAPEO, 'SCANS!A:K');
    const mapeoHeaders = mapeoRows[0] || [];
    const mapeoData = mapeoRows.slice(1).map(row => {
      const obj: Record<string, string> = {};
      mapeoHeaders.forEach((h, i) => { obj[h?.trim() || `c${i}`] = row[i]?.trim() || ''; });
      return obj;
    });

    // Índice: último escaneo por VIN (tomamos el más reciente)
    const ultimoEscaneo: Record<string, { fecha: string; hora: string; ubicacion: string }> = {};
    mapeoData.forEach(m => {
      const vinFull = m['VIN'] || m['Vin'] || m['CHASIS'] || m['QR'] || '';
      const fechaHora = m['Fecha'] || m['FECHA'] || m['fecha'] || '';
      if (!vinFull || !fechaHora) return;
      
      const vin10 = vinFull.trim().slice(-10);
      const prev = ultimoEscaneo[vin10];
      if (!prev || fechaHora > prev.fecha) {
        ultimoEscaneo[vin10] = {
          fecha: fechaHora,
          hora: fechaHora.includes(' ') ? fechaHora.split(' ')[1] : '',
          ubicacion: m['UBICACIONES'] || m['Ubicación'] || m['ubicacion'] || '',
        };
      }
    });

    const hoyStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // 5) Construir respuesta combinada
    const vehiculos = vehiculosPintura.map(v => {
      const vin = v['VIN'] || '';
      const fechaPlan = planIndex[vin] || v['FECHA PLANIFICADA'] || '';
      const urgencia = isFechaPinturaVencida(fechaPlan);
      const diasRestantes = getDiasRestantes(fechaPlan);
      const trabajos = trabajosPorVin[vin] || [];
      const escaneo = ultimoEscaneo[vin.trim().slice(-10)];
      
      // Verificar si fue mapeado hoy
      let estadoMapeo: 'hoy' | 'ayer' | 'antiguo' | 'sin_mapeo' = 'sin_mapeo';
      if (escaneo) {
        const fechaEscaneo = escaneo.fecha.substring(0, 10);
        const diffDias = Math.ceil((new Date(hoyStr).getTime() - new Date(fechaEscaneo).getTime()) / (1000 * 60 * 60 * 24));
        if (diffDias === 0) estadoMapeo = 'hoy';
        else if (diffDias === 1) estadoMapeo = 'ayer';
        else estadoMapeo = 'antiguo';
      }

      // Consolidar trabajos pendientes (último registro por sección)
      const ultimoTrabajosPorSeccion: Record<string, typeof histData[0]> = {};
      trabajos.forEach(t => {
        const sec = t['Sección'] || t['Seccion'] || t['seccion'] || t['SECCION'] || 'General';
        const prev = ultimoTrabajosPorSeccion[sec];
        const fechaT = t['Fecha / Hora'] || t['Fecha'] || '';
        const fechaPrev = prev ? (prev['Fecha / Hora'] || prev['Fecha'] || '') : '';
        if (!prev || fechaT > fechaPrev) {
          ultimoTrabajosPorSeccion[sec] = t;
        }
      });

      const trabajosActivos = Object.values(ultimoTrabajosPorSeccion)
        .filter(t => {
          const val = t['Validación'] || t['Validacion'] || '';
          return val !== 'PASA';
        })
        .map(t => ({
          seccion: (t['Sección'] || t['Seccion'] || '').trim(),
          tipo: (t['Validación'] || t['Validacion'] || '').trim().toUpperCase(),
          diagnostico: t['Diag. eSUM'] || t['Diagnostico'] || '',
          numPanos: parseFloat(t['Núm. Paños'] || t['Num. Paños'] || t['Num Paños'] || '0') || 0,
          comentario: t['Comentario'] || '',
        }));

      const tienePanos = trabajosActivos.some(t => t.tipo === 'PAÑOS');
      const tienePulir = trabajosActivos.some(t => t.tipo === 'PULIR');
      const tieneRevisar = trabajosActivos.some(t => t.tipo === 'REVISAR');
      const totalPanos = trabajosActivos.reduce((sum, t) => sum + (t.tipo === 'PAÑOS' ? t.numPanos : 0), 0);

      // Tipo de trabajo principal
      let tipoPrincipal = 'PASA';
      if (tieneRevisar) tipoPrincipal = 'REVISAR';
      else if (tienePanos) tipoPrincipal = 'PAÑOS';
      else if (tienePulir) tipoPrincipal = 'PULIR';

      return {
        vin,
        marca: v['MARCA'] || '',
        modelo: v['MODELO'] || '',
        color: v['COLOR'] || '',
        proceso: v['PROCESO'] || '',
        estado: v['ESTADO'] || '',
        concesionario: v['CONCESIONARIO'] || '',
        fechaIngreso: v['FECHA DE INGRESO A FLUJO'] || '',
        fechaPlanificacion: fechaPlan,
        fechaLimitePintura: formatDateLimit(fechaPlan),
        diasRestantes,
        urgencia,
        trabajos: trabajosActivos,
        tipoPrincipal,
        tienePanos,
        tienePulir,
        tieneRevisar,
        totalPanos,
        mapeo: {
          estado: estadoMapeo,
          ultimaFecha: escaneo?.fecha || null,
          ubicacion: escaneo?.ubicacion || null,
        },
      };
    });

    // Ordenar por urgencia: vencido > hoy > mañana > ok > sin_fecha
    const ordenUrgencia = { vencido: 0, hoy: 1, manana: 2, ok: 3, sin_fecha: 4 };
    vehiculos.sort((a, b) => {
      const ua = ordenUrgencia[a.urgencia] ?? 4;
      const ub = ordenUrgencia[b.urgencia] ?? 4;
      if (ua !== ub) return ua - ub;
      // Si misma urgencia, ordenar por diasRestantes (más urgente primero)
      return (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999);
    });

    return res.status(200).json({
      vehiculos,
      total: vehiculos.length,
      resumen: {
        vencidos: vehiculos.filter(v => v.urgencia === 'vencido').length,
        urgentesHoy: vehiculos.filter(v => v.urgencia === 'hoy').length,
        manana: vehiculos.filter(v => v.urgencia === 'manana').length,
        ok: vehiculos.filter(v => v.urgencia === 'ok').length,
        conTrabajoRevisar: vehiculos.filter(v => v.tieneRevisar).length,
        conTrabajoPanos: vehiculos.filter(v => v.tienePanos).length,
        conTrabajoPulir: vehiculos.filter(v => v.tienePulir).length,
      },
      actualizadoEn: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error en API /vehiculos:', error);
    return res.status(500).json({ error: 'Error al obtener datos', detalle: String(error) });
  }
}
