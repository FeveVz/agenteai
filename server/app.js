const express = require('express');
const cors = require('cors');
const path = require('path');

const webhookRouter = require('./routes/webhook');
const mensajesRouter = require('./routes/mensajes');
const visitasRouter = require('./routes/visitas');
const proyectosRouter = require('./routes/proyectos');
const configuracionRouter = require('./routes/configuracion');
const authRouter = require('./routes/auth');
const { router: agendaRouter } = require('./routes/agenda');
const { requiereAuth, proteccionActiva } = require('./middleware/auth');
const { obtenerSupabase } = require('./db');

const app = express();

// Detrás del proxy de Vercel: necesario para que req.ip sea la IP real
// del cliente y no la del proxy (lo usa el rate limit del login).
app.set('trust proxy', true);

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Rutas públicas ────────────────────────────────────────────────────────────
// El webhook se protege con la firma de Twilio, no con el token del panel:
// Twilio no puede mandar cabeceras Authorization.
app.use('/api/webhook', webhookRouter);
app.use('/api/auth', authRouter);

// Agenda pública: la abre el cliente desde el link que le manda Valeria.
// Se protege con un token firmado, no con el login del panel.
app.use('/api/agenda', agendaRouter);

// Diagnóstico. No expone datos: solo si las piezas están conectadas.
app.get('/api/health', async (_req, res) => {
  const salud = {
    ok: true,
    empresa: 'Ceinys',
    timestamp: new Date().toISOString(),
    config: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
      twilio_envio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM),
      twilio_firma: Boolean(process.env.TWILIO_AUTH_TOKEN),
      panel_protegido: proteccionActiva(),
      alertas_email: Boolean(process.env.RESEND_API_KEY),
    },
    base_de_datos: { conectada: false, tablas: {} },
  };

  // Huella del proyecto Supabase al que apunta, para poder confirmar desde
  // afuera que las variables apuntan a donde creemos. No expone el ref completo.
  try {
    const host = new URL(process.env.SUPABASE_URL).host;
    salud.base_de_datos.proyecto = `${host.slice(0, 6)}…${host.slice(host.indexOf('.'))}`;
  } catch { /* URL ausente o inválida */ }

  // Formato de la clave, sin revelar su valor: ayuda a distinguir entre la
  // clave nueva (sb_secret_/sb_publishable_) y la legacy (JWT que empieza con eyJ).
  const clave = process.env.SUPABASE_SERVICE_KEY || '';
  salud.base_de_datos.tipo_clave = !clave ? 'ausente'
    : clave.startsWith('sb_secret_') ? 'nueva-secret'
    : clave.startsWith('sb_publishable_') ? 'nueva-publishable (SIN permisos de escritura)'
    : clave.startsWith('eyJ') ? 'legacy-jwt'
    : 'desconocido';
  salud.base_de_datos.largo_clave = clave.length;

  try {
    const supabase = obtenerSupabase();

    for (const tabla of ['configuracion_agencia', 'visitas', 'proyectos', 'mensajes_whatsapp']) {
      const { error } = await supabase.from(tabla).select('id', { count: 'exact', head: true });
      salud.base_de_datos.tablas[tabla] = error
        ? `error[${error.code || 's/codigo'}]: ${error.message || error.hint || error.details || '(sin mensaje)'}`
        : 'ok';
    }

    salud.base_de_datos.conectada = Object.values(salud.base_de_datos.tablas).every(v => v === 'ok');
  } catch (error) {
    salud.base_de_datos.error = error.message;
  }

  const todoOk = salud.config.openai && salud.config.supabase && salud.base_de_datos.conectada;
  salud.ok = todoOk;

  res.status(todoOk ? 200 : 503).json(salud);
});

// ── Rutas protegidas (requieren login en el panel) ─────────────────────────────
app.use('/api/mensajes', requiereAuth, mensajesRouter);
app.use('/api/visitas', requiereAuth, visitasRouter);
app.use('/api/proyectos', requiereAuth, proyectosRouter);
app.use('/api/configuracion', requiereAuth, configuracionRouter);

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
