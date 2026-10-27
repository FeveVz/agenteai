// Helpers para manejo de fechas en español

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Perú es UTC-5 todo el año (no hay horario de verano). El servidor de Vercel
// corre en UTC, así que cualquier cuenta de "hoy" o de "ya pasó" hecha con la
// hora del proceso se adelanta 5 horas: a las 20:00 UTC el servidor cree que
// son las 20:00 y en Ica son las 15:00, y tacharía media tarde de turnos que
// todavía están vivos.
const ZONA_PERU = 'America/Lima';

/**
 * Lee el reloj de pared de un 'YYYY-MM-DDTHH:MM[:SS]' tal como está escrito.
 *
 * Esto NO es un detalle de estilo. `visitas.fecha_visita` es TEXT y guarda lo
 * que eligió el comprador en la página ('2026-10-10T16:00:00', visita id 3).
 * Pasarlo por `new Date(...)` funciona por casualidad: una cadena sin zona se
 * interpreta como hora LOCAL del proceso, que en Vercel es UTC. El día que una
 * fila entre con sufijo ('...T16:00:00Z' o '+00:00') ese mismo `new Date` la
 * lee como UTC y getHours() devuelve 11 en Lima y 16 en el servidor: el turno
 * ocupado deja de coincidir con el de la grilla y se agendan dos visitas sobre
 * la misma hora. Leyendo los dígitos no hay zona que pueda correr la hora.
 *
 * Devuelve null si la cadena no tiene esa forma — lo que ya llegó de verdad:
 * 'mañana a las 3' escrito por el modelo.
 */
function leerFechaHora(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(valor == null ? '' : valor).trim());
  if (!m) return null;

  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const hora = m[4] == null ? 0 : Number(m[4]);
  const minuto = m[5] == null ? 0 : Number(m[5]);

  if (mes < 1 || mes > 12 || dia < 1 || hora > 23 || minuto > 59) return null;

  // Rechaza el 31 de febrero: si el día no existe en ese mes, Date lo corre.
  const utc = new Date(Date.UTC(anio, mes - 1, dia));
  if (utc.getUTCMonth() !== mes - 1 || utc.getUTCDate() !== dia) return null;

  return { anio, mes, dia, hora, minuto, diaSemana: utc.getUTCDay() };
}

/**
 * Formatea una fecha ISO a texto legible en español
 * Ej: "2026-03-22T14:30:00" → "domingo 22 de marzo de 2026 a las 14:30"
 *
 * Con basura devuelve la cadena original. Antes `new Date('mañana a las 3')`
 * daba Invalid Date y el comprador recibía por WhatsApp "Visita confirmada ...
 * el jueves 1 de marzo de 2001 a las 00:00": una fecha que suena real y que
 * nadie puede detectar como inventada.
 */
function formatearFechaCompleta(fechaISO) {
  const p = leerFechaHora(fechaISO);
  if (!p) return String(fechaISO == null ? '' : fechaISO);

  const hora = String(p.hora).padStart(2, '0');
  const minutos = String(p.minuto).padStart(2, '0');
  return `${DIAS_SEMANA[p.diaSemana]} ${p.dia} de ${MESES[p.mes - 1]} de ${p.anio} a las ${hora}:${minutos}`;
}

/**
 * Formatea solo la hora de una fecha ISO
 * Ej: "2026-03-22T14:30:00" → "14:30"
 *
 * Devuelve null si no se puede leer: así una fila envenenada no aporta un
 * horario ocupado falso (antes 'mañana a las 3' producía 'NaN:NaN').
 */
function formatearHora(fechaISO) {
  const p = leerFechaHora(fechaISO);
  if (!p) return null;
  return `${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`;
}

/**
 * El reloj de Ica: la fecha 'YYYY-MM-DD' y los minutos transcurridos del día,
 * calculados con Intl y no con `new Date(d.toLocaleString(...))`.
 *
 * Ese truco funcionaba, pero depende de que V8 sepa reparsear "10/26/2026,
 * 4:45:12 PM". Acá los números salen directo de las partes formateadas.
 */
function relojEnPeru(instante) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_PERU,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  const p = {};
  for (const parte of fmt.formatToParts(instante || new Date())) p[parte.type] = parte.value;

  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    minutos: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

/** 'YYYY-MM-DD' de hoy en Ica. */
function fechaHoyEnPeru(instante) {
  return relojEnPeru(instante).fecha;
}

/** Minutos transcurridos del día en Ica (14:30 → 870). */
function minutosDelDiaEnPeru(instante) {
  return relojEnPeru(instante).minutos;
}

