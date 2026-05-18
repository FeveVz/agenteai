const { createClient } = require('@supabase/supabase-js');

let supabase;

function obtenerSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error('Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridas.');
    }

    supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

module.exports = { obtenerSupabase };
