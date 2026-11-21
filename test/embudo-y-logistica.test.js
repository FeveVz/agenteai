const test = require('node:test');
const assert = require('node:assert');

const { componerNotas } = require('../server/routes/agenda');
const { separarRecojo, construirHtml } = require('../server/services/email');
const { proyectoDeInteres, mensajeSugerido, esAlcanzable } = require('../server/routes/embudo');
const { seDespidio, clienteCierra, instruccionSegunHistorial } = require('../server/utils/conversacion');

// ═══════════════════════════════════════════════════════════════════
//  La logística de la visita
//
//  Gean Romano pidió por chat que lo recojan desde Tinguiña, el agente
//  contestó "coordinaremos", y su visita quedó con las notas en null: el día
//  de la visita nadie sabía dónde pasar por él. Y de las cinco visitas que
//  había, dos tenían por nota literalmente "2" y "4" — la gente contestaba la
//  primera mitad del marcador "cuántas personas van, si necesitas movilidad".
// ═══════════════════════════════════════════════════════════════════

test('el punto de recojo queda escrito en la visita', () => {
  assert.strictEqual(
    componerNotas({ personas: '2', punto_recojo: 'Tinguiña', notas: '' }),
    '2 personas · RECOGER EN: Tinguiña',
  );
});

test('una persona sola no se escribe en plural', () => {
  assert.strictEqual(componerNotas({ personas: 1 }), '1 persona');
});

test('un número suelto ya no queda como nota', () => {
  // Esto es exactamente lo que había en la base: notas que dicen "2" y "4".
  assert.strictEqual(componerNotas({ notas: '2' }), null);
  assert.strictEqual(componerNotas({}), null);
});

test('lo que el cliente escribe libre se conserva', () => {
  assert.strictEqual(
    componerNotas({ personas: 3, notas: 'vamos con mi esposa y mi hijo' }),
    '3 personas · vamos con mi esposa y mi hijo',
  );
});

test('no se guarda una cantidad de personas absurda', () => {
  assert.strictEqual(componerNotas({ personas: 400 }), null);
  assert.strictEqual(componerNotas({ personas: 'muchas' }), null);
});

test('el correo muestra la movilidad aparte y resaltada', () => {
  const { recojo, resto } = separarRecojo('2 personas · RECOGER EN: Tinguiña · vamos temprano');
  assert.strictEqual(recojo, 'Tinguiña');
  assert.strictEqual(resto, '2 personas · vamos temprano');

  const html = construirHtml({
    nombre: 'Gean Romano', telefono: '+51922379729', proyecto: 'Torres de Parcona',
    fechaLegible: 'martes 10 a las 16:00', notas: 'RECOGER EN: Tinguiña',
    origen: 'chat', empresa: 'Pamela Barrios',
  });
  assert.match(html, /Movilidad/);
  assert.match(html, /Recoger en Tingui/);
});

test('sin movilidad el correo no inventa la fila', () => {
  assert.deepStrictEqual(separarRecojo('2 personas'), { recojo: null, resto: '2 personas' });
  assert.deepStrictEqual(separarRecojo(null), { recojo: null, resto: null });
});

// ═══════════════════════════════════════════════════════════════════
//  El embudo y los leads fríos
// ═══════════════════════════════════════════════════════════════════

const PROYECTOS = [
  'Urbanización Torres de Parcona',
  'Condominio Hacienda Chacarilla',
  'Condominio Campestre Pecano Real',
  'Condominio Campestre Trébol Club',
  'Condominio Viñedos de Parcona',
];

test('dos proyectos que comparten una palabra no se confunden', () => {
  // "Parcona" lo llevan Torres y Viñedos: quedarse con la última palabra larga
  // le atribuía a Viñedos los compradores de Torres. Pasó con un contacto real.
  const torres = proyectoDeInteres(
    [{ remitente: 'usuario', contenido_mensaje: 'Quiero información de las Torres de Parcona' }],
    PROYECTOS,
  );
  assert.strictEqual(torres, 'Urbanización Torres de Parcona');

  const vinedos = proyectoDeInteres(
    [{ remitente: 'usuario', contenido_mensaje: 'me interesa Viñedos de Parcona' }],
    PROYECTOS,
  );
  assert.strictEqual(vinedos, 'Condominio Viñedos de Parcona');
});

test('el proyecto sale de lo que dijo el comprador, no el agente', () => {
  // El agente nombra proyectos al ofrecer alternativas, y eso ensuciaría el dato.
  const hallado = proyectoDeInteres([
    { remitente: 'usuario', contenido_mensaje: 'hola, cuánto cuesta' },
    { remitente: 'asistente', contenido_mensaje: 'Te puedo ofrecer Hacienda Chacarilla o Pecano Real' },
  ], PROYECTOS);
  assert.strictEqual(hallado, null);
});

test('escribe sin tildes, como la gente en WhatsApp', () => {
  assert.strictEqual(
    proyectoDeInteres([{ remitente: 'usuario', contenido_mensaje: 'info de hacienda chacarilla' }], PROYECTOS),
    'Condominio Hacienda Chacarilla',
  );
});

test('el mensaje para retomar nombra el proyecto y el tiempo', () => {
  const conProyecto = mensajeSugerido('Camila', 'Urbanización Torres de Parcona', 9);
  assert.match(conProyecto, /soy Camila/);
  assert.match(conProyecto, /Torres de Parcona/);
  assert.match(conProyecto, /hace 9 días/);
  // Minúscula después de la coma: "Hola, Soy Camila" se leía como un robot.
  assert.doesNotMatch(conProyecto, /Hola, Soy/);

  assert.match(mensajeSugerido('Camila', null, 1), /ayer/);
});