// ── Horario de atención ───────────────────────────────────────────────────────
//
// Se carga desde el panel (configuracion_agencia), no está en el código: cada
// clienta atiende distinto, y una que no trabaja domingos no puede tener un
// calendario que se los ofrezca.
//
// Estos valores son solo el punto de partida de una base recién creada.
const HORARIO_POR_DEFECTO = {
  apertura: 9,
  cierre: 17,
  minutos_por_slot: 30,
  dias: [0, 1, 2, 3, 4, 5, 6], // convención de Date.getDay(): 0 = domingo
};

// Compatibilidad hacia atrás: había código importando estas constantes.
const HORA_APERTURA = HORARIO_POR_DEFECTO.apertura;
const HORA_CIERRE = HORARIO_POR_DEFECTO.cierre;

/** Un entero dentro de un rango, o el valor por defecto si viene basura. */
function enteroEnRango(valor, minimo, maximo, porDefecto) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= minimo && n <= maximo ? n : porDefecto;
}

/**
 * Normaliza la fila de configuración a un horario usable.
 *
 * Tolera datos incompletos o mal cargados a propósito: esto lo edita una
 * persona desde el panel, y un cierre antes de la apertura no puede dejar el
 * calendario vacío sin explicación.
 */
function resolverHorario(config) {
  const c = config || {};

  const apertura = enteroEnRango(c.hora_apertura, 0, 23, HORARIO_POR_DEFECTO.apertura);
  let cierre = enteroEnRango(c.hora_cierre, 0, 23, HORARIO_POR_DEFECTO.cierre);
  if (cierre < apertura) cierre = apertura;

  const paso = enteroEnRango(c.minutos_por_slot, 5, 60, HORARIO_POR_DEFECTO.minutos_por_slot);

  // "1,2,3,4,5,6" → [1,2,3,4,5,6]. Si queda vacío se atienden todos los días:
  // es preferible ofrecer de más y que la asesora reprograme, a que el
  // calendario no muestre ni un día y el cliente se vaya.
  const dias = String(c.dias_atencion == null ? '' : c.dias_atencion)
    .split(/[,\s]+/)
    .filter(d => d !== '')      // sin esto, '' se convierte en 0 y queda "solo domingo"
    .map(d => Number(d))
    .filter(d => Number.isInteger(d) && d >= 0 && d <= 6);

  return {
    apertura,
    cierre,
    minutos_por_slot: paso,
    dias: dias.length > 0 ? [...new Set(dias)].sort() : HORARIO_POR_DEFECTO.dias,
  };
}

/** ¿Se atiende ese día de la semana? `fecha` es 'YYYY-MM-DD'. */
function esDiaDeAtencion(fecha, horario) {
  const h = horario || HORARIO_POR_DEFECTO;
  const p = leerFechaHora(fecha);
  if (!p) return false;
  return h.dias.includes(p.diaSemana);
}

/**
 * Texto legible del horario, DERIVADO de los mismos datos que usa el
 * calendario. No es un campo aparte a propósito: un texto suelto que dijera
 * "lunes a sábado" mientras el calendario ofrece domingos es justo la clase de
 * contradicción que el cliente descubre cuando ya reservó.
 */
function describirDias(horario) {
  const h = horario || HORARIO_POR_DEFECTO;
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dias = [...h.dias].sort();

  if (dias.length === 7) return 'Todos los días';

  // Semana corrida (lunes..sábado, martes..viernes): se dice como rango.
  const enOrdenSemanal = dias.filter(d => d !== 0).concat(dias.includes(0) ? [0] : []);
  const corridos = enOrdenSemanal.every((d, i) =>
    i === 0 || d === (enOrdenSemanal[i - 1] % 7) + 1 || (enOrdenSemanal[i - 1] === 6 && d === 0));

  if (corridos && enOrdenSemanal.length > 2) {
    const primero = nombres[enOrdenSemanal[0]];
    const ultimo = nombres[enOrdenSemanal[enOrdenSemanal.length - 1]];
    return `De ${primero} a ${ultimo}`;
  }

  const lista = enOrdenSemanal.map(d => nombres[d]);
  if (lista.length === 1) return `Solo ${lista[0]}`;
  return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
}

/** "De lunes a domingo, de 09:00 a 17:00" */
function describirHorario(horario) {
  const h = horario || HORARIO_POR_DEFECTO;
  const hh = n => `${String(n).padStart(2, '0')}:00`;
  return `${describirDias(h)}, de ${hh(h.apertura)} a ${hh(h.cierre)}`;
}

