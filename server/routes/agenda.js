const express = require('express');
const crypto = require('crypto');
const { obtenerSupabase } = require('../db');
const {
  calcularHorariosLibres,
  formatearFechaCompleta,
  resolverHorario,
  esDiaDeAtencion,
  describirDias,
  generarHorariosDelDia,
  validarRanura,
  fechaHoyEnPeru,
  minutosDelDiaEnPeru,
} = require('../utils/fechas');
const { enviarAlertaVisita } = require('../services/email');
const { buscarPorNombre } = require('../utils/proyectos');

const router = express.Router();

// La página de agenda es pública: la abre el cliente desde WhatsApp y no puede
// pedirle contraseña. Lo que la protege es un código corto y aleatorio guardado
// en la tabla enlaces_agenda, con el número del cliente asociado y vencimiento.
// Sin un código válido no se ve disponibilidad ni se puede reservar.

// Antes eran 7 días. Medido sobre la tabla el 26/10: de 16 enlaces emitidos, 15
// ya estaban vencidos y solo 1 seguía vivo, y el más viejo venció sin que nadie
// lo abriera. Un comprador de lotes no decide en una semana: consulta a la
// pareja, junta la inicial, pide el día libre. El enlace tiene que durar más
// que su duda, no menos.
const DIAS_VALIDEZ_ENLACE = 30;
const VALIDEZ_MS = DIAS_VALIDEZ_ENLACE * 24 * 60 * 60 * 1000;

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
 * ¿Esta identidad es un teléfono al que se puede llamar?
 *
 * 10 de 131 contactos llegan de Twilio como 'PE.2104140390227158' (identidad de
 * WhatsApp sin número). Con esas identidades no se puede llamar ni mandar un
 * SMS, y la página les mostraba "Te contactamos al número ••••7158", que son
 * los últimos cuatro dígitos de un id interno: un número que no es el suyo.
 */
function esTelefonoAlcanzable(valor) {
  return /^\+?\d{6,}$/.test(String(valor == null ? '' : valor).trim());
}

/** Solo dígitos, para armar un enlace wa.me. Devuelve null si no queda nada. */
function soloDigitos(valor) {
  const d = String(valor == null ? '' : valor).replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}

/**
 * El WhatsApp al que el comprador puede volver cuando algo falla.
 *
 * El dato de Pamela es `configuracion_agencia.telefono`, y hoy está VACÍO en la
 * base. El respaldo es el número del propio canal (TWILIO_WHATSAPP_FROM): es el
 * número al que el comprador ya le escribió, no un dato inventado. Si no hay
 * ninguno de los dos devuelve null, y la página muestra el hueco ("escríbenos
 * por WhatsApp") en vez de un botón que lleva a ninguna parte.
 */
async function obtenerWhatsAppEmpresa(config) {
  let fila = config;

  if (fila === undefined) {
    try {
      const supabase = obtenerSupabase();
      const { data } = await supabase.from('configuracion_agencia').select('telefono').limit(1).single();
      fila = data;
    } catch {
      fila = null;
    }
  }

  return soloDigitos(fila && fila.telefono) || soloDigitos(process.env.TWILIO_WHATSAPP_FROM) || null;
}

/**
 * Crea el enlace, o reusa el que ese número ya tiene vivo.
 *
 * El reuso no es una optimización: `enviar_link_agenda` acuñaba un código nuevo
 * en cada llamada y en la base quedaron dos pares de enlaces para el mismo
 * número — 2tahs86 y 2kme2sd, con 11 segundos de diferencia, los dos mandados
 * al mismo comprador uno detrás del otro. Recibir dos URLs distintas para la
 * misma visita no es un detalle: es el momento de decidir, y le pusimos una
 * duda encima.
 *
 * Devuelve { codigo, reusado, expira_en }. Los dos caminos que piden un enlace
 * (la herramienta del agente y cualquier envío futuro) lo aprovechan.
 */
