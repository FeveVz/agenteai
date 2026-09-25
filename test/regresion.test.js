const test = require('node:test');
const assert = require('node:assert');

const { buscarPorNombre, normalizar } = require('../server/utils/proyectos');
const { construirRemitente, parsearDestinatarios } = require('../server/services/email');

// ═══════════════════════════════════════════════════════════════════
//  Búsqueda de proyectos
//
//  Antes esto era `.ilike('nombre', `%${valor}%`)` con `.limit(1)`.
//  Cada test de acá corresponde a una forma concreta en que eso fallaba.
// ═══════════════════════════════════════════════════════════════════

const CATALOGO = [
  { nombre: 'Altos de Sacta' },
  { nombre: 'Los Sauces' },
  { nombre: 'Casa Sauces' },
  { nombre: 'Los Álamos' },
];

test('un nombre que coincide con varios proyectos se marca ambiguo, no se elige uno', () => {
  // El bug que esto previene: Ceinys tiene "Los Sauces" Y "Casa Sauces".
  // Con ILIKE '%Sauces%' LIMIT 1 el agente mandaba las fotos de uno de los
  // dos, al azar, y el cliente veía los renders del proyecto equivocado.
  const r = buscarPorNombre(CATALOGO, 'Sauces');

  assert.strictEqual(r.ambiguo, true);
  assert.deepStrictEqual(
    r.coincidencias.map(p => p.nombre).sort(),
    ['Casa Sauces', 'Los Sauces']
  );
});

test('el match exacto gana aunque el nombre sea subcadena de otro', () => {
  const r = buscarPorNombre(CATALOGO, 'Los Sauces');
  assert.strictEqual(r.ambiguo, false);
  assert.strictEqual(r.coincidencias[0].nombre, 'Los Sauces');
});

test('los comodines de LIKE no matchean nada', () => {
  // El endpoint público de reserva toma `proyecto` del body. Con ilike
  // crudo, un {"proyecto": "%"} matcheaba el catálogo entero y la visita
  // se reservaba contra el primero de la lista.
  for (const comodin of ['%', '_', '%%', '%a%', '*']) {
    assert.strictEqual(
      buscarPorNombre(CATALOGO, comodin).coincidencias.length, 0,
      `"${comodin}" no debería matchear ningún proyecto`
    );
  }
});

test('la búsqueda ignora tildes en ambos sentidos', () => {
  // ILIKE no es insensible a tildes. Con un catálogo de varias
  // constructoras el modelo escribe "Los Alamos" y no matcheaba nada.
  assert.strictEqual(buscarPorNombre(CATALOGO, 'Los Alamos').coincidencias[0].nombre, 'Los Álamos');
  assert.strictEqual(buscarPorNombre(CATALOGO, 'los álamos').coincidencias[0].nombre, 'Los Álamos');
});

test('una consulta vacía no devuelve todo el catálogo', () => {
  for (const vacio of ['', '   ', null, undefined]) {
    assert.strictEqual(buscarPorNombre(CATALOGO, vacio).coincidencias.length, 0);
  }
});

test('un catálogo vacío o ausente no rompe', () => {
  assert.strictEqual(buscarPorNombre([], 'Sauces').coincidencias.length, 0);
  assert.strictEqual(buscarPorNombre(null, 'Sauces').coincidencias.length, 0);
});

test('normalizar deja los nombres comparables', () => {
  assert.strictEqual(normalizar('  Los   ÁLAMOS '), 'los alamos');
});

test('la ñ se conserva: "Cañete" y "Canete" son proyectos distintos', () => {
  // La ñ es una letra propia, no una n acentuada. Si se la comiera junto con
  // las tildes, dos proyectos con esos nombres colisionarían y los dos
  // quedarían imposibles de agendar. En Perú, Cañete es una provincia de Lima.
  assert.notStrictEqual(normalizar('Cañete'), normalizar('Canete'));
  assert.strictEqual(normalizar('Cañete'), 'cañete');

  const conAmbos = [{ nombre: 'Cañete Norte' }, { nombre: 'Canete Sur' }];
  const r = buscarPorNombre(conAmbos, 'Cañete Norte');
  assert.strictEqual(r.ambiguo, false);
  assert.strictEqual(r.coincidencias[0].nombre, 'Cañete Norte');
});

