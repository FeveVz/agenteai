const express = require('express');
const crypto = require('crypto');
const { obtenerSupabase } = require('../db');
const {
  calcularHorariosLibres,
  formatearFechaCompleta,
  HORA_APERTURA,
  HORA_CIERRE,
} = require('../utils/fechas');
const { enviarAlertaVisita } = require('../services/email');

const router = express.Router();

// La página de agenda es pública: la abre el cliente desde WhatsApp y no puede
// pedirle contraseña. Lo que la protege es un código corto y aleatorio guardado
// en la tabla enlaces_agenda, con el número del cliente asociado y vencimiento.
// Sin un código válido no se ve disponibilidad ni se puede reservar.
const VALIDEZ_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// Sin caracteres ambiguos (0/O, 1/l/I) por si alguien lo dicta o lo escribe a mano.
const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyz';
const LARGO_CODIGO = 7; // 31^7 ≈ 2.7e10 combinaciones

function generarCodigo() {
  const bytes = crypto.randomBytes(LARGO_CODIGO);
  let codigo = '';
  for (let i = 0; i < LARGO_CODIGO; i++) codigo += ALFABETO[bytes[i] % ALFABETO.length];
  return codigo;
}

/**
 * Crea el enlace y lo guarda. Reintenta si el código ya existía — con 2.7e10
 * combinaciones es rarísimo, pero la colisión silenciosa daría el enlace de
 * otro cliente, así que no se deja al azar.
 */
async function crearEnlaceAgenda(telefono, proyecto) {
  const supabase = obtenerSupabase();
  const expira = new Date(Date.now() + VALIDEZ_MS).toISOString();

  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigo();
    const { error } = await supabase
      .from('enlaces_agenda')
      .insert({ codigo, numero_telefono: telefono, proyecto: proyecto || null, expira_en: expira });

    if (!error) return codigo;
    if (error.code !== '23505') throw error; // 23505 = clave duplicada
  }
  throw new Error('No se pudo generar un código de enlace único.');
}

// Límite de intentos de resolución por IP: hace inviable adivinar códigos
const intentosPorIP = new Map();
const MAX_INTENTOS_IP = 40;
const VENTANA_IP_MS = 10 * 60 * 1000;

function demasiadosIntentos(ip) {
  const ahora = Date.now();
  const reg = intentosPorIP.get(ip);
  if (!reg || ahora - reg.inicio > VENTANA_IP_MS) {
    intentosPorIP.set(ip, { conteo: 1, inicio: ahora });
    return false;
  }
  reg.conteo++;
  return reg.conteo > MAX_INTENTOS_IP;
}

/** Middleware: resuelve el código y deja el teléfono en req.telefonoCliente. */
async function requiereCodigoAgenda(req, res, next) {
  const codigo = req.params.codigo || req.query.codigo || (req.body && req.body.codigo);
  const ip = req.ip || 'desconocida';

  if (demasiadosIntentos(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos.' });
  }

  if (!codigo || !/^[a-z0-9]{4,16}$/.test(String(codigo))) {
    return res.status(401).json({ error: 'Este enlace no es válido. Pedile uno nuevo a Valeria por WhatsApp.' });
  }

  try {
    const supabase = obtenerSupabase();
    const { data: enlace } = await supabase
      .from('enlaces_agenda')
      .select('numero_telefono, proyecto, expira_en')
      .eq('codigo', String(codigo))
      .limit(1)
      .single();

    if (!enlace) {
      return res.status(401).json({ error: 'Este enlace no es válido. Pedile uno nuevo a Valeria por WhatsApp.' });
    }
    if (new Date(enlace.expira_en) < new Date()) {
      return res.status(401).json({ error: 'Este enlace ya venció. Escribinos por WhatsApp y te mandamos uno nuevo.' });
    }

    req.telefonoCliente = enlace.numero_telefono;
    req.proyectoSugerido = enlace.proyecto;
    next();
  } catch {
    return res.status(401).json({ error: 'Este enlace no es válido. Pedile uno nuevo a Valeria por WhatsApp.' });
  }
}

const requiereTokenAgenda = requiereCodigoAgenda;

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
router.get('/:codigo/contexto', requiereCodigoAgenda, async (req, res) => {
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
      proyecto_sugerido: req.proyectoSugerido || null,
      horario: { apertura: HORA_APERTURA, cierre: HORA_CIERRE, dias: 'Lunes a domingo' },
    });
  } catch (error) {
    console.error('[Agenda] Error en contexto:', error);
    res.status(500).json({ error: 'No pudimos cargar la agenda. Probá de nuevo en un momento.' });
  }
});

// ── GET /api/agenda/disponibilidad?fecha=YYYY-MM-DD ──────────────────────────
// Devuelve solo las horas libres. Nunca quién ocupa las otras.
router.get('/:codigo/disponibilidad', requiereCodigoAgenda, async (req, res) => {
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
router.post('/:codigo/reservar', requiereCodigoAgenda, async (req, res) => {
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

    // Acá sí esperamos: la respuesta se devuelve enseguida y en serverless
    // una promesa suelta puede quedar cortada antes de completarse.
    const { data: config } = await supabase
      .from('configuracion_agencia').select('email_alertas').limit(1).single();
    await enviarAlertaVisita({ ...visita, origen: 'link' }, config);

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

module.exports = { router, crearEnlaceAgenda };
