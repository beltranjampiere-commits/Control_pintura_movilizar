import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ─── TIPOS ────────────────────────────────────────────────────────────
interface MovilConfig {
  movilizador_name: string;
  telefono: string;
  rol: 'fijo' | 'buscador' | 'ausente';
}

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
  alerta_enviada: boolean;
  notas: string;
}

interface VehSeguimiento {
  vin: string;
  modelo: string;
  color: string;
  concesionario: string;
  marca: string;
  ubicacion_gps: string;
  ubicacion_esum: string;
  fecha_planificacion: string | null;
  dias_atraso: number;
  panos_total: number;
  tipo: string;
  dia_gps: string;
  usuario_gps: string;
  es_vari: boolean;
}

// ─── CONSTANTES ───────────────────────────────────────────────────────
const PINTORES = ['Yader', 'Luis Hernandez', 'Fernando (Planchador)', 'Rudy', 'César', 'Andy'];
const MOVILIZADORES_DEFAULT: MovilConfig[] = [
  { movilizador_name: 'Paul',   telefono: '51928358170', rol: 'buscador' },
  { movilizador_name: 'Santos', telefono: '51937550237', rol: 'buscador' },
  { movilizador_name: 'Marcos', telefono: '51924374906', rol: 'buscador' },
];
const ROL_COLORS = { fijo: '#8b5cf6', buscador: '#3b82f6', ausente: '#6b7280' };
const ROL_ICONS  = { fijo: '🏠', buscador: '🔍', ausente: '❌' };

function fmtHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
function fmtFecha(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function getUrgenciaColor(dias: number): string {
  if (dias > 7)  return '#ef4444';
  if (dias > 3)  return '#f97316';
  if (dias > 0)  return '#f59e0b';
  return '#10b981';
}

export default function Movilizadores() {
  const router = useRouter();

  // ── Estado ─────────────────────────────────────────────────────────
  const [config, setConfig]         = useState<MovilConfig[]>(MOVILIZADORES_DEFAULT);
  const [trips, setTrips]           = useState<Trip[]>([]);
  const [cola, setCola]             = useState<VehSeguimiento[]>([]);
  const [distribucion, setDistrib]  = useState<Record<string, VehSeguimiento[]>>({});
  const [loading, setLoading]       = useState(true);
  const [loadingCola, setLoadingCola] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [waSecret, setWaSecret]     = useState('');
  const [showSecretInput, setShowSecretInput] = useState(false);

  // Modales
  const [showTripModal, setShowTripModal] = useState(false);
  const [tripMov, setTripMov]       = useState('');       // movilizador seleccionado
  const [tripVeh, setTripVeh]       = useState<VehSeguimiento | null>(null);
  const [showPintorModal, setShowPintorModal] = useState(false);
  const [pintorTripId, setPintorTripId] = useState('');
  const [pintorSeleccionado, setPintorSeleccionado] = useState('');
  const [pintorNota, setPintorNota] = useState('');

  // Toast
  const [toasts, setToasts] = useState<{ id: number; type: 'success'|'error'|'info'; msg: string }[]>([]);
  const addToast = (type: 'success'|'error'|'info', msg: string) => {
    const id = Date.now();
    setToasts(t => [...t, { id, type, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  // ── Cargar datos ────────────────────────────────────────────────────
  const cargarTodo = useCallback(async () => {
    setLoading(true);
    try {
      // Config del día
      const r = await fetch('/api/movilizadores');
      const d = await r.json();
      if (d.config && d.config.length > 0) setConfig(d.config);
      if (d.trips) setTrips(d.trips);
    } catch { addToast('error', 'Error cargando configuración'); }
    finally { setLoading(false); }
  }, []);

  const cargarCola = useCallback(async () => {
    setLoadingCola(true);
    try {
      const r = await fetch('/api/seguimiento');
      const d = await r.json();
      setCola(d.vehiculos || []);
      setDistrib(d.distribucion || {});
    } catch { addToast('error', 'Error cargando cola de seguimiento'); }
    finally { setLoadingCola(false); }
  }, []);

  useEffect(() => {
    cargarTodo();
    cargarCola();
  }, [cargarTodo, cargarCola]);

  // ── Guardar configuración de roles ──────────────────────────────────
  const guardarConfig = async () => {
    setSavingConfig(true);
    try {
      await fetch('/api/movilizadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movilizadores: config }),
      });
      // Si hay wa_secret, guardarlo también
      if (waSecret) {
        const fijo = config.find(c => c.rol === 'fijo');
        if (fijo) {
          // Lo guardamos en la primera config del día (campo wa_secret)
          await fetch('/api/movilizadores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              movilizadores: config.map(c => c.rol === 'fijo' ? { ...c, wa_secret: waSecret } : c),
            }),
          });
        }
      }
      addToast('success', 'Configuración guardada ✅');
      await cargarCola(); // re-distribuir según nuevos buscadores
    } catch { addToast('error', 'Error guardando configuración'); }
    finally { setSavingConfig(false); }
  };

  const setRol = (name: string, rol: MovilConfig['rol']) => {
    setConfig(c => c.map(m => m.movilizador_name === name ? { ...m, rol } : m));
  };

  // ── Registrar trip (movilizador sale a buscar carro) ────────────────
  const registrarTrip = async () => {
    if (!tripVeh || !tripMov) return;
    try {
      await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movilizador_name: tripMov,
          vin: tripVeh.vin,
          marca: tripVeh.marca,
          modelo: tripVeh.modelo,
          color: tripVeh.color,
          concesionario: tripVeh.concesionario,
          ubicacion_gps: tripVeh.ubicacion_gps,
          fecha_planificacion: tripVeh.fecha_planificacion,
          dias_atraso: tripVeh.dias_atraso,
          panos_total: tripVeh.panos_total,
          tipo: tripVeh.tipo,
        }),
      });
      addToast('success', `Trip registrado: ${tripVeh.vin} ✅`);
      setShowTripModal(false);
      setTripVeh(null);
      await cargarTodo();
      await cargarCola();
    } catch { addToast('error', 'Error registrando trip'); }
  };

  // ── Asignar pintor ──────────────────────────────────────────────────
  const asignarPintor = async () => {
    if (!pintorTripId || !pintorSeleccionado) return;
    try {
      await fetch('/api/trips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pintorTripId,
          pintor_asignado: pintorSeleccionado,
          notas: pintorNota,
        }),
      });
      addToast('success', `Asignado a ${pintorSeleccionado} ✅`);
      setShowPintorModal(false);
      setPintorSeleccionado('');
      setPintorNota('');
      await cargarTodo();
    } catch { addToast('error', 'Error asignando pintor'); }
  };

  // ── Enviar WhatsApp ─────────────────────────────────────────────────
  const enviarWA = async (mov: MovilConfig) => {
    if (!waSecret) {
      setShowSecretInput(true);
      addToast('info', 'Ingresa el token del WA Service primero');
      return;
    }
    try {
      const r = await fetch('/api/whatsapp-alerta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movilizador_name: mov.movilizador_name,
          telefono: mov.telefono,
          wa_secret: waSecret,
        }),
      });
      const d = await r.json();
      if (d.enviado) addToast('success', `WhatsApp enviado a ${mov.movilizador_name} ✅`);
      else addToast('info', d.mensaje || 'Sin pendientes');
    } catch { addToast('error', 'Error enviando WhatsApp'); }
  };

  // ── Helpers UI ──────────────────────────────────────────────────────
  const tripsDeMovilizador = (nombre: string) => trips.filter(t => t.movilizador_name === nombre);
  const pendientesDeMov = (nombre: string) => tripsDeMovilizador(nombre).filter(t => !t.pintor_asignado);
  const buscadores = config.filter(c => c.rol === 'buscador');
  const fijo = config.find(c => c.rol === 'fijo');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner" style={{ width: 40, height: 40, borderTopColor: '#3b82f6' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Cargando panel de movilizadores...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Movilizadores | Control Pintura</title>
      </Head>

      {/* HEADER */}
      <header className="header">
        <div className="header-logo">
          <span style={{ fontSize: '1.4rem' }}>🚗</span>
          <span style={{ fontWeight: 700 }}>Movilizadores</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long' })}
          </span>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => router.push('/')}>📊 Dashboard</button>
          <button className="btn btn-ghost" onClick={() => router.push('/pintores')}>🎨 Pintores</button>
          <button className="btn btn-primary" onClick={cargarCola} disabled={loadingCola}>
            {loadingCola ? '⟳' : '🔄'} Actualizar cola
          </button>
        </nav>
      </header>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>

        {/* ─── SECCIÓN 1: CONFIGURACIÓN DIARIA ─────────────────────────── */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚙️ Configuración del día
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              — Define el rol de cada movilizador y guarda antes de comenzar
            </span>
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            {config.map(mov => (
              <div key={mov.movilizador_name} className="card" style={{
                border: `2px solid ${ROL_COLORS[mov.rol]}30`,
                background: `linear-gradient(135deg, var(--bg-card), ${ROL_COLORS[mov.rol]}08)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: ROL_COLORS[mov.rol],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.3rem', flexShrink: 0,
                  }}>
                    {ROL_ICONS[mov.rol]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{mov.movilizador_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📱 {mov.telefono}</div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600,
                      background: `${ROL_COLORS[mov.rol]}20`, color: ROL_COLORS[mov.rol],
                    }}>
                      {mov.rol.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Botones de rol */}
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {(['fijo', 'buscador', 'ausente'] as const).map(r => (
                    <button
                      key={r}
                      id={`rol-${mov.movilizador_name}-${r}`}
                      onClick={() => setRol(mov.movilizador_name, r)}
                      style={{
                        flex: 1, padding: '6px 0', borderRadius: 6, border: 'none',
                        cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, transition: 'all 0.15s',
                        background: mov.rol === r ? ROL_COLORS[r] : 'var(--bg-surface)',
                        color: mov.rol === r ? '#fff' : 'var(--text-secondary)',
                      }}
                    >
                      {ROL_ICONS[r]} {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Stats rápidos */}
                {mov.rol === 'buscador' && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 6, padding: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#3b82f6' }}>
                        {tripsDeMovilizador(mov.movilizador_name).length}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Traídos</div>
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 6, padding: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: pendientesDeMov(mov.movilizador_name).length > 0 ? '#ef4444' : '#10b981' }}>
                        {pendientesDeMov(mov.movilizador_name).length}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Sin pintor</div>
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 6, padding: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>
                        {tripsDeMovilizador(mov.movilizador_name).filter(t => t.pintor_asignado).length}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Entregados</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* WA Secret + botón guardar */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              id="btn-guardar-config"
              className="btn btn-primary"
              onClick={guardarConfig}
              disabled={savingConfig}
              style={{ minWidth: 160 }}
            >
              {savingConfig ? '⟳ Guardando...' : '💾 Guardar configuración'}
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => setShowSecretInput(!showSecretInput)}
              style={{ fontSize: '0.8rem' }}
            >
              🔑 {showSecretInput ? 'Ocultar' : 'Configurar'} token WA
            </button>

            {showSecretInput && (
              <input
                type="password"
                placeholder="Bearer token del wa-service..."
                value={waSecret}
                onChange={e => setWaSecret(e.target.value)}
                className="form-input"
                style={{ maxWidth: 320, fontSize: '0.85rem' }}
              />
            )}
          </div>
        </section>

        {/* ─── SECCIÓN 2: MOVILIZADOR FIJO ────────────────────────────────── */}
        {fijo && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>
              🏠 Movilizador Fijo — {fijo.movilizador_name}
            </h2>
            <div className="card" style={{ border: '2px solid #8b5cf620', background: 'linear-gradient(135deg, var(--bg-card), #8b5cf608)' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Responsable de sacar los carros terminados de la zona de pintura y llevarlos a las áreas que siguen (calidad, PDI, etc.).
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '12px 20px', minWidth: 120, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#8b5cf6' }}>
                    {tripsDeMovilizador(fijo.movilizador_name).length}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Carros sacados hoy</div>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    El registro de carros sacados se hace desde la vista de Pintores al marcar un trabajo como completado.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ─── SECCIÓN 3: COLAS DE BUSCADORES ────────────────────────────── */}
        {buscadores.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                🔍 Cola de buscadores
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>
                  — distribuido por fecha (mezcla proporcional de días de atraso)
                </span>
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  {cola.length} carros en cola
                </span>
                <button className="btn btn-ghost" onClick={cargarCola} disabled={loadingCola} style={{ fontSize: '0.8rem' }}>
                  {loadingCola ? '⟳' : '🔄'} Recargar
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: buscadores.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '1.5rem' }}>
              {buscadores.map(buscador => {
                const colaBuscador = distribucion[buscador.movilizador_name] || [];
                const tripsHoy = tripsDeMovilizador(buscador.movilizador_name);
                const pendientes = pendientesDeMov(buscador.movilizador_name);

                return (
                  <div key={buscador.movilizador_name}>
                    {/* Header del buscador */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                          🔍
                        </div>
                        <span style={{ fontWeight: 700 }}>{buscador.movilizador_name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {colaBuscador.length} en cola · {tripsHoy.length} traídos
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {pendientes.length > 0 && (
                          <button
                            id={`btn-wa-${buscador.movilizador_name}`}
                            className="btn"
                            style={{ background: '#25D366', color: '#fff', fontSize: '0.75rem', padding: '5px 10px' }}
                            onClick={() => enviarWA(buscador)}
                          >
                            📲 WA ({pendientes.length} pend.)
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Trips registrados hoy */}
                    {tripsHoy.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Registrados hoy
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {tripsHoy.map(trip => (
                            <div key={trip.id} style={{
                              background: trip.pintor_asignado ? 'var(--bg-card)' : 'rgba(239,68,68,0.05)',
                              border: `1px solid ${trip.pintor_asignado ? 'var(--border)' : '#ef444430'}`,
                              borderRadius: 8, padding: '10px 12px',
                              display: 'flex', alignItems: 'center', gap: '0.75rem',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span>{trip.vin}</span>
                                  {trip.dias_atraso > 0 && (
                                    <span style={{ background: `${getUrgenciaColor(trip.dias_atraso)}20`, color: getUrgenciaColor(trip.dias_atraso), borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
                                      ⚠️ {trip.dias_atraso}d atraso
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {trip.marca} {trip.modelo} · {trip.color} · Recogido: {fmtHora(trip.hora_recojo)}
                                </div>
                                {trip.pintor_asignado ? (
                                  <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '2px' }}>
                                    ✅ Pintor: <strong>{trip.pintor_asignado}</strong> a las {fmtHora(trip.hora_entrega)}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '2px' }}>
                                    ⏳ Sin pintor asignado aún
                                  </div>
                                )}
                              </div>
                              {!trip.pintor_asignado && (
                                <button
                                  id={`btn-pintor-${trip.id}`}
                                  className="btn btn-primary"
                                  style={{ fontSize: '0.75rem', padding: '5px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}
                                  onClick={() => {
                                    setPintorTripId(trip.id);
                                    setPintorSeleccionado('');
                                    setPintorNota('');
                                    setShowPintorModal(true);
                                  }}
                                >
                                  🎨 Asignar pintor
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cola pendiente del sheet */}
                    <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Cola del Sheet ({colaBuscador.length} carros)
                      </div>
                      {loadingCola ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          ⟳ Cargando...
                        </div>
                      ) : colaBuscador.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          ✅ Sin carros pendientes en cola
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 400, overflowY: 'auto' }}>
                          {colaBuscador.map((veh, idx) => (
                            <div key={veh.vin} style={{
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border)',
                              borderLeft: `4px solid ${getUrgenciaColor(veh.dias_atraso)}`,
                              borderRadius: 8, padding: '10px 12px',
                              display: 'flex', alignItems: 'center', gap: '0.75rem',
                              transition: 'border-color 0.15s',
                            }}>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
                                #{idx + 1}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.82rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.05em' }}>{veh.vin}</span>
                                  {veh.dias_atraso > 0 && (
                                    <span style={{ background: `${getUrgenciaColor(veh.dias_atraso)}20`, color: getUrgenciaColor(veh.dias_atraso), borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
                                      ⚠️ {veh.dias_atraso}d
                                    </span>
                                  )}
                                  {veh.es_vari && (
                                    <span style={{ background: '#8b5cf620', color: '#8b5cf6', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
                                      VARI
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {veh.marca} {veh.modelo} · {veh.color}
                                  {veh.fecha_planificacion && ` · Plan: ${fmtFecha(veh.fecha_planificacion)}`}
                                </div>
                                {veh.ubicacion_gps && (
                                  <div style={{ fontSize: '0.7rem', color: '#3b82f6', marginTop: '2px' }}>
                                    📍 {veh.ubicacion_gps}
                                  </div>
                                )}
                              </div>
                              <button
                                id={`btn-traer-${veh.vin}`}
                                className="btn btn-primary"
                                style={{ fontSize: '0.72rem', padding: '5px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}
                                onClick={() => {
                                  setTripMov(buscador.movilizador_name);
                                  setTripVeh(veh);
                                  setShowTripModal(true);
                                }}
                              >
                                🚗 Traer
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── SECCIÓN 4: RESUMEN TOTAL DEL DÍA ────────────────────────── */}
        <section>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>📊 Resumen del día</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
            {[
              { label: 'Total traídos', value: trips.length, color: '#3b82f6' },
              { label: 'Con pintor ✅', value: trips.filter(t => t.pintor_asignado).length, color: '#10b981' },
              { label: 'Sin pintor ⚠️', value: trips.filter(t => !t.pintor_asignado).length, color: '#ef4444' },
              { label: 'Carros en cola', value: cola.length, color: '#f59e0b' },
              { label: 'Paños totales', value: trips.reduce((s, t) => s + (t.panos_total || 0), 0).toFixed(1), color: '#8b5cf6' },
            ].map(stat => (
              <div key={stat.label} className="card" style={{ textAlign: 'center', border: `1px solid ${stat.color}20` }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ─── MODAL: CONFIRMAR TRIP ────────────────────────────────────── */}
      {showTripModal && tripVeh && (
        <div className="modal-overlay" onClick={() => { setShowTripModal(false); setTripVeh(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">🚗 Confirmar: Salir a buscar carro</h3>
              <button className="btn btn-ghost" onClick={() => { setShowTripModal(false); setTripVeh(null); }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'JetBrains Mono, monospace' }}>{tripVeh.vin}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {tripVeh.marca} {tripVeh.modelo} · {tripVeh.color}
                </div>
                {tripVeh.dias_atraso > 0 && (
                  <div style={{ marginTop: '0.4rem', color: getUrgenciaColor(tripVeh.dias_atraso), fontWeight: 600, fontSize: '0.8rem' }}>
                    ⚠️ {tripVeh.dias_atraso} días de atraso · Plan: {fmtFecha(tripVeh.fecha_planificacion)}
                  </div>
                )}
                {tripVeh.ubicacion_gps && (
                  <div style={{ marginTop: '0.4rem', color: '#3b82f6', fontSize: '0.8rem' }}>
                    📍 {tripVeh.ubicacion_gps}
                  </div>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                ✅ Se registrará que <strong>{tripMov}</strong> salió a buscar este carro a las <strong>{new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</strong>.
              </p>
            </div>
            <div className="action-row" style={{ marginTop: '1rem' }}>
              <button className="btn btn-ghost" onClick={() => { setShowTripModal(false); setTripVeh(null); }}>Cancelar</button>
              <button id="btn-confirmar-trip" className="btn btn-primary" style={{ flex: 1 }} onClick={registrarTrip}>
                ✅ Confirmar salida
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ASIGNAR PINTOR ────────────────────────────────────── */}
      {showPintorModal && (
        <div className="modal-overlay" onClick={() => setShowPintorModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">🎨 Asignar pintor</h3>
              <button className="btn btn-ghost" onClick={() => setShowPintorModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">¿A qué pintor se entregó el carro?</label>
                <select
                  className="form-input"
                  value={pintorSeleccionado}
                  onChange={e => setPintorSeleccionado(e.target.value)}
                  id="select-pintor"
                >
                  <option value="">-- Seleccionar pintor --</option>
                  {PINTORES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notas (opcional)</label>
                <textarea
                  className="form-textarea"
                  placeholder="Observaciones..."
                  value={pintorNota}
                  onChange={e => setPintorNota(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <div className="action-row" style={{ marginTop: '1rem' }}>
              <button className="btn btn-ghost" onClick={() => setShowPintorModal(false)}>Cancelar</button>
              <button
                id="btn-confirmar-pintor"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={asignarPintor}
                disabled={!pintorSeleccionado}
              >
                ✅ Confirmar entrega
              </button>
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
    </>
  );
}
