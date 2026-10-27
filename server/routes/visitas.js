const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

// Los mismos cuatro valores del CHECK de sql/esquema.sql. Si acá entrara uno
// que la base no acepta, Postgres rechaza el UPDATE y el panel solo vería un
// error 500 sin explicación.
const ESTADOS = ['pendiente', 'confirmada', 'cancelada', 'completada'];

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

// ── PUT /api/visitas/:id — Cambiar el estado (o las notas) de una visita ─────
//
// Por qué existe: un comprador llama a Pamela y cancela la visita del jueves
// 10:30. La fila se quedaba en 'confirmada' para siempre, y como
// `calcularHorariosLibres` descuenta todo lo que no esté cancelado, la página
// pública no volvía a ofrecer ese turno a nadie. Con slots de 30 minutos entre
// las 08:00 y las 20:00 son 25 turnos por día: cada cancelación fantasma se
// comía uno de forma permanente.
//
// Y al revés: sin 'completada' no había forma de saber si la única visita del
// mes (id 3, 2026-10-10) de verdad ocurrió.
//
// El estado es dato, no prosa: en cuanto se puede cambiar, lo leen la página
// pública y la herramienta de visitas del agente sin que nadie les avise.
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { estado, notas } = req.body || {};

  if (!/^\d+$/.test(String(id))) {
    return res.status(400).json({ error: 'Id de visita inválido' });
  }

  const cambios = {};

  if (estado !== undefined) {
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({
        error: 'Estado inválido',
        detalle: `Usa uno de: ${ESTADOS.join(', ')}.`,
      });
    }
    cambios.estado = estado;
  }

  // '' borra las notas a propósito (Pamela corrige una nota equivocada);
  // undefined las deja como están.
  if (notas !== undefined) {
    cambios.notas = String(notas).trim() || null;
  }

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No hay nada que cambiar', detalle: 'Manda estado o notas.' });
  }

  try {
    const supabase = obtenerSupabase();
    const { data: visita, error } = await supabase
      .from('visitas')
      .update(cambios)
      .eq('id', Number(id))
      .select()
      .single();

    if (error) throw error;
    if (!visita) return res.status(404).json({ error: 'Esa visita no existe' });

    console.log(`[API Visitas] Visita ${id} actualizada: ${JSON.stringify(cambios)}`);
    res.json({ ok: true, visita });
  } catch (error) {
    console.error(`[API Visitas] Error al actualizar ${id}:`, error);
    res.status(500).json({ error: 'No se pudo actualizar la visita', detalle: error.message });
  }
});

// GET /api/visitas/:fecha — Visitas de una fecha (YYYY-MM-DD)
router.get('/:fecha', async (req, res) => {
  const { fecha } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({
      error: 'Formato de fecha inválido',
      detalle: 'Usa el formato YYYY-MM-DD. Ej: 2026-08-14',
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
