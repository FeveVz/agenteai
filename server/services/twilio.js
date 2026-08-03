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
 * Devuelve { valida, motivo }. Si no hay TWILIO_AUTH_TOKEN configurado
 * devuelve valida=true con motivo 'sin_token': preferimos que el agente
 * siga respondiendo a que se caiga por una variable faltante, pero queda
 * avisado en los logs. En cuanto el token esté configurado, se exige.
 */
function validarFirmaTwilio(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    return { valida: true, motivo: 'sin_token' };
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
function generarRespuestaTwiML(mensaje) {
  const mensajeEscapado = mensaje
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message><Body>${mensajeEscapado}</Body></Message>
</Response>`;
}

const TWIML_VACIO = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

/**
 * Envía un mensaje WhatsApp vía Twilio REST API (para respuestas asíncronas)
 */
async function enviarMensajeWhatsApp(numeroDestino, mensaje) {
  const client = obtenerClienteTwilio();
  if (!client) {
    console.error('[Twilio] No se puede enviar: faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN');
    return false;
  }
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) {
    console.error('[Twilio] No se puede enviar: falta TWILIO_WHATSAPP_FROM');
    return false;
  }
  try {
    await client.messages.create({
      from,
      to: `whatsapp:${numeroDestino}`,
      body: mensaje,
    });
    console.log(`[Twilio] Mensaje enviado vía REST API a ${numeroDestino}`);
    return true;
  } catch (err) {
    console.error('[Twilio] Error al enviar vía REST API:', err.message);
    return false;
  }
}

/**
 * Genera una respuesta de error estándar para cuando falla la IA
 */
function generarRespuestaError(telefonoEmpresa) {
  const mensaje = telefonoEmpresa
    ? `Disculpá, estoy teniendo problemas técnicos. Intentá de nuevo en unos minutos o escribí al ${telefonoEmpresa}. 🙏`
    : 'Disculpá, estoy teniendo problemas técnicos. Intentá de nuevo en unos minutos y un asesor te va a atender. 🙏';
  return generarRespuestaTwiML(mensaje);
}

module.exports = {
  generarRespuestaTwiML,
  TWIML_VACIO,
  enviarMensajeWhatsApp,
  generarRespuestaError,
  validarFirmaTwilio,
};
