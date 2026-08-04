# 🏗️ Ceinys — Agente IA de WhatsApp

Agente de IA para **Ceinys, Constructora e Inmobiliaria**. Valeria, la asesora virtual, atiende
por WhatsApp a los interesados en los proyectos, responde sobre cada uno y **agenda visitas**.
Incluye un panel web para que el equipo comercial vea los mensajes, gestione las visitas y cargue
los datos de cada proyecto.

## Stack tecnológico

- **Backend:** Node.js + Express (desplegado como Serverless Function en Vercel)
- **Base de datos:** Supabase (PostgreSQL)
- **Frontend:** React + Vite + Tailwind CSS
- **WhatsApp:** Twilio (webhook + REST API para respuestas lentas)
- **IA:** OpenAI GPT-4o con function calling

---

## Cómo está armado

```
agenteai/
├── api/
│   └── index.js               ← Entrada de Vercel: monta server/app.js
├── server/
│   ├── app.js                 ← App Express (rutas + estáticos)
│   ├── index.js               ← Arranque local (no lo usa Vercel)
│   ├── db.js                  ← Cliente de Supabase
│   ├── routes/
│   │   ├── webhook.js         ← POST del webhook de Twilio
│   │   ├── mensajes.js        ← Historial de WhatsApp
│   │   ├── visitas.js         ← Visitas agendadas
│   │   ├── proyectos.js       ← Catálogo de proyectos (GET/POST/PUT)
│   │   └── configuracion.js   ← Datos de la empresa
│   ├── services/
│   │   ├── openai.js          ← Valeria: system prompt + herramientas
│   │   └── twilio.js          ← TwiML y envío vía REST API
│   └── utils/fechas.js        ← Fechas y slots en español
├── client/src/
│   ├── pages/
│   │   ├── Landing.jsx        ← Página pública
│   │   └── Dashboard.jsx      ← Panel (4 pestañas)
│   └── components/
│       ├── TabMensajes.jsx
│       ├── TabVisitas.jsx     → CalendarioVisitas / ListaVisitas
│       ├── TabProyectos.jsx   ← Carga de datos de cada proyecto
│       └── TabConfiguracion.jsx
├── supabase-schema.sql            ← Instalación limpia
└── supabase-migration-ceinys.sql  ← Migración desde el esquema anterior
```

### Dónde vive cada cosa

Esto es lo más importante de entender antes de editar:

| Qué | Dónde se cambia |
|---|---|
| Personalidad y reglas de Valeria | `server/services/openai.js` (prompt) + campo `reglas_agente` en la BD |
| Nombre, teléfono, email, horarios | **Base de datos**, vía panel → Configuración |
| Proyectos y sus precios/áreas | **Base de datos**, vía panel → Proyectos |
| Diseño de la landing | `client/src/pages/Landing.jsx` (hardcodeado) |

Los datos de la empresa **no están en el código**: se leen de la tabla `configuracion_agencia`
en cada mensaje. Cambiar el código no cambia lo que Valeria dice sobre Ceinys.

---

## Base de datos

### Instalación nueva

Pegar `supabase-schema.sql` en **Supabase → SQL Editor → Run**.

### Migrar desde el esquema anterior

Si la base ya venía del esquema viejo (`reuniones`, `tipo_servicio`, `empresa`), correr
`supabase-migration-ceinys.sql`. Es idempotente: se puede ejecutar varias veces sin romper nada.

> ⚠️ Correr la migración **antes** de desplegar el código. El código nuevo lee las tablas
> `visitas` y `proyectos`; si no existen, la API responde 500.

### Tablas

| Tabla | Para qué |
|---|---|
| `mensajes_whatsapp` | Historial de la conversación (memoria de los últimos 20 mensajes) |
| `visitas` | Visitas agendadas a los proyectos |
| `proyectos` | Catálogo. Valeria solo menciona los que están aquí con `activo = true` |
| `configuracion_agencia` | Datos de Ceinys y reglas del agente |

---

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

```env
OPENAI_API_KEY=sk-proj-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
PANEL_PASSWORD=...
PORT=3001
```

En Vercel se configuran en **Project Settings → Environment Variables**.

| Variable | Si falta |
|---|---|
| `OPENAI_API_KEY` | El agente no puede responder |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Toda la API responde 500 |
| `TWILIO_AUTH_TOKEN` | No se valida la firma del webhook **y** se pierden las respuestas de más de 9s |
| `TWILIO_ACCOUNT_SID` / `TWILIO_WHATSAPP_FROM` | Se pierden las respuestas de más de 9s |
| `PANEL_PASSWORD` | **El panel y la API quedan sin protección** |

---

## Seguridad

La app es pública en internet, así que se protege sola en dos capas distintas:

**1. El webhook — firma de Twilio.**
`/api/webhook/whatsapp` no puede pedir login: Twilio no manda cabeceras `Authorization`.
En su lugar valida la cabecera `x-twilio-signature` contra `TWILIO_AUTH_TOKEN`. Solo Twilio
puede generar esa firma, así que el endpoint puede quedar público sin riesgo. Si la firma no
valida, responde `403`.

> Si `TWILIO_AUTH_TOKEN` no está configurado, el webhook **acepta cualquier origen** y lo avisa
> en los logs. Es a propósito, para que un despliegue incompleto no deje el agente mudo — pero
> no es un estado en el que quieras quedarte.

**2. El panel — contraseña.**
Todo `/api` (salvo webhook, `auth` y `health`) exige `Authorization: Bearer <token>`. El token
se obtiene en `POST /api/auth/login` con `PANEL_PASSWORD`, va firmado con HMAC-SHA256 y dura
12 horas. No hay estado en el servidor: cambiar la contraseña invalida todas las sesiones.
El login tiene límite de 10 intentos cada 15 minutos por IP.

La pantalla de login del frontend es solo comodidad — **lo que protege los datos es el
middleware del backend**. Saltear la UI no da acceso a nada.

Esto es lo que permite apagar la protección de Vercel (*Deployment Protection*) sin exponer
las conversaciones ni los teléfonos de los clientes.

---

## Desarrollo local

```bash
npm run setup
npm run dev
```

Levanta el backend en `http://localhost:3001` y el frontend en `http://localhost:5173`.

### Conectar Twilio

El webhook tiene que ser accesible desde internet:

```bash
ngrok http 3001
```

En **Twilio Console → Messaging → WhatsApp Sandbox**, en *"When a message comes in"*, pegar:

```
https://TU-URL-NGROK/api/webhook/whatsapp
```

con método **HTTP POST**. En producción la URL es
`https://TU-DOMINIO/api/webhook/whatsapp` (el panel la muestra y la copia en Configuración).

---

## API REST

Las rutas marcadas 🔒 exigen `Authorization: Bearer <token>`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/webhook/whatsapp` | Webhook de Twilio (validado por firma) |
| GET | `/api/auth/estado` | ¿Está activa la protección del panel? |
| POST | `/api/auth/login` | Devuelve el token del panel |
| GET | 🔒 `/api/mensajes` | Últimos mensajes |
| GET | 🔒 `/api/visitas` | Todas las visitas |
| GET | 🔒 `/api/visitas/:fecha` | Visitas de una fecha (`YYYY-MM-DD`) |
| GET | 🔒 `/api/proyectos` | Catálogo de proyectos |
| POST | 🔒 `/api/proyectos` | Crear un proyecto |
| PUT | 🔒 `/api/proyectos/:id` | Actualizar un proyecto |
| GET | 🔒 `/api/configuracion` | Datos de la empresa |
| PUT | 🔒 `/api/configuracion` | Actualizar datos de la empresa |
| GET | `/api/health` | Diagnóstico: variables configuradas y estado de las tablas |

---

## Herramientas de Valeria (function calling)

| Herramienta | Qué hace |
|-------------|----------|
| `consultar_proyectos` | Trae el detalle real de los proyectos. Obligatoria antes de dar cualquier dato |
| `consultar_disponibilidad` | Horarios libres de una fecha |
| `ver_visitas_cliente` | Visitas activas de un número |
| `agendar_visita` | Crea la visita (valida que el proyecto exista) |
| `cancelar_visita` | Cancela una visita |
| `reprogramar_visita` | Cambia fecha y hora |

---

## Notas importantes

- **Valeria no inventa datos.** Si un proyecto no tiene precio, área o ubicación cargados,
  `consultar_proyectos` devuelve `sin_detalle_cargado` y el prompt le exige derivar al asesor.
  Lo mismo con el teléfono, email y dirección de la empresa: si están vacíos en la BD, no los
  improvisa. Es deliberado — un dato inventado en una compra inmobiliaria es un problema real.
- **Solo agenda proyectos que existen.** `agendar_visita` valida el nombre contra la tabla
  `proyectos` y, si no coincide, le devuelve al modelo la lista de proyectos válidos.
- **Timeout de Twilio.** Twilio corta el webhook a los ~10s. A los 9s el servidor responde con
  TwiML vacío y, cuando OpenAI termina, manda la respuesta por la REST API. Por eso hacen falta
  las credenciales de Twilio: sin ellas, las respuestas lentas se pierden.
- **Visitas de 9:00 a 18:00, cada 30 minutos.** Un horario ocupado bloquea a todos los clientes,
  no solo al mismo proyecto — pensado para no sobrecargar al asesor que recibe.
- **Rate limit:** 30 mensajes por minuto por número.
- El panel refresca mensajes y visitas cada 5 segundos.
