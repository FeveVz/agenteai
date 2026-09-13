/**
 * Respaldo completo de una base de Supabase, tabla por tabla.
 *
 * Genera JSON (legible, para inspeccionar) y un .sql con INSERTs
 * (para poder restaurar). Se guarda FUERA del repositorio: estas tablas
 * tienen telefonos y conversaciones de clientes reales, y el repo va a GitHub.
 */
import fs from 'node:fs';
import path from 'node:path';

const REF = process.argv[2];
const DESTINO = process.argv[3];
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const TABLAS = ['configuracion_agencia', 'proyectos', 'visitas', 'mensajes_whatsapp', 'enlaces_agenda', 'desarrolladoras'];
// enlaces_agenda queda afuera a proposito: su clave es `codigo`, no tiene id
// ni secuencia. Pedirle setval('...','id') revienta la restauracion entera.
const TABLAS_CON_ID = TABLAS.filter(t => t !== 'enlaces_agenda');

if (!REF || !DESTINO || !TOKEN) {
  console.error('Uso: node respaldar.mjs <ref> <carpeta-destino>   (con SUPABASE_ACCESS_TOKEN)');
  process.exitCode = 1;
}

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

/** Un literal SQL seguro para cualquier valor. */
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });
  const resumen = {};
  const saltoDeLinea = String.fromCharCode(10);
  const L = (texto) => texto + saltoDeLinea;

  // TRUNCATE antes de insertar: sql/esquema.sql siembra una fila vacia en
  // configuracion_agencia, asi que sin esto la restauracion sobre un esquema
  // recien creado falla por clave duplicada.
  let sql = L(`-- Respaldo del proyecto ${REF}`)
    + L(`-- Generado el ${new Date().toISOString()}`)
    + L('-- Restaurar: correr sql/esquema.sql y despues este archivo.')
    + L('-- OJO: vacia estas tablas antes de reponer el respaldo.')
    + L('')
    + L('BEGIN;')
    + L('')
    + L(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE;`);

  for (const tabla of TABLAS) {
    const filas = await q(`select * from ${tabla}`);
    resumen[tabla] = filas.length;
    fs.writeFileSync(path.join(DESTINO, `${tabla}.json`), JSON.stringify(filas, null, 2), 'utf8');

    sql += L('') + L(`-- ${tabla}: ${filas.length} filas`);
    if (filas.length) {
      const cols = Object.keys(filas[0]);
      for (const f of filas) {
        sql += L(`INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map(c => lit(f[c])).join(', ')});`);
      }
    }
    console.log(`  ${tabla.padEnd(24)} ${String(filas.length).padStart(4)} filas`);
  }

  // Los id se insertaron a mano, asi que las secuencias quedaron en 1: sin
  // esto, el primer mensaje nuevo despues de restaurar choca por id repetido.
  sql += L('') + L('-- Reponer las secuencias de los BIGSERIAL');
  for (const tabla of TABLAS_CON_ID) {
    sql += L(`SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), GREATEST(coalesce((SELECT max(id) FROM ${tabla}), 0), 1));`);
  }

  sql += L('') + L('COMMIT;');
  fs.writeFileSync(path.join(DESTINO, 'restaurar.sql'), sql, 'utf8');
  fs.writeFileSync(path.join(DESTINO, 'resumen.json'), JSON.stringify({ proyecto: REF, fecha: new Date().toISOString(), filas: resumen }, null, 2), 'utf8');

  console.log(`${saltoDeLinea}Guardado en: ${DESTINO}`);
  console.log(`Total de filas: ${Object.values(resumen).reduce((a, b) => a + b, 0)}`);
}

main().catch(e => { console.error('FALLO: ' + e.message); process.exitCode = 1; });
