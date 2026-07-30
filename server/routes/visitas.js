const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

// GET /api/visitas — Todas las visitas
router.get('/', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: visitas, error } = await supabase
      .from('visitas')
      .select('*')
      .order('fecha_visita', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, visitas: visitas || [] });
  } catch (error) {
    console.error('[API Visitas] Error:', error);
    res.status(500).json({ error: 'Error al obtener visitas', detalle: error.message });
  }
});

// GET /api/visitas/:fecha — Visitas de una fecha (YYYY-MM-DD)
router.get('/:fecha', async (req, res) => {
  const { fecha } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({
      error: 'Formato de fecha inválido',
      detalle: 'Usá el formato YYYY-MM-DD. Ej: 2026-08-14',
    });
  }

  try {
    const supabase = obtenerSupabase();
    const { data: visitas, error } = await supabase
      .from('visitas')
      .select('*')
      .gte('fecha_visita', `${fecha}T00:00:00`)
      .lte('fecha_visita', `${fecha}T23:59:59`)
      .order('fecha_visita', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, fecha, visitas: visitas || [] });
  } catch (error) {
    console.error(`[API Visitas] Error para ${req.params.fecha}:`, error);
    res.status(500).json({ error: 'Error al obtener visitas', detalle: error.message });
  }
});

module.exports = router;
