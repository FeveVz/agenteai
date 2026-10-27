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
  const { nombre_agencia, slogan, direccion, telefono, email, horarios, servicios, sobre_agencia, webhook_url,
        casos_exito, redes_sociales, preguntas_frecuentes, reglas_agente, email_alertas,
        hora_apertura, hora_cierre, minutos_por_slot, dias_atencion,
        nombre_agente, tipo_negocio, estilo_respuesta } = req.body;

  // Normalizar ANTES de comparar. Con {"nombre_agencia": null} esto era
  // `null.trim()`: un TypeError fuera del try, que deja la request colgada sin
  // respuesta y tumba el proceso con una promesa rechazada sin manejar. En
  // local se cae el servidor; en Vercel se pierde la invocación y la
  // configuración no se guarda, sin ningún mensaje útil.
  if (nombre_agencia !== undefined && !String(nombre_agencia == null ? '' : nombre_agencia).trim()) {
    return res.status(400).json({ error: 'El nombre de la agencia no puede estar vacío.' });
  }

  // El horario de atención manda en el calendario público, en la validación de
  // la reserva y en lo que el agente le dice al comprador. Un valor raro no se
  // puede guardar: la base acepta cualquier entero y el calendario se queda
  // vacío sin decir por qué.
  for (const [campo, valor, minimo, maximo] of [
    ['hora_apertura', hora_apertura, 0, 23],
    ['hora_cierre', hora_cierre, 0, 23],
  ]) {
    if (valor === undefined) continue;
    const n = Number(valor);
    if (!Number.isInteger(n) || n < minimo || n > maximo) {
      return res.status(400).json({ error: `${campo} tiene que ser una hora entera entre ${minimo} y ${maximo}.` });
    }
  }

  if (hora_apertura !== undefined && hora_cierre !== undefined && Number(hora_cierre) <= Number(hora_apertura)) {
    return res.status(400).json({ error: 'La hora de cierre tiene que ser posterior a la de apertura.' });
  }

  if (minutos_por_slot !== undefined && ![15, 30, 45, 60].includes(Number(minutos_por_slot))) {
    return res.status(400).json({ error: 'Los minutos por turno tienen que ser 15, 30, 45 o 60.' });
  }

  // Formato "0,1,2,3,4,5,6" (domingo = 0). Vacío significa "atiende todos los
  // días" y es válido a propósito.
  if (dias_atencion !== undefined) {
    const crudo = String(dias_atencion == null ? '' : dias_atencion).trim();
    const dias = crudo === '' ? [] : crudo.split(',').map(d => d.trim());
    if (!dias.every(d => /^[0-6]$/.test(d))) {
      return res.status(400).json({ error: 'Los días que atiende tienen que ser números del 0 (domingo) al 6 (sábado), separados por comas.' });
    }
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
      // String(...) sobre cada elemento: un arreglo con un null adentro hacía
      // `null.trim()` y el guardado entero fallaba con un 500 sin pista.
      if (Array.isArray(servicios)) {
        serviciosJSON = JSON.stringify(
          servicios.map(s => String(s == null ? '' : s).trim()).filter(Boolean));
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
    if (casos_exito !== undefined) actualizacion.casos_exito = casos_exito;
    if (redes_sociales !== undefined) actualizacion.redes_sociales = redes_sociales;
    if (preguntas_frecuentes !== undefined) actualizacion.preguntas_frecuentes = preguntas_frecuentes;
    if (reglas_agente !== undefined) actualizacion.reglas_agente = reglas_agente;
    if (email_alertas !== undefined) actualizacion.email_alertas = email_alertas;

    // Horario de atencion. Se guardan como vienen y se normalizan al leerlos
    // (resolverHorario en utils/fechas), asi un valor raro guardado a mano no
    // deja el calendario vacio.
    if (hora_apertura !== undefined) actualizacion.hora_apertura = hora_apertura;
    if (hora_cierre !== undefined) actualizacion.hora_cierre = hora_cierre;
    if (minutos_por_slot !== undefined) actualizacion.minutos_por_slot = minutos_por_slot;
    if (dias_atencion !== undefined) actualizacion.dias_atencion = dias_atencion;
    if (nombre_agente !== undefined) actualizacion.nombre_agente = nombre_agente;
    if (tipo_negocio !== undefined) actualizacion.tipo_negocio = tipo_negocio;
    if (estilo_respuesta !== undefined) actualizacion.estilo_respuesta = estilo_respuesta;

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
