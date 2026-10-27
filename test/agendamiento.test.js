const test = require('node:test');
const assert = require('node:assert');

const {
  leerFechaHora,
  formatearFechaCompleta,
  formatearHora,
  extraerHorariosOcupados,
  calcularHorariosLibres,
  resolverHorario,
  validarRanura,
  fechaHoyEnPeru,
  minutosDelDiaEnPeru,
} = require('../server/utils/fechas');

const {
  esTelefonoAlcanzable,
  obtenerWhatsAppEmpresa,
  libresDelDia,
  DIAS_VALIDEZ_ENLACE,
  MARGEN_MINUTOS,
} = require('../server/routes/agenda');

// El horario real de Pamela el 26/10/2026, leído de configuracion_agencia:
// 08:00 a 20:00, todos los días, slots de 30 minutos.
const HORARIO_REAL = resolverHorario({
  hora_apertura: 8, hora_cierre: 20, minutos_por_slot: 30, dias_atencion: '0,1,2,3,4,5,6',
});

// ═══════════════════════════════════════════════════════════════════
//  Huso horario: Perú es UTC-5 y el servidor corre en UTC
//
//  La página ofrece un horario, la base lo guarda y la confirmación lo
//  muestra. Si en algún punto una zona reinterpreta la cadena, el mismo
//  turno pasa a ser dos instantes distintos.
// ═══════════════════════════════════════════════════════════════════

test('el horario ofrecido, guardado y mostrado son el mismo instante', () => {
  // Fila real: visita id 3, Leyda Lourdes, guardada desde la página pública.
  const guardado = '2026-10-10T16:00:00';

  assert.strictEqual(formatearHora(guardado), '16:00');
  assert.strictEqual(
    formatearFechaCompleta(guardado),
    'sábado 10 de octubre de 2026 a las 16:00'
  );
  // Y ese mismo '16:00' es el que la grilla descuenta como ocupado.
  assert.deepStrictEqual(extraerHorariosOcupados([{ fecha_visita: guardado }]), ['16:00']);
});

test('un sufijo de zona no corre la hora del turno', () => {
  // Con `new Date(...).getHours()` esto daba 16 en el servidor (UTC) y 11 en
  // Lima: el turno ocupado dejaba de coincidir con el de la grilla y se podían
  // agendar dos visitas sobre la misma hora.
  assert.strictEqual(formatearHora('2026-10-10T16:00:00Z'), '16:00');
  assert.strictEqual(formatearHora('2026-10-10T16:00:00+00:00'), '16:00');
  assert.strictEqual(formatearHora('2026-10-10 16:00:00'), '16:00');
});

test('"las horas que ya pasaron" se calculan con el reloj de Ica', () => {
  const hoy = fechaHoyEnPeru();
  const minutosAhora = minutosDelDiaEnPeru();

  // Mismo cálculo que Intl, sin pasar por `new Date(d.toLocaleString(...))`.
  const esperada = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  assert.strictEqual(hoy, esperada);

  // Ningún turno ofrecido para hoy puede estar dentro del margen mínimo.
  const libres = libresDelDia(hoy, [], HORARIO_REAL, MARGEN_MINUTOS);
  for (const h of libres) {
    const [hh, mm] = h.split(':').map(Number);
    assert.ok(hh * 60 + mm > minutosAhora + MARGEN_MINUTOS, `${h} ya pasó o está muy encima`);
  }
});

test('un día que la asesora no atiende no ofrece ni un turno', () => {
  const lunASab = resolverHorario({ hora_apertura: 8, hora_cierre: 20, dias_atencion: '1,2,3,4,5,6' });
  assert.deepStrictEqual(libresDelDia('2026-11-08', [], lunASab, 60), []); // domingo
  assert.ok(libresDelDia('2026-11-09', [], lunASab, 60).length > 0);       // lunes
});

