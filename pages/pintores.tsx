import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ─── TIPOS ────────────────────────────────────────────────────────────
interface Trip {
  id: string;
  movilizador_name: string;
  vin: string;
  marca: string;
  modelo: string;
  color: string;
  concesionario: string;
  ubicacion_gps: string;
  fecha_planificacion: string | null;
  dias_atraso: number;
  panos_total: number;
  tipo: string;
  hora_recojo: string | null;
  pintor_asignado: string | null;
  hora_entrega: string | null;
  notas: string;
}

// ─── CONSTANTES ───────────────────────────────────────────────────────
const PINTORES_CONFIG: { nombre: string; rol: string; color: string; emoji: string }[] = [
  { nombre: 'Yader',          rol: 'pintor',     color: '#3b82f6', emoji: '🎨' },
  { nombre: 'Luis Hernandez', rol: 'pintor',     color: '#6366f1', emoji: '🎨' },
  { nombre: 'Fernando',       rol: 'planchador', color: '#8b5cf6', emoji: '🔨' },
  { nombre: 'Rudy',           rol: 'pintor',     color: '#06b6d4', emoji: '🎨' },
  { nombre: 'César',          rol: 'pintor',     color: '#0891b2', emoji: '🎨' },
  { nombre: 'Andy',           rol: 'pintor',     color: '#0284c7', emoji: '🎨' },
  { nombre: 'Sunción',        rol: 'pintor',     color: '#f43f5e', emoji: '🎨' },
];

function fmtHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
function fmtFecha(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}
function getUrgenciaColor(dias: number): string {
  if (dias > 7) return '#ef4444';
  if (dias > 3) return '#f97316';
  if (dias > 0) return '#f59e0b';
  return '#10b981';
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function Pintores() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [pintorFilter, setPintorFilter] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; type: 'success'|'error'|'info'; msg: string }[]>([]);

  const addToast = (type: 'success'|'error'|'info', msg: string) => {
    const id = Date.now();
    setToasts(t => [...t, { id, type, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  const cargarTrips = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/trips');
      const d = await r.json();
      // Solo trips con pintor asignado (ya entregados)
      setTrips((d.trips || []).filter((t: Trip) => t.pintor_asignado));
    } catch { addToast('error', 'Error cargando asignaciones'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargarTrips(); }, [cargarTrips]);

  // Agrupar trips por pintor
  const tripsPorPintor = (nombre: string) => {
    // Normalizar nombre (Fernando / Fernando (Planchador))
    return trips.filter(t => t.pintor_asignado && t.pintor_asignado.startsWith(nombre));
  };

  const pintorFiltrado = pintorFilter
    ? PINTORES_CONFIG.filter(p => p.nombre === pintorFilter)
    : PINTORES_CONFIG;

  // Estadísticas globales
  const totalCarros = trips.length;
  const totalPanos = trips.reduce((s, t) => s + (t.panos_total || 0), 0);
  const maxDiasAtraso = trips.reduce((m, t) => Math.max(m, t.dias_atraso || 0), 0);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner" style={{ width: 40, height: 40, borderTopColor: '#3b82f6' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Cargando filas de pintores...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Pintores | Control Pintura</title>
      </Head>

      {/* HEADER */}
      <header className="header">
        <div className="header-logo">
          <span style={{ fontSize: '1.4rem' }}>🎨</span>
          <span style={{ fontWeight: 700 }}>Vista Pintores</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long' })}
          </span>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => router.push('/')}>📊 Dashboard</button>
          <button className="btn btn-ghost" onClick={() => router.push('/movilizadores')}>🚗 Movilizadores</button>
          <button className="btn btn-primary" onClick={cargarTrips}>🔄 Actualizar</button>
        </nav>
      </header>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>

        {/* Resumen global */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Carros en área', value: totalCarros, color: '#3b82f6' },
            { label: 'Paños totales', value: totalPanos.toFixed(1), color: '#8b5cf6' },
            { label: 'Máx. días atraso', value: maxDiasAtraso, color: maxDiasAtraso > 5 ? '#ef4444' : '#10b981' },
            { label: 'Pintores activos', value: PINTORES_CONFIG.filter(p => tripsPorPintor(p.nombre).length > 0).length, color: '#10b981' },
          ].map(stat => (
            <div key={stat.label} className="card" style={{ textAlign: 'center', padding: '12px', border: `1px solid ${stat.color}20` }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filtro por pintor */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <button
            className={`btn ${pintorFilter === null ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.8rem' }}
            onClick={() => setPintorFilter(null)}
          >
            Todos
          </button>
          {PINTORES_CONFIG.map(p => (
            <button
              key={p.nombre}
              id={`filter-${p.nombre.replace(/\s/g, '-')}`}
              className={`btn ${pintorFilter === p.nombre ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.8rem', borderColor: pintorFilter === p.nombre ? p.color : undefined, background: pintorFilter === p.nombre ? p.color : undefined }}
              onClick={() => setPintorFilter(prev => prev === p.nombre ? null : p.nombre)}
            >
              {p.emoji} {p.nombre}
              {tripsPorPintor(p.nombre).length > 0 && (
                <span style={{ marginLeft: '6px', background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 7px', fontSize: '0.7rem' }}>
                  {tripsPorPintor(p.nombre).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Grid de pintores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {pintorFiltrado.map(pintor => {
            const mCarros = tripsPorPintor(pintor.nombre);
            const panos = mCarros.reduce((s, t) => s + (t.panos_total || 0), 0);
            const maxAtraso = mCarros.reduce((m, t) => Math.max(m, t.dias_atraso || 0), 0);

            return (
              <div key={pintor.nombre} className="card" style={{
                border: `2px solid ${pintor.color}25`,
                background: `linear-gradient(135deg, var(--bg-card), ${pintor.color}06)`,
              }}>
                {/* Header del pintor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${pintor.color}, ${pintor.color}80)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.9rem', color: '#fff', flexShrink: 0,
                  }}>
                    {getInitials(pintor.nombre)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{pintor.nombre}</div>
                    <div style={{ fontSize: '0.7rem', color: pintor.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {pintor.rol === 'planchador' ? '🔨 Planchador' : '🎨 Pintor'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: pintor.color }}>
                      {mCarros.length}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>carros</div>
                  </div>
                </div>

                {/* Mini stats */}
                {mCarros.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 6, padding: '5px', textAlign: 'center', fontSize: '0.7rem' }}>
                      <span style={{ fontWeight: 700, color: '#8b5cf6' }}>{panos.toFixed(1)}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '3px' }}>paños</span>
                    </div>
                    {maxAtraso > 0 && (
                      <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 6, padding: '5px', textAlign: 'center', fontSize: '0.7rem' }}>
                        <span style={{ fontWeight: 700, color: getUrgenciaColor(maxAtraso) }}>⚠️ {maxAtraso}d</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '3px' }}>máx</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Lista de carros */}
                {mCarros.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>🟢</div>
                    Sin carros asignados hoy
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {mCarros
                      .sort((a, b) => (b.dias_atraso || 0) - (a.dias_atraso || 0))
                      .map((trip, idx) => (
                        <div key={trip.id} style={{
                          background: 'var(--bg-surface)',
                          borderRadius: 7,
                          padding: '9px 11px',
                          borderLeft: `3px solid ${getUrgenciaColor(trip.dias_atraso)}`,
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                        }}>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700, minWidth: 18, textAlign: 'center' }}>
                            #{idx + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {trip.vin.slice(-8)}
                              {trip.dias_atraso > 0 && (
                                <span style={{ fontSize: '0.6rem', background: `${getUrgenciaColor(trip.dias_atraso)}20`, color: getUrgenciaColor(trip.dias_atraso), borderRadius: 4, padding: '1px 5px', fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
                                  ⚠️ {trip.dias_atraso}d
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                              {trip.marca} {trip.modelo} · <span style={{ color: '#3b82f6' }}>Llegó: {fmtHora(trip.hora_entrega)}</span>
                              {trip.fecha_planificacion && ` · Plan: ${fmtFecha(trip.fecha_planificacion)}`}
                            </div>
                            {trip.panos_total > 0 && (
                              <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginTop: '1px' }}>
                                🖌️ {trip.panos_total} paños · Traído por: {trip.movilizador_name}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
            {t.msg}
          </div>
        ))}
      </div>
    </>
  );
}
