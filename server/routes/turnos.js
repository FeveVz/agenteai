const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

// GET /api/reuniones — Todas las reuniones
router.get('/', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: reuniones, error } = await supabase
      .from('reuniones')
      .select('*')
      .order('fecha_reunion', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, reuniones: reuniones || [] });
  } catch (error) {
    console.error('[API Reuniones] Error:', error);
    res.status(500).json({ error: 'Error al obtener reuniones', detalle: error.message });
  }
});

// GET /api/reuniones/:fecha — Reuniones de una fecha (YYYY-MM-DD)
router.get('/:fecha', async (req, res) => {
  const { fecha } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({
      error: 'Formato de fecha inválido',
      detalle: 'Usá el formato YYYY-MM-DD. Ej: 2026-03-22',
    });
  }

  try {
    const supabase = obtenerSupabase();
    const { data: reuniones, error } = await supabase
      .from('reuniones')
      .select('*')
      .gte('fecha_reunion', `${fecha}T00:00:00`)
      .lte('fecha_reunion', `${fecha}T23:59:59`)
      .order('fecha_reunion', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, fecha, reuniones: reuniones || [] });
  } catch (error) {
    console.error(`[API Reuniones] Error para ${req.params.fecha}:`, error);
    res.status(500).json({ error: 'Error al obtener reuniones', detalle: error.message });
  }
});

module.exports = router;
