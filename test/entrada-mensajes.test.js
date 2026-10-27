const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { lineasConVoseo } = require('./ayudas/voseo');

const webhook = require('../server/routes/webhook');
const {
  clasificarEntrante,
  historialSinActual,
  textoProvisional,
  textoDelTurno,
  textoUbicacion,
  distanciaKm,
  verificarRateLimit,
  TIPOS,
} = webhook;

const {
  esURLDeMediosTwilio,
  textoRespuestaError,
  enviarMensajeWhatsApp,
  generarRespuestaTwiML,
} = require('../server/services/twilio');

const FUENTE_WEBHOOK = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'routes', 'webhook.js'), 'utf8');
const FUENTE_TWILIO = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'services', 'twilio.js'), 'utf8');

// ═══════════════════════════════════════════════════════════════════
//  Clasificación del mensaje entrante
//
//  El handler exigía `Body` y cortaba con 400. Twilio descarta el TwiML
//  de cualquier respuesta que no sea 2xx, así que una nota de voz, una
//  foto sola, una ubicación o un sticker recibían silencio absoluto, y
//  el insert estaba después del corte: no quedaba ni rastro en la base.
//  Cada test de acá es una de las formas reales en que llega un mensaje.
// ═══════════════════════════════════════════════════════════════════

test('una nota de voz sin texto se clasifica como audio, no se descarta', () => {
  // Cuerpo real de Twilio para una nota de voz de WhatsApp.
  const r = clasificarEntrante({
    Body: '',
    From: 'whatsapp:+51987653441',
    NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages/MMxxx/Media/MExxx',
    MediaContentType0: 'audio/ogg',
  });

  assert.strictEqual(r.clase, 'audio');
  assert.strictEqual(r.tipoMensaje, 'audio_entrante');
  assert.strictEqual(r.medios.length, 1);
  assert.strictEqual(r.caption, '');
});

test('una foto CON texto conserva la foto y el texto: el agente ya no contesta a ciegas', () => {
  // El caso medido: la captura del anuncio de Facebook con la leyenda
  // «este cuánto cuesta». Antes entraba, pero la foto se descartaba en
  // silencio y el agente preguntaba de qué proyecto hablaba.
  const r = clasificarEntrante({
    Body: 'este cuánto cuesta',
    From: 'whatsapp:+51987650326',
    NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages/MMxxx/Media/MExxx',
    MediaContentType0: 'image/jpeg',
  });

  assert.strictEqual(r.clase, 'imagen');
  assert.strictEqual(r.tipoMensaje, 'imagen_entrante');
  assert.strictEqual(r.caption, 'este cuánto cuesta');
  assert.match(textoProvisional(r), /este cuánto cuesta/);
});

test('un sticker no se trata como foto: es una reacción, no una pregunta', () => {
  // image/webp llega igual que una imagen y gpt-4o lo aceptaría, pero
  // mandarlo como imagen produce otro discurso de venta: el contacto
  // ...0326 dio cuatro "Ok" y recibió cuatro despedidas distintas.
  const r = clasificarEntrante({
    Body: '',
    NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages/MMxxx/Media/MExxx',
    MediaContentType0: 'image/webp',
  });

  assert.strictEqual(r.clase, 'sticker');
  assert.strictEqual(r.tipoMensaje, 'sticker_entrante');
});

test('la ubicación compartida se reconoce por Latitude/Longitude', () => {
  const r = clasificarEntrante({
    Body: '',
    NumMedia: '0',
    Latitude: '-14.0678',
    Longitude: '-75.7286',
  });

  assert.strictEqual(r.clase, 'ubicacion');
  assert.strictEqual(r.tipoMensaje, 'ubicacion_entrante');
  assert.strictEqual(r.latitud, -14.0678);
  assert.strictEqual(r.longitud, -75.7286);
});

test('un PDF o cualquier otro adjunto queda como otro_medio_entrante y se puede medir', () => {
  const r = clasificarEntrante({
    Body: '',
    NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages/MMxxx/Media/MExxx',
    MediaContentType0: 'application/pdf',
  });

  assert.strictEqual(r.tipoMensaje, 'otro_medio_entrante');
});

test('un mensaje de texto normal sigue siendo texto', () => {
  const r = clasificarEntrante({ Body: 'Sale', From: 'whatsapp:+51987653441', NumMedia: '0' });
  assert.strictEqual(r.clase, 'texto');
  assert.strictEqual(r.tipoMensaje, TIPOS.texto);
  assert.strictEqual(textoProvisional(r), 'Sale');
});

