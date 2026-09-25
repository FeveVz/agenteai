/**
 * Lo que el sistema aprende de las conversaciones.
 *
 * Va todo detrás de requiereAuth (se monta así en app.js): acá se leen
 * conversaciones completas con teléfonos de compradores reales.
 */

const express = require('express');
const { obtenerSupabase } = require('../db');
const { analizarConversaciones } = require('../services/aprendizaje');
const { obtenerClienteOpenAI } = require('../services/openai');

const router = express.Router();

// ── Informe de huecos ───────────────────────────────────────────────

/** El último análisis guardado. No cuesta nada: no vuelve a llamar al modelo. */
router.get('/analisis', async (_req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data } = await supabase
      .from('analisis')
      .select('*')
      .order('generado_en', { ascending: false })
      .limit(1)
      .single();

    res.json({ ok: true, analisis: data || null });
  } catch {
    // Todavía no se corrió ninguno: no es un error.
    res.json({ ok: true, analisis: null });
  }
});

/**
 * Corre un análisis nuevo.
 *
 * Es la única ruta del panel que gasta dinero, así que es explícita: se
 * dispara con un botón, no sola al abrir la pantalla.
 */
router.post('/analizar', async (req, res) => {
  try {
    // `desde` permite analizar solo lo nuevo. Sin él relee todo, que es lo
    // que conviene la primera vez y cuando se cambió el prompt.
    const desdeMensaje = Number(req.body?.desde) || 0;

    const resultado = await analizarConversaciones({
      obtenerCliente: obtenerClienteOpenAI,
      desdeMensaje,
    });

    res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error('[Aprendizaje] Falló el análisis:', error);
    res.status(500).json({ error: 'No se pudo analizar', detalle: error.message });
  }
});

// ── Correcciones ────────────────────────────────────────────────────

router.get('/correcciones', async (_req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data, error } = await supabase
      .from('correcciones')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ ok: true, correcciones: data || [] });
  } catch (error) {
    console.error('[Aprendizaje] Error al listar correcciones:', error);
    res.status(500).json({ error: 'No se pudieron leer las correcciones', detalle: error.message });
  }
});

router.post('/correcciones', async (req, res) => {
  const { dijo, debio_decir, nota, numero_telefono } = req.body || {};

  // Sin los dos lados la corrección no enseña nada: el ejemplo que viaja en
  // el prompt es justamente el par "dijo / debió decir".
  if (!String(dijo || '').trim() || !String(debio_decir || '').trim()) {
    return res.status(400).json({ error: 'Hacen falta la respuesta que dio y la que correspondía.' });
  }

  try {
    const supabase = obtenerSupabase();
    const { data, error } = await supabase
      .from('correcciones')
      .insert({
        dijo: String(dijo).trim(),
        debio_decir: String(debio_decir).trim(),
        nota: String(nota || '').trim() || null,
        numero_telefono: numero_telefono || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, correccion: data });
  } catch (error) {
    console.error('[Aprendizaje] Error al guardar la corrección:', error);
    res.status(500).json({ error: 'No se pudo guardar', detalle: error.message });
  }
});

/** Activar o desactivar. No se borra: el historial sirve para ver qué se probó. */
router.put('/correcciones/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido.' });

  try {
    const supabase = obtenerSupabase();
    const cambios = {};
    if (req.body?.activa !== undefined) cambios.activa = Boolean(req.body.activa);
    if (req.body?.debio_decir !== undefined) cambios.debio_decir = String(req.body.debio_decir).trim();
    if (req.body?.nota !== undefined) cambios.nota = String(req.body.nota).trim() || null;

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ error: 'Nada que cambiar.' });
    }

    const { data, error } = await supabase
      .from('correcciones')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, correccion: data });
  } catch (error) {
    console.error('[Aprendizaje] Error al actualizar la corrección:', error);
    res.status(500).json({ error: 'No se pudo actualizar', detalle: error.message });
  }
});

// ── Compradores ─────────────────────────────────────────────────────

/** Lo que sabemos de cada persona. Lo llena el análisis. */
router.get('/compradores', async (_req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data, error } = await supabase
      .from('compradores')
      .select('*')
      .order('actualizado_en', { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json({ ok: true, compradores: data || [] });
  } catch (error) {
    console.error('[Aprendizaje] Error al listar compradores:', error);
    res.status(500).json({ error: 'No se pudieron leer', detalle: error.message });
  }
});

module.exports = router;
