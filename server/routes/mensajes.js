const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

// GET /api/mensajes — Últimos 50 mensajes
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
