const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

const MAX_MENSAJES_CONVERSACION = 300;
// Cuántos mensajes recientes se escanean para armar la lista de conversaciones.
// Postgres no tiene DISTINCT ON via PostgREST, así que se agrupa en memoria.
const VENTANA_CONVERSACIONES = 2000;

function esNumeroValido(n) {
  return typeof n === 'string' && /^\+?\d{6,20}$/.test(n);
}

// GET /api/mensajes/conversaciones — Una entrada por número, con su último mensaje
router.get('/conversaciones', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: mensajes, error } = await supabase
      .from('mensajes_whatsapp')
      .select('numero_telefono, contenido_mensaje, remitente, recibido_en')
      .order('recibido_en', { ascending: false })
      .limit(VENTANA_CONVERSACIONES);

    if (error) throw error;

    // Vienen ordenados de más nuevo a más viejo: el primero de cada número es su último mensaje
    const porNumero = new Map();
    for (const m of mensajes || []) {
      let conv = porNumero.get(m.numero_telefono);
      if (!conv) {
        conv = {
          numero_telefono: m.numero_telefono,
          ultimo_mensaje: m.contenido_mensaje,
          ultimo_remitente: m.remitente,
          ultima_fecha: m.recibido_en,
          total: 0,
        };
        porNumero.set(m.numero_telefono, conv);
      }
      conv.total++;
    }

    res.json({
      ok: true,
      conversaciones: [...porNumero.values()],
      // Avisa si la ventana se llenó: podría haber conversaciones más viejas fuera
      ventana_completa: (mensajes || []).length >= VENTANA_CONVERSACIONES,
    });
  } catch (error) {
    console.error('[API Mensajes] Error al listar conversaciones:', error);
    res.status(500).json({ error: 'Error al obtener las conversaciones', detalle: error.message });
  }
});

// GET /api/mensajes/:numero — Historial completo de un número
router.get('/:numero', async (req, res) => {
  const numero = req.params.numero;

  if (!esNumeroValido(numero)) {
    return res.status(400).json({ error: 'Número de teléfono inválido.' });
  }

  try {
    const supabase = obtenerSupabase();
    const { data: mensajes, error } = await supabase
      .from('mensajes_whatsapp')
      .select('id, numero_telefono, contenido_mensaje, remitente, tipo_mensaje, procesado, recibido_en')
      .eq('numero_telefono', numero)
      .order('recibido_en', { ascending: false })
      .limit(MAX_MENSAJES_CONVERSACION);

    if (error) throw error;

    res.json({ ok: true, numero, mensajes: mensajes || [] });
  } catch (error) {
    console.error(`[API Mensajes] Error para ${numero}:`, error);
    res.status(500).json({ error: 'Error al obtener la conversación', detalle: error.message });
  }
});

// GET /api/mensajes — Últimos 50 mensajes de todos los números (vista global)
router.get('/', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: mensajes, error } = await supabase
      .from('mensajes_whatsapp')
      .select('id, numero_telefono, contenido_mensaje, remitente, tipo_mensaje, procesado, recibido_en')
      .order('recibido_en', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ ok: true, mensajes: mensajes || [] });
  } catch (error) {
    console.error('[API Mensajes] Error:', error);
    res.status(500).json({ error: 'Error al obtener mensajes', detalle: error.message });
  }
});

module.exports = router;