async function crearEnlaceAgendaDetallado(telefono, proyecto) {
  const supabase = obtenerSupabase();
  const ahora = new Date().toISOString();

  // Si ya tiene uno vivo, ese mismo. El más lejano a vencer, para darle el aire
  // que queda y no uno que muere mañana.
  try {
    const { data: vivos } = await supabase
      .from('enlaces_agenda')
      .select('codigo, proyecto, expira_en')
      .eq('numero_telefono', telefono)
      .gt('expira_en', ahora)
      .order('expira_en', { ascending: false })
      .limit(1);

    const vivo = vivos && vivos[0];
    if (vivo) {
      // El proyecto sí se actualiza: el enlace puede haberse emitido antes de
      // que el comprador dijera cuál le interesa, y la página lo prellena con
      // ese dato.
      if (proyecto && proyecto !== vivo.proyecto) {
        const { error } = await supabase
          .from('enlaces_agenda').update({ proyecto }).eq('codigo', vivo.codigo);
        if (error) console.warn('[Agenda] No se pudo actualizar el proyecto del enlace vivo:', error.message);
      }
      return { codigo: vivo.codigo, reusado: true, expira_en: vivo.expira_en };
    }
  } catch (err) {
    // Que falle la búsqueda no puede impedir mandar un enlace: se sigue al alta.
    console.warn('[Agenda] No se pudo buscar un enlace vivo:', err.message);
  }

  const expira = new Date(Date.now() + VALIDEZ_MS).toISOString();

  // Reintenta si el código ya existía — con 2.7e10 combinaciones es rarísimo,
  // pero la colisión silenciosa daría el enlace de otro cliente.
  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigo();
    const { error } = await supabase
      .from('enlaces_agenda')
      .insert({ codigo, numero_telefono: telefono, proyecto: proyecto || null, expira_en: expira });

    if (!error) return { codigo, reusado: false, expira_en: expira };
    if (error.code !== '23505') throw error; // 23505 = clave duplicada
  }
  throw new Error('No se pudo generar un código de enlace único.');
}

/** Igual que la anterior pero devuelve solo el código, como esperan los llamadores viejos. */
async function crearEnlaceAgenda(telefono, proyecto) {
  const { codigo } = await crearEnlaceAgendaDetallado(telefono, proyecto);
  return codigo;
}

// Límite de intentos de resolución por IP: hace inviable adivinar códigos
const intentosPorIP = new Map();
const MAX_INTENTOS_IP = 40;
const VENTANA_IP_MS = 10 * 60 * 1000;

function demasiadosIntentos(ip) {
  const ahora = Date.now();

  // Purga: el Map vive en memoria de la instancia y sin esto crece mientras la
  // instancia siga caliente. Es un freno best-effort por instancia, no una
  // garantía: en Vercel cada instancia arranca con su propio Map vacío.
  for (const [clave, reg] of intentosPorIP) {
    if (ahora - reg.inicio > VENTANA_IP_MS) intentosPorIP.delete(clave);
  }

  const reg = intentosPorIP.get(ip);
  if (!reg || ahora - reg.inicio > VENTANA_IP_MS) {
    intentosPorIP.set(ip, { conteo: 1, inicio: ahora });
    return false;
  }
  reg.conteo++;
  return reg.conteo > MAX_INTENTOS_IP;
}

/**
 * Registra que el enlace se abrió.
 *
 * Se cuenta en /contexto y no en cada llamada de disponibilidad porque esa ruta
 * se pide una sola vez por apertura de la página. Evidencia: los 16 enlaces
 * emitidos tienen usos = 0, así que hoy es imposible distinguir "no lo abrió"
 * (problema del mensaje) de "lo abrió y el formulario lo expulsó" (problema de
 * la página) — dos arreglos opuestos. `abierto_en` guarda el primer clic, que
 * es la señal de seguimiento: abierto y sin reservar es el lead que hay que
 * llamar el mismo día.
 *
 * No se espera y nunca tira: ni la métrica ni una columna que falte pueden
 * frenar la carga de la página.
 */