test('ningún mensaje entrante produce un contenido vacío: la fila siempre se puede guardar', () => {
  // contenido_mensaje es NOT NULL. Si el texto saliera vacío, el insert
  // reventaría y volveríamos al agujero de hoy: el mensaje del comprador
  // desaparece y nadie se entera de que lo perdimos.
  const cuerpos = [
    { Body: '', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/a', MediaContentType0: 'audio/ogg' },
    { Body: '', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/a', MediaContentType0: 'image/jpeg' },
    { Body: '', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/a', MediaContentType0: 'image/webp' },
    { Body: '', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/a', MediaContentType0: 'application/pdf' },
    { Body: '', NumMedia: '0', Latitude: '-14.07', Longitude: '-75.73' },
  ];

  for (const cuerpo of cuerpos) {
    const texto = textoProvisional(clasificarEntrante(cuerpo));
    assert.ok(texto && texto.trim().length > 0, `quedó vacío para ${cuerpo.MediaContentType0 || 'ubicación'}`);
  }
});

// ═══════════════════════════════════════════════════════════════════
//  Texto del turno con el medio resuelto
// ═══════════════════════════════════════════════════════════════════

test('la transcripción llega al agente marcada como nota de voz', () => {
  const entrante = clasificarEntrante({
    Body: '', NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/a', MediaContentType0: 'audio/ogg',
  });
  const texto = textoDelTurno(entrante, { paraElModelo: [], transcripcion: 'cuánto cuesta el lote de Parcona' }, []);

  assert.match(texto, /^\[nota de voz\]/);
  assert.match(texto, /cuánto cuesta el lote de Parcona/);
});

test('si la transcripción falla el hueco queda visible, no se finge un mensaje de texto', () => {
  const entrante = clasificarEntrante({
    Body: '', NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/a', MediaContentType0: 'audio/ogg',
  });
  const texto = textoDelTurno(entrante, { paraElModelo: [], transcripcion: null, fallo: 'timeout' }, []);

  assert.match(texto, /no se pudo transcribir/i);
  assert.match(texto, /No tenemos el contenido/i);
});

test('si la foto no se pudo bajar el texto lo dice en vez de dejar al agente a ciegas', () => {
  const entrante = clasificarEntrante({
    Body: 'este cuánto cuesta', NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/a', MediaContentType0: 'image/jpeg',
  });
  const texto = textoDelTurno(entrante, { paraElModelo: [], transcripcion: null, fallo: 'http_404' }, []);

  assert.match(texto, /no se pudo abrir/i);
  assert.match(texto, /este cuánto cuesta/);
});

// ═══════════════════════════════════════════════════════════════════
//  Ubicación: la distancia se calcula en código o se declara el hueco
// ═══════════════════════════════════════════════════════════════════

test('un grado de latitud son unos 111 km: la fórmula no está invertida', () => {
  assert.ok(Math.abs(distanciaKm(0, 0, 1, 0) - 111.19) < 0.5);
  assert.strictEqual(distanciaKm(-14.07, -75.73, -14.07, -75.73), 0);
});

test('sin coordenadas en el catálogo, el texto declara que la distancia NO está calculada', () => {
  // La regla del proyecto: si falta un dato, el código deja el hueco
  // visible y no lo rellena. Antes el agente felicitaba por "compartir tu
  // ubicación" y no usaba el dato para nada.
  const entrante = clasificarEntrante({ Body: '', NumMedia: '0', Latitude: '-14.07', Longitude: '-75.73' });
  const texto = textoUbicacion(entrante, [
    { nombre: 'Proyecto sin coordenadas', latitud: null, longitud: null },
  ]);

  assert.match(texto, /geo:-14\.07,-75\.73/);
  assert.match(texto, /NO están calculadas/);
  assert.ok(!/\d+\.\d+ km/.test(texto), 'no debería aparecer ninguna distancia inventada');
});

test('con coordenadas cargadas, el proyecto más cercano va primero y con su cifra', () => {
  const entrante = clasificarEntrante({ Body: '', NumMedia: '0', Latitude: '0', Longitude: '0' });
  const texto = textoUbicacion(entrante, [
    { nombre: 'Lejano', latitud: 1, longitud: 0 },
    { nombre: 'Cercano', latitud: 0.01, longitud: 0 },
    { nombre: 'Intermedio', latitud: 0.1, longitud: 0 },
  ]);

  assert.match(texto, /Cercano a 1\.1 km/);
  assert.ok(texto.indexOf('Cercano') < texto.indexOf('Intermedio'), 'el más cercano tiene que ir primero');
  assert.ok(texto.indexOf('Intermedio') < texto.indexOf('Lejano'));
});

// ═══════════════════════════════════════════════════════════════════
//  Ráfaga: el historial ya no le muestra el mismo mensaje dos veces
//
//  Caso real del contacto ...3441: "Y financiado cuanto me sñae"
//  (id 566, 12:10:11.654) y "Sale" (id 567, 12:10:12.699), 1.045 s de
//  diferencia, dos respuestas con las mismas cifras (ids 568 y 569).
// ═══════════════════════════════════════════════════════════════════

const RAFAGA_DESC = [
  { id: 567, remitente: 'usuario', contenido_mensaje: 'Sale' },
  { id: 566, remitente: 'usuario', contenido_mensaje: 'Y financiado cuanto me sñae' },
  { id: 565, remitente: 'asistente', contenido_mensaje: 'El Bono Mi Vivienda...' },
];

test('el mensaje recién insertado se quita por id, no por posición', () => {
  // Con slice(0, -1) el turno del 566 se quitaba el 567 y dejaba el 566
  // dentro del historial — y openai.js vuelve a empujar el 566 como
  // mensaje del usuario, así que el modelo lo veía DOS veces y no se
  // enteraba del 567.
  const historial = historialSinActual(RAFAGA_DESC, { id: 566, contenido: 'Y financiado cuanto me sñae' });

  const propios = historial.filter(m => m.contenido_mensaje === 'Y financiado cuanto me sñae');
  assert.strictEqual(propios.length, 0, 'el mensaje actual no puede quedar en el historial');
  assert.ok(historial.some(m => m.contenido_mensaje === 'Sale'), 'el otro mensaje de la ráfaga sí tiene que estar');
});

test('el historial queda en orden ascendente, del más viejo al más nuevo', () => {
  const historial = historialSinActual(RAFAGA_DESC, { id: 567, contenido: 'Sale' });
  assert.deepStrictEqual(historial.map(m => m.id), [565, 566]);
});

test('sin id, el respaldo por contenido descarta la última fila solo si de verdad es la nuestra', () => {
  const soloNuestra = historialSinActual(RAFAGA_DESC, { id: null, contenido: 'Sale' });
  assert.deepStrictEqual(soloNuestra.map(m => m.id), [565, 566]);

  // Si lo último que hay en la base no es nuestro mensaje, no se toca nada:
  // borrar "la última fila" a ciegas es lo que provocaba el duplicado.
  const ajena = historialSinActual(RAFAGA_DESC, { id: null, contenido: 'otra cosa' });
  assert.deepStrictEqual(ajena.map(m => m.id), [565, 566, 567]);
});

test('un historial vacío no revienta', () => {
  assert.deepStrictEqual(historialSinActual(null, { id: 1 }), []);
  assert.deepStrictEqual(historialSinActual([], { id: 1 }), []);
});

test('el turno espera y comprueba por la base si llegó otro mensaje después del suyo', () => {
  // En serverless cada POST abre su propio turno y no hay estado compartido
  // entre instancias: un lock en memoria no sirve. El orden por id es total,
  // así que de una ráfaga sigue adelante exactamente un turno.
  assert.match(FUENTE_WEBHOOK, /\.gt\('id', idMensaje\)/);
  assert.match(FUENTE_WEBHOOK, /ESPERA_RAFAGA_MS/);
  assert.match(FUENTE_WEBHOOK, /CONDICIÓN DE CARRERA QUE ELEGIMOS TOLERAR/);
});

// ═══════════════════════════════════════════════════════════════════
//  Códigos de estado: Twilio descarta el TwiML que no venga con 2xx
// ═══════════════════════════════════════════════════════════════════

test('ninguna respuesta con cuerpo TwiML sale con 4xx o 5xx', () => {
  // Los tres mensajes de error que este código creía mandar ("Mensaje
  // inválido", el del rate limit y la disculpa técnica) se escribían, se
  // serializaban en XML y se tiraban a la basura: el comprador no recibía
  // nada y quedaba convencido de que lo dejaron en visto.
  const sospechosas = FUENTE_WEBHOOK.match(/res\.status\((4\d\d|5\d\d)\)\s*\.?\s*send/g) || [];
  assert.deepStrictEqual(sospechosas, [], `quedó un send con estado de error: ${sospechosas.join(', ')}`);

  // El 403 de firma inválida se queda como está: ahí no hay comprador del
  // otro lado y el estado es la señal de salud para Twilio.
  assert.match(FUENTE_WEBHOOK, /res\.status\(403\)\.json/);
});

test('el rate limit responde en silencio, no con un texto que se multiplica por 30', () => {
  // Veredicto del verificador: devolver 200 con texto acá es PEOR que el
  // silencio. El tope son 30 mensajes en 60 s, así que con texto cada
  // mensaje de más genera un mensaje de salida: el freno se vuelve un
  // amplificador que le cobra a Pamela y repite el mismo aviso 30 veces.
  // Se mira el código, no los comentarios: la primera versión de esta prueba
  // se marcaba a sí misma, porque el comentario que explica POR QUÉ no hay que
  // mandar ese texto cita la frase textual.
  const sinComentarios = FUENTE_WEBHOOK
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

  assert.ok(!/demasiados mensajes/i.test(sinComentarios),
    'el aviso de rate limit no debería mandarse como texto al comprador');
  assert.match(FUENTE_WEBHOOK, /Rate limit alcanzado[\s\S]{0,200}responderATwilio\(TWIML_VACIO\)/);
});

test('el rate limit cuenta 30 por ventana y purga lo vencido', () => {
  const numero = '+51900000001';
  const t0 = 1_000_000;
  for (let i = 0; i < 30; i++) {
    assert.strictEqual(verificarRateLimit(numero, t0 + i), true, `el mensaje ${i + 1} debería pasar`);
  }
  assert.strictEqual(verificarRateLimit(numero, t0 + 30), false, 'el 31 en la misma ventana se frena');

  // Pasada la ventana vuelve a pasar, y la entrada vieja ya no ocupa lugar:
  // los Maps crecían sin límite mientras la instancia siguiera caliente.
  assert.strictEqual(verificarRateLimit(numero, t0 + 61_000), true);
});

test('el camino de error del timeout manda la disculpa por REST, no por TwiML', () => {
  // Si OpenAI tarda 10 s y después falla, Twilio ya recibió el TwiML vacío:
  // el catch no puede responder nada y el comprador no recibía ni la
  // disculpa. Ese es el silencio que más caro sale.
  assert.match(FUENTE_WEBHOOK, /if \(twilioRespondido\)[\s\S]{0,600}enviarMensajeWhatsApp\(numeroTelefono, textoRespuestaError/);
});

test('el catch final no puede reventar con ERR_HTTP_HEADERS_SENT', () => {
  // Antes hacía res.status(500).send() a ciegas: si el timer de 9 s ya había
  // respondido, el catch tiraba otro error y tapaba el real en los logs.
  assert.match(FUENTE_WEBHOOK, /if \(twilioRespondido \|\| res\.headersSent\) return false/);
});

test('el trabajo posterior a la respuesta se registra con waitUntil cuando está disponible', () => {
  // Sin esto, Vercel puede congelar la función con la respuesta ya cerrada:
  // la fila del asistente queda escrita y el comprador no recibe nada, así
  // que desde el panel la conversación se ve contestada. La base miente.
  assert.match(FUENTE_WEBHOOK, /@vercel\/functions/);
  assert.match(FUENTE_WEBHOOK, /mantenerVivo\(/);
});

// ═══════════════════════════════════════════════════════════════════
//  Envío y descarga por Twilio
// ═══════════════════════════════════════════════════════════════════

test('las credenciales de Twilio solo se mandan a api.twilio.com', () => {
  assert.strictEqual(esURLDeMediosTwilio('https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME'), true);
  for (const mala of [
    'http://api.twilio.com/x',                 // sin TLS
    'https://api.twilio.com.atacante.net/x',   // sufijo falso
    'https://atacante.net/api.twilio.com',
    'https://evil.com/x',
    'file:///etc/passwd',
    '',
    null,
  ]) {
    assert.strictEqual(esURLDeMediosTwilio(mala), false, `no debería aceptar ${mala}`);
  }
});

test('enviarMensajeWhatsApp devuelve el conteo real de imágenes, no la cantidad pedida', async () => {
  // El panel marcaba "[+2 imagen(es) enviada(s)]" aunque Twilio las hubiera
  // rechazado, porque el texto se armaba con la cantidad pedida. Sin
  // credenciales no se envía nada, así que el conteo tiene que ser 0.
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  try {
    const r = await enviarMensajeWhatsApp('+51987653441', 'hola', ['https://ejemplo.com/a.jpg', 'https://ejemplo.com/b.jpg']);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.imagenesPedidas, 2);
    assert.strictEqual(r.imagenesEnviadas, 0);
    assert.ok(r.codigoError, 'tiene que decir por qué falló');
  } finally {
    if (sid) process.env.TWILIO_ACCOUNT_SID = sid;
    if (token) process.env.TWILIO_AUTH_TOKEN = token;
  }
});

test('el texto va en su propio mensaje: una URL de foto rota no se lleva puesto el texto', () => {
  // Pamela pega en "Imágenes" un enlace de Google Drive. Antes la primera
  // imagen viajaba adjunta al texto, la creación del mensaje fallaba y el
  // comprador no recibía NADA: ni fotos ni texto.
  assert.ok(!/body: mensaje,[\s\S]{0,120}mediaUrl/.test(FUENTE_TWILIO),
    'el texto no debería salir con una imagen adjunta en el mismo mensaje');
  assert.match(FUENTE_TWILIO, /for \(const url of urls\)[\s\S]{0,200}try \{/);
});

test('el error de Twilio devuelve su código, no solo el mensaje', () => {
  // Sin err.code no hay forma de distinguir un 63016 (fuera de la ventana de
  // 24 h de WhatsApp) de un número mal escrito o de un saldo agotado: un
  // seguimiento que nunca llegó se ve igual que uno entregado.
  assert.match(FUENTE_TWILIO, /codigoError = err\.code/);
});

test('la disculpa existe como texto suelto para poder mandarla por REST', () => {
  assert.match(textoRespuestaError(null), /problemas técnicos/);
  assert.match(textoRespuestaError('056-123456'), /056-123456/);
  // Y el TwiML sigue saliendo bien formado.
  assert.match(generarRespuestaTwiML(textoRespuestaError(null)), /^<\?xml/);
});

// ═══════════════════════════════════════════════════════════════════
//  Reglas del repositorio sobre mis dos archivos
// ═══════════════════════════════════════════════════════════════════

test('nada de voseo argentino en la entrada de mensajes ni en el envío', () => {
  // Aplica también a los textos que ve el comprador, como el puente del
  // audio largo.
  // El detector vive en test/ayudas/voseo.js. La versión que estaba acá usaba
  // \b después de una vocal con tilde y se marcaba a sí misma: el \b de
  // JavaScript es ASCII, así que /\bdecí\b/ da positivo dentro de "decía".
  for (const [nombre, fuente] of [['webhook.js', FUENTE_WEBHOOK], ['twilio.js', FUENTE_TWILIO]]) {
    const encontradas = lineasConVoseo(fuente);
    assert.deepStrictEqual(encontradas, [],
      `voseo en ${nombre}: ${encontradas.map(e => `${e.linea}: ${e.texto.trim()}`).join(' | ')}`);
  }
});

test('el costo por mensaje no-texto queda anotado en el código', () => {
  assert.match(FUENTE_WEBHOOK, /COSTO APROXIMADO POR MENSAJE NO-TEXTO/);
});

test('el modelo de transcripción es uno que esta cuenta tiene', () => {
  // Verificado contra /v1/models el 2026-10-26: gpt-4o-transcribe,
  // gpt-4o-mini-transcribe y whisper-1 están disponibles.
  const permitidos = ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'];
  const usados = FUENTE_WEBHOOK.match(/MODELO_TRANSCRIPCION(?:_RESPALDO)? = '([^']+)'/g) || [];
  assert.strictEqual(usados.length, 2);
  for (const linea of usados) {
    const modelo = linea.match(/'([^']+)'/)[1];
    assert.ok(permitidos.includes(modelo), `modelo no verificado: ${modelo}`);
  }
});

test('el código funciona aunque la migración de medios todavía no esté aplicada', () => {
  // El dueño aplica la migración; hasta entonces el insert con las columnas
  // nuevas falla y se reintenta sin ellas. Si reventara, el mensaje del
  // comprador desaparecería de la base, que es el agujero que estamos tapando.
  assert.match(FUENTE_WEBHOOK, /columnasAusentes/);
  assert.match(FUENTE_WEBHOOK, /2026-10-medios-entrantes\.sql/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'sql', 'migraciones', '2026-10-medios-entrantes.sql')));
});
