/**
 * El embudo y los leads que se enfriaron.
 *
 * Dos huecos que la auditoría de noviembre dejó medidos:
 *
 *   1. Pamela no tenía en ninguna parte el único número que le importa. El
 *      panel le muestra mensajes, proyectos y visitas, pero nadie le dice
 *      "entraron 58, conversaron 32, aceptaron 6, agendaron 2". Operaba a
 *      ciegas sobre su propio embudo.
 *
 *   2. El 45% de los contactos escribe una vez y no vuelve — 26 personas en
 *      25 días — y nunca existió nada que volviera a tocarlos. Es el agujero
 *      más grande que queda, y el único que no se arregla con mejores
 *      respuestas: se arregla escribiendo de nuevo.
 *
 * Escribir solo pasadas 24 horas necesita una plantilla aprobada por Meta, que
 * no depende de nosotros. Esto resuelve la mitad que sí: le arma a Pamela la
 * lista, con el contexto de cada uno y el mensaje ya redactado, a un clic de
 * WhatsApp.
 */

const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

// Debajo de esto el lead todavía está caliente y escribirle es apurarlo.
const DIAS_PARA_ENFRIARSE = 3;

// Por encima de esto ya no es un lead, es una lista de correo.
const DIAS_PARA_DARLO_POR_PERDIDO = 45;

const MAXIMO_FRIOS = 60;

/** Todas las filas de una tabla, sin el tope de 1000 de PostgREST. */
async function traerTodo(supabase, tabla, columnas, orden) {
  let filas = [];
  let desde = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(tabla).select(columnas).order(orden).range(desde, desde + 999);

    if (error) throw error;
    if (!data || data.length === 0) break;

    filas = filas.concat(data);
    if (data.length < 1000) break;
    desde += 1000;
  }

  return filas;
}

/** Los días enteros que pasaron desde una fecha. */
function diasDesde(fechaISO) {
  return Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86400000);
}

/**
 * De qué proyecto habló esta persona.
 *
 * Se busca en lo que escribió ELLA, no en lo que contestó el agente: el agente
 * nombra proyectos al sugerir alternativas y eso ensuciaría el dato.
 */