test('el archivo del util no tiene bytes nulos ni caracteres de control', () => {
  // Un centinela U+0000 en el fuente hacía que git y grep lo trataran como
  // binario, y eso deja los diffs de este archivo ilegibles en las revisiones.
  const fuente = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'server', 'utils', 'proyectos.js'), 'utf8');
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(fuente), 'hay caracteres de control en el fuente');
});

// ═══════════════════════════════════════════════════════════════════
//  Remitente del correo
// ═══════════════════════════════════════════════════════════════════

test('un nombre con coma queda entrecomillado', () => {
  // Sin comillar, la coma se lee como separador de direcciones y Resend
  // rechaza el envío con un 422. "Barrios & Asociados, S.A.C." es un
  // nombre comercial peruano perfectamente normal.
  delete process.env.RESEND_FROM;
  const from = construirRemitente('Barrios & Asociados, S.A.C.');
  assert.strictEqual(from, '"Barrios & Asociados, S.A.C." <onboarding@resend.dev>');
});

test('las comillas del nombre se escapan', () => {
  delete process.env.RESEND_FROM;
  assert.strictEqual(construirRemitente('El "Buen" Lote'), '"El \\"Buen\\" Lote" <onboarding@resend.dev>');
});

test('un salto de línea en el nombre no inyecta cabeceras', () => {
  delete process.env.RESEND_FROM;
  const from = construirRemitente('Pamela\r\nBcc: fuga@ejemplo.com');
  assert.ok(!from.includes('\n') && !from.includes('\r'), `no debe traer saltos: ${JSON.stringify(from)}`);
});

test('sin nombre cargado cae a la casilla pelada, no a una marca ajena', () => {
  delete process.env.RESEND_FROM;
  for (const vacio of ['', '   ', null, undefined]) {
    assert.strictEqual(construirRemitente(vacio), 'onboarding@resend.dev');
  }
});

test('RESEND_FROM manda por encima de todo', () => {
  process.env.RESEND_FROM = 'Pamela Barrios <visitas@ejemplo.pe>';
  assert.strictEqual(construirRemitente('Otra Cosa'), 'Pamela Barrios <visitas@ejemplo.pe>');
  delete process.env.RESEND_FROM;
});

test('los destinatarios se separan y se filtra lo que no es email', () => {
  assert.deepStrictEqual(
    parsearDestinatarios('a@x.com, no-es-un-mail; b@y.pe\nc@z.org'),
    ['a@x.com', 'b@y.pe', 'c@z.org']
  );
  assert.deepStrictEqual(parsearDestinatarios(''), []);
  assert.deepStrictEqual(parsearDestinatarios(null), []);
});

// ═══════════════════════════════════════════════════════════════════
//  Horario de atención configurable
//
//  Estaba clavado en el código (09:00–17:00, todos los días). Cada
//  clienta atiende distinto, y una que no trabaja domingos no puede
//  tener un calendario que se los ofrezca.
// ═══════════════════════════════════════════════════════════════════

const {
  resolverHorario, describirHorario, esDiaDeAtencion, generarHorariosDelDia,
} = require('../server/utils/fechas');

test('una configuración vacía atiende todos los días, no solo domingo', () => {
  // El bug: ''.split(',') devuelve [''], y Number('') es 0, que es domingo.
  // Una base recién creada terminaba atendiendo únicamente los domingos.
  for (const vacio of [{}, { dias_atencion: '' }, { dias_atencion: null }]) {
    assert.deepStrictEqual(resolverHorario(vacio).dias, [0, 1, 2, 3, 4, 5, 6]);
  }
});

test('los días configurados se respetan', () => {
  const lunASab = resolverHorario({ dias_atencion: '1,2,3,4,5,6' });
  assert.strictEqual(describirHorario(lunASab), 'De lunes a sábado, de 09:00 a 17:00');
  assert.strictEqual(esDiaDeAtencion('2026-09-13', lunASab), false); // domingo
  assert.strictEqual(esDiaDeAtencion('2026-09-12', lunASab), true);  // sábado
});

test('los turnos salen del paso configurado', () => {
  const cada60 = resolverHorario({ hora_apertura: 8, hora_cierre: 12, minutos_por_slot: 60 });
  assert.deepStrictEqual(generarHorariosDelDia(cada60), ['08:00', '09:00', '10:00', '11:00', '12:00']);

  const cada15 = resolverHorario({ hora_apertura: 9, hora_cierre: 10, minutos_por_slot: 15 });
  assert.deepStrictEqual(generarHorariosDelDia(cada15), ['09:00', '09:15', '09:30', '09:45', '10:00']);
});

