import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import * as XLSX from 'xlsx';

// ─── TYPES ───────────────────────────────────────────────────────────
type Urgencia = 'vencido' | 'hoy' | 'manana' | 'ok' | 'sin_fecha';
type WorkType = 'REVISAR' | 'PAÑOS' | 'PULIR' | 'PASA';
type Role = 'pintor' | 'desabollador' | 'pulidor' | 'movilizador';
type Status = 'pendiente' | 'en_proceso' | 'completado' | 'pausado';

interface Trabajo { seccion: string; tipo: string; diagnostico: string; numPanos: number; comentario: string; }
interface Vehiculo {
  vin: string; marca: string; modelo: string; color: string;
  proceso: string; fechaPlanificacion: string; fechaLimitePintura: string;
  diasRestantes: number | null; urgencia: Urgencia; trabajos: Trabajo[];
  tipoPrincipal: WorkType; tienePanos: boolean; tienePulir: boolean; tieneRevisar: boolean;
  totalPanos: number; concesionario: string;
  mapeo: { estado: 'hoy'|'ayer'|'antiguo'|'sin_mapeo'; ultimaFecha: string|null; ubicacion: string|null; };
}
interface Resumen { vencidos: number; urgentesHoy: number; manana: number; ok: number; conTrabajoRevisar: number; conTrabajoPanos: number; conTrabajoPulir: number; }
interface Assignment {
  id: string; work_date: string; vin: string; marca?: string; modelo?: string; color?: string;
  work_type: string; num_panos?: number; seccion?: string;
  technician_name: string; technician_role: string;
  status: Status; started_at?: string; completed_at?: string; duration_minutes?: number; notes?: string;
}
import { sugerirAsignaciones, AssignmentDraft } from '../lib/algorithm';
interface Toast { id: number; type: 'success'|'error'|'info'; msg: string; }

// ─── CONSTANTS ───────────────────────────────────────────────────────
const TECNICOS = {
  pintores: ['Yader', 'Luis Hernandez', 'Fernando', 'Rudy', 'César', 'Andy'],
  desabolladores: ['Casius', 'Proveedor externo', 'Juan Carlos'],
  pulidores: ['Jairo', 'Daniel', 'Vicente'],
  movilizadores: ['Paul', 'Santos', 'Marcos'],
};

const ROLE_LABELS: Record<Role, string> = {
  pintor: '🎨 Pintor',
  desabollador: '🔨 Desabollador',
  pulidor: '✨ Pulidor',
  movilizador: '🚗 Movilizador',
};

const URGENCIA_LABELS: Record<Urgencia, string> = {
  vencido: '🔴 VENCIDO',
  hoy: '🟡 HOY',
  manana: '🟠 MAÑANA',
  ok: '🟢 OK',
  sin_fecha: '⚪ SIN FECHA',
};

const WORK_TYPE_LABELS: Record<string, string> = {
  REVISAR: '🔨 REVISAR',
  PAÑOS: '🧴 PAÑOS',
  PULIR: '✨ PULIR',
  PASA: '✅ PASA',
  DESABOLLAR: '🔨 DESABOLLAR',
  MOVILIZAR: '🚗 MOVILIZAR',
};

const META_DIARIA = 150;

