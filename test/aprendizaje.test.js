const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { tieneVoseo } = require('./ayudas/voseo');
const { sinComentarios } = require('./ayudas/fuente');

const {
  analizarConversaciones, fusionarResultados, seleccionarCorrecciones,
  formatearMemoriaComprador, esColumnaDesconocida, leerCursor,
  DESTINOS, MAX_MENSAJES, MAX_CORRECCIONES, MODELO_ANALISIS,
} = require('../server/services/aprendizaje');

// ═══════════════════════════════════════════════════════════════════
//  Aprendizaje: el análisis tiene que AVANZAR
//
//  Lo medido sobre la base real: 925 mensajes, 9 corridas en la tabla
//  `analisis` y las tres últimas detenidas exacto en hasta_mensaje=400.
//  Los 525 mensajes más nuevos nunca se habían leído, y los compradores
//  que dijeron que sí a una visita son todos posteriores al 400.
// ═══════════════════════════════════════════════════════════════════

/** Una base de datos de mentira, con lo justo para este módulo. */
function crearSupabaseFalso({
  totalMensajes = 925,
  cursorGuardado = 400,
  correcciones = [],
  comprador = null,
  faltaColumnaDesde = false,
  faltanColumnasComprador = false,
} = {}) {
  const mensajes = Array.from({ length: totalMensajes }, (_, i) => ({
    id: i + 1,
    numero_telefono: `+5190000${String(i % 7).padStart(4, '0')}`,
    contenido_mensaje: `mensaje ${i + 1}`,
    remitente: i % 2 === 0 ? 'usuario' : 'asistente',
  }));

  const guardado = { analisis: [], compradores: [], intentos: [] };

  const errorColumna = (columna, tabla) => ({
    code: 'PGRST204',
    message: `Could not find the '${columna}' column of '${tabla}' in the schema cache`,
  });

  function resolver(q) {
    if (q.tabla === 'mensajes_whatsapp') {
      const piso = q.gt ? Number(q.gt.valor) : 0;
      const filtrados = mensajes.filter(m => m.id > piso);
      if (q.count) return { count: filtrados.length, data: null, error: null };
      return { data: filtrados.slice(0, q.limite ?? filtrados.length), error: null };
    }

    if (q.tabla === 'analisis') {
      if (q.insert) {
        guardado.intentos.push(Object.keys(q.insert));
        if (faltaColumnaDesde && 'desde_mensaje' in q.insert) {
          return { data: null, error: errorColumna('desde_mensaje', 'analisis') };
        }
        guardado.analisis.push(q.insert);
        return { data: null, error: null };
      }
      const filas = cursorGuardado > 0 ? [{ hasta_mensaje: cursorGuardado }] : [];
      return { data: filas, error: null };
    }

    if (q.tabla === 'compradores') {
      if (q.upsert) {
        guardado.intentos.push(Object.keys(q.upsert[0] || {}));
        if (faltanColumnasComprador && q.upsert.some(f => 'presupuesto' in f)) {
          return { data: null, error: errorColumna('presupuesto', 'compradores') };
        }
        guardado.compradores.push(...q.upsert);
        return { data: null, error: null };
      }
      return { data: comprador, error: null };
    }

    if (q.tabla === 'correcciones') return { data: correcciones, error: null };

    throw new Error(`tabla no prevista en el doble: ${q.tabla}`);
  }

  function from(tabla) {
    const q = { tabla };
    const cadena = {
      select(_cols, opciones) { if (opciones?.count) q.count = true; return cadena; },
      gt(col, valor) { q.gt = { col, valor }; return cadena; },
      eq(col, valor) { q.eq = { col, valor }; return cadena; },
      order(col, o) { q.order = { col, ascending: o?.ascending !== false }; return cadena; },
      limit(n) { q.limite = n; return cadena; },
      single() { q.single = true; return cadena; },
      insert(fila) { q.insert = fila; return cadena; },
      upsert(filas) { q.upsert = filas; return cadena; },
      then(cumple, falla) { return Promise.resolve().then(() => resolver(q)).then(cumple, falla); },
    };
    return cadena;
  }

  return { from, guardado };
}

/** El cliente de OpenAI de mentira: devuelve una tanda por llamada. */
function crearClienteFalso(respuestas) {
  const llamadas = [];
  const cliente = {
    chat: {
      completions: {
        create: async (args) => {
          llamadas.push(args);
          const i = Math.min(llamadas.length - 1, respuestas.length - 1);
          return { choices: [{ message: { content: JSON.stringify(respuestas[i]) } }] };
        },
      },
    },
  };
  return { obtenerCliente: () => cliente, llamadas };
}

