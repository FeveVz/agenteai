require('dotenv').config();

if (!process.env.OPENAI_API_KEY) {
  console.error('\n❌ ERROR: La variable OPENAI_API_KEY no está configurada.\n');
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('\n❌ ERROR: Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el .env\n');
  process.exit(1);
}

const app = require('./app');
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n🏗️  Ceinys — Servidor iniciado`);
  console.log(`   → API:     http://localhost:${PORT}/api`);
  console.log(`   → Webhook: http://localhost:${PORT}/api/webhook/whatsapp`);
  console.log(`   → Health:  http://localhost:${PORT}/api/health\n`);
});
