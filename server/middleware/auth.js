const crypto = require('crypto');

// Duración de la sesión del panel
const DURACION_MS = 12 * 60 * 60 * 1000; // 12 horas

/**
 * ¿Está configurada la protección del panel?
 * Si no hay PANEL_PASSWORD, el middleware deja pasar todo y avisa por consola.
 * Esto es deliberado: preferimos que el panel quede accesible a que la app
 * se vuelva inusable si alguien despliega sin configurar la variable.
 */
function proteccionActiva() {
  return Boolean(process.env.PANEL_PASSWORD && process.env.PANEL_PASSWORD.trim());
}

function obtenerSecreto() {
  return process.env.PANEL_PASSWORD.trim();
}

/**
 * Comparación en tiempo constante. Evita filtrar información por cuánto
 * tarda en fallar la comparación.
 */
function comparacionSegura(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function firmar(payload) {
  return crypto.createHmac('sha256', obtenerSecreto()).update(payload).digest('hex');
}

/**
 * Token con formato "<expiraEnMs>.<firma>". No guarda estado en el servidor:
 * la firma HMAC con PANEL_PASSWORD alcanza para verificarlo. Cambiar la
 * contraseña invalida todas las sesiones abiertas, que es lo que queremos.
 */
function crearToken() {
  const expira = Date.now() + DURACION_MS;
  return `${expira}.${firmar(String(expira))}`;
}

function tokenValido(token) {
  if (!token || typeof token !== 'string') return false;

  const partes = token.split('.');
  if (partes.length !== 2) return false;

  const [expiraStr, firma] = partes;
  const expira = Number(expiraStr);
  if (!Number.isFinite(expira) || Date.now() > expira) return false;

  return comparacionSegura(firma, firmar(expiraStr));
}

function passwordValida(password) {
  if (!password) return false;
  return comparacionSegura(password, obtenerSecreto());
}

/**
 * Middleware: exige un token válido en Authorization: Bearer <token>.
 */
function requiereAuth(req, res, next) {
  if (!proteccionActiva()) return next();

  const cabecera = req.get('authorization') || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : null;

  if (!tokenValido(token)) {
    return res.status(401).json({ error: 'No autorizado', requiere_login: true });
  }

  next();
}

module.exports = { requiereAuth, crearToken, passwordValida, proteccionActiva };
