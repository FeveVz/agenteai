/**
 * Lo que el sistema aprende de las conversaciones.
 *
 * Va todo detrás de requiereAuth (se monta así en app.js): acá se leen
 * conversaciones completas con teléfonos de compradores reales.
 */

const express = require('express');
const { obtenerSupabase } = require('../db');
const {
  analizarConversaciones, contarPendientes, estadoCorrecciones, esColumnaDesconocida,
  MAX_MENSAJES, MAX_TANDAS, MODELO_ANALISIS,
} = require('../services/aprendizaje');
const { obtenerClienteOpenAI } = require('../services/openai');

const router = express.Router();

// ── Informe de huecos ───────────────────────────────────────────────

/**
 * El último análisis guardado, más cuánto falta por analizar.
 *
 * `pendientes` viaja acá y no en el POST porque es la cifra que le dice a
 * Pamela si vale la pena gastar la corrida, y tiene que verla ANTES de
 * apretar. Es un count con head: no llama al modelo, no cuesta nada.
 */
router.get('/analisis', async (_req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data } = await supabase
      .from('analisis')
      .select('*')
      .order('generado_en', { ascending: false })
      .limit(1)
      .single();

    let pendientes = null;
    let cursor = null;
    try {
      const conteo = await contarPendientes(supabase);
      pendientes = conteo.pendientes;
      cursor = conteo.cursor;
    } catch {
      // Sin el conteo el panel igual muestra el informe.
    }

    res.json({
      ok: true,
      analisis: data || null,
      pendientes,
      cursor,
      por_tanda: MAX_MENSAJES,
      modelo: MODELO_ANALISIS(),
    });
  } catch {
    // Todavía no se corrió ninguno: no es un error.
    res.json({ ok: true, analisis: null, pendientes: null, cursor: null, por_tanda: MAX_MENSAJES });
  }
});

/**
 * Corre un análisis nuevo.
 *
 * Es la única ruta del panel que gasta dinero, así que es explícita: se
 * dispara con un botón, no sola al abrir la pantalla.
 *
 * `desde` por defecto es 'auto': sigue desde donde quedó el análisis
 * anterior. Antes el panel mandaba 0 siempre y la consulta era ascendente,
 * así que las 9 corridas de la base releyeron los mismos 400 mensajes más
 * viejos y los 525 más nuevos nunca se analizaron. 0 sigue existiendo, pero
 * ahora hay que pedirlo ("Releer todo").
 *
 * Esta misma ruta es la que puede enganchar un cron: POST con el cuerpo
 * {"desde":"auto","tandas":2} y la cabecera de sesión del panel.
 */
router.post('/analizar', async (req, res) => {
  try {
    const desdeMensaje = req.body?.desde === undefined ? 'auto' : req.body.desde;
    const tandas = req.body?.tandas === undefined ? MAX_TANDAS : Number(req.body.tandas);

    const resultado = await analizarConversaciones({
      obtenerCliente: obtenerClienteOpenAI,
      desdeMensaje,
      tandas,
    });

    res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error('[Aprendizaje] Falló el análisis:', error);
    res.status(500).json({ error: 'No se pudo analizar', detalle: error.message });
  }
});

// ── Correcciones ────────────────────────────────────────────────────

/**
 * Las correcciones, con el estado del cupo.
 *
 * `cupo` existe porque el tope de las que viajan en el prompt se cruzaba en
 * silencio: hay 6 correcciones activas y MAX_CORRECCIONES es 6, así que la
 * séptima desalojaba a otra sin que el panel dijera nada. Ahora la lista de
 * desalojadas viene con nombre y el panel la puede mostrar en rojo.
 */
router.get('/correcciones', async (_req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data, error } = await supabase
      .from('correcciones')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(100);

    if (error) throw error;

    let cupo = null;
    try {
      cupo = await estadoCorrecciones(supabase);
    } catch {
      // El cupo es informativo: sin él la lista igual se muestra.
    }

    res.json({ ok: true, correcciones: data || [], cupo });
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
    // Las dos banderas del cupo: una libera el lugar porque el dato ya quedó
    // cargado en el catálogo, la otra rescata a la que sigue fallando.
    if (req.body?.resuelta_en_catalogo !== undefined) {
      cambios.resuelta_en_catalogo = Boolean(req.body.resuelta_en_catalogo);
    }
    if (req.body?.fijada !== undefined) cambios.fijada = Boolean(req.body.fijada);

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ error: 'Nada que cambiar.' });
    }

    const { data, error } = await supabase
      .from('correcciones')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // La migración de las dos banderas se aplica a mano: si todavía no
      // está, que el panel lo diga en vez de mostrar un error de base.
      if (esColumnaDesconocida(error)) {
        return res.status(409).json({
          error: 'Falta aplicar la migración sql/migraciones/2026-10-aprendizaje-cursor-y-cupo.sql '
               + 'para poder marcar correcciones como resueltas o fijadas.',
        });
      }
      throw error;
    }
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
