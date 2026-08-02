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
  console.warn('\n⚠️  PANEL_PASSWORD no está configurada: el panel y la API quedan SIN protección.');
  console.warn('   Definila para exigir login en /dashboard.\n');
}
if (!process.env.TWILIO_AUTH_TOKEN) {
  console.warn('⚠️  TWILIO_AUTH_TOKEN no está configurada: no se valida la firma del webhook');
  console.warn('   y las respuestas que superen los 9s no se podrán enviar.\n');
}

const app = require('./app');
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n🏗️  Ceinys — Servidor iniciado`);
  console.log(`   → API:     http://localhost:${PORT}/api`);
  console.log(`   → Webhook: http://localhost:${PORT}/api/webhook/whatsapp`);
  console.log(`   → Health:  http://localhost:${PORT}/api/health\n`);
});
