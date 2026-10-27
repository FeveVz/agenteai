const express = require('express');
const { toFile } = require('openai');
const { obtenerSupabase } = require('../db');
const { procesarMensajeConIA, obtenerClienteOpenAI } = require('../services/openai');
const {
  generarRespuestaTwiML,
  TWIML_VACIO,
  enviarMensajeWhatsApp,
  generarRespuestaError,
  textoRespuestaError,
  validarFirmaTwilio,
  descargarMedioTwilio,
} = require('../services/twilio');

const router = express.Router();

// ── Presupuesto de tiempo del turno ───────────────────────────────────────────
//
// Twilio corta a los 9-10 s y descarta el TwiML que llegue después. El reloj
// arranca ahora apenas se resuelve el número, ANTES de las lecturas a Supabase
// y de la descarga del medio: antes arrancaba después de dos lecturas
// secuenciales, así que el margen que protegía era menor al que decía proteger
// y agregarle una transcripción lo pasaba sin aviso.
const TIMEOUT_MS = 9000;

// Espera para juntar la ráfaga. Medido en producción: el contacto ...3441 mandó
// "Y financiado cuanto me sñae" (id 566, 12:10:11.654) y "Sale" (id 567,
// 12:10:12.699) con 1.045 s de diferencia, y recibió dos respuestas con las
// mismas cifras a 0.34 s una de otra (ids 568 y 569). 1200 ms cubre ese caso
// real con margen y, contra los 2.8 s de latencia media del turno, deja la
// respuesta en unos 4 s: bien dentro de los 9 s de Twilio.
const ESPERA_RAFAGA_MS = 1200;

// Umbral del mensaje puente. Una nota de voz de WhatsApp en ogg/opus pesa
// alrededor de 1 MB por minuto: por encima de eso la descarga más la
// transcripción no entran en los 9 s, así que conviene contestar el puente de
// una y mandar la respuesta real por REST. Por debajo NO se pone puente: el
// comprador ...1867 ya se quejó de recibir dos burbujas donde alcanzaba una, y
// para un audio de 8 segundos el camino normal llega en tiempo.
const UMBRAL_AUDIO_PUENTE_BYTES = 1024 * 1024;

const TEXTO_PUENTE = 'Ya te escucho el audio, dame un segundito 🎧';

// Modelo de transcripción. Verificado contra /v1/models de esta cuenta el
// 2026-10-26: están disponibles gpt-4o-transcribe, gpt-4o-mini-transcribe y
// whisper-1. Se usa gpt-4o-transcribe porque el error que importa no es el
// costo sino el nombre propio: si transcribe "Parcona" como "Barcona" o
// "Chacarilla" como "Chacarina", el agente después no encuentra el proyecto en
// el catálogo y la nota de voz se vuelve inútil igual que si no la hubiéramos
// escuchado. gpt-4o-mini-transcribe cuesta la mitad y queda como alternativa
// si el volumen crece.
const MODELO_TRANSCRIPCION = 'gpt-4o-transcribe';
const MODELO_TRANSCRIPCION_RESPALDO = 'whisper-1';

// COSTO APROXIMADO POR MENSAJE NO-TEXTO (precios de lista de OpenAI a octubre
// de 2026, conviene confirmarlos antes de cerrar presupuesto):
//   - nota de voz de 25 s con gpt-4o-transcribe (US$0.006/min): US$0.0025
//   - foto leída por gpt-4o en detail 'high' (~1105 tokens a US$2.50/M): US$0.0028
//   - descargar el medio de Twilio: gratis
// Techo realista por mensaje no-texto: menos de US$0.005 (≈ S/0.02). Con 96
// contactos nuevos al mes, aunque la mitad mandara audio o foto, no pasa de
// US$0.25 mensuales. Un solo lote de Torres de Parcona son S/65,000.

// Tipos que se guardan en mensajes_whatsapp. Hasta hoy las 925 filas de la
// base eran 'texto' (882) y 'texto_e_imagen' (43) y ni una sola de un medio
// entrante, porque el handler cortaba con 400 antes del insert: el 1:1 de
// "302 mensajes de compradores → 302 respuestas" era un artefacto de que lo
// perdido nunca se contaba. Con estos tipos por fin se puede medir cuántas
// notas de voz, fotos y ubicaciones llegan.
const TIPOS = {
  texto: 'texto',
  audio: 'audio_entrante',
  imagen: 'imagen_entrante',
  sticker: 'sticker_entrante',
  ubicacion: 'ubicacion_entrante',
  otro: 'otro_medio_entrante',
};

