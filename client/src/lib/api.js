// Funciones para comunicarse con la API del backend

const BASE_URL = '/api';

async function manejarRespuesta(res) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// ── Mensajes ──────────────────────────────────────────────────────────────────

export async function obtenerMensajes() {
  const res = await fetch(`${BASE_URL}/mensajes`);
  return manejarRespuesta(res);
}

// ── Turnos ────────────────────────────────────────────────────────────────────

export async function obtenerTurnos() {
  const res = await fetch(`${BASE_URL}/turnos`);
  return manejarRespuesta(res);
}

export async function obtenerTurnosPorFecha(fecha) {
  const res = await fetch(`${BASE_URL}/turnos/${fecha}`);
  return manejarRespuesta(res);
}

// ── Configuración ─────────────────────────────────────────────────────────────

export async function obtenerConfiguracion() {
  const res = await fetch(`${BASE_URL}/configuracion`);
  return manejarRespuesta(res);
}

export async function actualizarConfiguracion(datos) {
  const res = await fetch(`${BASE_URL}/configuracion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  return manejarRespuesta(res);
}
