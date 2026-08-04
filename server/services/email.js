const { formatearFechaCompleta } = require('../utils/fechas');

// Envío vía Resend (API REST, sin dependencias). Con RESEND_API_KEY alcanza.
const API_RESEND = 'https://api.resend.com/emails';

/** Remitente por defecto: el dominio de pruebas de Resend, que no requiere verificar nada. */
const REMITENTE_POR_DEFECTO = 'Ceinys <onboarding@resend.dev>';

function estaConfigurado() {
  return Boolean(process.env.RESEND_API_KEY);
}

/** "a@x.com, b@y.com" → ['a@x.com', 'b@y.com'], descartando lo que no sea un email. */
function parsearDestinatarios(texto) {
  if (!texto) return [];
  return String(texto)
    .split(/[,;\n]/)
    .map(e => e.trim())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function escapar(txt) {
  return String(txt == null ? '' : txt)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function construirHtml({ nombre, telefono, proyecto, fechaLegible, notas, origen }) {
  const filas = [
    ['Cliente', escapar(nombre)],
    ['Teléfono', `<a href="https://wa.me/${escapar(String(telefono).replace(/\D/g, ''))}" style="color:#F5851F;text-decoration:none">${escapar(telefono)}</a>`],
    ['Proyecto', escapar(proyecto)],
    ['Fecha y hora', escapar(fechaLegible)],
    notas ? ['Notas', escapar(notas)] : null,
    ['Agendada desde', origen === 'link' ? 'El calendario web' : 'La conversación de WhatsApp'],
  ].filter(Boolean);

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5">
    <div style="background:#000;padding:20px 24px">
      <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px">CEINYS</span>
      <span style="display:inline-block;width:7px;height:7px;background:#F5851F;border-radius:2px;margin-left:6px;vertical-align:middle"></span>
      <p style="color:#999;font-size:12px;margin:4px 0 0">Nueva visita agendada</p>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${filas.map(([k, v]) => `
      <tr>
        <td style="padding:12px 24px;color:#888;font-size:13px;border-bottom:1px solid #f0f0f0;width:130px;vertical-align:top">${k}</td>
        <td style="padding:12px 24px;color:#1a1a1a;font-size:14px;border-bottom:1px solid #f0f0f0;font-weight:500">${v}</td>
      </tr>`).join('')}
    </table>
    <div style="padding:18px 24px;background:#fafafa">
      <p style="margin:0;color:#888;font-size:12px;line-height:1.5">
        Valeria agendó esta visita automáticamente. Puedes verla en el panel, pestaña Visitas.
      </p>
    </div>
  </div>
</body></html>`;
}

/**
 * Avisa por correo que se agendó una visita.
 *
 * Nunca lanza: si el correo falla, la visita ya quedó guardada y no tiene
 * sentido romper el flujo del cliente por un aviso interno.
 *
 * @returns {Promise<{enviado: boolean, motivo?: string}>}
 */
async function enviarAlertaVisita(visita, config) {
  const destinatarios = parsearDestinatarios(config && config.email_alertas);

  if (destinatarios.length === 0) return { enviado: false, motivo: 'sin_destinatarios' };
  if (!estaConfigurado()) {
    console.warn('[Email] Hay destinatarios configurados pero falta RESEND_API_KEY: no se envió la alerta.');
    return { enviado: false, motivo: 'sin_api_key' };
  }

  const fechaLegible = formatearFechaCompleta(visita.fecha_visita);
  const asunto = `Nueva visita: ${visita.proyecto_interes} — ${fechaLegible}`;

  try {
    const respuesta = await fetch(API_RESEND, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || REMITENTE_POR_DEFECTO,
        to: destinatarios,
        subject: asunto,
        html: construirHtml({
          nombre: visita.nombre_cliente,
          telefono: visita.numero_telefono,
          proyecto: visita.proyecto_interes,
          fechaLegible,
          notas: visita.notas,
          origen: visita.origen,
        }),
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      console.error(`[Email] Resend respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
      return { enviado: false, motivo: `http_${respuesta.status}` };
    }

    console.log(`[Email] Alerta de visita enviada a ${destinatarios.join(', ')}`);
    return { enviado: true };
  } catch (error) {
    console.error('[Email] No se pudo enviar la alerta:', error.message);
    return { enviado: false, motivo: error.message };
  }
}

module.exports = { enviarAlertaVisita, estaConfigurado, parsearDestinatarios };
