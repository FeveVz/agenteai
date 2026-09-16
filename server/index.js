require('dotenv').config();

if (!process.env.OPENAI_API_KEY) {
  console.error('\n❌ ERROR: La variable OPENAI_API_KEY no está configurada.\n');
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('\n❌ ERROR: Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el .env\n');
  process.exit(1);
}

if (!process.env.PANEL_PASSWORD) {
  console.warn('\n⚠️  PANEL_PASSWORD no está configurada: la API de gestión responde 503 y el panel no abre.');
  console.warn('   Defínela para poder entrar a /dashboard.\n');
}
if (!process.env.TWILIO_AUTH_TOKEN) {
  console.warn('⚠️  TWILIO_AUTH_TOKEN no está configurada: no se valida la firma del webhook');
  console.warn('   y las respuestas que superen los 9s no se podrán enviar.\n');
}

const app = require('./app');
// SERVER_PORT primero: en desarrollo el cliente de Vite manda en el puerto
// principal y algunos entornos inyectan PORT con ESE valor, con lo cual la
// API se levanta encima de Vite y el proxy /api se queda sin backend.
// Fijando SERVER_PORT en .env la API queda donde el proxy la busca.
// En produccion no existe y todo sigue saliendo de PORT.
const PORT = process.env.SERVER_PORT || process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n🏗️  Agente IA — Servidor iniciado`);
  console.log(`   → API:     http://localhost:${PORT}/api`);
  console.log(`   → Webhook: http://localhost:${PORT}/api/webhook/whatsapp`);
  console.log(`   → Health:  http://localhost:${PORT}/api/health\n`);
});
