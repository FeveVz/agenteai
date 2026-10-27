const express = require('express');
const { obtenerSupabase } = require('../db');

const router = express.Router();

// Campos que el panel puede editar. Todo lo demás (id, timestamps) es de solo lectura.
const CAMPOS_EDITABLES = [
  'nombre', 'ubicacion', 'tipo', 'descripcion', 'precio_desde',
  'area_desde', 'caracteristicas', 'financiamiento', 'activo', 'orden',
  'estado_comercial', 'entrega_titulo', 'imagenes', 'mapa_url', 'desarrolladora',
  'disponibilidad',
];

// Columnas que viven en una migración que puede no estar aplicada todavía.
// Si falta, PostgREST rechaza el UPDATE entero y Pamela pierde la edición
// completa por un campo que ni usó: por eso se reintenta sin ellas.
const CAMPOS_OPCIONALES = ['disponibilidad'];

// Códigos con los que la base avisa que la columna no existe:
// 42703 es de Postgres, PGRST204 es el caché de esquema de PostgREST.
const CODIGOS_COLUMNA_AUSENTE = ['42703', 'PGRST204'];

function columnaAusente(error) {
  return Boolean(error) && CODIGOS_COLUMNA_AUSENTE.includes(String(error.code));
}

/** Solo http/https y sin espacios: es lo que Twilio puede ir a buscar. */
function esUrlDeImagen(url) {
  return /^https?:\/\/\S+$/i.test(String(url == null ? '' : url).trim());
}

/**
 * Revisa el campo `imagenes`, que es texto con una URL por línea en formato
 * "url | descripcion".
 *
 * Por qué se valida acá y no solo en el navegador: parsearImagenes
 * (server/services/openai.js) DESCARTA en silencio toda línea cuya URL no
 * matchee ^https?://\S+$. Pamela pegaba un enlace de Drive o uno con un typo,
 * el panel mostraba el toast verde de guardado, y después el agente le decía
 * al comprador que no hay fotos cargadas. Devolver 400 nombrando la línea hace
 * que el error aparezca en el panel, en el momento de guardar.
 *
 * @returns {Array<{linea: number, texto: string}>} las líneas que no sirven
 */
function lineasDeImagenInvalidas(texto) {
  const crudo = String(texto == null ? '' : texto);
  const malas = [];

  crudo.split('\n').forEach((linea, indice) => {
    if (!linea.trim()) return; // las líneas en blanco no molestan a nadie
    const url = linea.split('|')[0].trim();
    if (!esUrlDeImagen(url)) {
      malas.push({ linea: indice + 1, texto: linea.trim().slice(0, 80) });
    }
  });

  return malas;
}

/**
 * Valida lo que es común a crear y actualizar.
 * @returns {string|null} el mensaje de error, o null si está todo bien.
 */
function validarCampos(cuerpo) {
  if (cuerpo.nombre !== undefined && !String(cuerpo.nombre == null ? '' : cuerpo.nombre).trim()) {
    return 'El nombre del proyecto no puede estar vacío.';
  }

  // El mapa termina en un href de la pagina de confirmación: solo http/https.
  const mapa = cuerpo.mapa_url;
  if (mapa !== undefined && String(mapa == null ? '' : mapa).trim() && !/^https?:\/\/\S+$/i.test(String(mapa).trim())) {
    return 'El enlace del mapa debe empezar con http:// o https://';
  }

  if (cuerpo.imagenes !== undefined) {
    const malas = lineasDeImagenInvalidas(cuerpo.imagenes);
    if (malas.length > 0) {
      const detalle = malas.map(m => `línea ${m.linea}: "${m.texto}"`).join(' · ');
      return `En Imágenes hay ${malas.length} línea(s) que no son una URL (tiene que empezar con http:// o https:// y no llevar espacios). ${detalle}`;
    }
  }

  // `orden` decide qué proyecto nombra primero el agente y en qué orden salen
  // los botones del enlace de agenda. Si llega texto, Postgres rechaza el
  // UPDATE entero con un 500 que no explica nada.
  if (cuerpo.orden !== undefined && cuerpo.orden !== null && cuerpo.orden !== '') {
    const n = Number(cuerpo.orden);
    if (!Number.isInteger(n) || n < 0) {
      return 'El orden tiene que ser un número entero de 0 en adelante.';
    }
  }

  return null;
}