// En Vercel, el trabajo que queda después de cerrar la respuesta puede
// congelarse: cuando OpenAI tarda más de 9 s, la fila del asistente ya está
// escrita pero el envío por REST puede no llegar nunca, así que el panel
// muestra una conversación contestada y el comprador no recibió nada — la base
// miente. waitUntil mantiene viva la invocación. El require es opcional porque
// @vercel/functions todavía no está en package.json (que no es de esta zona):
// sin el paquete esto es un passthrough y el comportamiento es el de hoy.
let mantenerVivo = (promesa) => promesa;
try {
  const { waitUntil } = require('@vercel/functions');
  if (typeof waitUntil === 'function') {
    mantenerVivo = (promesa) => { waitUntil(promesa); return promesa; };
  }
} catch {
  console.warn('[Webhook] @vercel/functions no está instalado: el trabajo posterior a la respuesta corre sin waitUntil.');
}

// ── Rate limit ────────────────────────────────────────────────────────────────
//
// Freno best-effort POR INSTANCIA, no una garantía: en Vercel cada instancia
// arranca con su Map vacío, así que el tope real es 30 por minuto por número y
// por instancia activa. Con 131 contactos no hay problema de abuso hoy; se
// deja escrito para que nadie lo confunda con una defensa dura. La purga en
// cada llamada existe porque el Map crecía sin límite mientras la instancia
// siguiera caliente.
const limiterPorNumero = new Map();
const VENTANA_LIMITE_MS = 60 * 1000;
const LIMITE_POR_VENTANA = 30;

function verificarRateLimit(numero, ahora = Date.now()) {
  for (const [clave, datos] of limiterPorNumero) {
    if (ahora - datos.inicio > VENTANA_LIMITE_MS) limiterPorNumero.delete(clave);
  }

  const datos = limiterPorNumero.get(numero);
  if (!datos || ahora - datos.inicio > VENTANA_LIMITE_MS) {
    limiterPorNumero.set(numero, { conteo: 1, inicio: ahora });
    return true;
  }
  if (datos.conteo >= LIMITE_POR_VENTANA) return false;
  datos.conteo++;
  return true;
}

// ── Clasificación del mensaje entrante ────────────────────────────────────────

/**
 * Clasifica lo que mandó el comprador antes de decidir nada.
 *
 * Antes el handler exigía `Body` y cortaba con 400: una nota de voz, una foto
 * sola, una ubicación o un sticker recibían silencio absoluto y no dejaban ni
 * rastro en la base, porque el insert estaba después del corte. En Ica la nota
 * de voz es la forma normal de preguntar de quien maneja, de quien está en
 * obra y de la gente mayor, justo los compradores con plata: esto explica una
 * parte de los 41 de 96 contactos que escribieron una vez y nunca volvieron.
 *
 * Un sticker se clasifica aparte de una foto: image/webp llega igual que una
 * imagen, pero un sticker es una reacción y no una pregunta, y mandarlo a
 * gpt-4o como imagen produce otro discurso de venta (el contacto ...0326 dio
 * cuatro "Ok" y recibió cuatro despedidas distintas).
 */
function clasificarEntrante(body = {}) {
  const cuerpo = body || {};
  const caption = String(cuerpo.Body || '').trim();

  const latitud = aCoordenada(cuerpo.Latitude, 90);
  const longitud = aCoordenada(cuerpo.Longitude, 180);
  if (latitud !== null && longitud !== null) {
    return { clase: 'ubicacion', tipoMensaje: TIPOS.ubicacion, caption, latitud, longitud, medios: [] };
  }

  const cantidad = Number(cuerpo.NumMedia || 0) || 0;
  const medios = [];
  for (let i = 0; i < cantidad; i++) {
    const url = cuerpo[`MediaUrl${i}`];
    if (!url) continue;
    medios.push({ url, mime: String(cuerpo[`MediaContentType${i}`] || '').toLowerCase() });
  }

  if (!medios.length) {
    return { clase: 'texto', tipoMensaje: TIPOS.texto, caption, medios: [] };
  }

  const mime = medios[0].mime;
  let clase = 'otro';
  if (mime.startsWith('audio/')) clase = 'audio';
  else if (mime === 'image/webp') clase = 'sticker';
  else if (mime.startsWith('image/')) clase = 'imagen';

  return { clase, tipoMensaje: TIPOS[clase], caption, medios };
}

/**
 * Texto que se guarda en la base y que ve el agente, antes de bajar el medio.
 *
 * Se inserta con esto y después se corrige con la transcripción o las
 * distancias: así la fila existe SIEMPRE, incluso si la descarga o la
 * transcripción fallan o si la función se muere en el medio. Si el mensaje
 * del comprador no queda en la base, nadie se entera nunca de que lo perdimos.
 */
