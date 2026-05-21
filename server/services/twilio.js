const twilio = require('twilio');

let twilioClient;

function obtenerClienteTwilio() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
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
function generarRespuestaError(telefonoClinica) {
  const contacto = telefonoClinica || 'la agencia';
  const mensaje = `Disculpá, estoy teniendo problemas técnicos. Intentá de nuevo en unos minutos o escribí al ${contacto}. 🙏`;
  return generarRespuestaTwiML(mensaje);
}

module.exports = { generarRespuestaTwiML, TWIML_VACIO, enviarMensajeWhatsApp, generarRespuestaError };