/**
 * Genera todos los turnos de un día según el horario configurado.
 * El último turno es a la hora de cierre, inclusive.
 */
function generarHorariosDelDia(horario) {
  const h = horario || HORARIO_POR_DEFECTO;
  const turnos = [];
  for (let minutos = h.apertura * 60; minutos <= h.cierre * 60; minutos += h.minutos_por_slot) {
    turnos.push(`${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`);
  }
  return turnos;
}

/**
 * ¿Ese día y esa hora son agendables? Única fuente de verdad del contrato.
 *
 * Vive acá y no dentro de la ruta pública porque la página web validaba el día,
 * el turno y el pasado mientras `agendar_visita` no validaba nada: el modelo
 * podía agendar fuera del horario de atención y Pamela recibía la alerta por
 * correo comprometida a una hora que no atiende. Con 3 visitas en todo el
 * historial, una mal agendada es un tercio del resultado.
 *
 * `margenMinutos` es el aire mínimo contra el reloj de Ica. Al reservar va en 0
 * a propósito: la grilla pública ya solo ofrece turnos a más de una hora, y
 * volver a exigir ese margen al confirmar rechazaría el turno que el comprador
 * acaba de elegir si tardó unos minutos en llenar el formulario.
 */
function validarRanura(fecha, hora, horario, opciones) {
  const margenMinutos = (opciones && Number(opciones.margenMinutos)) || 0;
  const h = horario || HORARIO_POR_DEFECTO;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha == null ? '' : fecha)) || !leerFechaHora(fecha)) {
    return { ok: false, motivo: 'fecha', mensaje: 'Elige una fecha válida del calendario.' };
  }
  if (!/^\d{2}:\d{2}$/.test(String(hora == null ? '' : hora))) {
    return { ok: false, motivo: 'hora', mensaje: 'Elige un horario de la lista.' };
  }
  if (!esDiaDeAtencion(fecha, h)) {
    return { ok: false, motivo: 'dia', mensaje: `Ese día no atendemos. ${describirHorario(h)}.` };
  }
  if (!generarHorariosDelDia(h).includes(hora)) {
    return { ok: false, motivo: 'turno', mensaje: `Ese horario no está dentro de la atención. ${describirHorario(h)}.` };
  }

  const reloj = relojEnPeru(opciones && opciones.ahora);
  const [hh, mm] = hora.split(':').map(Number);
  if (fecha < reloj.fecha || (fecha === reloj.fecha && hh * 60 + mm < reloj.minutos + margenMinutos)) {
    return { ok: false, motivo: 'pasado', mensaje: 'Ese horario ya pasó. Elige uno más adelante.' };
  }

  return { ok: true };
}

/**
 * Extrae los horarios ocupados de una lista de visitas
 *
 * Las filas que no se pueden leer se descartan en vez de aportar 'NaN:NaN'.
 */
function extraerHorariosOcupados(visitas) {
  return (visitas || []).map(v => formatearHora(v.fecha_visita)).filter(Boolean);
}

/**
 * Devuelve los horarios libres para una fecha dado un array de visitas
 *
 * Quien llama es responsable de excluir las visitas canceladas: el turno de una
 * visita que el comprador canceló por teléfono quedaba bloqueado para siempre.
 */
function calcularHorariosLibres(visitas, horario) {
  const todos = generarHorariosDelDia(horario);
  const ocupados = extraerHorariosOcupados(visitas);
  return todos.filter(h => !ocupados.includes(h));
}

/**
 * Formatea un timestamp de SQLite para logs
 * Ej: "2026-03-22 14:30:00" → "22/03/2026 14:30"
 */
function formatearTimestamp(timestamp) {
  if (!timestamp) return '-';
  const fecha = new Date(timestamp);
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  const hora = String(fecha.getHours()).padStart(2, '0');
  const min = String(fecha.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${anio} ${hora}:${min}`;
}

module.exports = {
  HORA_APERTURA,
  HORA_CIERRE,
  HORARIO_POR_DEFECTO,
  ZONA_PERU,
  resolverHorario,
  esDiaDeAtencion,
  describirDias,
  describirHorario,
  formatearFechaCompleta,
  formatearHora,
  leerFechaHora,
  fechaHoyEnPeru,
  minutosDelDiaEnPeru,
  validarRanura,
  generarHorariosDelDia,
  extraerHorariosOcupados,
  calcularHorariosLibres,
  formatearTimestamp,
};
