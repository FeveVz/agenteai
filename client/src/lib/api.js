const BASE_URL = '/api';
const CLAVE_TOKEN = 'ceinys_panel_token';

// ── Sesión ────────────────────────────────────────────────────────────────────

export function obtenerToken() {
  try { return localStorage.getItem(CLAVE_TOKEN); } catch { return null; }
}

export function guardarToken(token) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch { /* modo privado sin localStorage */ }
}

export function cerrarSesion() {
  guardarToken(null);
}

/** Se dispara cuando el backend responde 401: la UI vuelve al login. */
function notificarSesionExpirada() {
  guardarToken(null);
  window.dispatchEvent(new CustomEvent('ceinys:sesion-expirada'));
}

// ── Fetch con token ───────────────────────────────────────────────────────────

async function manejarRespuesta(res) {
  if (res.status === 401) {
    notificarSesionExpirada();
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Sesión expirada. Volvé a ingresar.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

function cabeceras(extra = {}) {
  const token = obtenerToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function pedir(ruta, opciones = {}) {
  const res = await fetch(`${BASE_URL}${ruta}`, {
    ...opciones,
    headers: cabeceras(opciones.headers),
  });
  return manejarRespuesta(res);
}

function pedirJSON(ruta, metodo, datos) {
  return pedir(ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
}

// ── Autenticación ─────────────────────────────────────────────────────────────

export async function estadoAuth() {
  const res = await fetch(`${BASE_URL}/auth/estado`);
  return manejarRespuesta(res);
}

export async function iniciarSesion(password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  // El login no debe disparar "sesión expirada" ante una contraseña incorrecta
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status}`);
  }

  const data = await res.json();
  if (data.token) guardarToken(data.token);
  return data;
}

// ── Datos ─────────────────────────────────────────────────────────────────────

export const obtenerMensajes = () => pedir('/mensajes');
export const obtenerConversaciones = () => pedir('/mensajes/conversaciones');
export const obtenerConversacion = (numero) => pedir(`/mensajes/${encodeURIComponent(numero)}`);
export const obtenerVisitas = () => pedir('/visitas');
export const obtenerVisitasPorFecha = (fecha) => pedir(`/visitas/${fecha}`);
export const obtenerProyectos = () => pedir('/proyectos');
export const obtenerConfiguracion = () => pedir('/configuracion');

export const actualizarProyecto = ({ id, ...datos }) => pedirJSON(`/proyectos/${id}`, 'PUT', datos);
export const crearProyecto = (datos) => pedirJSON('/proyectos', 'POST', datos);
export const actualizarConfiguracion = (datos) => pedirJSON('/configuracion', 'PUT', datos);