test('una configuración inválida no deja el calendario vacío', () => {
  // Esto lo edita una persona desde el panel: un cierre antes de la apertura
  // no puede producir cero turnos sin ninguna explicación.
  const invertido = resolverHorario({ hora_apertura: 17, hora_cierre: 9 });
  assert.ok(generarHorariosDelDia(invertido).length >= 1);

  const basura = resolverHorario({ hora_apertura: 'x', hora_cierre: 99, minutos_por_slot: 0 });
  assert.strictEqual(basura.apertura, 9);
  assert.strictEqual(basura.cierre, 17);
  assert.strictEqual(basura.minutos_por_slot, 30);
});

test('el texto del horario se deriva de los mismos datos que el calendario', () => {
  // Nunca un campo de texto suelto: uno que dijera "lunes a sábado" mientras
  // el calendario ofrece domingos es una contradicción que el cliente
  // descubre recién cuando ya reservó.
  assert.strictEqual(describirHorario(resolverHorario({ dias_atencion: '0,1,2,3,4,5,6' })), 'Todos los días, de 09:00 a 17:00');
  assert.strictEqual(describirHorario(resolverHorario({ dias_atencion: '6' })), 'Solo sábado, de 09:00 a 17:00');
  assert.strictEqual(describirHorario(resolverHorario({ dias_atencion: '1,3,5' })), 'lunes, miércoles y viernes, de 09:00 a 17:00');
});

// ═══════════════════════════════════════════════════════════════════
//  Subida de imágenes
//
//  El endpoint emite un token para escribir en Storage. Tiene que estar
//  detrás del login y rechazar lo inválido ANTES de hablar con Supabase.
// ═══════════════════════════════════════════════════════════════════

test('el endpoint de subida exige login y valida antes de tocar Supabase', async () => {
  process.env.PANEL_PASSWORD = 'clave-de-test';
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'no-se-usa-en-este-test';

  const app = require('../server/app');
  const { crearToken } = require('../server/middleware/auth');
  const servidor = app.listen(0);
  await new Promise(r => servidor.once('listening', r));
  const base = `http://127.0.0.1:${servidor.address().port}/api/archivos/firma`;

  const pedir = (cuerpo, token) => fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo),
  });

  try {
    const valido = { carpeta: 'pagos', tipo: 'image/jpeg', tamano: 1000 };

    // Sin sesión: nadie de afuera puede pedir tokens de escritura.
    assert.strictEqual((await pedir(valido)).status, 401);

    const token = crearToken();
    const casos = [
      [{ ...valido, carpeta: '../../etc' }, 'carpeta fuera de la lista'],
      [{ ...valido, carpeta: 'otra' }, 'carpeta desconocida'],
      [{ ...valido, tipo: 'application/x-msdownload' }, 'ejecutable'],
      [{ ...valido, tipo: 'image/svg+xml' }, 'SVG (puede traer scripts)'],
      [{ ...valido, tamano: 6 * 1024 * 1024 }, 'más de 5 MB'],
      [{ ...valido, tamano: -1 }, 'tamaño negativo'],
      [{ ...valido, tamano: 'mucho' }, 'tamaño no numérico'],
    ];
    for (const [cuerpo, motivo] of casos) {
      assert.strictEqual((await pedir(cuerpo, token)).status, 400, `debería rechazar: ${motivo}`);
    }
  } finally {
    await new Promise(r => servidor.close(r));
    delete process.env.PANEL_PASSWORD;
  }
});

// ═══════════════════════════════════════════════════════════════════
//  Identidad del agente
//
//  Un solo repositorio atiende a varias clientas. El respaldo del
//  nombre estaba clavado en "Valeria", el agente de Ceinys: cualquier
//  clienta que no cargara el campo terminaba presentándose con el
//  nombre de otra empresa ante sus propios compradores.
// ═══════════════════════════════════════════════════════════════════

const { construirSystemPrompt } = require('../server/services/openai');

