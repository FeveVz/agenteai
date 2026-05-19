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

/**
 * Genera todos los horarios disponibles en un día (9:00 a 18:00, cada 30 min)
 */
function generarHorariosDelDia() {
  const horarios = [];
  for (let hora = 9; hora < 18; hora++) {
    horarios.push(`${String(hora).padStart(2, '0')}:00`);
    horarios.push(`${String(hora).padStart(2, '0')}:30`);
  }
  return horarios;
}

/**
 * Extrae los horarios ocupados de una lista de turnos
 */
function extraerHorariosOcupados(turnos) {
  return turnos.map(t => formatearHora(t.fecha_reunion || t.fecha_turno));
}

/**
 * Devuelve los horarios libres para una fecha dado un array de turnos
 */
function calcularHorariosLibres(turnos) {
  const todos = generarHorariosDelDia();
  const ocupados = extraerHorariosOcupados(turnos);
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
  formatearFechaCompleta,
  formatearHora,
  generarHorariosDelDia,
  extraerHorariosOcupados,
  calcularHorariosLibres,
  formatearTimestamp,
};