// ─── HELPERS ─────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function useInterval(cb: () => void, ms: number) {
  const ref = useRef(cb);
  useEffect(() => { ref.current = cb; }, [cb]);
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────
export default function Home() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [actualizadoEn, setActualizadoEn] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVin, setSelectedVin] = useState<string | null>(null);
  const [asignaciones, setAsignaciones] = useState<Assignment[]>([]);
  const [filter, setFilter] = useState<string>('todos');
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<Partial<Assignment>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoDrafts, setAutoDrafts] = useState<AssignmentDraft[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [tecnicoPresente, setTecnicoPresente] = useState<Record<string, boolean>>(() => {
    const all: Record<string, boolean> = {};
    Object.values(TECNICOS).flat().forEach(t => { all[t] = true; });
    // Marcos no está hoy por defecto (días que solo están Santos y Paul)
    all['Marcos'] = false;
    return all;
  });

  // Odoo Stock State
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockData, setStockData] = useState<{sum: any[], csi: any[]} | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);

  const fetchOdooStock = async () => {
    setLoadingStock(true);
    setShowStockModal(true);
    try {
      const r = await fetch('/api/stock');
      const d = await r.json();
      if (d.success) {
        setStockData(d.data);
      } else {
        addToast('error', d.message || 'Error al conectar con Odoo');
        setStockData(null);
      }
    } catch (e) {
      addToast('error', 'Error de red al consultar Odoo');
    } finally {
      setLoadingStock(false);
    }
  };

  // Montar solo en cliente para evitar hydration mismatch
  useEffect(() => { setMounted(true); setNow(new Date()); }, []);
  // Reloj
  useInterval(() => setNow(new Date()), 1000);

  // Cargar vehículos
  const fetchVehiculos = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await fetch('/api/vehiculos');
      const d = await r.json();
      setVehiculos(d.vehiculos || []);
      setResumen(d.resumen || null);
      setActualizadoEn(d.actualizadoEn || '');
    } catch {
      addToast('error', 'Error al cargar vehículos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Cargar asignaciones del día
  const fetchAsignaciones = useCallback(async () => {
    try {
      const r = await fetch('/api/asignaciones');
      const d = await r.json();
      setAsignaciones(d.asignaciones || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    fetchVehiculos();
    fetchAsignaciones();
  }, [fetchVehiculos, fetchAsignaciones]);

  // Auto-refresh cada 5 minutos
  useInterval(() => { fetchVehiculos(true); fetchAsignaciones(); }, 5 * 60 * 1000);

  // Toast helper
  const addToast = (type: Toast['type'], msg: string) => {
    const id = Date.now();
    setToasts(p => [...p, { id, type, msg }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };

  // Estadísticas de técnicos
  const tecLoadMap: Record<string, number> = {};
  asignaciones.forEach(a => {
    if (!tecLoadMap[a.technician_name]) tecLoadMap[a.technician_name] = 0;
    tecLoadMap[a.technician_name]++;
  });

  const completadosHoy = asignaciones.filter(a => a.status === 'completado').length;
  const totalAsignados = asignaciones.length;
  const porcentaje = Math.min(100, Math.round((completadosHoy / META_DIARIA) * 100));

  const vehiculoActual = vehiculos.find(v => v.vin === selectedVin) || null;
  const asignacionesVin = asignaciones.filter(a => a.vin === selectedVin);

  // Filtrar vehículos
  const vehiculosFiltrados = vehiculos.filter(v => {
    if (filter === 'vencido') return v.urgencia === 'vencido';
    if (filter === 'urgente') return v.urgencia === 'hoy' || v.urgencia === 'manana';
    if (filter === 'revisar') return v.tieneRevisar;
    if (filter === 'panos') return v.tienePanos;
    if (filter === 'pulir') return v.tienePulir;
    if (filter === 'sin_asignar') return !asignaciones.some(a => a.vin === v.vin);
    return true;
  });

  // ─── ACTIONS ─────────────────────────────────────────────────────
  async function crearAsignacion(data: Partial<Assignment>) {
    if (!vehiculoActual || !data.technician_name || !data.work_type) return;
    try {
      const payload = {
        vin: vehiculoActual.vin,
        marca: vehiculoActual.marca,
        modelo: vehiculoActual.modelo,
        color: vehiculoActual.color,
        technician_name: data.technician_name,
        technician_role: data.technician_role,
        work_type: data.work_type,
        num_panos: data.num_panos,
        seccion: data.seccion,
        status: 'pendiente',
        notes: data.notes,
      };
      const r = await fetch('/api/asignaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error();
      await fetchAsignaciones();
      addToast('success', `Asignado a ${data.technician_name}`);
      setShowModal(false);
    } catch { addToast('error', 'Error al crear asignación'); }
  }

  async function cambiarEstado(id: string, status: Status) {
    try {
      await fetch('/api/asignaciones', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }),
      });
      await fetchAsignaciones();
      addToast('success', status === 'completado' ? '✅ Trabajo completado' : status === 'en_proceso' ? '▶ En proceso' : 'Estado actualizado');
    } catch { addToast('error', 'Error al actualizar estado'); }
  }

  async function eliminarAsignacion(id: string) {
    if (!confirm('¿Eliminar asignación?')) return;
    try {
      await fetch(`/api/asignaciones?id=${id}`, { method: 'DELETE' });
      await fetchAsignaciones();
      addToast('info', 'Asignación eliminada');
    } catch { addToast('error', 'Error al eliminar'); }
  }

  const limpiarTodo = async () => {
    if (!confirm('¿Estás seguro de ELIMINAR TODAS las asignaciones? Esto dejará el panel en blanco.')) return;
    try {
      await fetch(`/api/asignaciones?id=all`, { method: 'DELETE' });
      await fetchAsignaciones();
      addToast('info', 'Todas las asignaciones fueron eliminadas');
    } catch { addToast('error', 'Error al limpiar todo'); }
  };

  const exportarExcel = () => {
    if (asignaciones.length === 0) {
      addToast('info', 'No hay asignaciones para exportar');
      return;
    }

    const dataExport = asignaciones
      .slice()
      .sort((a, b) => a.technician_name.localeCompare(b.technician_name))
      .map(a => {
        const v = vehiculos.find(veh => veh.vin === a.vin);
        return {
          'Técnico': a.technician_name,
          'Rol': a.technician_role,
          'Vehículo (VIN)': a.vin,
          'Marca/Modelo': `${a.marca || ''} ${a.modelo || ''}`.trim(),
          'Color': v?.color || a.color || '',
          'F. Planificación': v?.fechaPlanificacion || '',
          'Proceso': v?.proceso || '',
          'Sección': a.seccion,
          'Trabajo': a.work_type,
          'Num. Paños': a.num_panos,
          'Estado': a.status,
        };
      });

    const worksheet = XLSX.utils.json_to_sheet(dataExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen Diario");
    
    worksheet['!cols'] = [
      {wch: 15}, {wch: 12}, {wch: 20}, {wch: 25}, {wch: 12}, 
      {wch: 15}, {wch: 20}, {wch: 25}, {wch: 12}, {wch: 10}, {wch: 12}
    ];

    const fechaHoy = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Resumen_Diario_Tecnicos_${fechaHoy}.xlsx`);
  };

  const handleGenerarAuto = () => {
    const drafts = sugerirAsignaciones(vehiculos, asignaciones, tecnicoPresente, TECNICOS);
    if (drafts.length === 0) {
      addToast('info', 'No hay trabajos pendientes para asignar.');
      return;
    }
    setAutoDrafts(drafts);
    setShowAutoModal(true);
  };

  const guardarAutoAsignaciones = async () => {
    setAutoLoading(true);
    try {
      const r = await fetch('/api/asignaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(autoDrafts),
      });
      if (r.ok) {
        addToast('success', `${autoDrafts.length} asignaciones sugeridas han sido guardadas.`);
        setShowAutoModal(false);
        fetchAsignaciones();
      } else {
        addToast('error', 'Error al guardar asignaciones automáticas');
      }
    } catch {
      addToast('error', 'Error de red al guardar asignaciones');
    } finally {
      setAutoLoading(false);
    }
  };

  const router = useRouter();

  // ─── RENDER ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh' }}>
      {/* HEADER */}
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-icon">🎨</div>
          <span>Control Pintura</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— VARI ÓVALO</span>
        </div>
        <div className="header-meta">
          <button
            className="btn"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: '0.8rem' }}
            onClick={() => router.push('/movilizadores')}
          >
            🚗 Movilizadores
          </button>
          <button
            className="btn"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: '0.8rem' }}
            onClick={() => router.push('/pintores')}
          >
            🎨 Pintores
          </button>
          <div className="header-time">
            {mounted && now ? (
              <>{now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} — {now.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' })}</>
            ) : '...'}
          </div>
          <button
            className={`refresh-btn${refreshing ? ' spinning' : ''}`}
            onClick={() => { fetchVehiculos(true); fetchAsignaciones(); }}
            disabled={loading || refreshing}
          >
            <span className="refresh-icon">↻</span>
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button 
            className="btn"
            style={{ background: '#714B67', color: 'white', border: 'none', marginLeft: '10px' }}
            onClick={fetchOdooStock}
          >
            📦 Ver Stock Odoo
          </button>
          {actualizadoEn && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Últ. sync: {new Date(actualizadoEn).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </header>

      <div className="main-layout">
        {/* PROGRESS & STATS */}
        <div className="progress-section">
          <div className="stat-card">
            <div className="stat-label">🔴 Vencidos</div>
            <div className={`stat-value${resumen?.vencidos ? ' red' : ''}`}>{resumen?.vencidos ?? '–'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">🟡 Urgentes hoy</div>
            <div className={`stat-value${resumen?.urgentesHoy ? ' yellow' : ''}`}>{resumen?.urgentesHoy ?? '–'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">🚗 En área</div>
            <div className="stat-value accent">{vehiculos.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">✅ Completados hoy</div>
            <div className="stat-value green">{completadosHoy}</div>
          </div>
          <div className="progress-card">
            <div className="stat-label">Meta diaria</div>
            <div className="flex items-center justify-between" style={{ fontSize: '0.85rem' }}>
              <span style={{ fontWeight: 700 }}>{completadosHoy} / {META_DIARIA}</span>
              <span style={{ color: 'var(--text-muted)' }}>{porcentaje}%</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${porcentaje}%` }} />
            </div>
            <div className="progress-meta">
              <span>Asignados: {totalAsignados}</span>
              <span>Falta: {Math.max(0, META_DIARIA - completadosHoy)}</span>
            </div>
          </div>
        </div>

        {/* LEFT: VEHICLE LIST */}
        <div className="vehicles-panel">
          <div className="panel-header">
            <span className="panel-title">Vehículos en área ({vehiculosFiltrados.length})</span>
            <div className="filter-bar" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {[
                  ['todos', 'Todos'],
                  ['vencido', '🔴 Vencidos'],
                  ['urgente', '🟡 Urgentes'],
                  ['revisar', '🔨 Revisar'],
                  ['panos', '🧴 Paños'],
                  ['pulir', '✨ Pulir'],
                  ['sin_asignar', '⚡ Sin asignar'],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    className={`filter-btn${filter === k ? ' active' : ''}`}
                    onClick={() => setFilter(k)}
                  >{l}</button>
                ))}
              </div>
              <button 
                className="btn" 
                style={{ background: 'transparent', color: '#10b981', border: '1px solid #10b981', fontWeight: 'bold', padding: '6px 16px', borderRadius: 'var(--radius)', flexShrink: 0, marginRight: '10px' }}
                onClick={exportarExcel}
              >
                📊 Exportar Excel
              </button>
              <button 
                className="btn" 
                style={{ background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', fontWeight: 'bold', padding: '6px 16px', borderRadius: 'var(--radius)', flexShrink: 0, marginRight: '10px' }}
                onClick={limpiarTodo}
              >
                🗑️ Limpiar Todo
              </button>
              <button 
                className="btn" 
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 'bold', padding: '6px 16px', borderRadius: 'var(--radius)', flexShrink: 0 }}
                onClick={handleGenerarAuto}
              >
                ✨ Auto-Asignar (IA)
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-overlay">
              <div className="spinner" />
              <span>Cargando vehículos desde Google Sheets...</span>
            </div>
          ) : vehiculosFiltrados.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🚗</div>
              <div className="empty-state-text">No hay vehículos con este filtro</div>
            </div>
          ) : (
            vehiculosFiltrados.map(v => {
              const asigVin = asignaciones.filter(a => a.vin === v.vin);
              const techsAsig = [...new Set(asigVin.map(a => a.technician_name))];
              const completados = asigVin.filter(a => a.status === 'completado').length;
              return (
                <div
                  key={v.vin}
                  className={`vehicle-card urgencia-${v.urgencia}${selectedVin === v.vin ? ' selected' : ''}`}
                  onClick={() => setSelectedVin(selectedVin === v.vin ? null : v.vin)}
                >
                  <div className="vehicle-card-header">
                    <div>
                      <div className="vehicle-vin">{v.vin.slice(-10)}</div>
                      <div className="vehicle-info">
                        {v.marca} {v.modelo} · {v.color}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Límite pintura</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: v.urgencia === 'vencido' ? 'var(--red)' : v.urgencia === 'hoy' ? 'var(--yellow)' : 'var(--text-primary)' }}>
                        {v.fechaLimitePintura || 'Sin fecha'}
                      </div>
                    </div>
                  </div>

                  <div className="badge-row">
                    <span className={`badge badge-urgencia-${v.urgencia}`}>
                      {URGENCIA_LABELS[v.urgencia]}
                      {v.diasRestantes !== null && v.urgencia !== 'vencido'
                        ? ` (${v.diasRestantes}d)`
                        : v.urgencia === 'vencido' && v.diasRestantes !== null
                        ? ` (${Math.abs(v.diasRestantes)}d atraso)`
                        : ''}
                    </span>
                    {v.tieneRevisar && <span className="badge badge-trabajo-REVISAR">🔨 REVISAR</span>}
                    {v.tienePanos && <span className="badge badge-trabajo-PANOS">🧴 {v.totalPanos} paños</span>}
                    {v.tienePulir && <span className="badge badge-trabajo-PULIR">✨ PULIR</span>}
                    {!v.tieneRevisar && !v.tienePanos && !v.tienePulir && <span className="badge badge-trabajo-PASA">✅ PASA</span>}
                    <span className={`badge badge-mapeo-${v.mapeo.estado}`} title={v.mapeo.ubicacion || 'Sin ubicación registrada'}>
                      {v.mapeo.estado === 'hoy' ? `📍 Mapeado hoy${v.mapeo.ubicacion ? ` (${v.mapeo.ubicacion})` : ''}`
                        : v.mapeo.estado === 'ayer' ? `⚠️ Mapeado ayer${v.mapeo.ubicacion ? ` (${v.mapeo.ubicacion})` : ''}`
                        : v.mapeo.estado === 'antiguo' ? `🔴 Mapeo antiguo${v.mapeo.ubicacion ? ` (${v.mapeo.ubicacion})` : ''}`
                        : '❓ Sin mapeo'}
                    </span>
                  </div>

                  <div className="vehicle-card-footer">
                    <div className="assigned-tech">
                      {techsAsig.length > 0 ? (
                        <>
                          {techsAsig.slice(0, 3).map(t => (
                            <div key={t} className="tech-avatar" title={t}>{getInitials(t)}</div>
                          ))}
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {techsAsig.length === 1 ? techsAsig[0] : `${techsAsig.length} técnicos`}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Sin asignar</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {completados}/{asigVin.length} trabajos
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel">
          {/* DETAIL / ASSIGNMENT */}
          <div className="panel-card">
            <div className="panel-card-header">
              🔧 {vehiculoActual ? 'Detalle y Asignación' : 'Selecciona un vehículo'}
            </div>

            {vehiculoActual ? (
              <div className="vehicle-detail">
                <div className="vehicle-detail-title">
                  <span className="font-mono">{vehiculoActual.vin.slice(-10)}</span>
                </div>
                <div className="vehicle-detail-sub">
                  <div>{vehiculoActual.marca} {vehiculoActual.modelo} · {vehiculoActual.color}</div>
                  {vehiculoActual.mapeo.ubicacion && (
                    <div style={{ marginTop: 6, color: 'var(--text-primary)', fontWeight: 500 }}>
                      📍 Ubicación: {vehiculoActual.mapeo.ubicacion}
                      {vehiculoActual.mapeo.ultimaFecha && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: 8 }}>
                          ({vehiculoActual.mapeo.ultimaFecha})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Trabajos del vehículo */}
                {vehiculoActual.trabajos.length > 0 ? (
                  <>
                    <div className="tech-section-title">Trabajos Pendientes</div>
                    <div className="trabajos-list">
                      {vehiculoActual.trabajos.map((t, i) => (
                        <div key={i} className="trabajo-item">
                          <div className="trabajo-item-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                            <div>
                              <span className="trabajo-seccion">{t.seccion}</span>
                              <span className={`badge badge-trabajo-${t.tipo}`}>{t.tipo}{t.numPanos ? ` (${t.numPanos})` : ''}</span>
                            </div>
                            <button 
                              className="btn btn-primary btn-sm"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                              onClick={() => {
                                setModalData({
                                  vin: vehiculoActual.vin,
                                  work_type: t.tipo,
                                  seccion: t.seccion,
                                  num_panos: t.numPanos || 0
                                });
                                setShowModal(true);
                              }}
                            >
                              + Asignar
                            </button>
                          </div>
                          {t.diagnostico && <div className="trabajo-diag">{t.diagnostico}</div>}
                          {t.comentario && <div className="trabajo-diag" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.comentario}</div>}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    ✅ Este vehículo no tiene trabajos de pintura registrados (PASA)
                  </div>
                )}

                {/* Asignaciones actuales */}
                {asignacionesVin.length > 0 && (
                  <>
                    <div className="tech-section-title">Asignaciones del día</div>
                    <div className="trabajos-list">
                      {asignacionesVin.map(a => (
                        <div key={a.id} className="trabajo-item">
                          <div className="trabajo-item-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div className={`status-dot ${a.status}`} />
                              <span className="trabajo-seccion">{a.technician_name}</span>
                            </div>
                            <span className={`badge badge-trabajo-${a.work_type}`}>{WORK_TYPE_LABELS[a.work_type] || a.work_type}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {a.status === 'pendiente' && (
                              <button className="btn btn-warning btn-sm" onClick={() => cambiarEstado(a.id, 'en_proceso')}>▶ Iniciar</button>
                            )}
                            {a.status === 'en_proceso' && (
                              <button className="btn btn-success btn-sm" onClick={() => cambiarEstado(a.id, 'completado')}>✓ Completar</button>
                            )}
                            {a.status === 'completado' && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--green)' }}>
                                ✅ Completado {a.duration_minutes ? `en ${a.duration_minutes}min` : ''}
                              </span>
                            )}
                            <button className="btn btn-danger btn-sm" onClick={() => eliminarAsignacion(a.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <button
                  className="btn btn-primary btn-full mt-3"
                  onClick={() => { setModalData({ vin: vehiculoActual.vin }); setShowModal(true); }}
                >
                  + Asignar técnico
                </button>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '40px 16px' }}>
                <div className="empty-state-icon">👆</div>
                <div className="empty-state-text">Haz clic en un vehículo para ver el detalle y asignar trabajos</div>
              </div>
            )}
          </div>

          {/* TÉCNICOS PRESENTES */}
          <div className="panel-card">
            <div className="panel-card-header">👷 Técnicos del día</div>
            <div className="tech-overview-list">
              {Object.entries(TECNICOS).map(([rol, names]) =>
                names.map(name => {
                  const load = tecLoadMap[name] || 0;
                  const presente = tecnicoPresente[name];
                  return (
                    <div
                      key={name}
                      className="tech-overview-item"
                      style={{ opacity: presente ? 1 : 0.4, cursor: 'pointer' }}
                      onClick={() => setTecnicoPresente(p => ({ ...p, [name]: !p[name] }))}
                      title={`Clic para marcar ${presente ? 'ausente' : 'presente'}`}
                    >
                      <div className="tech-avatar" style={{ background: !presente ? 'var(--border)' : undefined }}>
                        {presente ? getInitials(name) : '✗'}
                      </div>
                      <div className="tech-overview-info">
                        <div className="tech-overview-name">{name}</div>
                        <div className={`tech-overview-role role-${rol.slice(0,-1) === 'movilizadore' ? 'movilizador' : rol === 'pintores' ? 'pintor' : rol === 'desabolladores' ? 'desabollador' : 'pulidor'}`}>
                          {ROLE_LABELS[rol === 'pintores' ? 'pintor' : rol === 'desabolladores' ? 'desabollador' : rol === 'pulidores' ? 'pulidor' : 'movilizador']}
                        </div>
                      </div>
                      <div className="tech-overview-bar">
                        <div
                          className={`tech-overview-bar-fill bar-${rol === 'pintores' ? 'pintor' : rol === 'desabolladores' ? 'desabollador' : rol === 'pulidores' ? 'pulidor' : 'movilizador'}`}
                          style={{ width: `${Math.min(100, load * 15)}%` }}
                        />
                      </div>
                      <div className={`tech-count${load >= 7 ? ' high' : load >= 4 ? ' med' : ''}`}>
                        {load}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL ASIGNACIÓN */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal-box">
            <div className="modal-title">Asignar trabajo</div>
            <div className="modal-sub">
              <span className="font-mono">{vehiculoActual?.vin.slice(-10)}</span>
              {' · '}{vehiculoActual?.marca} {vehiculoActual?.modelo}
            </div>

            {/* Técnico */}
            <div className="form-group">
              <label className="form-label">Técnico</label>
              <select
                className="form-select"
                value={modalData.technician_name || ''}
                onChange={e => {
                  const name = e.target.value;
                  let role: Role = 'pintor';
                  if (TECNICOS.desabolladores.includes(name)) role = 'desabollador';
                  else if (TECNICOS.pulidores.includes(name)) role = 'pulidor';
                  else if (TECNICOS.movilizadores.includes(name)) role = 'movilizador';
                  setModalData(p => ({ ...p, technician_name: name, technician_role: role }));
                }}
              >
                <option value="">Seleccionar técnico...</option>
                <optgroup label="🎨 Pintores">
                  {TECNICOS.pintores.filter(n => tecnicoPresente[n]).map(n => (
                    <option key={n}>{n} ({tecLoadMap[n] || 0} trabajos)</option>
                  ))}
                </optgroup>
                <optgroup label="🔨 Desabolladores">
                  {TECNICOS.desabolladores.filter(n => tecnicoPresente[n]).map(n => (
                    <option key={n}>{n} ({tecLoadMap[n] || 0} trabajos)</option>
                  ))}
                </optgroup>
                <optgroup label="✨ Pulidores">
                  {TECNICOS.pulidores.filter(n => tecnicoPresente[n]).map(n => (
                    <option key={n}>{n} ({tecLoadMap[n] || 0} trabajos)</option>
                  ))}
                </optgroup>
                <optgroup label="🚗 Movilizadores">
                  {TECNICOS.movilizadores.filter(n => tecnicoPresente[n]).map(n => (
                    <option key={n}>{n} ({tecLoadMap[n] || 0} trabajos)</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="form-row">
              {/* Tipo de trabajo */}
              <div className="form-group">
                <label className="form-label">Tipo de trabajo</label>
                <select
                  className="form-select"
                  value={modalData.work_type || ''}
                  onChange={e => setModalData(p => ({ ...p, work_type: e.target.value }))}
                >
                  <option value="">Seleccionar...</option>
                  <option value="REVISAR">🔨 REVISAR</option>
                  <option value="DESABOLLAR">🔨 DESABOLLAR</option>
                  <option value="PAÑOS">🧴 PAÑOS</option>
                  <option value="PULIR">✨ PULIR</option>
                  <option value="PASA">✅ PASA</option>
                  <option value="MOVILIZAR">🚗 MOVILIZAR</option>
                </select>
              </div>

              {/* Sección */}
              <div className="form-group">
                <label className="form-label">Sección</label>
                <input
                  className="form-input"
                  placeholder="Ej: Capot, Puerta LH..."
                  value={modalData.seccion || ''}
                  onChange={e => setModalData(p => ({ ...p, seccion: e.target.value }))}
                />
              </div>
            </div>

            {/* Num paños (solo si es PAÑOS) */}
            {modalData.work_type === 'PAÑOS' && (
              <div className="form-group">
                <label className="form-label">Número de paños</label>
                <input
                  className="form-input"
                  type="number"
                  min="0.5"
                  step="0.5"
                  placeholder="0.5, 1, 1.5..."
                  value={modalData.num_panos || ''}
                  onChange={e => setModalData(p => ({ ...p, num_panos: parseFloat(e.target.value) }))}
                />
              </div>
            )}

            {/* Notas */}
            <div className="form-group">
              <label className="form-label">Notas (opcional)</label>
              <textarea
                className="form-textarea"
                placeholder="Observaciones adicionales..."
                value={modalData.notes || ''}
                onChange={e => setModalData(p => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <div className="action-row">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => crearAsignacion(modalData)}
                disabled={!modalData.technician_name || !modalData.work_type}
              >
                Asignar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUTO ASIGNACION */}
      {showAutoModal && (
        <div className="modal-overlay" onClick={() => setShowAutoModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Sugerencias de Asignación (IA)</h3>
              <button className="btn btn-ghost" onClick={() => setShowAutoModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                El algoritmo sugiere <strong>{autoDrafts.length}</strong> asignaciones balanceando la carga de trabajo actual.
              </p>
              {autoDrafts.map((d, i) => (
                <div key={i} style={{ padding: '0.75rem', background: 'var(--bg-card-hover)', borderRadius: '6px', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{d.vin.slice(-6)} — {d.work_type} {d.seccion && d.seccion !== 'General' ? `(${d.seccion})` : ''}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Técnico asignado: <span style={{ color: 'var(--text-normal)' }}>{d.technician_name}</span></div>
                  </div>
                  {(d.num_panos ?? 0) > 0 && <span className="badge pu">{d.num_panos} paños</span>}
                </div>
              ))}
            </div>
            <div className="modal-footer" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
               <button className="btn btn-ghost" onClick={() => setShowAutoModal(false)}>Cancelar</button>
               <button className="btn btn-primary" onClick={guardarAutoAsignaciones} disabled={autoLoading}>
                 {autoLoading ? 'Guardando...' : 'Confirmar Asignaciones'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ODOO STOCK */}
      {showStockModal && (
        <div className="modal-overlay" onClick={() => setShowStockModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>📦</span> Disponibilidad de Insumos (Odoo)
              </h3>
              <button className="btn btn-ghost" onClick={() => setShowStockModal(false)}>✕</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {loadingStock ? (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <div className="spinner" style={{ margin: '0 auto 1rem', width: '30px', height: '30px', borderTopColor: '#714B67' }} />
                  <p style={{ color: 'var(--text-muted)' }}>Conectando con Odoo y extrayendo stock real...</p>
                </div>
              ) : !stockData ? (
                <div className="empty-state">
                  <div className="empty-state-icon">❌</div>
                  <div className="empty-state-text">No se pudo obtener el stock. Verifica las credenciales y el nombre de la base de datos en .env.local</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* SUM STOCK */}
                  <div>
                    <h4 style={{ color: '#714B67', borderBottom: '2px solid #714B67', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                      🏢 Almacén SUM (VAR/Stock)
                    </h4>
                    {stockData.sum.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No hay items o no se encontró el almacén.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-card-hover)', textAlign: 'left' }}>
                            <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Producto</th>
                            <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Cant. Disponible</th>
                            <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>UdM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockData.sum.map(item => (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px' }}>{item.product_id[1]}</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: item.available_quantity <= 0 ? 'var(--red)' : item.available_quantity < 5 ? 'var(--yellow)' : 'var(--green)' }}>
                                {item.available_quantity}
                              </td>
                              <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{item.product_uom_id[1]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* CSI STOCK */}
                  <div>
                    <h4 style={{ color: '#2C8E7B', borderBottom: '2px solid #2C8E7B', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                      🏢 Almacén CSI (VENT/Stock)
                    </h4>
                    {stockData.csi.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No hay items o no se encontró el almacén.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-card-hover)', textAlign: 'left' }}>
                            <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Producto</th>
                            <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Cant. Disponible</th>
                            <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>UdM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockData.csi.map(item => (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px' }}>{item.product_id[1]}</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: item.available_quantity <= 0 ? 'var(--red)' : item.available_quantity < 5 ? 'var(--yellow)' : 'var(--green)' }}>
                                {item.available_quantity}
                              </td>
                              <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{item.product_uom_id[1]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-primary" onClick={() => setShowStockModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}


      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