const RESULTADO_VACIO = { huecos: [], fallas: [], compradores: [], resumen: 'sin novedades' };

test('el análisis arranca donde quedó el anterior, no en el mensaje más viejo', async () => {
  // El bug exacto: `.gt('id', 0)` ascendente con limit 400. Las tres últimas
  // corridas de la base releyeron los mensajes 1 al 400 y pagaron por eso.
  const supabase = crearSupabaseFalso({ totalMensajes: 925, cursorGuardado: 400 });
  const { obtenerCliente, llamadas } = crearClienteFalso([RESULTADO_VACIO]);

  const r = await analizarConversaciones({ obtenerCliente, supabase, tandas: 1 });

  assert.strictEqual(r.desde_mensaje, 400, 'tiene que arrancar en el cursor guardado');
  assert.strictEqual(r.hasta_mensaje, 800);
  assert.strictEqual(r.mensajes_analizados, 400);
  assert.strictEqual(llamadas.length, 1);

  const texto = llamadas[0].messages[1].content;
  assert.ok(texto.includes('mensaje 401'), 'el modelo tiene que ver el primer mensaje nuevo');
  assert.ok(!texto.includes('mensaje 400\n') && !texto.endsWith('mensaje 400'),
    'no tiene que volver a mandar lo ya analizado');
});

test('una sola corrida vacía el atraso de 525 mensajes en tandas', async () => {
  const supabase = crearSupabaseFalso({ totalMensajes: 925, cursorGuardado: 400 });
  const { obtenerCliente, llamadas } = crearClienteFalso([RESULTADO_VACIO, RESULTADO_VACIO, RESULTADO_VACIO]);

  const r = await analizarConversaciones({ obtenerCliente, supabase, tandas: 3 });

  assert.strictEqual(llamadas.length, 2, '525 mensajes entran en dos tandas de 400');
  assert.strictEqual(r.mensajes_analizados, 525);
  assert.strictEqual(r.hasta_mensaje, 925);
  assert.strictEqual(r.pendientes, 0);
  assert.strictEqual(r.faltan, false);
});

test('el tope de tandas corta la corrida y avisa cuánto falta', async () => {
  // Un clic no puede convertirse en una factura abierta: si queda atraso, se
  // dice y se vuelve a apretar.
  const supabase = crearSupabaseFalso({ totalMensajes: 2000, cursorGuardado: 0 });
  const { obtenerCliente, llamadas } = crearClienteFalso([RESULTADO_VACIO]);

  const r = await analizarConversaciones({ obtenerCliente, supabase, tandas: 2 });

  assert.strictEqual(llamadas.length, 2);
  assert.strictEqual(r.mensajes_analizados, 800);
  assert.strictEqual(r.faltan, true);
  assert.strictEqual(r.pendientes, 1200);
});

test('releer todo sigue siendo posible, pero hay que pedirlo con desde=0', async () => {
  const supabase = crearSupabaseFalso({ totalMensajes: 925, cursorGuardado: 400 });
  const { obtenerCliente, llamadas } = crearClienteFalso([RESULTADO_VACIO]);

  const r = await analizarConversaciones({ obtenerCliente, supabase, desdeMensaje: 0, tandas: 1 });

  assert.strictEqual(r.desde_mensaje, 0);
  assert.ok(llamadas[0].messages[1].content.includes('mensaje 1\n'));
});

test('sin mensajes nuevos no se llama al modelo ni se gasta un centavo', async () => {
  const supabase = crearSupabaseFalso({ totalMensajes: 925, cursorGuardado: 925 });
  const { obtenerCliente, llamadas } = crearClienteFalso([RESULTADO_VACIO]);

  const r = await analizarConversaciones({ obtenerCliente, supabase });

  assert.strictEqual(llamadas.length, 0);
  assert.strictEqual(r.sinDatos, true);
  assert.match(r.mensaje, /No hay mensajes nuevos/);
});

