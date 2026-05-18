const express = require('express');
const cors = require('cors');
const path = require('path');

const webhookRouter = require('./routes/webhook');
const mensajesRouter = require('./routes/mensajes');
const reunionesRouter = require('./routes/turnos');
const configuracionRouter = require('./routes/configuracion');

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/api/webhook', webhookRouter);
app.use('/api/mensajes', mensajesRouter);
app.use('/api/reuniones', reunionesRouter);
app.use('/api/configuracion', configuracionRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, agencia: 'Suggestion', timestamp: new Date().toISOString() });
});

const distPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: 'Frontend no disponible.' });
  });
});

app.use((error, _req, res, _next) => {
  console.error('[Server] Error:', error);
  res.status(500).json({ error: 'Error interno', detalle: error.message });
});

module.exports = app;