function textoProvisional(entrante) {
  const conCaption = (marca) => (entrante.caption ? `${marca} El comprador escribió: "${entrante.caption}"` : marca);

  switch (entrante.clase) {
    case 'audio':
      return conCaption('[nota de voz] (todavía sin transcribir)');
    case 'imagen':
      return conCaption('[foto del comprador]');
    case 'sticker':
      return conCaption('[sticker] El comprador reaccionó con un sticker.');
    case 'ubicacion':
      return `[ubicación compartida] geo:${entrante.latitud},${entrante.longitud}`;
    case 'otro':
      return conCaption(`[archivo adjunto: ${entrante.medios[0]?.mime || 'tipo desconocido'}]`);
    default:
      return entrante.caption;
  }
}

/**
 * Historial sin el mensaje que acabamos de insertar, quitado por id.
 *
 * Antes era `.slice(0, -1)` sobre un historial ordenado por `recibido_en`, y en
 * ráfaga eso le mostraba al modelo el mensaje del comprador DOS veces: el
 * turno de "Y financiado cuanto me sñae" (id 566) leía el historial cuando
 * "Sale" (id 567) ya estaba insertado, el slice le quitaba el 567 y dejaba el
 * 566 dentro del historial — y openai.js vuelve a empujar el 566 como mensaje
 * del usuario. El id es identidad; la posición no.
 *
 * El respaldo por contenido cubre el caso en que el insert no devolvió id: ahí
 * se descarta la última fila solo si de verdad es la nuestra.
 */
function historialSinActual(filas, { id, contenido } = {}) {
  const ordenado = (filas || []).slice().reverse();

  if (id !== null && id !== undefined) {
    return ordenado.filter((f) => String(f.id) !== String(id));
  }

  const ultimo = ordenado[ordenado.length - 1];
  if (ultimo && ultimo.remitente === 'usuario' && String(ultimo.contenido_mensaje) === String(contenido)) {
    return ordenado.slice(0, -1);
  }
  return ordenado;
}

// ── Ubicación compartida ──────────────────────────────────────────────────────

/**
 * Convierte un valor a coordenada o devuelve null.
 *
 * No alcanza con Number.isFinite: `Number(null)` y `Number('')` son 0, que es
 * una coordenada perfectamente válida en el Golfo de Guinea. Con eso, un
 * proyecto sin coordenadas cargadas (latitud NULL en la base) salía a 8469 km
 * del comprador y el agente iba a dictar esa cifra como si fuera un dato. El
 * dato que falta tiene que quedar como hueco, no convertirse en un número.
 */
function aCoordenada(valor, tope) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const numero = Number(texto);
  if (!Number.isFinite(numero) || Math.abs(numero) > tope) return null;
  return numero;
}

function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Distancias ya resueltas en código, pegadas al texto del turno.
 *
 * "¿Qué tan lejos queda de acá?" es la pregunta de compra más común en Ica,
 * donde todo se mide en minutos a la Plaza de San Juan Bautista. El número
 * calculado en código y pegado al payload es el patrón que ya funcionó tres
 * veces en este proyecto; pedirle al modelo que estime kilómetros es invento.
 *
 * Mientras el catálogo no tenga coordenadas cargadas (la migración
 * 2026-10-medios-entrantes.sql agrega las columnas, Pamela las pega una vez
 * por proyecto), el hueco queda escrito en el texto en vez de rellenarse.
 */
