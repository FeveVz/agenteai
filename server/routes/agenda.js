const express = require('express');
const crypto = require('crypto');
const { obtenerSupabase } = require('../db');
const {
  calcularHorariosLibres,
  formatearFechaCompleta,
  HORA_APERTURA,
  HORA_CIERRE,
} = require('../utils/fechas');

const router = express.Router();

// La página de agenda es pública: la abre el cliente desde WhatsApp y no puede
// pedirle contraseña. Lo que la protege es un token firmado que Valeria genera
// con el número del cliente adentro. Sin token válido no se puede reservar ni
// ver disponibilidad, así que la URL no sirve para spamear la agenda.
const VALIDEZ_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function secreto() {
  // Ambas existen en producción; PANEL_PASSWORD tiene prioridad.
  return process.env.PANEL_PASSWORD || process.env.SUPABASE_SERVICE_KEY || 'sin-secreto';
}

function b64url(txt) {
  return Buffer.from(txt, 'utf8').toString('base64url');
}

function firmar(payload) {
  return crypto.createHmac('sha256', secreto()).update(payload).digest('base64url');
}

function crearTokenAgenda(telefono) {
  const cuerpo = `${b64url(telefono)}.${Date.now() + VALIDEZ_MS}`;
  return `${cuerpo}.${firmar(cuerpo)}`;
}

