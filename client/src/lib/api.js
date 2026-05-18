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

export async function obtenerReuniones() {
  return manejarRespuesta(await fetch(`${BASE_URL}/reuniones`));
}

export async function obtenerReunionesPorFecha(fecha) {
  return manejarRespuesta(await fetch(`${BASE_URL}/reuniones/${fecha}`));
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