function textoUbicacion(entrante, proyectos) {
  const geo = `geo:${entrante.latitud},${entrante.longitud}`;
  const conCoordenadas = (proyectos || [])
    .map((p) => ({
      nombre: p.nombre,
      lat: aCoordenada(p.latitud, 90),
      lon: aCoordenada(p.longitud, 180),
    }))
    .filter((p) => p.nombre && p.lat !== null && p.lon !== null);

  if (!conCoordenadas.length) {
    return `[ubicación compartida] ${geo}. Las distancias a los proyectos NO están calculadas: ningún proyecto del catálogo tiene coordenadas cargadas.`;
  }

  const cercanos = conCoordenadas
    .map((p) => ({ nombre: p.nombre, km: distanciaKm(entrante.latitud, entrante.longitud, p.lat, p.lon) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3)
    .map((p) => `${p.nombre} a ${p.km.toFixed(1)} km`)
    .join(', ');

  const extra = entrante.caption ? ` El comprador escribió: "${entrante.caption}"` : '';
  return `[ubicación compartida] ${geo}. Distancia en línea recta desde donde está: ${cercanos}.${extra}`;
}

// ── Transcripción ─────────────────────────────────────────────────────────────

/**
 * Transcribe una nota de voz.
 *
 * El `prompt` no es decorativo y no es un dato inventado: sale de los nombres
 * reales del catálogo. Sin él la transcripción escribe "Barcona" por "Parcona"
 * y "Chacarina" por "Chacarilla", y el agente después no encuentra el proyecto.
 * El ogg/opus de WhatsApp entra tal cual, no hay que convertir nada.
 */
async function transcribirAudio(buffer, mime, nombresProyectos = []) {
  const openai = obtenerClienteOpenAI();
  const extension = (mime || '').includes('mpeg') ? 'mp3' : (mime || '').includes('mp4') ? 'mp4' : 'ogg';
  const archivo = await toFile(buffer, `nota.${extension}`, { type: mime || 'audio/ogg' });

  const nombres = nombresProyectos.filter(Boolean).join(', ');
  const pista = 'Conversación de WhatsApp sobre lotes y casas en Ica, Perú.'
    + (nombres ? ` Nombres propios que pueden aparecer: ${nombres}.` : '');

  for (const modelo of [MODELO_TRANSCRIPCION, MODELO_TRANSCRIPCION_RESPALDO]) {
    try {
      const t = await openai.audio.transcriptions.create({
        file: archivo,
        model: modelo,
        language: 'es',
        prompt: pista,
      });
      const texto = String(t?.text || '').trim();
      if (texto) return { ok: true, texto, modelo };
      return { ok: false, motivo: 'transcripcion_vacia' };
    } catch (err) {
      console.error(`[Webhook] Falló la transcripción con ${modelo}:`, err.message);
    }
  }
  return { ok: false, motivo: 'error_transcripcion' };
}

// ── Lecturas auxiliares ───────────────────────────────────────────────────────

/**
 * Nombres y coordenadas de los proyectos activos.
 *
 * Solo se lee cuando entró un audio o una ubicación, para no sumarle una
 * consulta al turno de texto, que ya pelea contra los 9 s. Si las columnas de
 * coordenadas todavía no existen (la migración la aplica el dueño), el select
 * falla y se reintenta pidiendo solo el nombre: la transcripción sigue
 * teniendo su pista y la ubicación deja el hueco visible.
 */
async function leerProyectosParaMedios(supabase) {
  const { data, error } = await supabase
    .from('proyectos')
    .select('nombre, latitud, longitud')
    .eq('activo', true);

  if (!error) return data || [];

  console.warn(`[Webhook] Sin columnas de coordenadas en proyectos (${error.message}); falta correr sql/migraciones/2026-10-medios-entrantes.sql`);
  const { data: soloNombres } = await supabase
    .from('proyectos')
    .select('nombre')
    .eq('activo', true);
  return soloNombres || [];
}

/**
 * Inserta en mensajes_whatsapp y devuelve el id.
 *
 * Los campos de la migración nueva (medio_url, medio_mime, imagenes_enviadas)
 * van aparte y, si la columna todavía no existe, se reintenta sin ellos. El
 * arreglo no puede depender de que la migración ya esté aplicada: si el insert
 * revienta, el mensaje del comprador desaparece de la base, que es exactamente
 * el agujero que estamos tapando.
 */
const columnasAusentes = new Set();

async function insertarMensaje(supabase, base, opcionales = {}) {
  const extras = {};
  for (const [clave, valor] of Object.entries(opcionales)) {
    if (valor !== undefined && valor !== null) extras[clave] = valor;
  }

  const claveJuego = Object.keys(extras).sort().join(',');

  // Si ya sabemos que esas columnas no existen en esta base, no gastamos un
  // viaje de ida y vuelta por mensaje mientras la instancia siga caliente.
  if (claveJuego && columnasAusentes.has(claveJuego)) {
    for (const clave of Object.keys(extras)) delete extras[clave];
  }

  if (Object.keys(extras).length) {
    const { data, error } = await supabase
      .from('mensajes_whatsapp')
      .insert({ ...base, ...extras })
      .select('id')
      .single();
    if (!error) return data?.id ?? null;
    columnasAusentes.add(claveJuego);
    console.warn(`[Webhook] El insert con las columnas nuevas (${claveJuego}) falló: ${error.message}. Reintento sin ellas; falta correr sql/migraciones/2026-10-medios-entrantes.sql`);
  }

  const { data, error } = await supabase
    .from('mensajes_whatsapp')
    .insert(base)
    .select('id')
    .single();

  if (error) {
    console.error('[Webhook] No se pudo guardar el mensaje:', error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Espera corta y comprueba si llegó otro mensaje del mismo número después del
 * nuestro. Si llegó, este turno se calla y contesta el último, que ya tiene los
 * dos mensajes en el historial.
 *
 * Se resuelve con la base porque en serverless no hay estado compartido entre
 * instancias: cada POST abre su propio turno y un lock en memoria no sirve. El
 * orden por id es total, así que de una ráfaga exactamente un turno sigue
 * adelante — el del id más alto.
 *
 * CONDICIÓN DE CARRERA QUE ELEGIMOS TOLERAR: si el segundo mensaje entra
 * DESPUÉS de que venció esta ventana de 1200 ms, los dos turnos contestan,
 * igual que hoy. Cubre la ráfaga medida (1.045 s entre los ids 566 y 567) y no
 * la pausa de dos segundos, que ya es una segunda pregunta y no una ráfaga.
 * La otra cara: si el turno que gana se cae, el comprador no recibe nada en vez
 * de recibir una respuesta a medias. Se prefiere así porque dos respuestas con
 * las mismas cifras en el mensaje del precio es lo que se lee como bot roto.
 */
async function llegoOtroMensajeDespues(supabase, numeroTelefono, idMensaje) {
  if (idMensaje === null || idMensaje === undefined) return false;

  await new Promise((r) => setTimeout(r, ESPERA_RAFAGA_MS));

  const { data, error } = await supabase
    .from('mensajes_whatsapp')
    .select('id')
    .eq('numero_telefono', numeroTelefono)
    .eq('remitente', 'usuario')
    .gt('id', idMensaje)
    .limit(1);

  if (error) {
    console.error('[Webhook] No se pudo comprobar la ráfaga:', error.message);
    return false;
  }
  return Boolean(data && data.length);
}

// POST /api/webhook/whatsapp
router.post('/whatsapp', async (req, res) => {
  console.log(`\n[Webhook] Nuevo mensaje — ${new Date().toISOString()}`);

  // El estado de la respuesta vive afuera del try para que el catch final
  // pueda consultarlo: antes el catch contestaba un 500 con TwiML a ciegas y
  // si el timer de 9 s ya había respondido reventaba con ERR_HTTP_HEADERS_SENT,
  // tapando el error real en los logs.
  let twilioRespondido = false;
  let timer = null;
  let numeroTelefono = null;
  let telefonoEmpresa = null;

  const responderATwilio = (twiml) => {
    if (twilioRespondido || res.headersSent) return false;
    twilioRespondido = true;
    res.set('Content-Type', 'text/xml');
    // SIEMPRE 200 cuando el cuerpo es TwiML que el comprador tiene que leer:
    // Twilio descarta el TwiML de cualquier respuesta que no sea 2xx, así que
    // los mensajes de error que este código creía mandar ("Mensaje inválido",
    // "estoy teniendo problemas técnicos") terminaban en la basura y el
    // comprador quedaba convencido de que lo dejaron en visto. El detalle del
    // fallo va al log, que es donde sirve.
    res.status(200).send(twiml);
    return true;
  };

  try {
    // Solo Twilio puede invocar este endpoint. Esto es lo que permite dejarlo
    // público sin depender de la protección de Vercel.
    const firma = validarFirmaTwilio(req);

    if (!firma.valida) {
      if (firma.motivo === 'sin_token') {
        console.error('[Webhook] ⚠️  Falta TWILIO_AUTH_TOKEN: el webhook queda cerrado y el agente no responde. Configúrala en las variables de entorno.');
      } else {
        console.warn(`[Webhook] Firma rechazada (${firma.motivo}). URL evaluada: ${firma.url}`);
      }
      // Acá sí se devuelve 4xx: no hay comprador del otro lado esperando leer
      // nada, y el código de estado es la señal de salud para Twilio.
      return res.status(403).json({ error: 'Firma de Twilio inválida.' });
    }

    const telefonoRaw = req.body?.From;

    if (!telefonoRaw) {
      // Sin From no hay a quién contestarle ni a quién guardarle la fila.
      console.warn('[Webhook] Mensaje sin From: no hay número al que responder.');
      responderATwilio(TWIML_VACIO);
      return;
    }

    numeroTelefono = String(telefonoRaw).replace(/^whatsapp:/i, '');

    if (!verificarRateLimit(numeroTelefono)) {
      // Silencio deliberado, no un descuido: devolver 200 con el texto "estás
      // enviando demasiados mensajes" es PEOR que no contestar. El tope son 30
      // mensajes en 60 s, así que con texto cada mensaje de más genera un
      // mensaje de salida: el freno se convierte en un amplificador que le
      // cobra a Pamela y le llena el chat al comprador con el mismo aviso
      // treinta veces. El 200 con TwiML vacío frena sin que Twilio reintente.
      console.warn(`[Webhook] Rate limit alcanzado por ${numeroTelefono}: se responde en silencio.`);
      responderATwilio(TWIML_VACIO);
      return;
    }

    // El reloj arranca acá: tiene que cubrir TODO el trabajo del turno
    // (descarga del medio, transcripción, lecturas y OpenAI), no solo la parte
    // de OpenAI como antes.
    timer = setTimeout(() => {
      console.warn('[Webhook] Timeout 9s — liberando Twilio, continuando en background');
      responderATwilio(TWIML_VACIO);
    }, TIMEOUT_MS);

    const entrante = clasificarEntrante(req.body);
    const textoInicial = textoProvisional(entrante);

    console.log(`[Webhook] De: ${numeroTelefono} | ${entrante.tipoMensaje} | "${textoInicial.substring(0, 80)}"`);

    const supabase = obtenerSupabase();

    // La fila se guarda ANTES de cualquier camino de salida y antes de la
    // descarga del medio. Es lo que permite medir: hasta hoy, un mensaje que
    // moría en el 400 no quedaba en ninguna parte y Pamela no podía saber si
    // perdió 2 leads o 40.
    const primerMedio = entrante.medios[0] || null;
    const idMensaje = await insertarMensaje(supabase, {
      numero_telefono: numeroTelefono,
      contenido_mensaje: textoInicial,
      remitente: 'usuario',
      tipo_mensaje: entrante.tipoMensaje,
    }, {
      medio_url: entrante.clase === 'ubicacion'
        ? `geo:${entrante.latitud},${entrante.longitud}`
        : primerMedio?.url,
      medio_mime: primerMedio?.mime,
    });

    const necesitaCatalogo = entrante.clase === 'audio' || entrante.clase === 'ubicacion';

    // Todo lo que no depende de otra cosa, en paralelo: encadenarlo le sumaba
    // latencia a un turno que ya pelea contra los 9 s. La espera de la ráfaga
    // corre junto con la transcripción, así que para un audio corto no cuesta
    // tiempo extra.
    const tareaCatalogo = necesitaCatalogo
      ? leerProyectosParaMedios(supabase).catch((err) => {
        console.error('[Webhook] No se pudo leer el catálogo para el medio:', err.message);
        return [];
      })
      : Promise.resolve([]);

    const tareaConfig = supabase
      .from('configuracion_agencia')
      .select('*')
      .limit(1)
      .single();

    const tareaRafaga = llegoOtroMensajeDespues(supabase, numeroTelefono, idMensaje)
      .catch((err) => {
        console.error('[Webhook] Falló la comprobación de ráfaga:', err.message);
        return false;
      });

    const tareaMedio = prepararMedio(entrante, {
      alDetectarAudioLargo: async () => {
        // Puente condicional, decidido por el tamaño del archivo y no por una
        // regla del prompt. Se guarda como fila para que el historial lo vea y
        // nadie lo repita en el mismo turno.
        await insertarMensaje(supabase, {
          numero_telefono: numeroTelefono,
          contenido_mensaje: TEXTO_PUENTE,
          remitente: 'asistente',
          tipo_mensaje: 'puente',
          procesado: 1,
        });
        console.log('[Webhook] Nota de voz larga: se manda el puente y la respuesta real sale por REST.');
        responderATwilio(generarRespuestaTwiML(TEXTO_PUENTE));
      },
      proyectos: () => tareaCatalogo,
    }).catch((err) => {
      // Un medio ilegible no puede costar el turno entero: el agente contesta
      // igual, con el hueco escrito en el texto.
      console.error('[Webhook] Falló la preparación del medio:', err.message);
      return { paraElModelo: [], transcripcion: null, fallo: 'error_preparando' };
    });

    const [medio, catalogo, configResultado] = await Promise.all([tareaMedio, tareaCatalogo, tareaConfig]);
    const configEmpresa = configResultado?.data || {};
    telefonoEmpresa = configEmpresa?.telefono || null;

    // Texto definitivo del turno: la transcripción, la caption de la foto o las
    // distancias ya calculadas. Es el patrón del proyecto: el dato resuelto en
    // código pegado al payload, no una regla pidiéndole al modelo que lo deduzca.
    const textoFinal = textoDelTurno(entrante, medio, catalogo);

    if (idMensaje !== null && textoFinal !== textoInicial) {
      const { error } = await supabase
        .from('mensajes_whatsapp')
        .update({ contenido_mensaje: textoFinal })
        .eq('id', idMensaje);
      if (error) console.error('[Webhook] No se pudo actualizar el mensaje con la transcripción:', error.message);
    }

    if (await tareaRafaga) {
      console.log(`[Webhook] Ráfaga: llegó otro mensaje de ${numeroTelefono} después del ${idMensaje}; contesta ese turno.`);
      clearTimeout(timer);
      responderATwilio(TWIML_VACIO);
      return;
    }

    const { data: historialRaw } = await supabase
      .from('mensajes_whatsapp')
      .select('id, contenido_mensaje, remitente')
      .eq('numero_telefono', numeroTelefono)
      .order('id', { ascending: false })
      .limit(21);

    const historial = historialSinActual(historialRaw, { id: idMensaje, contenido: textoInicial });

    let respuestaIA;
    try {
      // Quinto argumento `medios`: los medios ya descargados y listos para que
      // openai.js los mande a gpt-4o como image_url. Hoy procesarMensajeConIA
      // tiene cuatro parámetros y lo ignora sin romperse; cuando lo acepte, la
      // foto del comprador llega al modelo sin tocar este archivo.
      respuestaIA = await procesarMensajeConIA(
        numeroTelefono,
        textoFinal,
        configEmpresa,
        historial,
        medio.paraElModelo
      );
    } catch (errorIA) {
      clearTimeout(timer);
      console.error('[Webhook] Error OpenAI:', errorIA.message);
      await insertarMensaje(supabase, {
        numero_telefono: numeroTelefono,
        contenido_mensaje: '[Error: falla de OpenAI]',
        remitente: 'asistente',
        tipo_mensaje: 'texto',
        procesado: 0,
      });

      if (twilioRespondido) {
        // El timer de 9 s ya liberó Twilio: el TwiML no llega a ninguna parte y
        // la disculpa solo puede salir por REST. Antes este camino terminaba en
        // silencio absoluto: el comprador escribía y no recibía ni el "estoy
        // teniendo problemas técnicos".
        await mantenerVivo(enviarMensajeWhatsApp(numeroTelefono, textoRespuestaError(telefonoEmpresa)));
      } else {
        responderATwilio(generarRespuestaError(telefonoEmpresa));
      }
      return;
    }

    clearTimeout(timer);

    // procesarMensajeConIA devuelve { texto, imagenes }
    const textoRespuesta = respuestaIA.texto;
    const imagenes = respuestaIA.imagenes || [];

    if (!twilioRespondido) {
      // Respuesta rápida: por TwiML. Acá no sabemos si Twilio aceptó cada
      // imagen (el TwiML se contesta y se cierra), así que se guarda la
      // cantidad pedida y queda dicho de dónde sale el número.
      console.log(`[Webhook] Respuesta rápida vía TwiML a ${numeroTelefono}${imagenes.length ? ` con ${imagenes.length} imagen(es)` : ''}`);
      await guardarRespuesta(supabase, numeroTelefono, textoRespuesta, imagenes.length, imagenes.length);
      responderATwilio(generarRespuestaTwiML(textoRespuesta, imagenes));
      return;
    }

    // Respuesta lenta: Twilio ya fue liberado (por el timer o por el puente),
    // así que el envío va por REST. waitUntil mantiene viva la invocación
    // mientras eso pasa; sin él Vercel puede congelarla y la respuesta nunca
    // sale aunque la fila quede escrita.
    console.log(`[Webhook] Respuesta tardía vía REST API a ${numeroTelefono}`);
    await mantenerVivo((async () => {
      const envio = await enviarMensajeWhatsApp(numeroTelefono, textoRespuesta, imagenes);
      await guardarRespuesta(supabase, numeroTelefono, textoRespuesta, imagenes.length, envio.imagenesEnviadas);
    })());

  } catch (error) {
    console.error('[Webhook] Error inesperado:', error);
    if (timer) clearTimeout(timer);
    if (!responderATwilio(generarRespuestaError(telefonoEmpresa)) && numeroTelefono) {
      // La respuesta ya estaba cerrada: la disculpa sale por REST o no sale.
      await mantenerVivo(enviarMensajeWhatsApp(numeroTelefono, textoRespuestaError(telefonoEmpresa)))
        .catch((err) => console.error('[Webhook] Tampoco se pudo avisar por REST:', err.message));
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
});

/**
 * Descarga el medio y lo deja listo: transcripción para el audio, buffer y
 * data URL para la imagen.
 *
 * Nunca lanza. Si la descarga o la transcripción fallan, el turno sigue y la
 * fila queda marcada como no transcrita: un fallo de transcripción tiene que
 * verse en la base el mismo día, no esconderse detrás de un turno sin rastro.
 */
async function prepararMedio(entrante, { alDetectarAudioLargo, proyectos }) {
  const vacio = { paraElModelo: [], transcripcion: null, fallo: null };
  const primero = entrante.medios[0];
  if (!primero) return vacio;

  const descarga = await descargarMedioTwilio(primero.url);
  if (!descarga.ok) {
    console.error(`[Webhook] No se pudo bajar el medio (${descarga.motivo}): ${primero.url}`);
    return { ...vacio, fallo: descarga.motivo };
  }

  const mime = descarga.mime || primero.mime;

  if (entrante.clase === 'audio') {
    if (descarga.bytes > UMBRAL_AUDIO_PUENTE_BYTES && typeof alDetectarAudioLargo === 'function') {
      await alDetectarAudioLargo();
    }
    const nombres = (await proyectos()).map((p) => p.nombre);
    const t = await transcribirAudio(descarga.buffer, mime, nombres);
    if (!t.ok) return { ...vacio, fallo: t.motivo };
    return { paraElModelo: [], transcripcion: t.texto, fallo: null };
  }

  if (entrante.clase === 'imagen') {
    // El base64 se le pasa al turno actual y NO entra al historial: el
    // historial se rearma desde mensajes_whatsapp, así que si la imagen
    // quedara guardada cada turno siguiente la reenviaría y el costo y la
    // latencia se multiplicarían.
    return {
      paraElModelo: [{
        clase: 'imagen',
        mime,
        bytes: descarga.bytes,
        buffer: descarga.buffer,
        dataUrl: `data:${mime};base64,${descarga.buffer.toString('base64')}`,
        detalle: 'high',
      }],
      transcripcion: null,
      fallo: null,
    };
  }

  // Sticker y cualquier otro adjunto: no se le manda al modelo. Un sticker es
  // una reacción, no una pregunta.
  return vacio;
}

/**
 * Texto del turno con el medio ya resuelto.
 *
 * Cuando algo falla, el hueco queda escrito tal cual en el texto: el agente
 * tiene que saber que llegó una nota de voz que no pudimos escuchar, no
 * contestar a ciegas como si hubiera sido un mensaje de texto cualquiera.
 */
function textoDelTurno(entrante, medio, catalogo) {
  const caption = entrante.caption;
  const conCaption = (base) => (caption ? `${base} El comprador escribió: "${caption}"` : base);

  if (entrante.clase === 'ubicacion') return textoUbicacion(entrante, catalogo);

  if (entrante.clase === 'audio') {
    if (medio.transcripcion) return conCaption(`[nota de voz] ${medio.transcripcion}`);
    return conCaption('[nota de voz que no se pudo transcribir] No tenemos el contenido del audio del comprador.');
  }

  if (entrante.clase === 'imagen') {
    if (medio.paraElModelo.length) return conCaption('[foto del comprador]');
    return conCaption('[foto del comprador que no se pudo abrir] No tenemos la imagen que mandó.');
  }

  return textoProvisional(entrante);
}

/**
 * Guarda la respuesta del agente.
 *
 * El texto se guarda LIMPIO. Antes se le pegaba "[+N imagen(es) enviada(s)]"
 * adentro del contenido, así que el modelo recibía como propia una línea de
 * telemetría que nunca escribió: de ahí salían los "Ya te envié..." que el
 * contacto ...1867 recibió dos veces. El conteo va en una columna aparte y,
 * cuando se pidieron fotos y no salió ni una, el tipo lo dice, así que el
 * panel puede distinguir una foto entregada de una que se cayó sin que la
 * cifra viva dentro del texto.
 */
async function guardarRespuesta(supabase, numeroTelefono, texto, pedidas, enviadas) {
  const tipo = pedidas === 0
    ? 'texto'
    : enviadas > 0 ? 'texto_e_imagen' : 'texto_imagen_fallida';

  await insertarMensaje(supabase, {
    numero_telefono: numeroTelefono,
    contenido_mensaje: texto,
    remitente: 'asistente',
    tipo_mensaje: tipo,
    procesado: 1,
  }, {
    imagenes_enviadas: pedidas > 0 ? enviadas : null,
  });
}

module.exports = router;
module.exports.clasificarEntrante = clasificarEntrante;
module.exports.historialSinActual = historialSinActual;
module.exports.textoProvisional = textoProvisional;
module.exports.textoDelTurno = textoDelTurno;
module.exports.textoUbicacion = textoUbicacion;
module.exports.distanciaKm = distanciaKm;
module.exports.verificarRateLimit = verificarRateLimit;
module.exports.TIPOS = TIPOS;
