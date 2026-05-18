const express = require('express');
const cors = require('cors');
const path = require('path');

const webhookRouter = require('./routes/webhook');
const mensajesRouter = require('./routes/mensajes');
const turnosRouter = require('./routes/turnos');
const configuracionRouter = require('./routes/configuracion');

const app = express();

// ── Middlewares ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ── Rutas API ─────────────────────────────────────────────────────────────────

app.use('/api/webhook', webhookRouter);
app.use('/api/mensajes', mensajesRouter);
app.use('/api/turnos', turnosRouter);
app.use('/api/configuracion', configuracionRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ── Servir frontend en producción ─────────────────────────────────────────────

const distPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: 'Frontend no disponible.' });
  });
});

// ── Manejo de errores global ──────────────────────────────────────────────────

app.use((error, _req, res, _next) => {
  console.error('[Server] Error no manejado:', error);
  res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
});

module.exports = app;