function registrarApertura(enlace) {
  if (!enlace || !enlace.codigo) return;
  const supabase = obtenerSupabase();

  const fallback = async () => {
    // Sin la función RPC: suma sobre el valor que ya leímos. Puede perder una
    // apertura simultánea; para esta métrica es aceptable.
    const { error } = await supabase
      .from('enlaces_agenda')
      .update({ usos: Number(enlace.usos || 0) + 1 })
      .eq('codigo', enlace.codigo);
    if (error) console.warn('[Agenda] No se pudo registrar la apertura:', error.message);
  };

  // La RPC hace `usos = usos + 1` y fija abierto_en en la base, sin carrera.
  // Si la migración todavía no corrió, no existe: se cae al update simple.
  Promise.resolve(supabase.rpc('incrementar_uso_enlace', { p_codigo: enlace.codigo }))
    .then(({ error }) => (error ? fallback() : null))
    .catch(() => fallback())
    .catch(() => {});
}

/** Middleware: resuelve el código y deja el teléfono en req.telefonoCliente. */
async function requiereCodigoAgenda(req, res, next) {
  const codigo = req.params.codigo || req.query.codigo || (req.body && req.body.codigo);
  const ip = req.ip || 'desconocida';

  if (demasiadosIntentos(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  }

  // El error viaja con `motivo` y con el WhatsApp de la empresa. El motivo es
  // dato, no prosa: la página pintaba "Enlace no válido" también cuando el
  // enlace había sido perfectamente válido y solo venció, y no ofrecía ni un
  // botón para volver. Probado en producción el 26/10: GET /visita/vkm68w5
  // devuelve 401 y la pantalla queda sin salida.
  const rechazar = async (estado, motivo, mensaje) => {
    const whatsapp = await obtenerWhatsAppEmpresa();
    return res.status(estado).json({ error: mensaje, motivo, whatsapp });
  };

  if (!codigo || !/^[a-z0-9]{4,16}$/.test(String(codigo))) {
    return rechazar(401, 'inexistente', 'Este enlace no es válido. Pídenos uno nuevo por WhatsApp.');
  }

  try {
    const supabase = obtenerSupabase();
    const { data: enlace } = await supabase
      .from('enlaces_agenda')
      .select('codigo, numero_telefono, proyecto, expira_en, usos')
      .eq('codigo', String(codigo))
      .limit(1)
      .single();

    if (!enlace) {
      return rechazar(401, 'inexistente', 'Este enlace no es válido. Pídenos uno nuevo por WhatsApp.');
    }
    if (new Date(enlace.expira_en) < new Date()) {
      return rechazar(401, 'vencido', 'Este enlace ya venció. Escríbenos por WhatsApp y te mandamos uno nuevo.');
    }

    req.enlace = enlace;
    req.telefonoCliente = enlace.numero_telefono;
    req.proyectoSugerido = enlace.proyecto;
    next();
  } catch {
    return rechazar(401, 'inexistente', 'Este enlace no es válido. Pídenos uno nuevo por WhatsApp.');
  }
}

const requiereTokenAgenda = requiereCodigoAgenda;

/**
 * Límite de reservas por número, para que un enlace filtrado no llene la agenda.
 *
 * Se cuenta en la base y no en un Map de memoria: en Vercel cada instancia
 * arranca con el suyo vacío, así que el tope de 5 se multiplicaba por la
 * cantidad de instancias calientes y la defensa no existía de verdad.
 *
 * Si la consulta falla, deja pasar: con 3 visitas en todo el historial, perder
 * una reserva legítima por un problema de telemetría cuesta más que el abuso
 * que esto previene.
 */
const MAX_RESERVAS = 5;
const VENTANA_MS = 60 * 60 * 1000;

async function demasiadasReservas(telefono) {
  try {
    const supabase = obtenerSupabase();
    const desde = new Date(Date.now() - VENTANA_MS).toISOString();
    const { count, error } = await supabase
      .from('visitas')
      .select('id', { count: 'exact', head: true })
      .eq('numero_telefono', telefono)
      .gte('creado_en', desde);

    if (error) throw error;
    return Number(count || 0) >= MAX_RESERVAS;
  } catch (err) {
    console.warn('[Agenda] No se pudo contar las reservas recientes:', err.message);
    return false;
  }
}

function esFechaValida(f) {
  return typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f);
}

