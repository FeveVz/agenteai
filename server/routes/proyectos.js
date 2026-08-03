const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

// Campos que el panel puede editar. Todo lo demás (id, timestamps) es de solo lectura.
const CAMPOS_EDITABLES = [
  'nombre', 'ubicacion', 'tipo', 'descripcion', 'precio_desde',
  'area_desde', 'caracteristicas', 'financiamiento', 'activo', 'orden',
  'estado_comercial', 'entrega_titulo', 'imagenes',
];

// GET /api/proyectos — Todos los proyectos (incluye inactivos, para el panel)
router.get('/', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: proyectos, error } = await supabase
      .from('proyectos')
      .select('*')
      .order('orden', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, proyectos: proyectos || [] });
  } catch (error) {
    console.error('[API Proyectos] Error:', error);
    res.status(500).json({ error: 'Error al obtener proyectos', detalle: error.message });
  }
});

// PUT /api/proyectos/:id — Actualizar un proyecto
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  if (req.body.nombre !== undefined && !String(req.body.nombre).trim()) {
    return res.status(400).json({ error: 'El nombre del proyecto no puede estar vacío.' });
  }

  const actualizacion = { actualizado_en: new Date().toISOString() };
  for (const campo of CAMPOS_EDITABLES) {
    if (req.body[campo] !== undefined) actualizacion[campo] = req.body[campo];
  }

  try {
    const supabase = obtenerSupabase();
    const { data: proyecto, error } = await supabase
      .from('proyectos')
      .update(actualizacion)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!proyecto) return res.status(404).json({ error: `No existe el proyecto ${id}.` });

    console.log(`[API Proyectos] Proyecto ${id} actualizado.`);
    res.json({ ok: true, mensaje: 'Proyecto guardado correctamente.', proyecto });
  } catch (error) {
    console.error(`[API Proyectos] Error al actualizar ${id}:`, error);
    res.status(500).json({ error: 'Error al guardar el proyecto', detalle: error.message });
  }
});

// POST /api/proyectos — Crear un proyecto nuevo
router.post('/', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del proyecto es obligatorio.' });
  }

  const nuevo = { nombre };
  for (const campo of CAMPOS_EDITABLES) {
    if (campo !== 'nombre' && req.body[campo] !== undefined) nuevo[campo] = req.body[campo];
  }

  try {
    const supabase = obtenerSupabase();
    const { data: proyecto, error } = await supabase
      .from('proyectos')
      .insert(nuevo)
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation sobre proyectos.nombre
      if (error.code === '23505') {
        return res.status(409).json({ error: `Ya existe un proyecto llamado "${nombre}".` });
      }
      throw error;
    }

    console.log(`[API Proyectos] Proyecto "${nombre}" creado.`);
    res.status(201).json({ ok: true, mensaje: 'Proyecto creado.', proyecto });
  } catch (error) {
    console.error('[API Proyectos] Error al crear:', error);
    res.status(500).json({ error: 'Error al crear el proyecto', detalle: error.message });
  }
});

module.exports = router;