function leerToken(token) {
  if (!token || typeof token !== 'string') return null;

  const partes = token.split('.');
  if (partes.length !== 3) return null;

  const [telefonoB64, expiraStr, firma] = partes;
  const cuerpo = `${telefonoB64}.${expiraStr}`;

  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;

  if (!Number.isFinite(Number(expiraStr)) || Date.now() > Number(expiraStr)) return null;

  try {
    return Buffer.from(telefonoB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/** Middleware: deja el teléfono del token en req.telefonoCliente. */
function requiereTokenAgenda(req, res, next) {
  const token = req.query.token || (req.body && req.body.token);
  const telefono = leerToken(token);

  if (!telefono) {
    return res.status(401).json({ error: 'Este enlace no es válido o ya venció. Pedile uno nuevo a Valeria por WhatsApp.' });
  }

  req.telefonoCliente = telefono;
  next();
}

// Límite de reservas por número, para que un token filtrado no llene la agenda
const reservasPorNumero = new Map();
const MAX_RESERVAS = 5;
const VENTANA_MS = 60 * 60 * 1000;

function demasiadasReservas(telefono) {
  const ahora = Date.now();
  const reg = reservasPorNumero.get(telefono);
  if (!reg || ahora - reg.inicio > VENTANA_MS) {
    reservasPorNumero.set(telefono, { conteo: 1, inicio: ahora });
    return false;
  }
  reg.conteo++;
  return reg.conteo > MAX_RESERVAS;
}

function esFechaValida(f) {
  return typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f);
}

// ── GET /api/agenda/contexto ─────────────────────────────────────────────────
// Datos para pintar la página. No devuelve el teléfono completo ni datos de
// otros clientes: solo lo necesario para elegir proyecto y fecha.
router.get('/contexto', requiereTokenAgenda, async (req, res) => {
  try {
    const supabase = obtenerSupabase();

    const [{ data: proyectos }, { data: config }] = await Promise.all([
      supabase.from('proyectos').select('nombre').eq('activo', true).order('orden', { ascending: true }),
      supabase.from('configuracion_agencia').select('nombre_agencia').limit(1).single(),
    ]);

    const tel = req.telefonoCliente;

    res.json({
      ok: true,
      telefono_visible: `••••${tel.slice(-4)}`,
      empresa: config?.nombre_agencia || 'Ceinys',
      proyectos: (proyectos || []).map(p => p.nombre),
      horario: { apertura: HORA_APERTURA, cierre: HORA_CIERRE, dias: 'Lunes a domingo' },
    });
  } catch (error) {
    console.error('[Agenda] Error en contexto:', error);
    res.status(500).json({ error: 'No pudimos cargar la agenda. Probá de nuevo en un momento.' });
  }
});

// ── GET /api/agenda/disponibilidad?fecha=YYYY-MM-DD ──────────────────────────
// Devuelve solo las horas libres. Nunca quién ocupa las otras.
router.get('/disponibilidad', requiereTokenAgenda, async (req, res) => {
  const { fecha } = req.query;

  if (!esFechaValida(fecha)) {
    return res.status(400).json({ error: 'Fecha inválida. Usá el formato YYYY-MM-DD.' });
  }

  try {
    const supabase = obtenerSupabase();
    const { data: visitas, error } = await supabase
      .from('visitas')
      .select('fecha_visita')
      .gte('fecha_visita', `${fecha}T00:00:00`)
      .lte('fecha_visita', `${fecha}T23:59:59`)
      .neq('estado', 'cancelada');

    if (error) throw error;

    let libres = calcularHorariosLibres(visitas || []);

    // Si la fecha es hoy, no ofrecer horas que ya pasaron (hora de Perú).
    const ahoraPeru = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const hoy = `${ahoraPeru.getFullYear()}-${String(ahoraPeru.getMonth() + 1).padStart(2, '0')}-${String(ahoraPeru.getDate()).padStart(2, '0')}`;
    if (fecha === hoy) {
      const minutosAhora = ahoraPeru.getHours() * 60 + ahoraPeru.getMinutes();
      libres = libres.filter(h => {
        const [hh, mm] = h.split(':').map(Number);
        return hh * 60 + mm > minutosAhora + 60; // al menos 1 hora de anticipación
      });
    }

    res.json({ ok: true, fecha, libres });
  } catch (error) {
    console.error('[Agenda] Error en disponibilidad:', error);
    res.status(500).json({ error: 'No pudimos cargar los horarios.' });
  }
});

// ── POST /api/agenda/reservar ────────────────────────────────────────────────
router.post('/reservar', requiereTokenAgenda, async (req, res) => {
  const telefono = req.telefonoCliente;
  const { nombre, fecha, hora, proyecto, notas } = req.body || {};

  if (!nombre || String(nombre).trim().length < 3) {
    return res.status(400).json({ error: 'Necesitamos tu nombre completo.' });
  }
  if (!esFechaValida(fecha) || !/^\d{2}:\d{2}$/.test(hora || '')) {
    return res.status(400).json({ error: 'Elegí una fecha y un horario.' });
  }
  if (!proyecto) {
    return res.status(400).json({ error: 'Elegí el proyecto que querés visitar.' });
  }
  if (demasiadasReservas(telefono)) {
    return res.status(429).json({ error: 'Ya registraste varias visitas. Escribinos por WhatsApp para coordinar otra.' });
  }

  const fechaVisita = `${fecha}T${hora}:00`;

  try {
    const supabase = obtenerSupabase();

    // El proyecto tiene que existir de verdad
    const { data: valido } = await supabase
      .from('proyectos').select('nombre').ilike('nombre', proyecto).eq('activo', true).limit(1);

    if (!valido || valido.length === 0) {
      return res.status(400).json({ error: 'Ese proyecto no está disponible.' });
    }

    // Que el horario siga libre: entre que cargó la página y confirmó pudo ocuparse
    const { data: ocupado } = await supabase
      .from('visitas').select('id').eq('fecha_visita', fechaVisita).neq('estado', 'cancelada').limit(1);

    if (ocupado && ocupado.length > 0) {
      return res.status(409).json({ error: 'Ese horario se acaba de ocupar. Elegí otro, por favor.' });
    }

    const { data: visita, error } = await supabase
      .from('visitas')
      .insert({
        numero_telefono: telefono,
        nombre_cliente: String(nombre).trim(),
        fecha_visita: fechaVisita,
        proyecto_interes: valido[0].nombre,
        estado: 'confirmada',
        notas: notas ? String(notas).trim() : null,
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Agenda] Visita ${visita.id} reservada desde el link por ${telefono}`);

    res.json({
      ok: true,
      mensaje: `¡Listo! Tu visita a ${valido[0].nombre} quedó confirmada para el ${formatearFechaCompleta(fechaVisita)}.`,
      visita: { id: visita.id, proyecto: valido[0].nombre, fecha: formatearFechaCompleta(fechaVisita) },
    });
  } catch (error) {
    console.error('[Agenda] Error al reservar:', error);
    res.status(500).json({ error: 'No pudimos confirmar la visita. Escribinos por WhatsApp y lo resolvemos.' });
  }
});

module.exports = { router, crearTokenAgenda };