test('el modelo del análisis se puede cambiar por variable de entorno', async () => {
  assert.strictEqual(MODELO_ANALISIS(), 'gpt-4o', 'el valor por defecto no cambia');

  const previo = process.env.MODELO_ANALISIS;
  process.env.MODELO_ANALISIS = 'gpt-5-mini';
  try {
    const supabase = crearSupabaseFalso({ totalMensajes: 10, cursorGuardado: 0 });
    const { obtenerCliente, llamadas } = crearClienteFalso([RESULTADO_VACIO]);
    const r = await analizarConversaciones({ obtenerCliente, supabase, tandas: 1 });

    assert.strictEqual(llamadas[0].model, 'gpt-5-mini');
    assert.strictEqual(r.modelo, 'gpt-5-mini');
  } finally {
    if (previo === undefined) delete process.env.MODELO_ANALISIS;
    else process.env.MODELO_ANALISIS = previo;
  }
});

test('el análisis no se pierde si la migración todavía no se aplicó', async () => {
  // Las columnas nuevas se aplican a mano. Entre el despliegue y la
  // migración, la corrida tiene que guardar lo que sí puede.
  const supabase = crearSupabaseFalso({
    totalMensajes: 10, cursorGuardado: 0,
    faltaColumnaDesde: true, faltanColumnasComprador: true,
  });
  const { obtenerCliente } = crearClienteFalso([{
    ...RESULTADO_VACIO,
    compradores: [{
      numero_telefono: '+51900000001', nombre: 'Rosa', resumen: 'quiere lote en Parcona',
      uso: 'vivienda', forma_pago: 'cuotas', presupuesto: 'S/ 30,000', plazo: 'en dos meses',
      objecion: '', dato_para_retomar: 'lo quiero para mi hija', telefono_alternativo: '', ya_visito: false,
    }],
  }]);

  const r = await analizarConversaciones({ obtenerCliente, supabase, tandas: 1 });

  assert.strictEqual(r.sinDatos, false);
  assert.strictEqual(r.falta_migracion, true, 'el panel tiene que poder avisarlo');
  assert.strictEqual(supabase.guardado.analisis.length, 1, 'el informe se guardó igual');
  assert.ok(!('desde_mensaje' in supabase.guardado.analisis[0]));
  assert.strictEqual(supabase.guardado.compradores.length, 1, 'la ficha se guardó igual');
  assert.strictEqual(supabase.guardado.compradores[0].nombre, 'Rosa');
  assert.ok(!('presupuesto' in supabase.guardado.compradores[0]));
});

test('un error que no sea de columna faltante no se traga', async () => {
  const supabase = crearSupabaseFalso({ totalMensajes: 10, cursorGuardado: 0 });
  supabase.from = () => ({
    select: () => ({ gt: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'se cayó la base' } }) }) }) }),
  });
  const { obtenerCliente } = crearClienteFalso([RESULTADO_VACIO]);

  await assert.rejects(
    () => analizarConversaciones({ obtenerCliente, supabase, desdeMensaje: 0 }),
    /se cayó la base/,
  );
});

test('esColumnaDesconocida distingue la columna que falta de un error real', () => {
  assert.strictEqual(esColumnaDesconocida({ code: 'PGRST204', message: 'x' }), true);
  assert.strictEqual(esColumnaDesconocida({ code: '42703', message: 'x' }), true);
  assert.strictEqual(
    esColumnaDesconocida({ message: "column compradores.plazo does not exist" }), true);
  assert.strictEqual(esColumnaDesconocida({ message: 'permission denied' }), false);
  assert.strictEqual(esColumnaDesconocida(null), false);
});

test('el cursor sale del análisis más lejano, no del último por fecha', async () => {
  const supabase = crearSupabaseFalso({ cursorGuardado: 800 });
  assert.strictEqual(await leerCursor(supabase), 800);

  const sinCorridas = crearSupabaseFalso({ cursorGuardado: 0 });
  assert.strictEqual(await leerCursor(sinCorridas), 0);
});

// ═══════════════════════════════════════════════════════════════════
//  Fusión de tandas
// ═══════════════════════════════════════════════════════════════════

