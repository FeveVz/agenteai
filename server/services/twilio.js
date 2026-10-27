const twilio = require('twilio');

let twilioClient;

function obtenerClienteTwilio() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

/**
 * Reconstruye las URLs candidatas que Twilio pudo haber firmado.
 *
 * Twilio firma la URL exacta que invocó, así que si no coincide carácter por
 * carácter la firma no valida. Hay dos complicaciones:
 *
 * 1. Detrás del proxy de Vercel, req.protocol y req.host no sirven: hay que
 *    leer las cabeceras x-forwarded-*.
 * 2. El rewrite de vercel.json ("/api/:path*" → "/api/index.js") NO usa :path
 *    en el destino, así que Vercel lo agrega como query string. La request
 *    llega como "/api/webhook/whatsapp?path=webhook/whatsapp" aunque Twilio
 *    haya llamado a "/api/webhook/whatsapp" a secas.
 *
 * Por eso probamos la ruta sin query (producción en Vercel) y la URL tal cual
 * llegó (desarrollo local, donde no hay rewrite). Probar ambas no debilita la
 * validación: siguen siendo URLs derivadas de la request real, y falsificar el
 * HMAC de cualquiera de las dos requiere el auth token igual.
 */
function urlsCandidatas(req) {
  const protocolo = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  const base = `${protocolo}://${host}`;
  const completa = req.originalUrl || req.url || '';

  return [...new Set([
    `${base}${completa.split('?')[0]}`,
    `${base}${completa}`,
  ])];
}

/**
 * Valida la cabecera x-twilio-signature.
 *
 * Devuelve { valida, motivo }.
 *
 * Sin TWILIO_AUTH_TOKEN el webhook queda CERRADO, no abierto. Antes era al
 * revés, para que una variable faltante no dejara al agente mudo. Pero un
 * webhook abierto es una URL pública donde cualquiera puede hacerse pasar por
 * un cliente: inventar conversaciones, agendar visitas falsas en la agenda de
 * la asesora y gastar saldo de OpenAI, todo sin dejar ninguna señal.
 *
 * Es el mismo criterio que en el panel: un agente mudo se nota en el día; un
 * endpoint que acepta mensajes falsificados no se nota nunca.
 */
function validarFirmaTwilio(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    return { valida: false, motivo: 'sin_token' };
  }

  const candidatas = urlsCandidatas(req);

  const firma = req.get('x-twilio-signature');
  if (!firma) {
    return { valida: false, motivo: 'falta_cabecera', url: candidatas.join(' | ') };
  }

  try {
    for (const url of candidatas) {
      if (twilio.validateRequest(authToken, firma, url, req.body || {})) {
        return { valida: true, motivo: 'ok', url };
      }
    }
    return { valida: false, motivo: 'firma_no_coincide', url: candidatas.join(' | ') };
  } catch (err) {
    return { valida: false, motivo: `error_validando: ${err.message}`, url: candidatas.join(' | ') };
  }
}

/**
 * Genera una respuesta TwiML válida para Twilio WhatsApp
 */