/** Arma el objeto a escribir, quedándose solo con los campos permitidos. */
function soloCamposEditables(cuerpo, { incluirNombre = true } = {}) {
  const salida = {};
  for (const campo of CAMPOS_EDITABLES) {
    if (!incluirNombre && campo === 'nombre') continue;
    if (cuerpo[campo] === undefined) continue;
    salida[campo] = campo === 'orden' && cuerpo[campo] !== null && cuerpo[campo] !== ''
      ? Number(cuerpo[campo])
      : cuerpo[campo];
  }
  return salida;
}

// GET /api/proyectos — Todos los proyectos (incluye inactivos, para el panel)
router.get('/', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: proyectos, error } = await supabase
      .from('proyectos')
      .select('*')
      .order('orden', { ascending: true });

    if (error) throw error;

    // Qué columnas opcionales existen de verdad, mirando la fila que devolvió
    // la base. Sin esto el panel tendría que adivinar si la migración se
    // aplicó, y mostraría un campo que no se puede guardar.
    const columnas = proyectos && proyectos[0] ? Object.keys(proyectos[0]) : [];
    const columnas_opcionales = {};
    for (const campo of CAMPOS_OPCIONALES) {
      columnas_opcionales[campo] = columnas.length === 0 ? null : columnas.includes(campo);
    }

    res.json({ ok: true, proyectos: proyectos || [], columnas_opcionales });
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

  const problema = validarCampos(req.body || {});
  if (problema) return res.status(400).json({ error: problema });

  const actualizacion = {
    ...soloCamposEditables(req.body || {}),
    actualizado_en: new Date().toISOString(),
  };

  try {
    const supabase = obtenerSupabase();
    const escribir = (datos) => supabase
      .from('proyectos')
      .update(datos)
      .eq('id', id)
      .select()
      .single();

    let { data: proyecto, error } = await escribir(actualizacion);
    let aviso;

    if (columnaAusente(error)) {
      // La migración todavía no está aplicada: se guarda todo lo demás en vez
      // de perder la edición entera, y se dice qué quedó afuera.
      const sinOpcionales = { ...actualizacion };
      const descartados = CAMPOS_OPCIONALES.filter(c => c in sinOpcionales);
      for (const campo of descartados) delete sinOpcionales[campo];
      aviso = `Falta correr la migración: ${descartados.join(', ')} no se guardó. El resto sí.`;
      console.warn(`[API Proyectos] Columna ausente (${error.code}). Reintento sin: ${descartados.join(', ')}`);
      ({ data: proyecto, error } = await escribir(sinOpcionales));
    }

    // PGRST116 = la consulta con .single() no encontró ninguna fila. Antes esto
    // caía en el catch y salía como 500 "Error al guardar", que hacía pensar
    // que la base estaba rota en vez de que el proyecto no existe.
    if (error && String(error.code) === 'PGRST116') {
      return res.status(404).json({ error: `No existe el proyecto ${id}.` });
    }
    if (error) throw error;
    if (!proyecto) return res.status(404).json({ error: `No existe el proyecto ${id}.` });

    console.log(`[API Proyectos] Proyecto ${id} actualizado.`);
    res.json({
      ok: true,
      mensaje: aviso || 'Proyecto guardado correctamente.',
      ...(aviso ? { aviso } : {}),
      proyecto,
    });
  } catch (error) {
    console.error(`[API Proyectos] Error al actualizar ${id}:`, error);
    res.status(500).json({ error: 'Error al guardar el proyecto', detalle: error.message });
  }
});

// POST /api/proyectos — Crear un proyecto nuevo
router.post('/', async (req, res) => {
  const nombre = String(req.body?.nombre == null ? '' : req.body.nombre).trim();
  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del proyecto es obligatorio.' });
  }

  const problema = validarCampos(req.body || {});
  if (problema) return res.status(400).json({ error: problema });

  const nuevo = { nombre, ...soloCamposEditables(req.body || {}, { incluirNombre: false }) };

  try {
    const supabase = obtenerSupabase();
    const crear = (datos) => supabase.from('proyectos').insert(datos).select().single();

    let { data: proyecto, error } = await crear(nuevo);

    if (columnaAusente(error)) {
      const sinOpcionales = { ...nuevo };
      for (const campo of CAMPOS_OPCIONALES) delete sinOpcionales[campo];
      ({ data: proyecto, error } = await crear(sinOpcionales));
    }

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

// Para las pruebas: la validación se puede ejercitar sin levantar el servidor.
module.exports.lineasDeImagenInvalidas = lineasDeImagenInvalidas;
module.exports.validarCampos = validarCampos;
module.exports.soloCamposEditables = soloCamposEditables;
module.exports.CAMPOS_EDITABLES = CAMPOS_EDITABLES;
module.exports.CAMPOS_OPCIONALES = CAMPOS_OPCIONALES;
