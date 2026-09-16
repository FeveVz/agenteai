const express = require('express');
const cors = require('cors');
const path = require('path');

const webhookRouter = require('./routes/webhook');
const mensajesRouter = require('./routes/mensajes');
const visitasRouter = require('./routes/visitas');
const proyectosRouter = require('./routes/proyectos');
const configuracionRouter = require('./routes/configuracion');
const desarrolladorasRouter = require('./routes/desarrolladoras');
const { router: archivosRouter } = require('./routes/archivos');
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
    empresa: null, // se completa desde la base, más abajo
    timestamp: new Date().toISOString(),
    config: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
      twilio_envio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM),
      twilio_firma: Boolean(process.env.TWILIO_AUTH_TOKEN),
      panel_protegido: proteccionActiva(),
      // Sin APP_URL el agente no puede mandar el enlace del calendario.
      app_url: Boolean(String(process.env.APP_URL || '').trim()),
      alertas_email: Boolean(process.env.RESEND_API_KEY),
    },
    base_de_datos: { conectada: false, tablas: {} },
  };

  // Que version esta viva. Vercel inyecta estas variables solo, y sin
  // ellas confirmar si un cambio llego a produccion es adivinar: el
  // bundle del cliente lleva hash, pero la funcion del servidor no.
  const commit = String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
  salud.version = {
    commit: commit || '(local)',
    desplegado_en: process.env.VERCEL_DEPLOYMENT_ID ? 'vercel' : 'local',
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

    // enlaces_agenda incluida a propósito: vive en una migración aparte y es
    // fácil olvidarla al levantar una base nueva. Sin ella el agente no puede
    // mandar el enlace del calendario, y antes el health decía que todo bien.
    for (const tabla of ['configuracion_agencia', 'visitas', 'proyectos', 'mensajes_whatsapp', 'enlaces_agenda', 'desarrolladoras']) {
      // `*` y no 'id': enlaces_agenda no tiene columna id, su clave primaria
      // es `codigo`. Con head:true no viajan filas, así que sigue siendo un
      // simple "¿existe y se puede leer?".
      const { error } = await supabase.from(tabla).select('*', { count: 'exact', head: true });
      salud.base_de_datos.tablas[tabla] = error
        ? `error[${error.code || 's/codigo'}]: ${error.message || error.hint || error.details || '(sin mensaje)'}`
        : 'ok';
    }

    salud.base_de_datos.conectada = Object.values(salud.base_de_datos.tablas).every(v => v === 'ok');

    const { data: cfg } = await supabase
      .from('configuracion_agencia').select('nombre_agencia').limit(1).single();
    salud.empresa = (cfg && cfg.nombre_agencia) || null;
  } catch (error) {
    salud.base_de_datos.error = error.message;
  }

  // panel_protegido, app_url y twilio_firma entran en el veredicto: son las
  // tres formas en que un despliegue nuevo se rompe sin que nadie lo note.
  // Sin la primera el panel no abre, sin la segunda el agente manda enlaces
  // que no funcionan, y sin la tercera el webhook queda cerrado y el agente
  // no contesta. Un health que dice "ok" con eso roto no sirve de nada.
  const todoOk = salud.config.openai
    && salud.config.supabase
    && salud.config.panel_protegido
    && salud.config.app_url
    && salud.config.twilio_firma
    && salud.base_de_datos.conectada;
  salud.ok = todoOk;

  res.status(todoOk ? 200 : 503).json(salud);
});

// ── Rutas protegidas (requieren login en el panel) ─────────────────────────────
app.use('/api/mensajes', requiereAuth, mensajesRouter);
app.use('/api/visitas', requiereAuth, visitasRouter);
app.use('/api/proyectos', requiereAuth, proyectosRouter);
app.use('/api/configuracion', requiereAuth, configuracionRouter);
app.use('/api/desarrolladoras', requiereAuth, desarrolladorasRouter);
app.use('/api/archivos', requiereAuth, archivosRouter);

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