const CONFIG_BASE = {
  nombre_agencia: 'Pamela Barrios',
  tipo_negocio: 'asesora inmobiliaria en Ica',
  hora_apertura: 9, hora_cierre: 17, minutos_por_slot: 30, dias_atencion: '0,1,2,3,4,5,6',
};

test('el agente usa el nombre cargado en la configuración', () => {
  const prompt = construirSystemPrompt('+51900000000', { ...CONFIG_BASE, nombre_agente: 'Camila' }, []);
  assert.match(prompt, /Eres Camila, la asesora virtual de Pamela Barrios/);
});

test('sin nombre cargado no se cuela el de otra clienta', () => {
  for (const vacio of [null, undefined, '', '   ']) {
    const prompt = construirSystemPrompt('+51900000000', { ...CONFIG_BASE, nombre_agente: vacio }, []);
    assert.doesNotMatch(prompt, /Valeria/i, `con nombre_agente = ${JSON.stringify(vacio)}`);
    assert.match(prompt, /Eres la asesora virtual de Pamela Barrios/);
    // Sin nombre no puede quedar una coma huérfana: "Eres , la asesora...".
    assert.doesNotMatch(prompt, /Eres\s*,/);
  }
});

test('el rubro tampoco cae al de otra clienta', () => {
  const prompt = construirSystemPrompt('+51900000000', { ...CONFIG_BASE, tipo_negocio: '' }, []);
  assert.doesNotMatch(prompt, /constructora e inmobiliaria peruana/i);
  assert.doesNotMatch(prompt, /,\s*\.\s/, 'no debe quedar puntuación suelta al faltar el rubro');
});

test('ningún nombre propio de otra clienta sobrevive en el código del prompt', () => {
  const fuente = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'server', 'services', 'openai.js'), 'utf8');
  // Solo el código ejecutable: los comentarios explican justamente este bug.
  const sinComentarios = fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  for (const marca of ['Valeria', 'Ceinys']) {
    assert.doesNotMatch(sinComentarios, new RegExp(`['"\`][^'"\`]*${marca}`, 'i'),
      `"${marca}" no puede aparecer en un literal del prompt`);
  }
});

test('ninguna marca de otra clienta sobrevive en el cliente', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const raiz = path.join(__dirname, '..', 'client', 'src');

  const archivos = [];
  (function recorrer(dir) {
    for (const entrada of fs.readdirSync(dir)) {
      const p = path.join(dir, entrada);
      if (fs.statSync(p).isDirectory()) recorrer(p);
      else if (/\.(jsx?|css)$/.test(p)) archivos.push(p);
    }
  })(raiz);

  // Nombres propios de clientas y de sus proyectos. El panel y la landing son
  // código compartido: lo que quede clavado acá lo ve otra clienta en su
  // propio despliegue. Los comentarios sí pueden nombrarlos: explican el bug.
  const PROHIBIDAS = ['Ceinys', 'ceinys', 'Valeria', 'Sacta', 'Carhuaz', 'Sauces', 'Paracas'];
  const hallazgos = [];

  for (const archivo of archivos) {
    const lineas = fs.readFileSync(archivo, 'utf8').split('\n');
    let enBloque = false;
    lineas.forEach((linea, i) => {
      const limpia = linea.trim();
      if (enBloque) { if (limpia.includes('*/')) enBloque = false; return; }
      // Los comentarios de JSX abren con `{/*`, no con `/*`, y suelen ocupar
      // varias lineas: sin contemplarlos, la continuacion parece codigo.
      if (limpia.startsWith('/*') || limpia.startsWith('{/*')) {
        if (!limpia.includes('*/')) enBloque = true;
        return;
      }
      if (limpia.startsWith('//') || limpia.startsWith('*')) return;
      for (const marca of PROHIBIDAS) {
        if (linea.includes(marca)) {
          hallazgos.push(`${path.relative(raiz, archivo)}:${i + 1}  ${marca}`);
        }
      }
    });
  }

  assert.deepStrictEqual(hallazgos, [], 'marcas ajenas en el cliente:\n  ' + hallazgos.join('\n  '));
});

// ═══════════════════════════════════════════════════════════════════
//  Formato de la respuesta
//
//  El prompt no tenía ninguna regla de formato: el modelo devolvía
//  párrafos corridos, que en un celular nadie lee. La base vive en el
//  código para que una clienta nueva no arranque sin formato, y
//  `estilo_respuesta` la ajusta desde el panel sin desplegar.
// ═══════════════════════════════════════════════════════════════════

