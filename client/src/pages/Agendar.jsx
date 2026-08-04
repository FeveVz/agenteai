import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_A_MOSTRAR = 45;

function claveFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hoy en horario de Perú, que es donde están los proyectos. */
function hoyEnPeru() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  d.setHours(0, 0, 0, 0);
  return d;
}

function Cargando({ texto }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-gray-400">
      <div className="w-5 h-5 border-2 border-ceinys-orange border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

function Calendario({ mes, onCambiarMes, seleccionada, onSeleccionar, minima, maxima }) {
  const anio = mes.getFullYear();
  const m = mes.getMonth();
  const diasEnMes = new Date(anio, m + 1, 0).getDate();
  let inicio = new Date(anio, m, 1).getDay();
  inicio = inicio === 0 ? 6 : inicio - 1; // semana arranca en lunes

  const celdas = [...Array(inicio).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)];

  const puedeRetroceder = new Date(anio, m, 1) > new Date(minima.getFullYear(), minima.getMonth(), 1);
  const puedeAvanzar = new Date(anio, m, 1) < new Date(maxima.getFullYear(), maxima.getMonth(), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => puedeRetroceder && onCambiarMes(new Date(anio, m - 1, 1))}
          disabled={!puedeRetroceder}
          className="w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          aria-label="Mes anterior"
        >←</button>
        <h3 className="font-bold text-gray-900 capitalize">{MESES[m]} {anio}</h3>
        <button
          type="button"
          onClick={() => puedeAvanzar && onCambiarMes(new Date(anio, m + 1, 1))}
          disabled={!puedeAvanzar}
          className="w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          aria-label="Mes siguiente"
        >→</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DIAS_CORTOS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia, i) => {
          if (!dia) return <div key={`v${i}`} />;
          const fecha = new Date(anio, m, dia);
          const clave = claveFecha(fecha);
          const fueraDeRango = fecha < minima || fecha > maxima;
          const elegida = seleccionada === clave;

          return (
            <button
              key={clave}
              type="button"
              disabled={fueraDeRango}
              onClick={() => onSeleccionar(clave)}
              className={`aspect-square rounded-xl text-sm font-medium transition-all ${
                elegida ? 'bg-ceinys-orange text-white shadow-md'
                : fueraDeRango ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-orange-50 hover:text-ceinys-orange'
              }`}
            >
              {dia}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Agendar() {
  const { codigo } = useParams();

  const minima = useMemo(() => hoyEnPeru(), []);
  const maxima = useMemo(() => {
    const d = hoyEnPeru();
    d.setDate(d.getDate() + DIAS_A_MOSTRAR);
    return d;
  }, []);

  const [contexto, setContexto] = useState(null);
  const [errorInicial, setErrorInicial] = useState('');
  const [mes, setMes] = useState(() => hoyEnPeru());
  const [fecha, setFecha] = useState('');
  const [horarios, setHorarios] = useState(null);
  const [hora, setHora] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [nombre, setNombre] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [confirmada, setConfirmada] = useState(null);

  useEffect(() => {
    if (!codigo) { setErrorInicial('Falta el enlace personal. Pedile uno a Valeria por WhatsApp.'); return; }
    fetch(`/api/agenda/${encodeURIComponent(codigo)}/contexto`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No pudimos abrir la agenda.');
        setContexto(d);
        // Preseleccionar el proyecto que venía en el enlace, si sigue activo
        if (d.proyecto_sugerido && d.proyectos.includes(d.proyecto_sugerido)) {
          setProyecto(d.proyecto_sugerido);
        }
      })
      .catch(e => setErrorInicial(e.message));
  }, [codigo]);

  useEffect(() => {
    if (!fecha || !codigo) return;
    setHorarios(null);
    setHora('');
    fetch(`/api/agenda/${encodeURIComponent(codigo)}/disponibilidad?fecha=${fecha}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No pudimos cargar los horarios.');
        setHorarios(d.libres);
      })
      .catch(e => { setHorarios([]); setError(e.message); });
  }, [fecha, codigo]);

  async function reservar(e) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const r = await fetch(`/api/agenda/${encodeURIComponent(codigo)}/reservar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, fecha, hora, proyecto, notas }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No pudimos confirmar la visita.');
      setConfirmada(d.visita);
    } catch (err) {
      setError(err.message);
      // Si el horario se ocupó, refrescar para que vea el estado real
      if (/ocup/i.test(err.message)) setFecha(f => f);
    } finally {
      setEnviando(false);
    }
  }

  const fechaLegible = fecha
    ? (() => { const [a, m, d] = fecha.split('-'); return `${parseInt(d)} de ${MESES[parseInt(m) - 1]}`; })()
    : '';

  // ── Pantallas de estado ────────────────────────────────────────────────────

  if (errorInicial) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 font-sans">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-sm text-center">
          <p className="text-4xl mb-4">🔗</p>
          <h1 className="font-bold text-gray-900 mb-2">Enlace no válido</h1>
          <p className="text-sm text-gray-500">{errorInicial}</p>
        </div>
      </div>
    );
  }

  if (confirmada) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 font-sans">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-2xl">✅</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">¡Visita confirmada!</h1>
          <p className="text-gray-600 mb-1 font-medium">{confirmada.proyecto}</p>
          <p className="text-sm text-gray-500 mb-6">{confirmada.fecha}</p>

          {confirmada.mapa_url && (
            <a
              href={confirmada.mapa_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-ceinys-blue hover:bg-ceinys-blue-light text-white font-bold py-3 rounded-xl transition-all mb-5"
            >
              📍 Cómo llegar
            </a>
          )}

          <p className="text-xs text-gray-400">
            Te esperamos. Si necesitás cambiarla, escribinos por WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  if (!contexto) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-sans">
        <Cargando texto="Abriendo la agenda..." />
      </div>
    );
  }

  const listoParaReservar = fecha && hora && proyecto && nombre.trim().length >= 3;

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-10">
      <header className="bg-black px-4 py-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-lg tracking-tight">CEINYS</span>
            <span className="w-2 h-2 bg-ceinys-orange rounded-sm" />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Agendá tu visita — {contexto.horario.dias}, {String(contexto.horario.apertura).padStart(2, '0')}:00 a {String(contexto.horario.cierre).padStart(2, '0')}:00</p>
        </div>
      </header>

      <form onSubmit={reservar} className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Proyecto */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-bold text-gray-900 mb-3">1. ¿Qué proyecto querés visitar?</label>
          <div className="flex flex-wrap gap-2">
            {contexto.proyectos.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setProyecto(p)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  proyecto === p
                    ? 'bg-ceinys-orange text-white border-ceinys-orange'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-ceinys-orange'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* Fecha */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-bold text-gray-900 mb-3">2. Elegí el día</label>
          <Calendario
            mes={mes}
            onCambiarMes={setMes}
            seleccionada={fecha}
            onSeleccionar={setFecha}
            minima={minima}
            maxima={maxima}
          />
        </section>

        {/* Horario */}
        {fecha && (
          <section className="bg-white rounded-2xl border border-gray-200 p-5">
            <label className="block text-sm font-bold text-gray-900 mb-1">3. Elegí la hora</label>
            <p className="text-xs text-gray-400 mb-3">Horarios libres para el {fechaLegible}</p>

            {horarios === null && <Cargando texto="Buscando horarios..." />}

            {horarios && horarios.length === 0 && (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
                No quedan horarios libres ese día. Probá con otra fecha.
              </p>
            )}

            {horarios && horarios.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {horarios.map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHora(h)}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      hora === h
                        ? 'bg-ceinys-orange text-white border-ceinys-orange'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-ceinys-orange'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Datos */}
        {hora && (
          <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <label className="block text-sm font-bold text-gray-900">4. Tus datos</label>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">Nombre completo</label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Como figura en tu DNI"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ceinys-orange transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">¿Algo que debamos saber? (opcional)</label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                rows={2}
                placeholder="Cuántas personas van, si necesitás movilidad..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ceinys-orange transition-all"
              />
            </div>
            <p className="text-xs text-gray-400">
              Te contactamos al número {contexto.telefono_visible}, el mismo con el que nos escribiste.
            </p>
          </section>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={!listoParaReservar || enviando}
          className="w-full bg-ceinys-orange hover:bg-ceinys-orange-light disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl transition-all"
        >
          {enviando ? 'Confirmando...'
            : listoParaReservar ? `Confirmar visita — ${fechaLegible}, ${hora}`
            : 'Completá los pasos para confirmar'}
        </button>
      </form>
    </div>
  );
}
