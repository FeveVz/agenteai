const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

// GET /api/turnos — Todos los turnos
router.get('/', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: turnos, error } = await supabase
      .from('turnos')
      .select('*')
      .order('fecha_turno', { ascending: false });

    if (error) throw error;

    res.json({ ok: true, turnos: turnos || [] });
  } catch (error) {
    console.error('[API Turnos] Error al obtener turnos:', error);
    res.status(500).json({ error: 'Error al obtener turnos', detalle: error.message });
  }
});

// GET /api/turnos/:fecha — Turnos de una fecha (formato YYYY-MM-DD)
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
    // fecha_turno se guarda como string ISO, filtramos por prefijo de fecha
    const { data: turnos, error } = await supabase
      .from('turnos')
      .select('*')
      .gte('fecha_turno', `${fecha}T00:00:00`)
      .lte('fecha_turno', `${fecha}T23:59:59`)
      .order('fecha_turno', { ascending: true });

    if (error) throw error;

    res.json({ ok: true, fecha, turnos: turnos || [] });
  } catch (error) {
    console.error(`[API Turnos] Error para fecha ${req.params.fecha}:`, error);
    res.status(500).json({ error: 'Error al obtener turnos', detalle: error.message });
  }
});

module.exports = router;