// ═══════════════════════════════════════════════════════════════════
//  Fechas envenenadas
//
//  El modelo llamó a agendar_visita con cadenas como 'mañana a las 3'.
//  Con `new Date` eso daba Invalid Date y el comprador recibía una fecha
//  que suena real: "jueves 1 de marzo de 2001 a las 00:00".
// ═══════════════════════════════════════════════════════════════════

test('una fecha que no se puede leer no se convierte en una fecha que suena real', () => {
  assert.strictEqual(formatearFechaCompleta('mañana a las 3'), 'mañana a las 3');
  assert.strictEqual(formatearFechaCompleta(''), '');
  assert.strictEqual(formatearFechaCompleta(null), '');
  assert.strictEqual(leerFechaHora('mañana a las 3'), null);
  assert.strictEqual(leerFechaHora('2026-02-31T10:00:00'), null);
});

test('una fila envenenada no aporta un horario ocupado falso', () => {
  // Antes esto producía 'NaN:NaN', que no tacha ningún turno pero tampoco
  // avisa. Ahora la fila se descarta explícitamente.
  const visitas = [
    { fecha_visita: '2026-10-10T16:00:00' },
    { fecha_visita: 'mañana a las 3' },
    { fecha_visita: null },
  ];
  assert.deepStrictEqual(extraerHorariosOcupados(visitas), ['16:00']);

  const libres = calcularHorariosLibres(visitas, HORARIO_REAL);
  assert.ok(!libres.includes('16:00'));
  assert.ok(libres.includes('16:30'));
});

// ═══════════════════════════════════════════════════════════════════
//  validarRanura: el mismo contrato para la página y para el agente
//
//  La página validaba día, turno y pasado; agendar_visita no validaba
//  nada, así que el modelo podía dejar a Pamela comprometida a las 19:00
//  de un día que no atiende.
// ═══════════════════════════════════════════════════════════════════

test('validarRanura acepta un turno real de la grilla', () => {
  assert.deepStrictEqual(
    validarRanura('2026-11-10', '10:30', HORARIO_REAL, { ahora: new Date('2026-11-01T12:00:00Z') }),
    { ok: true }
  );
});

test('validarRanura rechaza fuera del horario de atención', () => {
  const r = validarRanura('2026-11-10', '08:15', HORARIO_REAL, { ahora: new Date('2026-11-01T12:00:00Z') });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'turno');

  const tarde = validarRanura('2026-11-10', '21:00', HORARIO_REAL, { ahora: new Date('2026-11-01T12:00:00Z') });
  assert.strictEqual(tarde.motivo, 'turno');
});

test('validarRanura rechaza un día que no se atiende', () => {
  const lunASab = resolverHorario({ hora_apertura: 8, hora_cierre: 20, dias_atencion: '1,2,3,4,5,6' });
  const r = validarRanura('2026-11-08', '10:30', lunASab, { ahora: new Date('2026-11-01T12:00:00Z') });
  assert.strictEqual(r.motivo, 'dia');
});

test('validarRanura rechaza el pasado medido en hora de Perú, no en UTC', () => {
  // 2026-11-10T02:00:00Z son las 21:00 del 9 de noviembre en Ica. Un turno a
  // las 19:00 del 9 todavía es pasado; uno a las 10:30 del 10 no lo es.
  const ahora = new Date('2026-11-10T02:00:00Z');
  assert.strictEqual(validarRanura('2026-11-09', '19:00', HORARIO_REAL, { ahora }).motivo, 'pasado');
  assert.strictEqual(validarRanura('2026-11-10', '10:30', HORARIO_REAL, { ahora }).ok, true);

  // Y al revés: a las 02:00 UTC del 10 el servidor cree que ya es el 10, pero
  // en Ica siguen siendo las 21:00 del 9, así que un turno de las 22:00 del 9
  // no es pasado por calendario — lo rechaza por no estar en la grilla.
  assert.strictEqual(validarRanura('2026-11-09', '22:00', HORARIO_REAL, { ahora }).motivo, 'turno');
});