function sinTildes(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * La palabra de cada proyecto que no comparte con ningún otro.
 *
 * "Parcona" NO sirve: lo llevan "Urbanización Torres de Parcona" y "Condominio
 * Viñedos de Parcona", y quedarse con la última palabra larga le atribuía a
 * Viñedos los compradores de Torres. Lo único que identifica es lo que no se
 * repite.
 */
function palabrasPropias(nombresDeProyectos) {
  const porNombre = nombresDeProyectos.map(n => ({
    nombre: n,
    palabras: sinTildes(n).split(/\s+/).filter(p => p.length > 4),
  }));

  const cuantos = {};
  for (const { palabras } of porNombre) {
    for (const p of new Set(palabras)) cuantos[p] = (cuantos[p] || 0) + 1;
  }

  return porNombre.map(({ nombre, palabras }) => ({
    nombre,
    // Las que solo tiene este proyecto; si todas se repiten, se usan todas y
    // el desempate queda en manos de cuántas coinciden.
    claves: palabras.filter(p => cuantos[p] === 1).length ? palabras.filter(p => cuantos[p] === 1) : palabras,
  }));
}

function proyectoDeInteres(mensajes, nombresDeProyectos) {
  const limpio = sinTildes(
    mensajes
      .filter(m => m.remitente === 'usuario')
      .map(m => m.contenido_mensaje || '')
      .join(' '),
  );

  let mejor = null;
  let mejorPuntaje = 0;

  for (const { nombre, claves } of palabrasPropias(nombresDeProyectos)) {
    const puntaje = claves.filter(c => limpio.includes(c)).length;
    if (puntaje > mejorPuntaje) { mejor = nombre; mejorPuntaje = puntaje; }
  }

  return mejor;
}

/**
 * Por dónde se quedó la conversación, en una línea.
 *
 * Es lo que Pamela necesita leer antes de escribirle a alguien que no se
 * acuerda de ella: qué preguntó y qué fue lo último que pasó.
 */
function dondeQuedo(mensajes) {
  const delCliente = mensajes
    .filter(m => m.remitente === 'usuario')
    .map(m => String(m.contenido_mensaje || '').trim())
    .filter(Boolean);

  // El último mensaje suele ser "Ok" o "Gracias", y eso no le dice nada a
  // Pamela. Lo que sirve para retomar es la última cosa que preguntó de verdad.
  const sustancial = [...delCliente].reverse()
    .find(t => t.includes('?') || t.split(/\s+/).length >= 4);

  return (sustancial || delCliente[delCliente.length - 1] || '').slice(0, 160);
}

/**
 * El mensaje con el que Pamela puede retomar, ya escrito.
 *
 * Se arma con lo que la persona dijo, no con una plantilla genérica: "hola,
 * ¿sigues interesado?" es lo que todo el mundo ignora.
 */
function mensajeSugerido(nombreAgente, proyecto, dias) {
  const quien = nombreAgente ? `soy ${nombreAgente} ` : '';
  const cuando = dias === 1 ? 'ayer' : `hace ${dias} días`;

  if (proyecto) {
    return `Hola, ${quien}de ${proyecto}. Conversamos ${cuando} y me quedé con la duda de si te `
         + 'resolví todo. ¿Sigues viendo la opción o ya te decidiste por otra cosa?';
  }

  return `Hola, ${quien}por acá. Conversamos ${cuando} sobre nuestros proyectos y quedé con la duda `
       + 'de si te resolví todo. ¿Hay algo que te haya frenado?';
}

/** ¿Se le puede escribir primero a este número? */
function esAlcanzable(numero) {
  return /^\+?\d{9,15}$/.test(String(numero || '').replace(/[\s()-]/g, ''));
}

// GET /api/embudo — el resumen y los leads fríos
router.get('/', async (req, res) => {
  try {
    const supabase = obtenerSupabase();

    const [mensajes, visitas, proyectos, configFila] = await Promise.all([
      traerTodo(supabase, 'mensajes_whatsapp', 'numero_telefono, remitente, contenido_mensaje, recibido_en', 'recibido_en'),
      traerTodo(supabase, 'visitas', 'numero_telefono, estado, fecha_visita, creado_en', 'creado_en'),
      supabase.from('proyectos').select('nombre').eq('activo', true).order('orden'),
      supabase.from('configuracion_agencia').select('nombre_agente').limit(1).single(),
    ]);

    const nombresDeProyectos = (proyectos.data || []).map(p => p.nombre);
    const nombreAgente = ((configFila.data && configFila.data.nombre_agente) || '').trim();

    const porNumero = new Map();
    for (const m of mensajes) {
      if (!porNumero.has(m.numero_telefono)) porNumero.set(m.numero_telefono, []);
      porNumero.get(m.numero_telefono).push(m);
    }

    const conVisita = new Set(
      visitas.filter(v => v.estado !== 'cancelada').map(v => v.numero_telefono),
    );

    const desde30 = new Date(Date.now() - 30 * 86400000).toISOString();

    const resumen = { contactos: 0, conversaron: 0, visitas: 0, frios: 0 };
    const frios = [];

    for (const [numero, lista] of porNumero) {
      const delCliente = lista.filter(m => m.remitente === 'usuario');
      if (delCliente.length === 0) continue;

      const ultimoMensaje = lista[lista.length - 1].recibido_en;
      const esDelMes = ultimoMensaje >= desde30;

      if (esDelMes) {
        resumen.contactos++;
        // Dos mensajes o más: hubo conversación, no solo el clic del anuncio.
        if (delCliente.length > 1) resumen.conversaron++;
        if (conVisita.has(numero)) resumen.visitas++;
      }

      if (conVisita.has(numero)) continue;

      const dias = diasDesde(ultimoMensaje);
      if (dias < DIAS_PARA_ENFRIARSE || dias > DIAS_PARA_DARLO_POR_PERDIDO) continue;

      resumen.frios++;

      const proyecto = proyectoDeInteres(lista, nombresDeProyectos);
      frios.push({
        numero_telefono: numero,
        alcanzable: esAlcanzable(numero),
        dias_en_silencio: dias,
        mensajes_suyos: delCliente.length,
        proyecto,
        donde_quedo: dondeQuedo(lista),
        sugerido: mensajeSugerido(nombreAgente, proyecto, dias),
      });
    }

    // Primero los que más conversaron y hace menos: son los más recuperables.
    frios.sort((a, b) => (b.mensajes_suyos - a.mensajes_suyos) || (a.dias_en_silencio - b.dias_en_silencio));

    res.json({
      ok: true,
      resumen,
      frios: frios.slice(0, MAXIMO_FRIOS),
      frios_totales: frios.length,
    });
  } catch (error) {
    console.error('[Embudo] Error:', error.message);
    res.status(500).json({ error: 'No se pudo armar el embudo.' });
  }
});

module.exports = router;
module.exports.proyectoDeInteres = proyectoDeInteres;
module.exports.mensajeSugerido = mensajeSugerido;
module.exports.esAlcanzable = esAlcanzable;
module.exports.DIAS_PARA_ENFRIARSE = DIAS_PARA_ENFRIARSE;
