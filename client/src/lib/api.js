const BASE_URL = '/api';

async function manejarRespuesta(res) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function obtenerMensajes() {
  return manejarRespuesta(await fetch(`${BASE_URL}/mensajes`));
}

export async function obtenerVisitas() {
  return manejarRespuesta(await fetch(`${BASE_URL}/visitas`));
}

export async function obtenerVisitasPorFecha(fecha) {
  return manejarRespuesta(await fetch(`${BASE_URL}/visitas/${fecha}`));
}

export async function obtenerProyectos() {
  return manejarRespuesta(await fetch(`${BASE_URL}/proyectos`));
}

export async function actualizarProyecto({ id, ...datos }) {
  return manejarRespuesta(await fetch(`${BASE_URL}/proyectos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  }));
}

export async function crearProyecto(datos) {
  return manejarRespuesta(await fetch(`${BASE_URL}/proyectos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  }));
}

export async function obtenerConfiguracion() {
  return manejarRespuesta(await fetch(`${BASE_URL}/configuracion`));
}

export async function actualizarConfiguracion(datos) {
  return manejarRespuesta(await fetch(`${BASE_URL}/configuracion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  }));
}