test('dos tandas se juntan en un informe y el hueco repetido suma personas', () => {
  // Si no se fusionan, el panel muestra solo la última tanda y los huecos de
  // la primera quedan en una fila que nadie abre. Y "cuántas personas lo
  // preguntaron" es la cifra con la que se decide qué cargar primero.
  const fusion = fusionarResultados([
    {
      huecos: [{ pregunta: '¿Trabajan con Techo Propio?', veces: 2, gravedad: 'media', respuesta_sugerida: '' }],
      fallas: [{ que_paso: 'inventó una etapa', tipo: 'contenido', gravedad: 'alta', ejemplo: 'a' }],
      compradores: [{ numero_telefono: '+51900000001', resumen: 'viejo' }],
      resumen: 'Primera mitad.',
    },
    {
      huecos: [{ pregunta: '¿Trabajan con techo propio?', veces: 3, gravedad: 'alta', respuesta_sugerida: 'No trabajamos Techo Propio' }],
      fallas: [{ que_paso: 'repitió la ficha', tipo: 'conducta', gravedad: 'media', ejemplo: 'b' }],
      compradores: [{ numero_telefono: '+51900000001', resumen: 'nuevo' }],
      resumen: 'Segunda mitad.',
    },
  ]);

  assert.strictEqual(fusion.huecos.length, 1, 'la misma pregunta no se cuenta dos veces');
  assert.strictEqual(fusion.huecos[0].veces, 5);
  assert.strictEqual(fusion.huecos[0].gravedad, 'alta', 'gana la gravedad más alta');
  assert.strictEqual(fusion.huecos[0].respuesta_sugerida, 'No trabajamos Techo Propio');
  assert.strictEqual(fusion.fallas.length, 2);
  assert.strictEqual(fusion.compradores.length, 1);
  assert.strictEqual(fusion.compradores[0].resumen, 'nuevo', 'la ficha más nueva gana');
  assert.match(fusion.resumen, /Primera mitad\. Segunda mitad\./);
});

test('fusionar una sola tanda la devuelve tal cual, y ninguna no revienta', () => {
  const una = { huecos: [], fallas: [], compradores: [], resumen: 'x' };
  assert.strictEqual(fusionarResultados([una]), una);
  assert.deepStrictEqual(fusionarResultados([]), { huecos: [], fallas: [], compradores: [], resumen: '' });
  assert.doesNotThrow(() => fusionarResultados(null));
});

// ═══════════════════════════════════════════════════════════════════
//  El cupo de las correcciones
//
//  MAX_CORRECCIONES es 6 y hay exactamente 6 cargadas en la base: la
//  séptima desalojaba a otra en silencio y Pamela veía la fila en el
//  panel asumiendo que el agente ya había aprendido.
// ═══════════════════════════════════════════════════════════════════

const CORRECCIONES_REALES = [
  { id: 6, dijo: 'cuota de S/1,200 en Chacarilla', debio_decir: '20% y 72 cuotas de S/889', activa: true, creado_en: '2026-10-04T03:54:58Z' },
  { id: 5, dijo: 'Los requisitos son: financiamiento', debio_decir: 'DNI vigente, recibo de luz y voucher', activa: true, creado_en: '2026-09-26T03:36:33Z' },
  { id: 4, dijo: 'el plan va desde el 1%', debio_decir: 'la inicial es la de cada proyecto', activa: true, creado_en: '2026-09-26T03:33:44Z' },
  { id: 3, dijo: 'inicial del 1% del valor del lote', debio_decir: 'el 1% es la reserva, no la inicial', activa: true, creado_en: '2026-09-25T18:22:48Z' },
  { id: 2, dijo: 'lotes de la primera etapa', debio_decir: 'son de la tercera etapa', activa: true, creado_en: '2026-09-25T17:56:23Z' },
  { id: 1, dijo: 'no tengo esa información de Techo Propio', debio_decir: 'no trabajamos Techo Propio', activa: true, creado_en: '2026-09-25T17:55:16Z' },
];

test('la séptima corrección no desaloja a otra en silencio: queda nombrada', () => {
  const septima = {
    id: 7, dijo: 'el punto de encuentro lo confirma un asesor',
    debio_decir: 'nos vemos en la entrada del proyecto', activa: true, creado_en: '2026-10-26T10:00:00Z',
  };

  const { viajan, desalojadas, max } = seleccionarCorrecciones([septima, ...CORRECCIONES_REALES]);

  assert.strictEqual(max, MAX_CORRECCIONES);
  assert.strictEqual(viajan.length, 6);
  assert.strictEqual(desalojadas.length, 1, 'el panel tiene que poder decir cuál quedó afuera');
  assert.strictEqual(desalojadas[0].id, 1);
  assert.ok(viajan.some(c => c.id === 7), 'lo que Pamela acaba de enseñar sí viaja');
});

