/**
 * Lo que el sistema aprende de las conversaciones.
 *
 * El modelo no aprende: cada mensaje arranca de cero, sus pesos no cambian
 * con el uso y no recuerda nada entre chats. Lo único que persiste es lo que
 * le metemos en el prompt. Así que el aprendizaje se construye acá afuera:
 * se leen las conversaciones, se saca qué le faltó saber y quién es cada
 * comprador, y eso vuelve al prompt en la conversación siguiente.
 *
 * El análisis de huecos y los resúmenes de comprador salen de UNA sola
 * llamada. Son la misma lectura de las mismas conversaciones: partirlo en
 * dos llamadas duplicaría el costo sin agregar nada.
 */

const { obtenerSupabase } = require('../db');

// Un lote grande de una vez sale más barato que muchas llamadas chicas: el
// prompt de instrucciones se paga una sola vez.
const MAX_MENSAJES = 400;

// Cuántas correcciones viajan en el prompt. Son ejemplos, no un manual:
// pasado cierto punto ocupan tokens en cada mensaje sin agregar señal.
const MAX_CORRECCIONES = 6;

const ESQUEMA = {
  type: 'object',
  properties: {
    huecos: {
      type: 'array',
      description: 'Cosas que le preguntaron al agente y no supo responder, o datos que le faltaron.',
      items: {
        type: 'object',
        properties: {
          pregunta: { type: 'string', description: 'Qué querían saber, en palabras del comprador.' },
          veces: { type: 'integer', description: 'Cuántas personas distintas lo preguntaron.' },
          donde: { type: 'string', description: 'Dónde habría que cargar el dato: un proyecto concreto, el FAQ, o la configuración.' },
          gravedad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['pregunta', 'veces', 'donde', 'gravedad'],
        additionalProperties: false,
      },
    },
    fallas: {
      type: 'array',
      description: 'Momentos donde el agente respondió mal: inventó un dato, no entendió, repitió lo mismo o cortó la conversación.',
      items: {
        type: 'object',
        properties: {
          que_paso: { type: 'string' },
          ejemplo: { type: 'string', description: 'La frase concreta del agente.' },
          gravedad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['que_paso', 'ejemplo', 'gravedad'],
        additionalProperties: false,
      },
    },
    compradores: {
      type: 'array',
      description: 'Un resumen por persona, solo de lo que ella misma dijo.',
      items: {
        type: 'object',
        properties: {
          numero_telefono: { type: 'string' },
          nombre: { type: 'string', description: 'Vacío si nunca lo dijo.' },
          resumen: { type: 'string', description: 'Qué busca, para qué, presupuesto, qué proyectos le interesaron. Una o dos frases.' },
        },
        required: ['numero_telefono', 'nombre', 'resumen'],
        additionalProperties: false,
      },
    },
    resumen: { type: 'string', description: 'Dos o tres frases sobre cómo viene funcionando el agente y qué conviene arreglar primero.' },
  },
  required: ['huecos', 'fallas', 'compradores', 'resumen'],
  additionalProperties: false,
};

const INSTRUCCIONES = `Eres quien supervisa a un agente de WhatsApp que atiende a compradores de lotes y casas.

Te paso conversaciones reales. Tu trabajo NO es corregirlas una por una, sino encontrar los PATRONES que hacen que el agente pierda ventas.

Céntrate en:
1. HUECOS — lo que le preguntaron y no supo contestar, o contestó con evasivas del tipo "un asesor te confirma". Cada hueco es un dato que falta cargar. Agrupa las preguntas parecidas y cuenta cuántas personas distintas la hicieron.
2. FALLAS — dónde respondió mal: se inventó un dato que no estaba en el catálogo, no entendió la pregunta y contestó otra cosa, repitió la misma frase varias veces, o cortó una conversación que venía bien.
3. COMPRADORES — qué sabemos de cada persona POR LO QUE ELLA DIJO. No deduzcas ni rellenes: si no dijo su nombre, va vacío.

Sé concreto y accionable. "Falta información" no sirve; "tres personas preguntaron en qué etapa están los lotes de Torres de Parcona y no está cargado" sí.
Ordena huecos y fallas de más grave a menos. Si algo no aparece, devuelve la lista vacía.`;

/** Arma el texto de las conversaciones para mandárselo al modelo. */
function formatearConversaciones(mensajes) {
  const porNumero = new Map();
  for (const m of mensajes) {
    if (!porNumero.has(m.numero_telefono)) porNumero.set(m.numero_telefono, []);
    porNumero.get(m.numero_telefono).push(m);
  }

  const partes = [];
  for (const [numero, lista] of porNumero) {
    partes.push(`\n--- Conversación con ${numero} ---`);
    for (const m of lista) {
      const quien = m.remitente === 'usuario' ? 'COMPRADOR' : 'AGENTE';
      partes.push(`${quien}: ${String(m.contenido_mensaje || '').replace(/\s+/g, ' ').slice(0, 600)}`);
    }
  }
  return partes.join('\n');
}

/**
 * Analiza las conversaciones y guarda lo aprendido.
 *
 * @param obtenerCliente  Se inyecta para poder probar esto sin llamar a OpenAI.
 */
async function analizarConversaciones({ obtenerCliente, desdeMensaje = 0 } = {}) {
  const supabase = obtenerSupabase();

  const { data: mensajes, error } = await supabase
    .from('mensajes_whatsapp')
    .select('id, numero_telefono, contenido_mensaje, remitente')
    .gt('id', desdeMensaje)
    .order('id', { ascending: true })
    .limit(MAX_MENSAJES);

  if (error) throw new Error(`No pude leer las conversaciones: ${error.message}`);
  if (!mensajes || mensajes.length === 0) {
    return { sinDatos: true, mensaje: 'No hay conversaciones nuevas para analizar.' };
  }

  const cliente = obtenerCliente();
  const respuesta = await cliente.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: INSTRUCCIONES },
      { role: 'user', content: formatearConversaciones(mensajes) },
    ],
    // El esquema forzado evita tener que parsear prosa: si el modelo se
    // desvía, falla acá y no a mitad de guardar en la base.
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'analisis', strict: true, schema: ESQUEMA },
    },
    temperature: 0.2,
  });

  const resultado = JSON.parse(respuesta.choices[0].message.content);
  const hastaMensaje = mensajes[mensajes.length - 1].id;

  await supabase.from('analisis').insert({
    mensajes_analizados: mensajes.length,
    hasta_mensaje: hastaMensaje,
    resultado,
  });

  // Los resúmenes por comprador se guardan aparte porque es lo que el agente
  // va a leer en la próxima conversación; el informe es para la clienta.
  const compradores = (resultado.compradores || [])
    .filter(c => c.numero_telefono && (c.resumen || '').trim())
    .map(c => ({
      numero_telefono: c.numero_telefono,
      nombre: (c.nombre || '').trim() || null,
      resumen: c.resumen.trim(),
      actualizado_en: new Date().toISOString(),
    }));

  if (compradores.length) {
    await supabase.from('compradores').upsert(compradores, { onConflict: 'numero_telefono' });
  }

  return {
    sinDatos: false,
    mensajes_analizados: mensajes.length,
    hasta_mensaje: hastaMensaje,
    resultado,
  };
}