test('validarRanura rechaza basura sin inventar una fecha', () => {
  assert.strictEqual(validarRanura('mañana', '10:30', HORARIO_REAL).motivo, 'fecha');
  assert.strictEqual(validarRanura('2026-02-31', '10:30', HORARIO_REAL).motivo, 'fecha');
  assert.strictEqual(validarRanura('2026-11-10', 'a las 3', HORARIO_REAL).motivo, 'hora');
});

test('al reservar no se exige el margen de una hora dos veces', () => {
  // La grilla pública solo ofrece turnos a más de MARGEN_MINUTOS. Si al
  // confirmar se volviera a exigir ese margen, el comprador que tardó unos
  // minutos en llenar el formulario vería rechazado el turno que acaba de
  // elegir: un callejón sin salida en el último paso del embudo.
  const ahora = new Date('2026-11-10T15:00:00Z'); // 10:00 en Ica
  assert.strictEqual(validarRanura('2026-11-10', '10:30', HORARIO_REAL, { ahora, margenMinutos: 0 }).ok, true);
  assert.strictEqual(validarRanura('2026-11-10', '10:30', HORARIO_REAL, { ahora, margenMinutos: 60 }).motivo, 'pasado');
});

// ═══════════════════════════════════════════════════════════════════
//  Identidades sin número de teléfono
//
//  El único enlace vivo el 26/10 (vjv9kdb) apunta a
//  'PE.2104140390227158'. La página le afirmaba "te contactamos al
//  ••••7158", que son los últimos dígitos de un id interno.
// ═══════════════════════════════════════════════════════════════════

test('una identidad PE.<id> no es un teléfono alcanzable', () => {
  assert.strictEqual(esTelefonoAlcanzable('PE.2104140390227158'), false);
  assert.strictEqual(esTelefonoAlcanzable('PE.981400590890326'), false);
  assert.strictEqual(esTelefonoAlcanzable('+51962279823'), true);
  assert.strictEqual(esTelefonoAlcanzable('962279823'), true);
  assert.strictEqual(esTelefonoAlcanzable(''), false);
  assert.strictEqual(esTelefonoAlcanzable(null), false);
});

// ═══════════════════════════════════════════════════════════════════
//  El WhatsApp de vuelta cuando el enlace venció
// ═══════════════════════════════════════════════════════════════════

test('si no hay teléfono cargado el hueco queda visible, no se inventa un número', async () => {
  const original = process.env.TWILIO_WHATSAPP_FROM;
  try {
    delete process.env.TWILIO_WHATSAPP_FROM;
    // Así está la base hoy: configuracion_agencia.telefono = ''.
    assert.strictEqual(await obtenerWhatsAppEmpresa({ telefono: '' }), null);
    assert.strictEqual(await obtenerWhatsAppEmpresa(null), null);

    // Con el número del canal cargado, ése es el respaldo: es el número al que
    // el comprador ya le escribió.
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+51999888777';
    assert.strictEqual(await obtenerWhatsAppEmpresa({ telefono: '' }), '51999888777');

    // El dato de Pamela gana sobre el del canal.
    assert.strictEqual(await obtenerWhatsAppEmpresa({ telefono: '+51 962 279 823' }), '51962279823');
  } finally {
    if (original === undefined) delete process.env.TWILIO_WHATSAPP_FROM;
    else process.env.TWILIO_WHATSAPP_FROM = original;
  }
});

// ═══════════════════════════════════════════════════════════════════
//  Validez del enlace
// ═══════════════════════════════════════════════════════════════════

test('el enlace dura más que la duda del comprador', () => {
  // Con 7 días, 15 de 16 enlaces estaban vencidos al momento de la auditoría y
  // el más viejo venció sin que nadie lo abriera.
  assert.ok(DIAS_VALIDEZ_ENLACE >= 30, `${DIAS_VALIDEZ_ENLACE} días es poco para un comprador de lotes`);
});
