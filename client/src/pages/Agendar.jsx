import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_A_MOSTRAR = 45;

// Cuántos días se prueban solos al abrir la página, buscando el primero con
// turnos libres. El comprador llega decidido desde el chat: tener que elegir el
// día a ciegas y descubrir recién ahí que no hay horarios es un paso de más en
// el embudo que produjo 1 visita de 16 enlaces.
const DIAS_A_TANTEAR = 10;

function claveFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function desdeClave(clave) {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** Hoy en horario de Perú, que es donde están los proyectos. */
function hoyEnPeru() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** El próximo día que la asesora atiende, a partir de `clave` (sin incluirla). */
function siguienteDiaHabil(clave, diasHabiles, limite) {
  const d = desdeClave(clave);
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    if (limite && d > limite) return null;
    if (!Array.isArray(diasHabiles) || diasHabiles.includes(d.getDay())) return claveFecha(d);
  }
  return null;
}

/** El primer día atendido desde hoy, incluido hoy. */
function primerDiaHabil(diasHabiles, desde) {
  const d = new Date(desde);
  for (let i = 0; i < 14; i++) {
    if (!Array.isArray(diasHabiles) || diasHabiles.includes(d.getDay())) return claveFecha(d);
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function Cargando({ texto }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-gray-400">
      <div className="w-5 h-5 border-2 border-marca-orange border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

/**
 * El botón de vuelta a WhatsApp.
 *
 * Es la pieza que faltaba: con el enlace vencido la página pintaba un cartel
 * rojo y nada más — ni un botón ni un enlace — y para volver el comprador tenía
 * que cerrar el navegador y buscar el chat. 15 de los 16 enlaces emitidos ya
 * estaban vencidos, así que esa pantalla sin salida es la que más gente vio.
 *
 * Si no hay número cargado (configuracion_agencia.telefono está vacío y no hay
 * número de canal), el hueco se muestra como hueco: no se inventa un número.
 */
function BotonWhatsApp({ numero, texto, etiqueta }) {
  if (!numero) {
    return (
      <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        Escríbenos por WhatsApp, al mismo chat por donde te llegó este enlace, y te ayudamos.
      </p>
    );
  }

  return (
    <a
      href={`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all text-center"
    >
      {etiqueta}
    </a>
  );
}

function Calendario({ mes, onCambiarMes, seleccionada, onSeleccionar, minima, maxima, diasHabiles }) {
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
          // Los dias que la asesora no atiende se deshabilitan igual que los
          // fuera de rango: ofrecerlos y despues rechazar la reserva es peor.
          const noAtiende = Array.isArray(diasHabiles) && !diasHabiles.includes(fecha.getDay());
          const fueraDeRango = fecha < minima || fecha > maxima || noAtiende;
          const elegida = seleccionada === clave;

          return (
            <button
              key={clave}
              type="button"
              disabled={fueraDeRango}
              onClick={() => onSeleccionar(clave)}
              className={`aspect-square rounded-xl text-sm font-medium transition-all ${
                elegida ? 'bg-marca-orange text-white shadow-md'
                : fueraDeRango ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-orange-50 hover:text-marca-orange'
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
  // Objeto y no cadena: la página necesita saber POR QUÉ falló. "Enlace no
  // válido" sobre un enlace que simplemente venció es un encabezado equivocado,
  // y además cambia el mensaje que conviene prellenar en WhatsApp.
  const [errorInicial, setErrorInicial] = useState(null);
  const [mes, setMes] = useState(() => hoyEnPeru());
  const [fecha, setFecha] = useState('');
  const [horarios, setHorarios] = useState(null);
  const [hora, setHora] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [confirmada, setConfirmada] = useState(null);
  // Clave de refresco: subirla vuelve a pedir la disponibilidad del día. El
  // `setFecha(f => f)` que había antes no cambiaba el estado, así que React no
  // reejecutaba nada y el turno recién ocupado seguía pintado y seleccionado.
  const [refresco, setRefresco] = useState(0);
  // Mientras es true la página avanza sola al próximo día con turnos.
  const [tanteando, setTanteando] = useState(true);
  const [diasTanteados, setDiasTanteados] = useState(0);

  useEffect(() => {
    if (!codigo) {
      setErrorInicial({ motivo: 'inexistente', mensaje: 'Falta el enlace personal. Pídenos uno por WhatsApp.', whatsapp: null });
      return;
    }
    fetch(`/api/agenda/${encodeURIComponent(codigo)}/contexto`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) {
          const fallo = new Error(d.error || 'No pudimos abrir la agenda.');
          fallo.motivo = d.motivo || 'inexistente';
          fallo.whatsapp = d.whatsapp || null;
          throw fallo;
        }
        setContexto(d);
        // Preseleccionar el proyecto que venía en el enlace, si sigue activo
        if (d.proyecto_sugerido && d.proyectos.includes(d.proyecto_sugerido)) {
          setProyecto(d.proyecto_sugerido);
        }
        // Y preseleccionar el día: el comprador ya decidió en el chat, lo que
        // le queda es confirmar.
        const primero = primerDiaHabil(d.horario?.dias_semana, hoyEnPeru());
        if (primero) {
          setFecha(primero);
          setMes(desdeClave(primero));
        }
      })
      .catch(e => setErrorInicial({
        motivo: e.motivo || 'inexistente',
        mensaje: e.message,
        whatsapp: e.whatsapp || null,
      }));
  }, [codigo]);

  useEffect(() => {
    if (!fecha || !codigo) return;
    setHorarios(null);
    setHora('');
    // El cartel rojo de un pedido que falló quedaba pegado arriba del botón
    // "Confirmar visita" aunque el comprador ya hubiera cambiado de día y los
    // horarios hubieran cargado bien. En un celular con mala señal en Ica eso
    // pasa seguido, y deja a la persona sin saber si puede confirmar.
    setError('');
    fetch(`/api/agenda/${encodeURIComponent(codigo)}/disponibilidad?fecha=${fecha}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No pudimos cargar los horarios.');
        setHorarios(d.libres);
      })
      .catch(e => { setHorarios([]); setError(e.message); setTanteando(false); });
  }, [fecha, codigo, refresco]);

  // Si el día preseleccionado no tiene turnos, salta al siguiente en vez de
  // dejar al comprador frente a "no quedan horarios" sin alternativa.
  useEffect(() => {
    if (!tanteando || !contexto || horarios === null) return;
    if (horarios.length > 0) { setTanteando(false); return; }
    if (diasTanteados >= DIAS_A_TANTEAR) { setTanteando(false); return; }

    const siguiente = siguienteDiaHabil(fecha, contexto.horario?.dias_semana, maxima);
    if (!siguiente) { setTanteando(false); return; }

    setDiasTanteados(n => n + 1);
    setFecha(siguiente);
    setMes(desdeClave(siguiente));
  }, [horarios, tanteando, contexto, fecha, diasTanteados, maxima]);

  const elegirFecha = useCallback(clave => {
    setTanteando(false);
    setFecha(clave);
  }, []);

  async function reservar(e) {
    e.preventDefault();
    // Freno de doble envío: el botón está deshabilitado mientras se envía, pero
    // un Enter desde el campo de nombre puede disparar el submit igual según el
    // navegador, y eso sería una segunda visita sobre el mismo turno.
    if (enviando) return;

    setEnviando(true);
    setError('');
    try {
      const r = await fetch(`/api/agenda/${encodeURIComponent(codigo)}/reservar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          fecha,
          hora,
          proyecto,
          notas,
          telefono_contacto: telefonoContacto,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        const fallo = new Error(d.error || 'No pudimos confirmar la visita.');
        fallo.estado = r.status;
        throw fallo;
      }
      setConfirmada(d.visita);
    } catch (err) {
      setError(err.message);
      // Si el horario se ocupó mientras llenaba el formulario, hay que soltar
      // la hora Y volver a pedir la grilla: antes el turno ocupado seguía
      // seleccionado y en naranja, así que volver a apretar daba el mismo error
      // y la única salida era adivinar que había que cambiar de día.
      if (err.estado === 409 || /ocup/i.test(err.message)) {
        setHora('');
        setTanteando(false);
        setRefresco(n => n + 1);
      }
    } finally {
      setEnviando(false);
    }
  }

  const fechaLegible = fecha
    ? (() => { const [, m, d] = fecha.split('-'); return `${parseInt(d)} de ${MESES[parseInt(m) - 1]}`; })()
    : '';

  // ── Pantallas de estado ────────────────────────────────────────────────────

  if (errorInicial) {
    const vencido = errorInicial.motivo === 'vencido';
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10 font-sans">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 w-full max-w-sm text-center">
          <h1 className="font-bold text-gray-900 text-lg mb-2">
            {vencido ? 'Este enlace venció' : 'Enlace no válido'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {vencido
              ? 'No perdiste nada: te mandamos uno nuevo al instante y eliges tu día y tu hora.'
              : errorInicial.mensaje}
          </p>
          <BotonWhatsApp
            numero={errorInicial.whatsapp}
            etiqueta={vencido ? 'Pedir un enlace nuevo por WhatsApp' : 'Escribirnos por WhatsApp'}
            texto={vencido
              ? 'Hola, mi enlace para agendar la visita venció. ¿Me mandas uno nuevo, por favor?'
              : 'Hola, abrí el enlace para agendar la visita y no funcionó. ¿Me ayudas?'}
          />
        </div>
      </div>
    );
  }

  if (confirmada) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10 font-sans">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-2xl text-emerald-700 font-bold">✓</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">¡Visita confirmada!</h1>
          <p className="text-gray-600 mb-1 font-medium">{confirmada.proyecto}</p>
          <p className="text-sm text-gray-500 mb-6">{confirmada.fecha}</p>

          {confirmada.mapa_url && (
            <a
              href={confirmada.mapa_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-marca-blue hover:bg-marca-blue-light text-white font-bold py-3 rounded-xl transition-all mb-3"
            >
              Cómo llegar
            </a>
          )}

          {contexto?.whatsapp && (
            <a
              href={`https://wa.me/${contexto.whatsapp}?text=${encodeURIComponent('Hola, acabo de agendar mi visita y tengo una consulta.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full border border-emerald-600 text-emerald-700 font-bold py-3 rounded-xl transition-all mb-5 hover:bg-emerald-50"
            >
              Escribirnos por WhatsApp
            </a>
          )}

          <p className="text-xs text-gray-400">
            Te esperamos. Si necesitas cambiarla, escríbenos por WhatsApp.
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

  const telefonoListo = !contexto.pide_telefono || /^\+?\d{6,}$/.test(telefonoContacto.replace(/[\s()-]/g, ''));
  const listoParaReservar = Boolean(fecha && hora && proyecto && nombre.trim().length >= 2 && telefonoListo);

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-10">
      <header className="bg-black px-4 py-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            {/* El backend ya manda `empresa` desde configuracion_agencia. Estaba
                clavado en "CEINYS", y esta es la única pantalla que el comprador
                abre sí o sí desde el enlace de WhatsApp. */}
            <span className="font-bold text-white text-lg tracking-tight uppercase">{contexto.empresa}</span>
            <span className="w-2 h-2 bg-marca-orange rounded-sm" />
          </div>
          <p className="text-xs text-gray-500 mt-0.5 break-words">Agenda tu visita — {contexto.horario.dias}, {String(contexto.horario.apertura).padStart(2, '0')}:00 a {String(contexto.horario.cierre).padStart(2, '0')}:00</p>
        </div>
      </header>

      <form onSubmit={reservar} className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Proyecto */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
          <label className="block text-sm font-bold text-gray-900 mb-3">1. ¿Qué proyecto quieres visitar?</label>
          <div className="flex flex-wrap gap-2">
            {contexto.proyectos.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setProyecto(p)}
                className={`px-3 sm:px-4 py-2 rounded-xl text-sm font-medium border transition-all text-left ${
                  proyecto === p
                    ? 'bg-marca-orange text-white border-marca-orange'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-marca-orange'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* Fecha */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
          <label className="block text-sm font-bold text-gray-900 mb-3">2. Elige el día</label>
          <Calendario
            mes={mes}
            onCambiarMes={setMes}
            seleccionada={fecha}
            onSeleccionar={elegirFecha}
            minima={minima}
            maxima={maxima}
            diasHabiles={contexto.horario.dias_semana}
          />
        </section>

        {/* Horario */}
        {fecha && (
          <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
            <label className="block text-sm font-bold text-gray-900 mb-1">3. Elige la hora</label>
            <p className="text-xs text-gray-400 mb-3">Horarios libres para el {fechaLegible}</p>

            {(horarios === null || tanteando) && <Cargando texto="Buscando horarios..." />}

            {horarios && horarios.length === 0 && !tanteando && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">
                  No quedan horarios libres el {fechaLegible}. Elige otro día en el calendario, o escríbenos y lo coordinamos.
                </p>
                <BotonWhatsApp
                  numero={contexto.whatsapp}
                  etiqueta="Coordinar por WhatsApp"
                  texto={`Hola, quiero visitar ${proyecto || 'el proyecto'} pero no veo horarios libres. ¿Qué día me recomiendas?`}
                />
              </div>
            )}

            {horarios && horarios.length > 0 && !tanteando && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {horarios.map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHora(h)}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      hora === h
                        ? 'bg-marca-orange text-white border-marca-orange'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-marca-orange'
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
          <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4">
            <label className="block text-sm font-bold text-gray-900">4. Tus datos</label>
            <div className="space-y-1.5">
              {/* Antes pedía el nombre "como figura en tu DNI" y exigía 3
                  caracteres. Es el último campo del embudo y el nombre legal lo
                  toma Pamela en la visita, no un formulario abierto desde el
                  chat. */}
              <label className="block text-xs font-medium text-gray-600">¿Cómo te llamamos?</label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                autoComplete="given-name"
                placeholder="Tu nombre"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-marca-orange transition-all"
              />
            </div>

            {contexto.pide_telefono && (
              <div className="space-y-1.5">
                {/* Esta identidad de WhatsApp no trae número (llega como
                    PE.<id>). Sin este campo la visita quedaba confirmada y
                    Pamela sin a quién llamar. */}
                <label className="block text-xs font-medium text-gray-600">¿A qué número te llamamos?</label>
                <input
                  value={telefonoContacto}
                  onChange={e => setTelefonoContacto(e.target.value)}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="999 999 999"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-marca-orange transition-all"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">¿Algo que debamos saber? (opcional)</label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                rows={2}
                placeholder="Cuántas personas van, si necesitas movilidad..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-marca-orange transition-all"
              />
            </div>

            {contexto.telefono_visible && (
              <p className="text-xs text-gray-400">
                Te contactamos al número {contexto.telefono_visible}, el mismo con el que nos escribiste.
              </p>
            )}
          </section>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={!listoParaReservar || enviando}
          className="w-full bg-marca-orange hover:bg-marca-orange-light disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl transition-all"
        >
          {enviando ? 'Confirmando...'
            : listoParaReservar ? (
              <span className="block leading-tight">
                Confirmar visita
                <span className="block text-xs font-medium opacity-90">{fechaLegible}, {hora}</span>
              </span>
            )
            : 'Completa los pasos para confirmar'}
        </button>
      </form>
    </div>
  );
}