/**
 * La nota de la visita, armada acá y no en el navegador.
 *
 * El campo era un textarea libre con el marcador "cuántas personas van, si
 * necesitas movilidad...", y en la base quedaron notas que dicen literalmente
 * "2" y "4": la gente contestó la primera mitad de la frase. Pamela abre el
 * correo y lee un número suelto.
 *
 * Peor es lo que NO quedó: Gean Romano pidió por chat que lo recojan desde
 * Tinguiña, el agente dijo que coordinaban, y su visita tiene notas en null.
 * El día de la visita nadie sabe dónde pasar por él. Un recojo perdido es una
 * visita perdida, y una visita es lo más caro que produce todo este programa.
 *
 * Se compone en el servidor para que la misma nota salga igual venga del
 * calendario web o de la conversación.
 */
function componerNotas({ personas, punto_recojo: puntoRecojo, notas }) {
  const partes = [];

  const cuantas = Number.parseInt(personas, 10);
  if (Number.isFinite(cuantas) && cuantas > 0 && cuantas <= 20) {
    partes.push(`${cuantas} ${cuantas === 1 ? 'persona' : 'personas'}`);
  }

  const recojo = String(puntoRecojo == null ? '' : puntoRecojo).trim();
  if (recojo) partes.push(`RECOGER EN: ${recojo.slice(0, 120)}`);

  const libre = String(notas == null ? '' : notas).trim();
  // Un "2" suelto ya viaja como "2 personas": no se repite.
  if (libre && !/^\d{1,2}$/.test(libre)) partes.push(libre.slice(0, 300));

  return partes.length ? partes.join(' · ') : null;
}

/** Los turnos de un día ya libres, descontando las horas pasadas si es hoy. */
function libresDelDia(fecha, visitas, horario, margenMinutos) {
  if (!esDiaDeAtencion(fecha, horario)) return [];

  let libres = calcularHorariosLibres(visitas || [], horario);

  // Si la fecha es hoy, no ofrecer horas que ya pasaron (hora de Perú: el
  // servidor corre en UTC y usar su reloj tacharía cinco horas de turnos vivos).
  if (fecha === fechaHoyEnPeru()) {
    const minutosAhora = minutosDelDiaEnPeru();
    libres = libres.filter(h => {
      const [hh, mm] = h.split(':').map(Number);
      return hh * 60 + mm > minutosAhora + margenMinutos;
    });
  }

  return libres;
}

// Anticipación mínima para ofrecer un turno de hoy. Pamela tiene que poder
// salir a recibir al comprador.
const MARGEN_MINUTOS = 60;