test('el formato base viaja siempre, aunque no haya nada configurado', () => {
  const prompt = construirSystemPrompt('+51900000000', CONFIG_BASE, []);
  assert.match(prompt, /FORMATO DEL MENSAJE/);
  assert.match(prompt, /\*negrita\*/);
  assert.match(prompt, /una l[íi]nea en blanco/i);
});

test('el formato prohíbe el markdown que WhatsApp no entiende', () => {
  const prompt = construirSystemPrompt('+51900000000', CONFIG_BASE, []);
  // WhatsApp muestra `## titulo` y `[texto](url)` tal cual: quedan peor que
  // el párrafo corrido que el formato viene a arreglar.
  assert.match(prompt, /Nada de Markdown/);
  assert.match(prompt, /##/);
  assert.match(prompt, /\[texto\]\(url\)/);
});

test('el estilo de la clienta se suma al base y manda sobre él', () => {
  const prompt = construirSystemPrompt('+51900000000',
    { ...CONFIG_BASE, estilo_respuesta: 'Sin emojis de dinero.' }, []);
  assert.match(prompt, /FORMATO DEL MENSAJE/, 'el base no puede desaparecer');
  assert.match(prompt, /AJUSTES DE ESTILO DE PAMELA BARRIOS/);
  assert.match(prompt, /Sin emojis de dinero\./);
  // El orden importa: lo de la clienta va después, para que gane.
  assert.ok(prompt.indexOf('AJUSTES DE ESTILO') > prompt.indexOf('FORMATO DEL MENSAJE'));
});

test('un estilo en blanco no deja un encabezado huérfano', () => {
  for (const vacio of [null, undefined, '', '   ']) {
    const prompt = construirSystemPrompt('+51900000000', { ...CONFIG_BASE, estilo_respuesta: vacio }, []);
    assert.doesNotMatch(prompt, /AJUSTES DE ESTILO/, `con estilo_respuesta = ${JSON.stringify(vacio)}`);
  }
});

test('el panel puede guardar el estilo', () => {
  const ruta = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'server', 'routes', 'configuracion.js'), 'utf8');
  // Sin esto el campo se edita en el panel, se ve guardado y nunca llega a
  // la base: el PUT descarta en silencio todo lo que no lista.
  assert.ok(/estilo_respuesta[^=]*\}\s*=\s*req\.body/s.test(ruta),
    'el PUT tiene que leer estilo_respuesta del body');
  assert.ok(ruta.includes('actualizacion.estilo_respuesta = estilo_respuesta'),
    'el PUT tiene que escribirlo en la base');
});

test('el formato prohíbe el doble asterisco de Markdown', () => {
  const prompt = construirSystemPrompt('+51900000000', CONFIG_BASE, []);
  // El modelo escribía "**Inicial**" por reflejo de Markdown y el comprador
  // veía los asteriscos crudos. Decirle que use *negrita* no alcanzaba:
  // hay que prohibirle la otra forma con todas las letras.
  assert.match(prompt, /UN SOLO asterisco/);
  assert.match(prompt, /NUNCA uses dos/);
  assert.match(prompt, /Nada de Markdown/);
});

// ═══════════════════════════════════════════════════════════════════
//  Formato de salida hacia WhatsApp
//
//  Los casos de acá salieron de conversaciones reales: son mensajes
//  que compradores de Pamela recibieron con los asteriscos y los
//  corchetes a la vista. Al prompt se le pidió dos veces que no usara
//  Markdown y siguió haciéndolo, así que el resultado se garantiza en
//  código.
// ═══════════════════════════════════════════════════════════════════

const { limpiarWhatsApp } = require('../server/utils/formatoWhatsApp');

test('la negrita de Markdown pasa a la de WhatsApp', () => {
  assert.strictEqual(limpiarWhatsApp('📍 **Ubicación:** Parcona'), '📍 *Ubicación:* Parcona');
  assert.strictEqual(limpiarWhatsApp('***muy fuerte***'), '*muy fuerte*');
  assert.strictEqual(limpiarWhatsApp('__cursiva__'), '_cursiva_');
});

