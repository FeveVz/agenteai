const crypto = require('crypto');

// Duración de la sesión del panel
const DURACION_MS = 12 * 60 * 60 * 1000; // 12 horas

/**
 * ¿Está configurada la protección del panel?
 *
 * Si no hay PANEL_PASSWORD, la API de gestión queda CERRADA, no abierta.
 * Antes era al revés — dejaba pasar todo — con la idea de que un despliegue
 * incompleto no se volviera inusable. Con varios clientes en el mismo código
 * ese default se volvió peligroso: a un despliegue nuevo al que se le olvide
 * la variable le quedan las conversaciones y los teléfonos de sus clientes
 * abiertos a internet, y `/api/health` seguía respondiendo `ok: true`.
 *
 * Un panel que no abre se nota en cinco minutos; uno público, no.
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
  if (!proteccionActiva()) {
    console.error('[Auth] Falta PANEL_PASSWORD: la API de gestión queda cerrada hasta configurarla.');
    return res.status(503).json({
      error: 'El panel no está configurado. Falta definir PANEL_PASSWORD en las variables de entorno.',
      requiere_configuracion: true,
    });
  }

  const cabecera = req.get('authorization') || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : null;

  if (!tokenValido(token)) {
    return res.status(401).json({ error: 'No autorizado', requiere_login: true });
  }

  next();
}

module.exports = { requiereAuth, crearToken, passwordValida, proteccionActiva };