// ── GET /api/agenda/contexto ─────────────────────────────────────────────────
// Datos para pintar la página. No devuelve el teléfono completo ni datos de
// otros clientes: solo lo necesario para elegir proyecto y fecha.
router.get('/:codigo/contexto', requiereCodigoAgenda, async (req, res) => {
  try {
    const supabase = obtenerSupabase();

    const [{ data: proyectos }, { data: config }] = await Promise.all([
      supabase.from('proyectos').select('nombre').eq('activo', true).order('orden', { ascending: true }),
      supabase.from('configuracion_agencia')
        .select('nombre_agencia, telefono, hora_apertura, hora_cierre, minutos_por_slot, dias_atencion')
        .limit(1).single(),
    ]);

    const horario = resolverHorario(config);
    const tel = req.telefonoCliente;
    const alcanzable = esTelefonoAlcanzable(tel);

    registrarApertura(req.enlace);

    res.json({
      ok: true,
      // Null cuando la identidad no es un teléfono: afirmarle al comprador "te
      // contactamos al ••••7158" sobre los últimos dígitos de PE.21041403902...
      // es mostrarle un número que no es suyo, y si reserva Pamela se queda sin
      // nadie a quien llamar.
      telefono_visible: alcanzable ? `••••${tel.slice(-4)}` : null,
      pide_telefono: !alcanzable,
      whatsapp: await obtenerWhatsAppEmpresa(config),
      empresa: (config?.nombre_agencia || '').trim() || 'Agenda tu visita',
      proyectos: (proyectos || []).map(p => p.nombre),
      proyecto_sugerido: req.proyectoSugerido || null,
      // El texto de los dias se DERIVA de los mismos datos que usan el
      // calendario y la validacion. Antes era el literal 'Lunes a domingo',
      // que quedaba mintiendo apenas la clienta cambiara su horario.
      horario: {
        apertura: horario.apertura,
        cierre: horario.cierre,
        dias: describirDias(horario),
        dias_semana: horario.dias,
      },
    });
  } catch (error) {
    console.error('[Agenda] Error en contexto:', error);
    res.status(500).json({ error: 'No pudimos cargar la agenda. Prueba de nuevo en un momento.' });
  }
});

// ── GET /api/agenda/disponibilidad?fecha=YYYY-MM-DD ──────────────────────────
// Devuelve solo las horas libres. Nunca quién ocupa las otras.
router.get('/:codigo/disponibilidad', requiereCodigoAgenda, async (req, res) => {
  const { fecha } = req.query;

  if (!esFechaValida(fecha)) {
    return res.status(400).json({ error: 'Fecha inválida. Usa el formato YYYY-MM-DD.' });
  }

  try {
    const supabase = obtenerSupabase();

    const [{ data: config }, { data: visitas, error }] = await Promise.all([
      supabase.from('configuracion_agencia')
        .select('hora_apertura, hora_cierre, minutos_por_slot, dias_atencion')
        .limit(1).single(),
      supabase.from('visitas')
        .select('fecha_visita')
        .gte('fecha_visita', `${fecha}T00:00:00`)
        .lte('fecha_visita', `${fecha}T23:59:59`)
        .neq('estado', 'cancelada'),
    ]);

    if (error) throw error;

    const horario = resolverHorario(config);

    // Dia sin atencion: sin turnos. El calendario ya lo deshabilita, pero esta
    // ruta es publica y hay que validarlo tambien aca.
    const libres = libresDelDia(fecha, visitas, horario, MARGEN_MINUTOS);

    res.json({ ok: true, fecha, libres });
  } catch (error) {
    console.error('[Agenda] Error en disponibilidad:', error);
    res.status(500).json({ error: 'No pudimos cargar los horarios.' });
  }
});