test('los enlaces con texto se abren, conservando la frase', () => {
  assert.strictEqual(
    limpiarWhatsApp('[Ver ubicación en el mapa](https://maps.app.goo.gl/jQaFKg)'),
    'Ver ubicación en el mapa: https://maps.app.goo.gl/jQaFKg',
  );
  // Sin texto no hay nada que conservar: queda la URL sola.
  assert.strictEqual(limpiarWhatsApp('[](https://x.com/a)'), 'https://x.com/a');
});

test('no queda ningún resto de Markdown en un mensaje real', () => {
  const real = [
    '🏡 *Urbanización Torres de Parcona*',
    '',
    '📍 **Ubicación:** 1era cuadra de Av. 28 de Julio',
    '📐 **Área desde:** 109 m²',
    '* Agua, luz y desagüe instalados',
    '',
    '## Financiamiento',
    '[Ver ubicación en mapa](https://maps.app.goo.gl/jQaFKg)',
  ].join('\n');

  const limpio = limpiarWhatsApp(real);
  assert.doesNotMatch(limpio, /\*\*/, 'no puede quedar doble asterisco');
  assert.doesNotMatch(limpio, /\[[^\]]*\]\(/, 'no puede quedar un enlace de Markdown');
  assert.doesNotMatch(limpio, /^#{1,6} /m, 'no puede quedar un título de Markdown');
  assert.doesNotMatch(limpio, /^\* /m, 'una viñeta con asterisco abre una negrita');
  assert.match(limpio, /\*Ubicación:\*/);
  assert.match(limpio, /• Agua, luz/);
  assert.match(limpio, /\*Financiamiento\*/);
});

test('un asterisco impar no deja el resto del mensaje en negrita', () => {
  const r = limpiarWhatsApp('Precio *S/65,000 y algo más');
  assert.strictEqual((r.match(/\*/g) || []).length % 2, 0);
});

test('no toca lo que va dentro de un bloque de código', () => {
  const r = limpiarWhatsApp('Copia esto:\n```\n**no_tocar** [a](http://b.com)\n```');
  assert.match(r, /\*\*no_tocar\*\*/);
  assert.match(r, /\[a\]\(http:\/\/b\.com\)/);
});

test('recorta el aire de más sin pegar las líneas', () => {
  assert.strictEqual(limpiarWhatsApp('a\n\n\n\n\nb'), 'a\n\nb');
  assert.strictEqual(limpiarWhatsApp('a\nb'), 'a\nb');
});

test('un texto ya limpio no se altera', () => {
  const ok = '🏡 *Torres de Parcona*\n\n📍 Parcona, Ica\n\n¿Lo ves para vivir o para invertir?';
  assert.strictEqual(limpiarWhatsApp(ok), ok);
});

test('aguanta valores que no son texto', () => {
  for (const v of [null, undefined, '', 123]) {
    assert.doesNotThrow(() => limpiarWhatsApp(v));
  }
});

test('el prompt le prohíbe soltar la ficha completa de entrada', () => {
  const prompt = construirSystemPrompt('+51900000000', CONFIG_BASE, []);
  // En conversaciones reales el agente recitaba los siete campos en el
  // primer mensaje y la mitad de los chats morían ahí mismo.
  assert.match(prompt, /NO SUELTES LA FICHA COMPLETA/);
  assert.match(prompt, /DOS O TRES datos/);
  assert.match(prompt, /no pasa de 60/, 'el primer mensaje necesita su propio límite');
});

test('el prompt le prohíbe repetir la misma pregunta', () => {
  const prompt = construirSystemPrompt('+51900000000', CONFIG_BASE, []);
  // El cierre "¿te gustaría agendar una visita?" apareció seis veces casi
  // idéntico en las conversaciones reales. Es el tic que lo delata.
  assert.match(prompt, /NUNCA REPITAS UNA PREGUNTA QUE YA HICISTE/);
  assert.match(prompt, /que NO sea la misma que ya hiciste/);
});

test('el prompt le exige contestar lo que le preguntaron y no inventar', () => {
  const prompt = construirSystemPrompt('+51900000000', CONFIG_BASE, []);
  // Un comprador preguntó en qué etapa estaban los lotes; el agente
  // respondió con el estado de entrega y después se inventó "primera etapa".
  assert.match(prompt, /PRIMERO CONTESTA LO QUE TE PREGUNTARON/);
  assert.match(prompt, /etapas/, 'las etapas tienen que estar en la lista de lo que no se inventa');
  assert.match(prompt, /lo confirma un asesor/);
});

// ═══════════════════════════════════════════════════════════════════
//  Aprendizaje
//
//  El modelo no aprende: cada mensaje arranca de cero. Lo que se
//  acumula acá es lo que se le devuelve en el prompt la próxima vez.
// ═══════════════════════════════════════════════════════════════════

const { formatearConversaciones, MAX_CORRECCIONES } = require('../server/services/aprendizaje');

test('las conversaciones se agrupan por número antes de analizarlas', () => {
  const texto = formatearConversaciones([
    { numero_telefono: '+51900000001', remitente: 'usuario', contenido_mensaje: 'Hola' },
    { numero_telefono: '+51900000002', remitente: 'usuario', contenido_mensaje: 'Buenas' },
    { numero_telefono: '+51900000001', remitente: 'asistente', contenido_mensaje: 'Qué tal' },
  ]);

  // Sin agrupar, el modelo vería un solo hilo mezclado y contaría mal
  // cuántas personas distintas preguntaron lo mismo.
  assert.match(texto, /Conversación con \+51900000001/);
  assert.match(texto, /Conversación con \+51900000002/);
  assert.ok(texto.indexOf('Qué tal') < texto.indexOf('Conversación con +51900000002'),
    'los mensajes de un mismo número van juntos');
  assert.match(texto, /COMPRADOR: Hola/);
  assert.match(texto, /AGENTE: Qué tal/);
});

test('un mensaje larguísimo no infla el análisis', () => {
  const texto = formatearConversaciones([
    { numero_telefono: '+51900000001', remitente: 'usuario', contenido_mensaje: 'x'.repeat(5000) },
  ]);
  assert.ok(texto.length < 1200, `quedó en ${texto.length} caracteres`);
});

test('el análisis aguanta una conversación vacía', () => {
  assert.doesNotThrow(() => formatearConversaciones([]));
  assert.strictEqual(formatearConversaciones([]), '');
});

test('las correcciones que viajan en el prompt están acotadas', () => {
  // Son ejemplos, no un manual: pasado cierto punto ocupan tokens en cada
  // mensaje del agente sin agregar señal.
  assert.ok(MAX_CORRECCIONES > 0 && MAX_CORRECCIONES <= 10, `son ${MAX_CORRECCIONES}`);
});

test('el prompt trae un ejemplo, no solo reglas', () => {
  const prompt = construirSystemPrompt('+51900000000', CONFIG_BASE, []);
  // Dos rondas de reglas en prosa no alcanzaron. Un modelo imita un ejemplo
  // mucho mejor de lo que obedece una instrucción abstracta.
  assert.match(prompt, /MAL —/);
  assert.match(prompt, /BIEN —/);
  assert.match(prompt, /DOS datos en vez de siete/);
});

test('el formato ya no enumera los campos a completar', () => {
  const prompt = construirSystemPrompt('+51900000000', CONFIG_BASE, []);
  // La enumeración "📍 ubicación, 📐 área, 💰 precio, 🏗️ etapa…" era una
  // plantilla: el modelo la rellenaba entera en cada respuesta.
  const formato = prompt.slice(prompt.indexOf('FORMATO DEL MENSAJE'));
  const camposEnFila = /ubicaci[óo]n,\s*📐/.test(formato);
  assert.ok(!camposEnFila, 'el bloque de formato no puede listar los campos en fila');
  assert.match(prompt, /No existe una lista fija de campos/);
});

test('la herramienta de proyectos manda la instrucción junto con los datos', () => {
  const fuente = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'server', 'services', 'openai.js'), 'utf8');
  // Una regla del prompt queda miles de tokens atrás; esto llega pegado al
  // JSON, que es lo último que el modelo lee antes de escribir.
  assert.match(fuente, /instruccion: limpios\.length === 1/);
  assert.match(fuente, /no un gui[óo]n para leer/);
});

