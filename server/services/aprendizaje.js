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
 *
 * Lo que el análisis devuelve son DATOS, no prosa: el destino exacto de cada
 * hueco ('configuracion.preguntas_frecuentes'), el tipo de cada falla y los
 * campos del comprador uno por uno. Tres rondas de reglas escritas en el
 * system prompt no movieron la aguja; lo que el modelo sí lee es el campo
 * que le llega con un valor adentro.
 */

const { obtenerSupabase } = require('../db');

// Un lote grande de una vez sale más barato que muchas llamadas chicas: el
// prompt de instrucciones se paga una sola vez. Medido sobre los 400
// mensajes que quedaban sin analizar: 87 mil caracteres, unos 22 mil tokens
// de entrada por tanda.
const MAX_MENSAJES = 400;

// Cuántas tandas corre una sola corrida. Con 925 mensajes en la base y 525
// sin analizar, dos tandas vacían el atraso; la tercera es colchón. El tope
// existe para que un clic no se convierta en una factura abierta.
const MAX_TANDAS = 3;

// Cuántas correcciones viajan en el prompt. Son ejemplos, no un manual:
// pasado cierto punto ocupan tokens en cada mensaje sin agregar señal.
const MAX_CORRECCIONES = 6;

// El modelo del análisis. Configurable para poder probar uno más nuevo sin
// tocar código ni volver a desplegar.
const MODELO_ANALISIS = () => (process.env.MODELO_ANALISIS || '').trim() || 'gpt-4o';

/**
 * Los destinos posibles de un hueco.
 *
 * Antes `donde` era texto libre y salía "Cargar en: FAQ": Pamela tenía que
 * adivinar que FAQ es el campo "Preguntas frecuentes" de Configuración. El
 * destino es un dato, así que es un enum y el panel lo traduce a la ruta
 * exacta de la pantalla. Si cambia esta lista hay que cambiar también
 * DESTINOS en client/src/components/TabAprendizaje.jsx.
 */