/**
 * Las correcciones activas, ya formateadas para el prompt.
 *
 * Se mandan como pares "dijo / debió decir" en vez de reescribirlas como
 * reglas: el ejemplo concreto corrige mejor que la generalización, y además
 * es lo que la clienta escribió, sin que nadie lo interprete por ella.
 */
async function obtenerCorreccionesParaPrompt() {
  try {
    const supabase = obtenerSupabase();
    const { data } = await supabase
      .from('correcciones')
      .select('dijo, debio_decir, nota')
      .eq('activa', true)
      .order('creado_en', { ascending: false })
      .limit(MAX_CORRECCIONES);

    if (!data || data.length === 0) return '';

    const ejemplos = data.map((c, i) => {
      const nota = (c.nota || '').trim();
      return `${i + 1}. EN VEZ DE: "${String(c.dijo).slice(0, 300)}"\n`
           + `   RESPONDE ASÍ: "${String(c.debio_decir).slice(0, 300)}"`
           + (nota ? `\n   (${nota})` : '');
    }).join('\n\n');

    return `\n\nCORRECCIONES DE LA ASESORA (casos reales donde respondiste mal y te corrigieron — no repitas el error):\n${ejemplos}`;
  } catch (e) {
    // Una tabla que todavía no existe no puede dejar al agente sin responder.
    console.error('[Aprendizaje] No pude leer las correcciones:', e.message);
    return '';
  }
}

/** Lo que ya sabemos de este comprador, de conversaciones anteriores. */
async function obtenerMemoriaComprador(numeroTelefono) {
  try {
    const supabase = obtenerSupabase();
    const { data } = await supabase
      .from('compradores')
      .select('nombre, resumen')
      .eq('numero_telefono', numeroTelefono)
      .limit(1)
      .single();

    if (!data || !(data.resumen || '').trim()) return '';

    const nombre = (data.nombre || '').trim();
    return `\n\nLO QUE YA SABES DE ESTA PERSONA (de conversaciones anteriores; no se lo vuelvas a preguntar):\n`
         + (nombre ? `- Se llama ${nombre}\n` : '')
         + `- ${data.resumen}`;
  } catch {
    // Sin memoria previa el agente funciona igual: no es un error.
    return '';
  }
}

module.exports = {
  analizarConversaciones,
  obtenerCorreccionesParaPrompt,
  obtenerMemoriaComprador,
  formatearConversaciones,
  MAX_CORRECCIONES,
};
