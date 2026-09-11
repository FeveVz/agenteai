// Helpers para manejo de fechas en español

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Formatea una fecha ISO a texto legible en español
 * Ej: "2026-03-22T14:30:00" → "domingo 22 de marzo de 2026 a las 14:30"
 */
function formatearFechaCompleta(fechaISO) {
  const fecha = new Date(fechaISO);
  const diaSemana = DIAS_SEMANA[fecha.getDay()];
  const dia = fecha.getDate();
  const mes = MESES[fecha.getMonth()];
  const anio = fecha.getFullYear();
  const hora = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${diaSemana} ${dia} de ${mes} de ${anio} a las ${hora}:${minutos}`;
}

/**
 * Formatea solo la hora de una fecha ISO
 * Ej: "2026-03-22T14:30:00" → "14:30"
 */
function formatearHora(fechaISO) {
  const fecha = new Date(fechaISO);
  const hora = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${hora}:${minutos}`;
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
  const [a, m, d] = String(fecha).split('-').map(Number);
  if (!a || !m || !d) return false;
  return h.dias.includes(new Date(a, m - 1, d).getDay());
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
 * Extrae los horarios ocupados de una lista de visitas
 */
function extraerHorariosOcupados(visitas) {
  return visitas.map(v => formatearHora(v.fecha_visita));
}

/**
 * Devuelve los horarios libres para una fecha dado un array de visitas
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
  resolverHorario,
  esDiaDeAtencion,
  describirDias,
  describirHorario,
  formatearFechaCompleta,
  formatearHora,
  generarHorariosDelDia,
  extraerHorariosOcupados,
  calcularHorariosLibres,
  formatearTimestamp,
};
