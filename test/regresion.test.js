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
