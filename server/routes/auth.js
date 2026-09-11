const express = require('express');
const { crearToken, passwordValida, proteccionActiva } = require('../middleware/auth');

const router = express.Router();

// Límite de intentos por IP, para que la contraseña no se pueda probar a fuerza bruta
const intentos = new Map();
const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 10;

function demasiadosIntentos(ip) {
  const ahora = Date.now();
  const registro = intentos.get(ip);

  if (!registro || ahora - registro.inicio > VENTANA_MS) {
    intentos.set(ip, { conteo: 1, inicio: ahora });
    return false;
  }

  registro.conteo++;
  return registro.conteo > MAX_INTENTOS;
}

// GET /api/auth/estado — ¿hace falta login?
router.get('/estado', (_req, res) => {
  res.json({ ok: true, proteccion_activa: proteccionActiva() });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  // Sin contraseña configurada no se emite ningún token: la API está cerrada
  // (ver requiereAuth) y devolver `ok: true` acá solo produciría un panel que
  // parece abierto y falla en cada llamada.
  if (!proteccionActiva()) {
    return res.status(503).json({
      error: 'El panel no está configurado. Falta definir PANEL_PASSWORD en las variables de entorno.',
      requiere_configuracion: true,
    });
  }

  const ip = req.ip || req.get('x-forwarded-for') || 'desconocida';

  if (demasiadosIntentos(ip)) {
    console.warn(`[Auth] Demasiados intentos fallidos desde ${ip}`);
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  }

  const { password } = req.body || {};

  if (!passwordValida(password)) {
    console.warn(`[Auth] Intento fallido desde ${ip}`);
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }

  intentos.delete(ip);
  console.log('[Auth] Login correcto.');
  res.json({ ok: true, token: crearToken(), proteccion_activa: true });
});

module.exports = router;