// ── POST /api/agenda/reservar ────────────────────────────────────────────────
router.post('/:codigo/reservar', requiereCodigoAgenda, async (req, res) => {
  const telefono = req.telefonoCliente;
  const { nombre, fecha, hora, proyecto, notas, telefono_contacto, personas, punto_recojo } = req.body || {};

  // Dos caracteres y "con el que quieres que te llamemos", no el nombre de DNI.
  // Es el último campo del embudo (11 enlaces, 1 reserva) y el nombre legal lo
  // toma Pamela en la visita, no el formulario.
  if (!nombre || String(nombre).trim().length < 2) {
    return res.status(400).json({ error: 'Dinos tu nombre para anotarte.' });
  }
  if (!esFechaValida(fecha) || !/^\d{2}:\d{2}$/.test(hora || '')) {
    return res.status(400).json({ error: 'Elige una fecha y un horario.' });
  }
  if (!proyecto) {
    return res.status(400).json({ error: 'Elige el proyecto que quieres visitar.' });
  }

  // Si la identidad de WhatsApp no trae número, hay que pedirlo: 1 de cada 13
  // contactos llega como PE.<id> y Pamela se quedaría con una visita confirmada
  // sin a quién llamar para confirmar o avisar un cambio.
  let contacto = null;
  if (!esTelefonoAlcanzable(telefono)) {
    contacto = String(telefono_contacto == null ? '' : telefono_contacto).replace(/[\s()-]/g, '');
    if (!esTelefonoAlcanzable(contacto)) {
      return res.status(400).json({
        error: 'Déjanos un número de celular para confirmarte la visita.',
        campo: 'telefono_contacto',
      });
    }
  }

  if (await demasiadasReservas(telefono)) {
    return res.status(429).json({ error: 'Ya registraste varias visitas. Escríbenos por WhatsApp para coordinar otra.' });
  }

  const fechaVisita = `${fecha}T${hora}:00`;

  try {
    const supabase = obtenerSupabase();

    // El proyecto tiene que existir de verdad.
    //
    // Ojo con cómo se valida: `proyecto` viene del body de una ruta pública.
    // Con `.ilike('nombre', proyecto)` los comodines de LIKE llegaban intactos,
    // así que un {"proyecto": "%"} matcheaba el catálogo entero y la reserva
    // caía sobre el primero de la lista. El match se hace en Node.
    // El horario tambien se valida aca: el body de esta ruta lo arma el
    // navegador, y nada impide postear una hora que el calendario no ofrecio.
    const { data: configHorario } = await supabase
      .from('configuracion_agencia')
      .select('hora_apertura, hora_cierre, minutos_por_slot, dias_atencion')
      .limit(1).single();

    const horario = resolverHorario(configHorario);

    // Mismo contrato que usa el agente al agendar por chat (utils/fechas.js):
    // día de atención, turno de la grilla y nada en el pasado de Ica. Margen 0
    // a propósito, para no rechazar el turno que el comprador acaba de elegir.
    const ranura = validarRanura(fecha, hora, horario, { margenMinutos: 0 });
    if (!ranura.ok) {
      return res.status(400).json({ error: ranura.mensaje, motivo: ranura.motivo });
    }

    const { data: activos, error: errorProyectos } = await supabase
      .from('proyectos').select('nombre, mapa_url').eq('activo', true).order('orden', { ascending: true });

    if (errorProyectos) throw errorProyectos;

    const { coincidencias, ambiguo } = buscarPorNombre(activos, proyecto);

    // Ambiguo no es culpa del cliente: el nombre se lo ofreció nuestro propio
    // desplegable. Pasa si el catálogo tiene dos proyectos activos que
    // normalizan igual ("Los Álamos" y "Los Alamos", cargados por tipeo).
    // Sin este log, desde el panel solo se ve que dejaron de entrar visitas.
    if (ambiguo) {
      console.error(`[Agenda] Nombre ambiguo "${proyecto}": ${coincidencias.map(p => p.nombre).join(', ')}. Renombra o desactiva uno.`);
      return res.status(500).json({ error: 'No pudimos confirmar la visita. Escríbenos por WhatsApp y lo resolvemos.' });
    }

    if (coincidencias.length === 0) {
      console.warn(`[Agenda] Proyecto inexistente o desactivado: "${proyecto}"`);
      return res.status(400).json({ error: 'Ese proyecto no está disponible.' });
    }

    const elegido = coincidencias[0];

    // Que el horario siga libre: entre que cargó la página y confirmó pudo ocuparse.
    //
    // El error se propaga a propósito: si esta consulta falla y lo ignoramos,
    // `ocupado` queda null, el chequeo pasa de largo y se agenda una visita
    // encima de otra. Mejor devolver error que duplicar el horario del asesor.
    const { data: ocupado, error: errorOcupado } = await supabase
      .from('visitas').select('id').eq('fecha_visita', fechaVisita).neq('estado', 'cancelada').limit(1);

    if (errorOcupado) throw errorOcupado;

    if (ocupado && ocupado.length > 0) {
      return res.status(409).json({ error: 'Ese horario se acaba de ocupar. Elige otro, por favor.' });
    }

    const fila = {
      numero_telefono: telefono,
      nombre_cliente: String(nombre).trim(),
      fecha_visita: fechaVisita,
      proyecto_interes: elegido.nombre,
      estado: 'confirmada',
      notas: componerNotas({ personas, punto_recojo, notas }),
    };

    let visita;
    {
      // telefono_contacto vive en una migración aparte. Si todavía no corrió,
      // PostgREST rechaza el insert entero por columna desconocida: antes de
      // perder la reserva, se guarda sin ella y el número queda en las notas,
      // que es donde Pamela igual lo va a leer.
      const conContacto = contacto ? { ...fila, telefono_contacto: contacto } : fila;
      let { data, error } = await supabase.from('visitas').insert(conContacto).select().single();

      if (error && contacto && /telefono_contacto/.test(String(error.message || ''))) {
        console.warn('[Agenda] Falta la columna visitas.telefono_contacto; el número va en notas.');
        const notasConTelefono = [fila.notas, `Celular de contacto: ${contacto}`].filter(Boolean).join(' · ');
        ({ data, error } = await supabase
          .from('visitas').insert({ ...fila, notas: notasConTelefono }).select().single());
      }

      if (error) throw error;
      visita = data;
    }

    console.log(`[Agenda] Visita ${visita.id} reservada desde el link por ${telefono}`);

    // El enlace que produjo una reserva deja de ser una incógnita: sin esto, el
    // embudo enlace → abierto → reservado es invisible (16 enlaces, 3 visitas,
    // 13 sin ningún rastro). No se espera y no puede tumbar la confirmación.
    Promise.resolve(
      supabase.from('enlaces_agenda').update({ reservado_en: new Date().toISOString() }).eq('codigo', req.enlace.codigo)
    ).then(({ error }) => (error ? console.warn('[Agenda] No se pudo marcar reservado_en:', error.message) : null))
     .catch(() => {});

    // Acá sí esperamos: la respuesta se devuelve enseguida y en serverless
    // una promesa suelta puede quedar cortada antes de completarse.
    const { data: config } = await supabase
      .from('configuracion_agencia').select('email_alertas, nombre_agencia').limit(1).single();
    await enviarAlertaVisita({ ...visita, origen: 'link' }, config);

    // Solo http/https: este enlace va directo a un href en la confirmación
    const mapa = elegido.mapa_url;
    const mapaSeguro = typeof mapa === 'string' && /^https?:\/\/\S+$/i.test(mapa.trim()) ? mapa.trim() : null;

    res.json({
      ok: true,
      mensaje: `¡Listo! Tu visita a ${elegido.nombre} quedó confirmada para el ${formatearFechaCompleta(fechaVisita)}.`,
      visita: {
        id: visita.id,
        proyecto: elegido.nombre,
        fecha: formatearFechaCompleta(fechaVisita),
        mapa_url: mapaSeguro,
      },
    });
  } catch (error) {
    console.error('[Agenda] Error al reservar:', error);
    res.status(500).json({ error: 'No pudimos confirmar la visita. Escríbenos por WhatsApp y lo resolvemos.' });
  }
});

module.exports = {
  router,
  componerNotas,
  crearEnlaceAgenda,
  crearEnlaceAgendaDetallado,
  esTelefonoAlcanzable,
  obtenerWhatsAppEmpresa,
  libresDelDia,
  DIAS_VALIDEZ_ENLACE,
  MARGEN_MINUTOS,
};