function escaparXML(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Genera una respuesta TwiML válida para Twilio WhatsApp.
 *
 * WhatsApp admite una sola imagen por mensaje, así que cada imagen extra
 * va en su propio <Message>. El texto viaja en el primero.
 */
function generarRespuestaTwiML(mensaje, imagenes = []) {
  const cuerpo = escaparXML(mensaje);
  const urls = (imagenes || []).filter(Boolean);

  if (urls.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message><Body>${cuerpo}</Body></Message>
</Response>`;
  }

  const mensajes = urls.map((url, i) => (
    i === 0
      ? `  <Message><Body>${cuerpo}</Body><Media>${escaparXML(url)}</Media></Message>`
      : `  <Message><Media>${escaparXML(url)}</Media></Message>`
  ));

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${mensajes.join('\n')}
</Response>`;
}

const TWIML_VACIO = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

/**
 * Envía un mensaje WhatsApp vía Twilio REST API (para respuestas asíncronas).
 *
 * Devuelve `{ ok, imagenesPedidas, imagenesEnviadas, codigoError }` en vez de
 * un booleano. Dos razones medidas:
 *
 * 1. El panel mostraba "[+2 imagen(es) enviada(s)]" aunque Twilio hubiera
 *    rechazado las dos, porque el texto se armaba con la cantidad PEDIDA. Así
 *    nadie podía distinguir una foto entregada de una que se cayó, y la cifra
 *    "38 respuestas llevaron fotos" del embudo salía de ese mismo marcador
 *    optimista. Quien guarda la fila necesita el número real.
 * 2. Cuando el envío falla, `err.code` de Twilio es el único dato que dice por
 *    qué. El 63016 (fuera de la ventana de 24 h de WhatsApp) tiene que poder
 *    distinguirse de un número mal escrito o de un saldo agotado; sin el
 *    código, un seguimiento que nunca llegó se ve igual que uno entregado.
 *
 * El objeto es truthy, así que un `if (await enviarMensajeWhatsApp(...))`
 * sigue comportándose como antes.
 *
 * El texto va SOLO en su propio mensaje y cada imagen en el suyo. Antes la
 * primera imagen viajaba adjunta al texto: si esa URL del catálogo estaba mal
 * (un enlace de Google Drive, un typo), la creación del mensaje fallaba y el
 * comprador no recibía NADA, ni las fotos ni el texto, y en el panel quedaba
 * una pregunta sin respuesta y sin ninguna pista del motivo.
 */
async function enviarMensajeWhatsApp(numeroDestino, mensaje, imagenes = []) {
  const urls = (imagenes || []).filter(Boolean);
  const resultado = { ok: false, imagenesPedidas: urls.length, imagenesEnviadas: 0, codigoError: null };

  const client = obtenerClienteTwilio();
  if (!client) {
    console.error('[Twilio] No se puede enviar: faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN');
    resultado.codigoError = 'sin_credenciales';
    return resultado;
  }
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) {
    console.error('[Twilio] No se puede enviar: falta TWILIO_WHATSAPP_FROM');
    resultado.codigoError = 'sin_remitente';
    return resultado;
  }

  const to = `whatsapp:${numeroDestino}`;

  if (String(mensaje || '').trim()) {
    try {
      await client.messages.create({ from, to, body: mensaje });
      resultado.ok = true;
    } catch (err) {
      console.error(`[Twilio] Error al enviar el texto vía REST API (code ${err.code || 'sin_code'}):`, err.message);
      resultado.codigoError = err.code || 'error_envio';
      return resultado;
    }
  } else {
    resultado.ok = true;
  }

  // WhatsApp acepta una imagen por mensaje. Cada una en su propio try/catch:
  // una URL rota del catálogo no se lleva puesto el texto ni las fotos buenas.
  for (const url of urls) {
    try {
      await client.messages.create({ from, to, mediaUrl: [url] });
      resultado.imagenesEnviadas++;
    } catch (err) {
      console.error(`[Twilio] No se pudo enviar la imagen ${url} (code ${err.code || 'sin_code'}):`, err.message);
      if (!resultado.codigoError) resultado.codigoError = err.code || 'error_imagen';
    }
  }

  console.log(`[Twilio] Mensaje enviado vía REST API a ${numeroDestino}${urls.length ? ` — ${resultado.imagenesEnviadas} de ${urls.length} imagen(es)` : ''}`);
  return resultado;
}

// Tope duro de descarga de medios. Una nota de voz de WhatsApp de un minuto en
// ogg/opus pesa alrededor de 1 MB, así que 10 MB cubre cualquier audio o foto
// real y evita que un medio enorme se coma la memoria de la función y los 9 s
// que da Twilio antes de cortar.
const MEDIO_MAX_BYTES = 10 * 1024 * 1024;
const MEDIO_TIMEOUT_MS = 3000;

function esURLDeMediosTwilio(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:'
      && (u.hostname === 'api.twilio.com' || u.hostname.endsWith('.api.twilio.com'));
  } catch {
    return false;
  }
}