// ═══════════════════════════════════════════════════════════════════
//  Estado de la conversación
//
//  Todas las frases de acá son reales: las escribió el agente en
//  pruebas contra el modelo. La primera versión del detector buscaba
//  "agendar" y el modelo decía "agendemos", así que no disparaba
//  nunca y seguía invitando en todos los turnos.
// ═══════════════════════════════════════════════════════════════════

const { proponeVisita, aceptoVisita, instruccionSegunHistorial } = require('../server/utils/conversacion');

test('reconoce la invitación a visitar, esté como esté conjugada', () => {
  const reales = [
    '¿Te gustaría agendar una visita para conocer más?',
    '¿Te gustaría que agendemos una visita para que lo veas en persona?',
    '¿Te gustaría que coordinemos una visita para que puedas conocer el lugar?',
    '¿Qué te parece si agendamos una visita para que conozcas el proyecto?',
    'Te invito a agendar una visita al proyecto.',
    'Podríamos programar una visita cuando te quede cómodo.',
    'Para agendar tu visita, ¿te mando el enlace?',
  ];
  for (const f of reales) {
    assert.ok(proponeVisita(f), `no reconoció: ${f}`);
  }
});

test('no confunde cualquier mención con una invitación', () => {
  for (const f of [
    'La visita dura unos 40 minutos.',
    '¿Te mando fotos del proyecto?',
    'Los lotes están con entrega inmediata.',
  ]) {
    assert.ok(!proponeVisita(f), `marcó de más: ${f}`);
  }
});

