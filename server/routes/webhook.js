const express = require('express');
const { obtenerSupabase } = require('../db');
const { procesarMensajeConIA } = require('../services/openai');
const { generarRespuestaTwiML, generarRespuestaError } = require('../services/twilio');

const router = express.Router();

const limiterPorNumero = new Map();

function verificarRateLimit(numero) {
  const ahora = Date.now();
  const ventana = 60 * 1000;
  const limite = 30;
  const datos = limiterPorNumero.get(numero);
  if (!datos || ahora - datos.inicio > ventana) {
    limiterPorNumero.set(numero, { conteo: 1, inicio: ahora });
    return true;
  }
  if (datos.conteo >= limite) return false;
  datos.conteo++;
  return true;
}

// POST /api/webhook/whatsapp
router.post('/whatsapp', async (req, res) => {
  console.log(`\n[Webhook] Nuevo mensaje — ${new Date().toISOString()}`);

  try {
    const { Body: contenidoMensaje, From: telefonoRaw } = req.body;

    if (!contenidoMensaje || !telefonoRaw) {
      res.set('Content-Type', 'text/xml');
      return res.status(400).send(generarRespuestaTwiML('Mensaje inválido.'));
    }

    const numeroTelefono = telefonoRaw.replace(/^whatsapp:/i, '');
    console.log(`[Webhook] De: ${numeroTelefono} | "${contenidoMensaje.substring(0, 80)}"`);

    if (!verificarRateLimit(numeroTelefono)) {
      res.set('Content-Type', 'text/xml');
      return res.status(429).send(
        generarRespuestaTwiML('Estás enviando demasiados mensajes. Esperá un minuto. 🙏')
      );
    }

    const supabase = obtenerSupabase();

    await supabase.from('mensajes_whatsapp').insert({
      numero_telefono: numeroTelefono,
      contenido_mensaje: contenidoMensaje,
      remitente: 'usuario',
      tipo_mensaje: 'texto',
    });

    const { data: configAgencia } = await supabase
      .from('configuracion_agencia')
      .select('*')
      .limit(1)
      .single();

    const { data: historialRaw } = await supabase
      .from('mensajes_whatsapp')
      .select('contenido_mensaje, remitente')
      .eq('numero_telefono', numeroTelefono)
      .order('recibido_en', { ascending: false })
      .limit(21);

    const historial = (historialRaw || []).reverse().slice(0, -1);

    let respuestaIA;
    try {
      respuestaIA = await procesarMensajeConIA(
        numeroTelefono,
        contenidoMensaje,
        configAgencia || {},
        historial
      );
    } catch (errorIA) {
      console.error('[Webhook] Error OpenAI:', errorIA.message);
      await supabase.from('mensajes_whatsapp').insert({
        numero_telefono: numeroTelefono,
        contenido_mensaje: '[Error: falla de OpenAI]',
        remitente: 'asistente',
        tipo_mensaje: 'texto',
        procesado: 0,
      });
      res.set('Content-Type', 'text/xml');
      return res.send(generarRespuestaError(configAgencia?.telefono));
    }

    await supabase.from('mensajes_whatsapp').insert({
      numero_telefono: numeroTelefono,
      contenido_mensaje: respuestaIA,
      remitente: 'asistente',
      tipo_mensaje: 'texto',
      procesado: 1,
    });

    console.log(`[Webhook] Respuesta enviada a ${numeroTelefono}`);
    res.set('Content-Type', 'text/xml');
    res.send(generarRespuestaTwiML(respuestaIA));

  } catch (error) {
    console.error('[Webhook] Error inesperado:', error);
    res.set('Content-Type', 'text/xml');
    res.status(500).send(generarRespuestaError());
  }
});

module.exports = router;
