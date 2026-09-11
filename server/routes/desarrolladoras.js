const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

/**
 * Empresas dueñas de los proyectos.
 *
 * Acá viven los datos de pago, y no en cada proyecto, por una razón concreta:
 * si estuvieran por proyecto, dos proyectos de la misma constructora podrían
 * quedar con cuentas distintas sin que nadie lo note, y la inicial de un
 * cliente terminaría en otra empresa.
 */

const CAMPOS_EDITABLES = ['nombre', 'razon_social', 'pago_imagen_url', 'notas'];

/** Solo http/https: esta URL termina en un envío de WhatsApp. */
function urlValida(url) {
  const v = String(url == null ? '' : url).trim();
  return v === '' || /^https?:\/\/\S+$/i.test(v);
}

// GET /api/desarrolladoras
router.get('/', async (_req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data, error } = await supabase
      .from('desarrolladoras')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, desarrolladoras: data || [] });
  } catch (error) {
    console.error('[API Desarrolladoras] Error:', error);
    res.status(500).json({ error: 'Error al obtener las constructoras', detalle: error.message });
  }
});

// POST /api/desarrolladoras
router.post('/', async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });

  try {
    const supabase = obtenerSupabase();
    const { data, error } = await supabase
      .from('desarrolladoras')
      .insert({ nombre })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `Ya existe una constructora llamada "${nombre}".` });
      throw error;
    }

    console.log(`[API Desarrolladoras] Creada: ${nombre}`);
    res.status(201).json({ ok: true, desarrolladora: data });
  } catch (error) {
    console.error('[API Desarrolladoras] Error al crear:', error);
    res.status(500).json({ error: 'Error al crear la constructora', detalle: error.message });
  }
});

// PUT /api/desarrolladoras/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  if (req.body.nombre !== undefined && !String(req.body.nombre).trim()) {
    return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
  }
  if (req.body.pago_imagen_url !== undefined && !urlValida(req.body.pago_imagen_url)) {
    return res.status(400).json({ error: 'El enlace de la gráfica de cuentas tiene que empezar con http:// o https://' });
  }

  const actualizacion = { actualizado_en: new Date().toISOString() };
  for (const campo of CAMPOS_EDITABLES) {
    if (req.body[campo] !== undefined) actualizacion[campo] = req.body[campo];
  }

  try {
    const supabase = obtenerSupabase();
    const { data, error } = await supabase
      .from('desarrolladoras')
      .update(actualizacion)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe otra constructora con ese nombre.' });
      throw error;
    }

    console.log(`[API Desarrolladoras] Actualizada: ${data.nombre}`);
    res.json({ ok: true, desarrolladora: data });
  } catch (error) {
    console.error('[API Desarrolladoras] Error al actualizar:', error);
    res.status(500).json({ error: 'Error al guardar la constructora', detalle: error.message });
  }
});

module.exports = router;