test('un "sí" suelto cuenta como aceptar', () => {
  for (const f of ['Sí', 'sí, dale', 'Dale', 'ok', 'Claro', 'mándame el enlace']) {
    assert.ok(aceptoVisita(f), `no lo tomó como sí: ${f}`);
  }
  assert.ok(!aceptoVisita('no por ahora'));
  assert.ok(!aceptoVisita('¿cuánto cuesta?'));
});

test('avisa cuando ya invitó y no le dijeron que sí', () => {
  const instruccion = instruccionSegunHistorial([
    { remitente: 'usuario', contenido_mensaje: 'hola' },
    { remitente: 'asistente', contenido_mensaje: '¿Te gustaría que agendemos una visita?' },
    { remitente: 'usuario', contenido_mensaje: '¿y a crédito?' },
  ]);
  assert.match(instruccion, /Ya le propusiste agendar una visita una vez/);
  assert.match(instruccion, /NO se lo vuelvas a proponer/);
});

test('si aceptó, deja de frenarlo', () => {
  const instruccion = instruccionSegunHistorial([
    { remitente: 'asistente', contenido_mensaje: '¿Te gustaría que agendemos una visita?' },
    { remitente: 'usuario', contenido_mensaje: 'Sí' },
  ]);
  assert.doesNotMatch(instruccion, /NO se lo vuelvas a proponer/);
});

test('recoge lo que la persona contó de sí misma', () => {
  const instruccion = instruccionSegunHistorial([
    { remitente: 'usuario', contenido_mensaje: 'Es para vivir, con mi familia' },
  ]);
  assert.match(instruccion, /su familia/);
  assert.match(instruccion, /para vivir/);
});

test('sin historial no inventa instrucciones', () => {
  assert.strictEqual(instruccionSegunHistorial([]), '');
  assert.strictEqual(instruccionSegunHistorial(undefined), '');
});

test('ningún archivo del servidor tiene caracteres de control', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const raiz = path.join(__dirname, '..', 'server');

  // Esto pasó de verdad, dos veces: una barra invertida perdida en el camino
  // convirtió un `\b` de una expresión regular en un carácter de retroceso
  // real. El archivo se veía bien en pantalla y la regex no coincidía nunca,
  // así que el agente seguía repitiendo la invitación sin que se notara por qué.
  const archivos = [];
  (function recorrer(dir) {
    for (const entrada of fs.readdirSync(dir)) {
      const p = path.join(dir, entrada);
      if (fs.statSync(p).isDirectory()) recorrer(p);
      else if (p.endsWith('.js')) archivos.push(p);
    }
  })(raiz);

  const sospechosos = [];
  for (const archivo of archivos) {
    const contenido = fs.readFileSync(archivo, 'utf8');
    // Se permiten salto de línea, retorno y tabulación; nada más.
    const match = contenido.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    if (match) {
      const pos = contenido.indexOf(match[0]);
      const linea = contenido.slice(0, pos).split('\n').length;
      sospechosos.push(`${path.relative(raiz, archivo)}:${linea} (U+${match[0].codePointAt(0).toString(16).padStart(4, '0')})`);
    }
  }

  assert.deepStrictEqual(sospechosos, [], 'caracteres de control:\n  ' + sospechosos.join('\n  '));
});