const DESTINOS = [
  'configuracion.preguntas_frecuentes',
  'configuracion.horarios',
  'configuracion.direccion',
  'configuracion.telefono',
  'proyectos.precio',
  'proyectos.financiamiento',
  'proyectos.disponibilidad',
  'proyectos.caracteristicas',
  'proyectos.ubicacion',
  'proyectos.imagenes',
  'no_se_sabe',
];

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
          donde: { type: 'string', description: 'Dónde habría que cargar el dato, en una frase corta.' },
          campo: {
            type: 'string',
            enum: DESTINOS,
            description: 'El campo exacto donde se carga el dato. "no_se_sabe" solo si ninguno aplica.',
          },
          proyecto: { type: 'string', description: 'Nombre del proyecto al que le falta el dato. Vacío si el hueco es general.' },
          respuesta_sugerida: {
            type: 'string',
            description: 'Borrador de la respuesta SOLO si el dato ya aparece dicho por el agente o la asesora en estas conversaciones. Vacío si hay que preguntárselo a la asesora: no lo inventes.',
          },
          gravedad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['pregunta', 'veces', 'donde', 'campo', 'proyecto', 'respuesta_sugerida', 'gravedad'],
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
          tipo: {
            type: 'string',
            enum: ['contenido', 'conducta'],
            description: 'contenido: dijo un dato equivocado o le faltó un dato, se arregla enseñándole la respuesta. conducta: repitió, se despidió antes de hora, contestó dos veces, no preguntó nada de la persona.',
          },
          gravedad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['que_paso', 'ejemplo', 'tipo', 'gravedad'],
        additionalProperties: false,
      },
    },
    compradores: {
      type: 'array',
      description: 'Una ficha por persona, solo con lo que ella misma dijo.',
      items: {
        type: 'object',
        properties: {
          numero_telefono: { type: 'string' },
          nombre: { type: 'string', description: 'Vacío si nunca lo dijo.' },
          resumen: { type: 'string', description: 'Una o dos frases sobre qué busca. Nombra el proyecto concreto.' },
          uso: { type: 'string', enum: ['vivienda', 'inversion', 'casa_de_verano', 'comercial', 'sin_dato'] },
          forma_pago: { type: 'string', enum: ['contado', 'cuotas', 'credito_bancario', 'sin_dato'] },
          presupuesto: { type: 'string', description: 'Textual, como lo dijo él. Vacío si no lo dijo.' },
          plazo: { type: 'string', description: 'Cuándo quiere comprar, como lo dijo él. Vacío si no lo dijo.' },
          objecion: { type: 'string', description: 'Lo que lo frenó, en sus palabras. Vacío si no se quejó de nada.' },
          dato_para_retomar: {
            type: 'string',
            description: 'La frase propia del comprador con la que se puede abrir un mensaje de seguimiento, CITADA tal cual, no parafraseada. Vacío si no dijo nada aprovechable.',
          },
          telefono_alternativo: { type: 'string', description: 'Otro número que haya escrito en el chat. Vacío si no escribió ninguno.' },
          ya_visito: { type: 'boolean', description: 'true solo si dijo que estuvo en el terreno.' },
        },
        required: [
          'numero_telefono', 'nombre', 'resumen', 'uso', 'forma_pago', 'presupuesto',
          'plazo', 'objecion', 'dato_para_retomar', 'telefono_alternativo', 'ya_visito',
        ],
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
1. HUECOS — lo que le preguntaron y no supo contestar, o contestó con evasivas del tipo "un asesor te confirma". Cada hueco es un dato que falta cargar. Agrupa las preguntas parecidas y cuenta cuántas personas distintas la hicieron. Elige el campo exacto donde se carga, y si el dato le falta a un proyecto en particular, nómbralo.
2. FALLAS — dónde respondió mal. Separa las de CONTENIDO (dijo un dato equivocado, le faltó un dato) de las de CONDUCTA (repitió lo mismo, se despidió antes de hora, contestó dos veces al mismo mensaje, no preguntó nada de la persona). Esa diferencia importa: las de contenido se arreglan enseñándole la respuesta correcta, las de conducta no.
3. COMPRADORES — una ficha por persona con lo que ella dijo, campo por campo. Esta ficha es lo que la asesora va a leer para volver a escribirle a alguien que se enfrió, así que lo que importa es lo concreto: cuánto puede pagar, para qué lo quiere, para cuándo, qué lo frenó, y una frase suya que sirva para retomar ("estuve allí la semana pasada y a mi esposa le gustó la ubicación" sirve; "pregunta por precios" no sirve).

No deduzcas ni rellenes. Si no dijo su nombre, va vacío. Si no dijo el presupuesto, va vacío, y el uso o la forma de pago van en "sin_dato". Un presupuesto inventado es peor que un presupuesto vacío: con el vacío el agente se lo pregunta, con el inventado no se lo pregunta nunca más.

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

const ORDEN_GRAVEDAD = { alta: 3, media: 2, baja: 1 };

/**
 * ¿El error es "esa columna no existe"?
 *
 * Las columnas nuevas de este módulo viajan en una migración que se aplica a
 * mano. Entre el despliegue del código y la migración hay una ventana, y en
 * esa ventana el análisis tiene que seguir guardando lo que sí puede en vez
 * de perder la corrida entera.
 */
function esColumnaDesconocida(error) {
  if (!error) return false;
  const codigo = String(error.code || '');
  const texto = String(error.message || '').toLowerCase();
  return codigo === 'PGRST204' || codigo === '42703'
    || (texto.includes('column') && (texto.includes('does not exist') || texto.includes('schema cache')));
}

function sinColumnas(fila, columnas) {
  const copia = { ...fila };
  for (const c of columnas) delete copia[c];
  return copia;
}

/** Guarda la fila; si la base todavía no tiene las columnas nuevas, guarda el resto. */
async function guardarTolerante(consulta, fila, columnasNuevas) {
  const { error } = await consulta(fila);
  if (!error) return { degradado: false };
  if (!esColumnaDesconocida(error)) throw new Error(error.message);

  const recortada = Array.isArray(fila)
    ? fila.map(f => sinColumnas(f, columnasNuevas))
    : sinColumnas(fila, columnasNuevas);

  const segundo = await consulta(recortada);
  if (segundo.error) throw new Error(segundo.error.message);
  return { degradado: true };
}

/** Hasta qué mensaje llegó el análisis más lejano. 0 si nunca se corrió. */
async function leerCursor(supabase = obtenerSupabase()) {
  const { data } = await supabase
    .from('analisis')
    .select('hasta_mensaje')
    .order('hasta_mensaje', { ascending: false })
    .limit(1);

  const valor = Number(data?.[0]?.hasta_mensaje);
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

/** Cuántos mensajes quedan sin analizar. No cuesta nada: no llama al modelo. */
async function contarPendientes(supabase = obtenerSupabase(), desdeMensaje = null) {
  const cursor = desdeMensaje === null ? await leerCursor(supabase) : Number(desdeMensaje) || 0;
  const { count } = await supabase
    .from('mensajes_whatsapp')
    .select('id', { count: 'exact', head: true })
    .gt('id', cursor);

  return { cursor, pendientes: Number(count) || 0 };
}

/**
 * Junta las tandas de una corrida en un solo informe.
 *
 * Si no se fusionan, el panel muestra solo la última tanda y los huecos de
 * la anterior quedan en una fila de la base que nadie abre. Los huecos se
 * suman por pregunta porque "cuántas personas distintas lo preguntaron" es
 * la cifra con la que Pamela decide qué cargar primero, y partida en dos
 * tandas de 400 mensajes queda siempre chica.
 */
function fusionarResultados(tandas) {
  const lista = (tandas || []).filter(Boolean);
  if (lista.length === 0) return { huecos: [], fallas: [], compradores: [], resumen: '' };
  if (lista.length === 1) return lista[0];

  const huecos = new Map();
  for (const t of lista) {
    for (const h of t.huecos || []) {
      const clave = String(h.pregunta || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const previo = huecos.get(clave);
      if (previo) {
        previo.veces = (Number(previo.veces) || 0) + (Number(h.veces) || 0);
        if (!previo.respuesta_sugerida && h.respuesta_sugerida) previo.respuesta_sugerida = h.respuesta_sugerida;
        if ((ORDEN_GRAVEDAD[h.gravedad] || 0) > (ORDEN_GRAVEDAD[previo.gravedad] || 0)) previo.gravedad = h.gravedad;
      } else {
        huecos.set(clave, { ...h });
      }
    }
  }

  // La ficha más nueva de cada comprador gana: las tandas van de mensajes
  // viejos a nuevos, así que la última es la que refleja lo último que dijo.
  const compradores = new Map();
  for (const t of lista) {
    for (const c of t.compradores || []) {
      if (c.numero_telefono) compradores.set(c.numero_telefono, c);
    }
  }

  return {
    huecos: [...huecos.values()].sort(
      (a, b) => (ORDEN_GRAVEDAD[b.gravedad] || 0) - (ORDEN_GRAVEDAD[a.gravedad] || 0),
    ),
    fallas: lista.flatMap(t => t.fallas || []),
    compradores: [...compradores.values()],
    resumen: lista.map(t => String(t.resumen || '').trim()).filter(Boolean).join(' '),
  };
}

/** Las filas de `compradores` tal como se guardan. */
function filaDeComprador(c) {
  const texto = (v) => String(v == null ? '' : v).trim() || null;
  return {
    numero_telefono: c.numero_telefono,
    nombre: texto(c.nombre),
    resumen: String(c.resumen || '').trim(),
    uso: c.uso || 'sin_dato',
    forma_pago: c.forma_pago || 'sin_dato',
    presupuesto: texto(c.presupuesto),
    plazo: texto(c.plazo),
    objecion: texto(c.objecion),
    dato_para_retomar: texto(c.dato_para_retomar),
    telefono_alternativo: texto(c.telefono_alternativo),
    ya_visito: Boolean(c.ya_visito),
    actualizado_en: new Date().toISOString(),
  };
}

const COLUMNAS_NUEVAS_COMPRADORES = [
  'uso', 'forma_pago', 'presupuesto', 'plazo', 'objecion',
  'dato_para_retomar', 'telefono_alternativo', 'ya_visito',
];

/**
 * Analiza las conversaciones y guarda lo aprendido.
 *
 * Avanza desde donde quedó el análisis anterior. Antes no: la consulta era
 * `.gt('id', desdeMensaje)` ascendente con desdeMensaje=0 fijo desde el
 * panel, así que las 9 corridas que hay en la base releyeron siempre los
 * mismos 400 mensajes más viejos — las tres últimas se detienen exacto en
 * hasta_mensaje=400 — y los 525 mensajes siguientes de 925 nunca se
 * leyeron. Los compradores que dijeron que sí a una visita son todos
 * posteriores al mensaje 400: el diagnóstico era ciego justo al mes del que
 * se queja el dueño, y cada clic pagaba por releer septiembre.
 *
 * @param obtenerCliente  Se inyecta para poder probar esto sin llamar a OpenAI.
 * @param supabase        Se inyecta para poder probar esto sin base de datos.
 * @param desdeMensaje    Un número fuerza el piso; 'auto' (o nada) sigue
 *                        desde el cursor guardado; 0 relee todo.
 * @param tandas          Tope de llamadas al modelo en esta corrida.
 */
async function analizarConversaciones({
  obtenerCliente,
  supabase = obtenerSupabase(),
  desdeMensaje = 'auto',
  tandas = MAX_TANDAS,
} = {}) {
  const pedido = Number(desdeMensaje);
  const explicito = desdeMensaje !== '' && desdeMensaje !== null && Number.isFinite(pedido) && pedido >= 0;
  const desde = explicito ? pedido : await leerCursor(supabase);
  const topeTandas = Math.max(1, Math.min(Number(tandas) || MAX_TANDAS, 10));

  let cursor = desde;
  let total = 0;
  let corridas = 0;
  const resultados = [];

  while (corridas < topeTandas) {
    const { data: mensajes, error } = await supabase
      .from('mensajes_whatsapp')
      .select('id, numero_telefono, contenido_mensaje, remitente')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(MAX_MENSAJES);

    if (error) throw new Error(`No pude leer las conversaciones: ${error.message}`);
    if (!mensajes || mensajes.length === 0) break;

    const cliente = obtenerCliente();
    const respuesta = await cliente.chat.completions.create({
      model: MODELO_ANALISIS(),
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

    resultados.push(JSON.parse(respuesta.choices[0].message.content));
    cursor = mensajes[mensajes.length - 1].id;
    total += mensajes.length;
    corridas += 1;

    // Menos de un lote completo significa que no quedaba nada más.
    if (mensajes.length < MAX_MENSAJES) break;
  }

  if (corridas === 0) {
    return {
      sinDatos: true,
      mensaje: 'No hay mensajes nuevos para analizar: el último análisis ya llegó al final.',
      desde_mensaje: desde,
      hasta_mensaje: desde,
      pendientes: 0,
      faltan: false,
    };
  }

  const resultado = fusionarResultados(resultados);

  await guardarTolerante(
    (fila) => supabase.from('analisis').insert(fila),
    { mensajes_analizados: total, desde_mensaje: desde, hasta_mensaje: cursor, resultado },
    ['desde_mensaje'],
  );

  // Los resúmenes por comprador se guardan aparte porque es lo que el agente
  // va a leer en la próxima conversación; el informe es para la clienta.
  const fichas = new Map();
  for (const c of resultado.compradores || []) {
    const tieneAlgo = String(c.resumen || '').trim() || String(c.dato_para_retomar || '').trim()
      || String(c.presupuesto || '').trim() || String(c.nombre || '').trim();
    if (c.numero_telefono && tieneAlgo) fichas.set(c.numero_telefono, filaDeComprador(c));
  }

  let fichasDegradadas = false;
  if (fichas.size) {
    const guardado = await guardarTolerante(
      (filas) => supabase.from('compradores').upsert(filas, { onConflict: 'numero_telefono' }),
      [...fichas.values()],
      COLUMNAS_NUEVAS_COMPRADORES,
    );
    fichasDegradadas = guardado.degradado;
  }

  const { pendientes } = await contarPendientes(supabase, cursor);

  return {
    sinDatos: false,
    mensajes_analizados: total,
    tandas_corridas: corridas,
    desde_mensaje: desde,
    hasta_mensaje: cursor,
    pendientes,
    faltan: pendientes > 0,
    modelo: MODELO_ANALISIS(),
    // Si esto viene en true, la migración de `compradores` todavía no se
    // aplicó y las fichas se guardaron sin los campos nuevos.
    falta_migracion: fichasDegradadas,
    resultado,
  };
}

/** Vacía el atraso sin pasar por el panel. Es lo que engancharía un cron. */
function analizarPendientes({ obtenerCliente, supabase, tandas = MAX_TANDAS } = {}) {
  return analizarConversaciones({ obtenerCliente, supabase, desdeMensaje: 'auto', tandas });
}

// ── Correcciones ────────────────────────────────────────────────────

/**
 * Cuáles de las correcciones cargadas viajan en el prompt y cuáles no.
 *
 * El tope de 6 se cruzaba en silencio: hay exactamente 6 correcciones
 * activas en la base, así que la séptima que cargue Pamela desaloja a la más
 * vieja sin que nada lo diga, y ella ve la fila en el panel y asume que el
 * agente ya aprendió. Dos salidas, las dos en los datos:
 *
 *  · `resuelta_en_catalogo`: la corrección cuyo dato ya quedó cargado en el
 *    proyecto o en el FAQ libera su cupo en vez de competir por él.
 *  · `fijada`: rescata a la que sigue fallando aunque sea vieja. Las
 *    correcciones 3 y 4 (que el 1% es la reserva, no la inicial) son del 25
 *    de septiembre y 7 de las 8 respuestas que repiten el error son
 *    posteriores al parche: por antigüedad son las primeras en caerse y son
 *    justamente las que no se pueden perder.
 *
 * El orden por defecto sigue siendo la más nueva primero, porque el panel le
 * promete a Pamela que lo que acaba de enseñar aplica en la próxima
 * conversación. Lo que cambia es que ahora se sabe quién quedó afuera.
 */
function seleccionarCorrecciones(filas, max = MAX_CORRECCIONES) {
  const activas = (filas || []).filter(c => c.activa !== false);
  const resueltas = activas.filter(c => c.resuelta_en_catalogo === true);
  const vivas = activas
    .filter(c => c.resuelta_en_catalogo !== true)
    .sort((a, b) => {
      if (Boolean(b.fijada) !== Boolean(a.fijada)) return Boolean(b.fijada) ? 1 : -1;
      return String(b.creado_en || '').localeCompare(String(a.creado_en || ''));
    });

  return {
    max,
    viajan: vivas.slice(0, max),
    desalojadas: vivas.slice(max),
    resueltas,
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
    // `select('*')` y el filtrado en memoria, no `.eq('resuelta_en_catalogo',
    // false)`: si la columna todavía no existe, la consulta falla entera y el
    // agente se queda sin NINGUNA corrección. Son 6 filas; filtrarlas acá no
    // cuesta nada.
    const { data } = await supabase
      .from('correcciones')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(100);

    const { viajan } = seleccionarCorrecciones(data);
    if (viajan.length === 0) return '';

    const ejemplos = viajan.map((c, i) => {
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

/** El estado del cupo, para que el panel avise antes de que se pierda algo. */
async function estadoCorrecciones(supabase = obtenerSupabase()) {
  const { data } = await supabase
    .from('correcciones')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(100);

  const { max, viajan, desalojadas, resueltas } = seleccionarCorrecciones(data);
  const resumir = (c) => ({ id: c.id, dijo: c.dijo, debio_decir: c.debio_decir });

  return {
    max,
    activas: viajan.length + desalojadas.length + resueltas.length,
    viajan: viajan.map(resumir),
    desalojadas: desalojadas.map(resumir),
    resueltas: resueltas.length,
    contradicciones: buscarContradicciones([...viajan, ...desalojadas]),
  };
}

// Los temas sobre los que una contradicción le cuesta plata a alguien. No es
// una lista de palabras bonitas: son los que ya aparecieron en el panel de
// Pamela, y los que un comprador usa para decidir.
const TEMAS = [
  ['techo propio', /techo propio/i],
  ['bono Mi Vivienda', /mi vivienda/i],
  ['la cuota inicial', /\binicial\b/i],
  ['la reserva', /\breserva\b/i],
  ['la etapa de la urbanización', /\betapas?\b/i],
  ['los requisitos de compra', /requisit/i],
  ['el precio al contado', /al contado/i],
  ['el título de propiedad', /\bt[íi]tulos?\b/i],
];

// "no trabajamos con", "no contamos con", "no aplica". Lo que convierte una
// frase sobre un tema en su contrario.
const NIEGA = /\bno\s+(se\s+)?(trabaj|cont(amos|ar)|manej|aplic|ten(emos|go)|hay|dispon|exist)/i;

/**
 * Correcciones que hablan del mismo tema diciendo cosas opuestas.
 *
 * Pasó de verdad y le estaba costando ventas: la corrección 1 decía
 * "actualmente no trabajo con proyectos en modalidad Techo Propio" y la 9
 * decía "en Torres de Parcona se puede acceder a bonos como Techo Propio".
 * Como al prompt solo entran las más nuevas, viajaba la 9 y el agente le
 * ofrecía a compradores reales un bono que la inmobiliaria no maneja.
 *
 * Nadie podía verlo: el panel las lista una debajo de otra, sin cruzarlas.
 */
/**
 * ¿La frase niega ESTE tema, o solo tiene un "no" en otra parte?
 *
 * La primera versión buscaba la negación en todo el texto y marcaba como
 * contradictorias dos correcciones que decían lo mismo: una dice "no trabajo
 * con Techo Propio, podemos trabajar con el bono Mi Vivienda" y la negación
 * es del primer tema, no del segundo. Hay que mirar alrededor de la palabra.
 */
function niegaElTema(texto, patron) {
  const frase = String(texto || '');
  const donde = frase.search(patron);
  if (donde < 0) return false;

  const ventana = frase.slice(Math.max(0, donde - 60), donde + 20);
  return NIEGA.test(ventana);
}

function buscarContradicciones(correcciones) {
  const choques = [];

  for (const [tema, patron] of TEMAS) {
    const hablan = correcciones.filter(c => patron.test(String(c.debio_decir || '')));
    if (hablan.length < 2) continue;

    const niegan = hablan.filter(c => niegaElTema(c.debio_decir, patron));
    const afirman = hablan.filter(c => !niegaElTema(c.debio_decir, patron));

    if (niegan.length > 0 && afirman.length > 0) {
      choques.push({
        tema,
        // La que dice que NO primero: suele ser la regla y la otra la excepción
        // mal escrita, y así Pamela lee el conflicto en el orden que importa.
        ids: [...niegan, ...afirman].map(c => c.id),
        niega: niegan[0].debio_decir,
        afirma: afirman[0].debio_decir,
      });
    }
  }

  return choques;
}

// ── Memoria del comprador ───────────────────────────────────────────

const ETIQUETA_USO = {
  vivienda: 'para vivir',
  inversion: 'para invertir',
  casa_de_verano: 'como casa de verano',
  comercial: 'para un negocio',
};

const ETIQUETA_PAGO = {
  contado: 'al contado',
  cuotas: 'en cuotas',
  credito_bancario: 'con crédito bancario',
};

/**
 * La ficha del comprador, armada como payload y no como párrafo.
 *
 * Lo que había antes era una frase ("no se lo vuelvas a preguntar") seguida
 * de un resumen sin ningún dato: los 47 resúmenes de la base no traen un
 * solo nombre, 10 son literalmente la misma frase ("Interesado en Torres de
 * Parcona, pregunta por precios y financiamiento") y el promedio es de 67
 * caracteres. Ese bloque solo podía desalentar el descubrimiento que
 * justamente falta — 2 de 302 respuestas preguntaron el presupuesto — y
 * gastaba tokens en cada turno.
 *
 * Ahora son dos listas: lo que ya se sabe y LO QUE TE FALTA SABER. El hueco
 * explícito en el payload es lo que el modelo lee; pedirle "conoce a la
 * persona" en prosa ya se probó y no alcanzó.
 */
function formatearMemoriaComprador(fila) {
  if (!fila) return '';

  const texto = (v) => String(v == null ? '' : v).trim();
  const nombre = texto(fila.nombre);
  const uso = texto(fila.uso) || 'sin_dato';
  const pago = texto(fila.forma_pago) || 'sin_dato';
  const presupuesto = texto(fila.presupuesto);
  const plazo = texto(fila.plazo);
  const objecion = texto(fila.objecion);
  const retomar = texto(fila.dato_para_retomar);
  const resumen = texto(fila.resumen);

  const sabe = [];
  if (nombre) sabe.push(`- Se llama ${nombre}`);
  if (ETIQUETA_USO[uso]) sabe.push(`- Lo quiere ${ETIQUETA_USO[uso]}`);
  if (ETIQUETA_PAGO[pago]) sabe.push(`- Dijo que pagaría ${ETIQUETA_PAGO[pago]}`);
  if (presupuesto) sabe.push(`- Presupuesto que dijo: ${presupuesto}`);
  if (plazo) sabe.push(`- Plazo que dijo: ${plazo}`);
  if (fila.ya_visito === true) sabe.push('- Ya estuvo en el terreno');
  if (objecion) sabe.push(`- Lo que lo frenó: "${objecion}"`);
  if (retomar) sabe.push(`- Dijo textual: "${retomar}"`);
  if (resumen) sabe.push(`- En conversaciones anteriores: ${resumen}`);

  const falta = [];
  if (!nombre) falta.push('su nombre');
  if (!ETIQUETA_USO[uso]) falta.push('si es para vivir o para invertir');
  if (!presupuesto) falta.push('cuánto tiene pensado invertir');
  if (!plazo) falta.push('para cuándo quiere comprar');

  // Un resumen genérico no es un dato propio: si lo único que hay es
  // "pregunta por precios", el bloque no aporta nada y encima le ordenaba al
  // modelo no indagar. En ese caso viaja solo la lista de lo que falta.
  const tieneDatoPropio = Boolean(
    nombre || presupuesto || plazo || objecion || retomar
    || ETIQUETA_USO[uso] || ETIQUETA_PAGO[pago] || fila.ya_visito === true,
  );

  if (!tieneDatoPropio) {
    if (falta.length === 0) return '';
    return '\n\nDE ESTA PERSONA NO SABES NADA TODAVÍA, aunque ya te escribió antes.'
      + `\nLO QUE TE FALTA SABER: ${falta.join(', ')}.`
      + '\nPregunta UNA sola de esas cosas en este mensaje, la que venga a cuento.';
  }

  let bloque = '\n\nLO QUE YA SABES DE ESTA PERSONA (lo dijo ella; no se lo vuelvas a preguntar):\n'
    + sabe.join('\n');

  if (falta.length) {
    bloque += `\n\nLO QUE TE FALTA SABER DE ELLA: ${falta.join(', ')}.`
      + '\nPregunta UNA sola de esas cosas en este mensaje, la que venga a cuento.';
  }

  return bloque;
}

/** Lo que ya sabemos de este comprador, de conversaciones anteriores. */
async function obtenerMemoriaComprador(numeroTelefono) {
  try {
    const supabase = obtenerSupabase();
    // `select('*')`: los campos nuevos de la ficha viajan en una migración
    // que se aplica a mano, y pedirlos por nombre antes de eso rompe el turno.
    const { data } = await supabase
      .from('compradores')
      .select('*')
      .eq('numero_telefono', numeroTelefono)
      .limit(1)
      .single();

    return formatearMemoriaComprador(data);
  } catch {
    // Sin memoria previa el agente funciona igual: no es un error.
    return '';
  }
}

module.exports = {
  analizarConversaciones,
  analizarPendientes,
  contarPendientes,
  leerCursor,
  fusionarResultados,
  obtenerCorreccionesParaPrompt,
  seleccionarCorrecciones,
  estadoCorrecciones,
  buscarContradicciones,
  obtenerMemoriaComprador,
  formatearMemoriaComprador,
  formatearConversaciones,
  esColumnaDesconocida,
  DESTINOS,
  MAX_MENSAJES,
  MAX_TANDAS,
  MAX_CORRECCIONES,
  MODELO_ANALISIS,
};