test('marcar una corrección como ya cargada en el catálogo libera su cupo', () => {
  const resuelta = { ...CORRECCIONES_REALES[1], resuelta_en_catalogo: true };
  const septima = { id: 7, dijo: 'a', debio_decir: 'b', activa: true, creado_en: '2026-10-26T10:00:00Z' };
  const lista = [septima, CORRECCIONES_REALES[0], resuelta, ...CORRECCIONES_REALES.slice(2)];

  const { viajan, desalojadas, resueltas } = seleccionarCorrecciones(lista);

  assert.strictEqual(resueltas.length, 1);
  assert.strictEqual(desalojadas.length, 0, 'con una resuelta entran las seis que siguen vivas');
  assert.ok(!viajan.some(c => c.id === resuelta.id), 'la resuelta no ocupa lugar en el prompt');
  assert.ok(viajan.some(c => c.id === 1), 'la más vieja viva vuelve a entrar');
});

test('una corrección fijada no se cae aunque sea la más vieja', () => {
  // Las correcciones 3 y 4 (que el 1% es la reserva) son del 25 de septiembre
  // y 7 de las 8 respuestas que repiten el error son posteriores al parche:
  // por antigüedad son las primeras en caerse y son las que no se pueden
  // perder.
  const fijada = { ...CORRECCIONES_REALES[5], fijada: true };
  const nuevas = [7, 8].map(id => ({
    id, dijo: 'x', debio_decir: 'y', activa: true, creado_en: `2026-10-2${id}T10:00:00Z`,
  }));

  const { viajan, desalojadas } = seleccionarCorrecciones([...nuevas, ...CORRECCIONES_REALES.slice(0, 5), fijada]);

  assert.strictEqual(viajan[0].id, fijada.id, 'la fijada va primera');
  assert.ok(!desalojadas.some(c => c.id === fijada.id));
  assert.strictEqual(desalojadas.length, 2);
});

