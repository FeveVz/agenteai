const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

// GET /api/configuracion
router.get('/', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: config, error } = await supabase
      .from('configuracion_agencia')
      .select('*')
      .limit(1)
      .single();

    if (error) throw error;

    let servicios = [];
    try { servicios = JSON.parse(config.servicios || '[]'); } catch {
      servicios = config.servicios ? config.servicios.split(',').map(s => s.trim()) : [];
    }

    res.json({ ok: true, config: { ...config, servicios } });
  } catch (error) {
    console.error('[API Config] Error:', error);
    res.status(500).json({ error: 'Error al obtener configuración', detalle: error.message });
  }
});

// PUT /api/configuracion
router.put('/', async (req, res) => {
  const { nombre_agencia, slogan, direccion, telefono, email, horarios, servicios, sobre_agencia, webhook_url } = req.body;

  if (nombre_agencia !== undefined && nombre_agencia.trim() === '') {
    return res.status(400).json({ error: 'El nombre de la agencia no puede estar vacío.' });
  }

  try {
    const supabase = obtenerSupabase();
    const { data: configActual, error: errorGet } = await supabase
      .from('configuracion_agencia')
      .select('id, servicios')
      .limit(1)
      .single();

    if (errorGet) throw errorGet;

    let serviciosJSON = configActual.servicios;
    if (servicios !== undefined) {
      if (Array.isArray(servicios)) {
        serviciosJSON = JSON.stringify(servicios.filter(s => s.trim()));
      } else if (typeof servicios === 'string') {
        serviciosJSON = JSON.stringify(servicios.split(',').map(s => s.trim()).filter(Boolean));
      }
    }

    const actualizacion = { servicios: serviciosJSON, actualizado_en: new Date().toISOString() };
    if (nombre_agencia !== undefined) actualizacion.nombre_agencia = nombre_agencia;
    if (slogan !== undefined) actualizacion.slogan = slogan;
    if (direccion !== undefined) actualizacion.direccion = direccion;
    if (telefono !== undefined) actualizacion.telefono = telefono;
    if (email !== undefined) actualizacion.email = email;
    if (horarios !== undefined) actualizacion.horarios = horarios;
    if (sobre_agencia !== undefined) actualizacion.sobre_agencia = sobre_agencia;
    if (webhook_url !== undefined) actualizacion.webhook_url = webhook_url;

    const { data: configActualizada, error: errorUpdate } = await supabase
      .from('configuracion_agencia')
      .update(actualizacion)
      .eq('id', configActual.id)
      .select()
      .single();

    if (errorUpdate) throw errorUpdate;

    let serviciosActualizados = [];
    try { serviciosActualizados = JSON.parse(configActualizada.servicios || '[]'); } catch { serviciosActualizados = []; }

    console.log('[API Config] Configuración actualizada.');
    res.json({ ok: true, mensaje: 'Configuración guardada correctamente.', config: { ...configActualizada, servicios: serviciosActualizados } });
  } catch (error) {
    console.error('[API Config] Error al actualizar:', error);
    res.status(500).json({ error: 'Error al guardar configuración', detalle: error.message });
  }
});

module.exports = router;
