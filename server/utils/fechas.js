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

// Horario de atención para visitas: de lunes a domingo, 09:00 a 17:00.
// Un solo lugar para cambiarlo — lo usan el agente, el link de agenda y el panel.
const HORA_APERTURA = 9;
const HORA_CIERRE = 17;
const MINUTOS_POR_SLOT = 30;

/**
 * Genera todos los horarios de visita de un día (09:00 a 17:00, cada 30 min).
 * El último turno es a las 17:00 inclusive.
 */
function generarHorariosDelDia() {
  const horarios = [];
  for (let hora = HORA_APERTURA; hora <= HORA_CIERRE; hora++) {
    horarios.push(`${String(hora).padStart(2, '0')}:00`);
    if (hora < HORA_CIERRE) horarios.push(`${String(hora).padStart(2, '0')}:${MINUTOS_POR_SLOT}`);
  }
  return horarios;
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
function calcularHorariosLibres(visitas) {
  const todos = generarHorariosDelDia();
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
  formatearFechaCompleta,
  formatearHora,
  generarHorariosDelDia,
  extraerHorariosOcupados,
  calcularHorariosLibres,
  formatearTimestamp,
};