test('las correcciones desactivadas no ocupan cupo', () => {
  const lista = CORRECCIONES_REALES.map((c, i) => (i < 3 ? { ...c, activa: false } : c));
  const { viajan, desalojadas } = seleccionarCorrecciones(lista);

  assert.strictEqual(viajan.length, 3);
  assert.strictEqual(desalojadas.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
//  La memoria del comprador
//
//  Los 47 resúmenes de la base no tienen un solo nombre, 10 son
//  literalmente la misma frase y el promedio es de 67 caracteres. Ese
//  bloque entraba al prompt con un "no se lo vuelvas a preguntar" y lo
//  único que podía hacer era frenar la calificación.
// ═══════════════════════════════════════════════════════════════════

test('un resumen genérico ya no le ordena al agente dejar de preguntar', () => {
  const memoria = formatearMemoriaComprador({
    numero_telefono: '+51924129355',
    nombre: null,
    resumen: 'Interesado en Torres de Parcona, pregunta por precios y financiamiento.',
    uso: 'sin_dato', forma_pago: 'sin_dato', presupuesto: null, plazo: null, ya_visito: false,
  });

  assert.ok(!memoria.includes('no se lo vuelvas a preguntar'),
    'sin un dato propio, prohibir preguntar es lo peor que puede hacer');
  assert.match(memoria, /LO QUE TE FALTA SABER/);
  assert.match(memoria, /su nombre/);
  assert.match(memoria, /cuánto tiene pensado invertir/);
  assert.match(memoria, /para cuándo quiere comprar/);
});

test('una ficha con datos reales sí viaja, con la frase del comprador citada', () => {
  // El caso extremo medido: ...4782 dijo "estuvo allí la semana pasada y a mi
  // esposa le gustó la ubicación" y eso no quedó en ningún campo.
  const memoria = formatearMemoriaComprador({
    nombre: 'Luis',
    resumen: 'Quiere cuatro lotes juntos en Torres de Parcona.',
    uso: 'inversion',
    forma_pago: 'cuotas',
    presupuesto: 'el 25% de inicial',
    plazo: '36 meses',
    objecion: 'está lejos del colegio',
    dato_para_retomar: 'estuve allí la semana pasada y a mi esposa le gustó la ubicación',
    ya_visito: true,
  });

  assert.match(memoria, /Se llama Luis/);
  assert.match(memoria, /para invertir/);
  assert.match(memoria, /en cuotas/);
  assert.match(memoria, /el 25% de inicial/);
  assert.match(memoria, /Ya estuvo en el terreno/);
  assert.match(memoria, /a mi esposa le gustó la ubicación/);
  assert.match(memoria, /no se lo vuelvas a preguntar/);
  assert.ok(!memoria.includes('LO QUE TE FALTA SABER'), 'con todo cargado no hay lista de faltantes');
});

test('una ficha a medias pide UNA sola cosa, no las cuatro', () => {
  const memoria = formatearMemoriaComprador({
    nombre: 'Rosa', resumen: '', uso: 'vivienda', forma_pago: 'sin_dato',
    presupuesto: null, plazo: null, ya_visito: false,
  });

  assert.match(memoria, /Se llama Rosa/);
  assert.match(memoria, /LO QUE TE FALTA SABER DE ELLA/);
  assert.match(memoria, /Pregunta UNA sola/);
  assert.ok(!memoria.includes('su nombre'), 'lo que ya se sabe no se vuelve a pedir');
});

test('sin ficha en la base la memoria no manda nada al prompt', () => {
  assert.strictEqual(formatearMemoriaComprador(null), '');
  assert.strictEqual(formatearMemoriaComprador(undefined), '');
});

// ═══════════════════════════════════════════════════════════════════
//  El panel y el análisis tienen que hablar el mismo idioma
// ═══════════════════════════════════════════════════════════════════

const RUTA_PANEL = path.join(__dirname, '..', 'client', 'src', 'components', 'TabAprendizaje.jsx');
const PANEL = fs.readFileSync(RUTA_PANEL, 'utf8');

test('cada destino que puede devolver el análisis tiene instrucciones en el panel', () => {
  // El hueco decía "Cargar en: FAQ" y nada más. Ahora el destino es un dato
  // con enum, y si alguien agrega uno al esquema sin explicarlo en el panel,
  // Pamela vuelve a quedar con una etiqueta que no le dice dónde cargar.
  for (const destino of DESTINOS) {
    if (destino === 'no_se_sabe') continue;
    assert.ok(PANEL.includes(destino), `al panel le falta cómo cargar "${destino}"`);
  }
});

test('el panel no ofrece corregir una falla de conducta', () => {
  // El botón rellenaba el formulario con una frase que estuvo BIEN y la
  // guardaba como prohibida: arreglaba la repetición degradando la mejor
  // respuesta que tenía el agente.
  // Sobre el código, no sobre los comentarios: el comentario que explica por
  // qué se quitó el botón nombra el botón, y la primera versión de esta prueba
  // se marcaba a sí misma con él.
  const codigo = sinComentarios(PANEL);
  const seccionConducta = codigo.slice(codigo.indexOf('fallasConducta.map'));
  assert.ok(!seccionConducta.slice(0, 1600).includes('Corregir esta respuesta'));
  assert.ok(PANEL.includes('fallasContenido'), 'las de contenido sí se corrigen');
});

test('el panel ya no promete leer todas las conversaciones', () => {
  assert.ok(!PANEL.includes('Lee todas las conversaciones'),
    'releía los 400 más viejos: decirlo así era mentira');
  assert.ok(PANEL.includes('Analizar lo nuevo') && PANEL.includes('Releer todo'));
  assert.ok(PANEL.includes('Última vez'), 'tiene que verse cuándo se analizó');
});

test('nada de voseo argentino en los archivos del aprendizaje', () => {
  const archivos = [
    'server/services/aprendizaje.js',
    'server/routes/aprendizaje.js',
    'client/src/components/TabAprendizaje.jsx',
  ];
  // Ojo con el \b final: el de JavaScript es ASCII, así que después de una
  // vocal con tilde SIEMPRE encuentra un límite de palabra y /\bdecí\b/ da
  // positivo dentro de "decía", que es castellano perfectamente normal. Es la
  // tercera vez que este detalle muerde en este proyecto. Con el lookahead, el
  // patrón solo acepta la forma del voseo, donde la palabra termina ahí.
  // El detector vive en test/ayudas/voseo.js.


  for (const archivo of archivos) {
    const contenido = fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
    const linea = contenido.split('\n').findIndex(l => tieneVoseo(l));
    assert.strictEqual(linea, -1,
      `${archivo}:${linea + 1} tiene voseo: ${contenido.split('\n')[linea]}`);
  }
});

test('el lote de mensajes por tanda sigue acotado', () => {
  // 400 mensajes son unos 22 mil tokens de entrada, medido sobre los que
  // estaban sin analizar. Subirlo mucho pone en riesgo el contexto y la
  // factura de cada corrida.
  assert.ok(MAX_MENSAJES > 0 && MAX_MENSAJES <= 600, `son ${MAX_MENSAJES}`);
});