test('sin número no se ofrece escribirle primero', () => {
  // 1 de cada 13 contactos llega con la identidad de Meta en vez del teléfono.
  assert.ok(esAlcanzable('+51993841746'));
  assert.ok(esAlcanzable('993841746'));
  assert.ok(!esAlcanzable('PE.981400590890326'));
  assert.ok(!esAlcanzable(''));
});

// ═══════════════════════════════════════════════════════════════════
//  Los detectores que contaban de más
// ═══════════════════════════════════════════════════════════════════

test('una frase de cortesía no es una despedida', () => {
  // La primera versión contaba "no dudes en escribirme" y "estaré aquí para
  // ayudarte" como despedidas, y esas frases viven dentro de respuestas
  // buenas: de 12 "despedidas" marcadas en noviembre, la mitad estaban bien.
  assert.ok(!seDespidio('Si tienes más preguntas, no dudes en escribirme. Estoy aquí para ayudarte.'));
  assert.ok(!seDespidio('¡Perfecto! Coordinaremos para que te recojan desde Tinguiña.'));
  assert.ok(seDespidio('¡Hasta luego! Que tengas un excelente día'));
  assert.ok(seDespidio('¡Cuídate mucho!'));
});

test('si el comprador cierra, despedirse está bien', () => {
  for (const cierre of ['A ok gracias', 'Ok gracias x su tiempo', 'Listo', 'gracias', 'Ok']) {
    assert.ok(clienteCierra(cierre), `no lo tomó como cierre: ${cierre}`);
  }
  // Una pregunta no cierra nada, aunque empiece agradeciendo.
  assert.ok(!clienteCierra('Gracias, y cuánto cuesta?'));
  assert.ok(!clienteCierra('Ok pero dónde queda'));
  assert.ok(!clienteCierra('gracias ahora dime cuánto sale el metro cuadrado'));
});

test('la prohibición de despedirse respeta al que ya se despidió', () => {
  const historial = [
    { remitente: 'usuario', contenido_mensaje: 'info' },
    { remitente: 'asistente', contenido_mensaje: '¡Hasta luego! Que tengas un buen día' },
  ];
  assert.doesNotMatch(instruccionSegunHistorial(historial, 'Ok gracias'), /PROHIBIDO despedirte/);
  assert.match(instruccionSegunHistorial(historial, 'y el precio?'), /PROHIBIDO despedirte/);
});

// ═══════════════════════════════════════════════════════════════════
//  Correcciones que se contradicen
//
//  Pasó en producción y estaba costando ventas: la corrección 1 decía
//  "actualmente no trabajo con proyectos en modalidad Techo Propio" y la 9
//  decía "en Torres de Parcona se puede acceder a bonos como Techo Propio".
//  Al prompt solo entran las 6 más nuevas, así que viajaba la 9 y el agente
//  le ofrecía a compradores reales un bono que la inmobiliaria no maneja.
// ═══════════════════════════════════════════════════════════════════

const { buscarContradicciones } = require('../server/services/aprendizaje');

test('detecta dos correcciones opuestas sobre el mismo tema', () => {
  const choques = buscarContradicciones([
    { id: 1, debio_decir: 'Actualmente no trabajo con proyectos en modalidad Techo Propio, podemos trabajar con el bono Mi Vivienda con casa en Chacarilla' },
    { id: 9, debio_decir: 'En la Urbanización Torres de Parcona, se puede acceder a bonos como Techo Propio o Mi Vivienda.' },
  ]);

  const techo = choques.find(c => c.tema === 'techo propio');
  assert.ok(techo, 'no vio el choque de Techo Propio');
  assert.deepStrictEqual(techo.ids.sort(), [1, 9]);
});

test('no marca como choque lo que en realidad coincide', () => {
  // Las dos de arriba dicen lo MISMO sobre Mi Vivienda: que sí lo manejan. La
  // primera versión las marcaba porque buscaba el "no" en todo el texto, y el
  // "no trabajo" era del otro tema.
  const choques = buscarContradicciones([
    { id: 1, debio_decir: 'Actualmente no trabajo con proyectos en modalidad Techo Propio, podemos trabajar con el bono Mi Vivienda con casa en Chacarilla' },
    { id: 9, debio_decir: 'En la Urbanización Torres de Parcona, se puede acceder a bonos como Techo Propio o Mi Vivienda.' },
  ]);
  assert.ok(!choques.some(c => c.tema === 'bono Mi Vivienda'), 'marcó Mi Vivienda, donde las dos coinciden');

  // Y estas dos dicen lo mismo sobre la etapa, con un "no contamos" de más.
  const etapas = buscarContradicciones([
    { id: 2, debio_decir: 'Los lotes están en la tercera etapa, la primera y segunda ya están entregadas y no contamos con lotes en esas dos etapas' },
    { id: 7, debio_decir: 'Los lotes quedan en la tercera y última etapa de la Urbanización Torres de Parcona' },
  ]);
  assert.deepStrictEqual(etapas, []);
});

test('una sola corrección sobre un tema no es un choque', () => {
  assert.deepStrictEqual(
    buscarContradicciones([{ id: 1, debio_decir: 'No trabajamos con Techo Propio' }]),
    [],
  );
});