/**
 * Descarga un medio entrante de Twilio (nota de voz, foto, sticker).
 *
 * Devuelve `{ ok: true, buffer, mime, bytes }` o `{ ok: false, motivo }`, y
 * nunca lanza: el turno tiene que seguir y guardar la fila igual aunque el
 * medio no se pueda bajar, porque si no el mensaje del comprador desaparece
 * de la base y nadie se entera de que lo perdimos.
 *
 * La trampa: `MediaUrl0` apunta a api.twilio.com, exige Basic auth con
 * AccountSid:AuthToken y responde 302 hacia un bucket firmado. El fetch de
 * Node borra solo la cabecera Authorization al cruzar de dominio, así que no
 * hay que reenviarla a mano ni desactivar los redirects.
 *
 * Se valida el host antes de pedir nada: la URL llega en el cuerpo del webhook
 * y, aunque ese cuerpo viene firmado por Twilio, mandar las credenciales de la
 * cuenta a cualquier host que aparezca en un campo es lo que convierte un
 * webhook en una puerta para pedir URLs ajenas con credenciales adjuntas.
 */
async function descargarMedioTwilio(url, { maxBytes = MEDIO_MAX_BYTES, timeoutMs = MEDIO_TIMEOUT_MS } = {}) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return { ok: false, motivo: 'sin_credenciales' };
  }

  if (!esURLDeMediosTwilio(url)) {
    console.warn(`[Twilio] URL de medio rechazada por no ser de api.twilio.com: ${String(url).slice(0, 120)}`);
    return { ok: false, motivo: 'host_no_permitido' };
  }

  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return { ok: false, motivo: `http_${r.status}` };

    // Si Twilio ya declara el tamaño y pasa el tope, cortamos antes de leer el
    // cuerpo: bajar de balde lo que vamos a descartar solo gasta los 9 s.
    const declarado = Number(r.headers.get('content-length') || 0);
    if (declarado && declarado > maxBytes) return { ok: false, motivo: 'demasiado_grande' };

    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length > maxBytes) return { ok: false, motivo: 'demasiado_grande' };

    return {
      ok: true,
      buffer,
      bytes: buffer.length,
      mime: (r.headers.get('content-type') || '').split(';')[0].trim(),
    };
  } catch (err) {
    // Timeout incluido: para el turno es lo mismo que un medio ilegible.
    const esCorte = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { ok: false, motivo: esCorte ? 'timeout' : `error: ${err.message}` };
  }
}

/**
 * Texto de la disculpa cuando falla la IA.
 *
 * Está separado del TwiML porque hay un camino donde el TwiML ya no sirve: si
 * OpenAI tarda más de 9 s y DESPUÉS falla, Twilio ya recibió el TwiML vacío y
 * la disculpa solo puede salir por REST. Antes ese caso terminaba en silencio
 * absoluto, que es el peor momento para desaparecer.
 */
function textoRespuestaError(telefonoEmpresa) {
  return telefonoEmpresa
    ? `Disculpa, estoy teniendo problemas técnicos. Intenta de nuevo en unos minutos o escribe al ${telefonoEmpresa}. 🙏`
    : 'Disculpa, estoy teniendo problemas técnicos. Intenta de nuevo en unos minutos y un asesor te va a atender. 🙏';
}

/**
 * Genera una respuesta de error estándar para cuando falla la IA
 */
function generarRespuestaError(telefonoEmpresa) {
  return generarRespuestaTwiML(textoRespuestaError(telefonoEmpresa));
}

module.exports = {
  generarRespuestaTwiML,
  TWIML_VACIO,
  enviarMensajeWhatsApp,
  generarRespuestaError,
  textoRespuestaError,
  validarFirmaTwilio,
  descargarMedioTwilio,
  esURLDeMediosTwilio,
  MEDIO_MAX_BYTES,
};
