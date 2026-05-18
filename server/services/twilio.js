/**
 * Genera una respuesta TwiML válida para Twilio WhatsApp
 */
function generarRespuestaTwiML(mensaje) {
  // Escapar caracteres especiales XML para evitar errores de parseo
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

/**
 * Genera una respuesta de error estándar para cuando falla la IA
 */
function generarRespuestaError(telefonoClinica) {
  const contacto = telefonoClinica || 'la clínica';
  const mensaje = `Disculpá, estoy teniendo problemas técnicos. Intentá de nuevo en unos minutos o llamá al ${contacto}. 🙏`;
  return generarRespuestaTwiML(mensaje);
}

module.exports = { generarRespuestaTwiML, generarRespuestaError };
