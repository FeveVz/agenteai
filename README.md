# 🦷 Sistema de Turnos — Clínica Dental con WhatsApp + IA

Sistema completo de gestión de turnos para clínicas dentales. Incluye un agente de IA (Sarah) que actúa como recepcionista virtual por WhatsApp y un dashboard web para el personal de la clínica.

## Stack tecnológico

- **Backend:** Node.js + Express
- **Base de datos:** SQLite (via better-sqlite3) — sin servicios externos
- **Frontend:** React + Vite + Tailwind CSS
- **WhatsApp:** Twilio (webhook)
- **IA:** OpenAI GPT-4o con function calling

---

## Requisitos previos

- Node.js 18 o superior
- Una cuenta de [Twilio](https://www.twilio.com/) con WhatsApp Sandbox habilitado
- Una API key de [OpenAI](https://platform.openai.com/)

---

## Instalación

### 1. Instalar dependencias

```bash
cd clinica-dental
npm run setup
```

Este comando instala las dependencias del servidor y del cliente.

### 2. Configurar variables de entorno

Copiá el archivo de ejemplo y completá tus credenciales:

```bash
cp .env.example .env
```

Abrí el archivo `.env` y completá:

```env
OPENAI_API_KEY=sk-proj-tu_api_key_aqui
PORT=3001
```

---

## Levantar en desarrollo

```bash
npm run dev
```

Este comando inicia simultáneamente:
- **Backend** en `http://localhost:3001`
- **Frontend** en `http://localhost:5173`

---

## Configurar Twilio WhatsApp

Para que los mensajes de WhatsApp lleguen a tu servidor local, necesitás exponer tu servidor a internet.

### Opción 1: ngrok (recomendado para desarrollo)

1. Instalá ngrok: https://ngrok.com/download
2. Ejecutá en una terminal separada:
   ```bash
   ngrok http 3001
   ```
3. Copiá la URL HTTPS que genera ngrok (ej: `https://abc123.ngrok-free.app`)

### Configurar el webhook en Twilio

1. Ingresá a [Twilio Console](https://console.twilio.com/)
2. Navegá a **Messaging → WhatsApp → Sandbox**
3. En el campo **"When a message comes in"**, pegá:
   ```
   https://TU-URL-NGROK/api/webhook/whatsapp
   ```
4. Asegurate de seleccionar **HTTP POST**
5. Hacé click en **Save**

### Probar la conexión

Enviá un mensaje al número de WhatsApp Sandbox de Twilio y Sarah te debería responder.

---

## Build para producción

```bash
npm run build
```

Esto compila el frontend de React. Luego podés iniciar el servidor en modo producción:

```bash
npm start
```

El servidor Express servirá automáticamente los archivos estáticos del frontend en `http://localhost:3001`.

---

## Estructura del proyecto

```
clinica-dental/
├── server/
│   ├── index.js              ← Express server principal
│   ├── db.js                 ← Inicialización SQLite + esquema
│   ├── routes/
│   │   ├── webhook.js        ← Endpoint Twilio WhatsApp
│   │   ├── mensajes.js       ← API REST mensajes
│   │   ├── turnos.js         ← API REST turnos
│   │   └── configuracion.js  ← API REST config clínica
│   ├── services/
│   │   ├── openai.js         ← Agente IA con function calling
│   │   └── twilio.js         ← Formateo respuestas TwiML
│   └── utils/
│       └── fechas.js         ← Helpers de fecha en español
├── client/
│   └── src/
│       ├── pages/
│       │   ├── Landing.jsx   ← Página de inicio
│       │   └── Dashboard.jsx ← Panel de administración
│       └── components/
│           ├── TabMensajes.jsx
│           ├── TabTurnos.jsx
│           ├── TabConfiguracion.jsx
│           ├── CalendarioTurnos.jsx
│           └── ListaTurnos.jsx
├── clinica.db                ← Base de datos SQLite (se crea al iniciar)
├── .env                      ← Variables de entorno (no commitear)
└── README.md
```

---

## API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/webhook/whatsapp` | Webhook de Twilio |
| GET | `/api/mensajes` | Últimos 50 mensajes |
| GET | `/api/turnos` | Todos los turnos |
| GET | `/api/turnos/:fecha` | Turnos de una fecha (YYYY-MM-DD) |
| GET | `/api/configuracion` | Config de la clínica |
| PUT | `/api/configuracion` | Actualizar config |

---

## Herramientas de la IA (function calling)

Sarah puede ejecutar estas acciones de forma autónoma:

| Herramienta | Descripción |
|-------------|-------------|
| `consultar_disponibilidad` | Ver horarios libres en una fecha |
| `ver_turnos_paciente` | Consultar turnos de un paciente |
| `agendar_turno` | Crear un nuevo turno |
| `cancelar_turno` | Cancelar un turno existente |
| `reprogramar_turno` | Cambiar fecha/hora de un turno |

---

## Notas importantes

- La base de datos SQLite (`clinica.db`) se crea automáticamente al iniciar el servidor.
- El rate limiting limita a 30 mensajes por minuto por número de teléfono.
- En el dashboard, los mensajes y turnos se actualizan automáticamente cada 5 segundos.
- El agente tiene memoria conversacional de los últimos 20 mensajes por número.
