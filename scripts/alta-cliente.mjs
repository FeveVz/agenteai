#!/usr/bin/env node
/**
 * Da de alta la base de datos de una clienta.
 *
 * Corre el esquema y los datos de la clienta contra un proyecto de Supabase
 * ya creado, y verifica que haya quedado bien. Es el paso que más se repite
 * al sumar clientas, y hacerlo a mano invita justo a los dos errores que más
 * caro salen: correr el SQL de una clienta en la base de otra, y desplegar
 * con una tabla o una columna faltando.
 *
 * Uso:
 *   node scripts/alta-cliente.mjs <ref-del-proyecto> <carpeta-de-la-clienta>
 *
 * Ejemplo:
 *   node scripts/alta-cliente.mjs abcdefghijklmnop pamela-barrios
 *
 * El token se lee de SUPABASE_ACCESS_TOKEN. Se saca en
 * https://supabase.com/dashboard/account/tokens y tiene que poder ver el
 * proyecto: un token con permisos recortados devuelve 403.
 *
 * El `ref` es el identificador que aparece en la URL del panel:
 *   https://supabase.com/dashboard/project/ESTO-DE-ACA
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.supabase.com/v1';

/**
 * Aborta con un mensaje.
 *
 * Lanza en vez de llamar a process.exit(): cortar el proceso a mitad de una
 * petición HTTP hace que Node reviente con una aserción de libuv en Windows y
 * el código de salida deja de ser 1. En el camino que evita pisar la base de
 * otra clienta, el corte tiene que ser limpio.
 */
class Abortar extends Error {}
const salir = (mensaje) => { throw new Abortar(mensaje); };

async function main() {
  const [ref, clienta] = process.argv.slice(2);
  const token = process.env.SUPABASE_ACCESS_TOKEN;

  if (!ref || !clienta) salir('Uso: node scripts/alta-cliente.mjs <ref-del-proyecto> <carpeta-de-la-clienta>');
  if (!token) salir('Falta SUPABASE_ACCESS_TOKEN en el entorno.');

  const carpetaDatos = path.join(RAIZ, 'sql', 'clientes', clienta);
  if (!fs.existsSync(carpetaDatos)) {
    const hay = fs.readdirSync(path.join(RAIZ, 'sql', 'clientes')).join(', ');
    salir(`No existe sql/clientes/${clienta}. Las que hay: ${hay}`);
  }

  /** Ejecuta SQL en el proyecto vía la API de Supabase. */
  async function ejecutar(sql) {
    const r = await fetch(`${API}/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    const texto = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 300)}`);
    try { return JSON.parse(texto); } catch { return texto; }
  }

  async function correrArchivo(rutaRelativa) {
    const sql = fs.readFileSync(path.join(RAIZ, rutaRelativa), 'utf8');
    process.stdout.write(`  ${rutaRelativa} ... `);
    await ejecutar(sql);
    console.log('ok');
  }

  console.log(`\nAlta de "${clienta}" en el proyecto ${ref}\n`);

  // ── Antes de escribir nada: confirmar qué hay en esa base ───────────
  // Correr los datos de una clienta sobre la base de OTRA no tiene vuelta
  // atrás. Si no se puede averiguar qué hay, no se escribe: este chequeo
  // tiene que fallar cerrado.
  let existentes = null;
  try {
    existentes = await ejecutar(`
      select coalesce((select nombre_agencia from configuracion_agencia order by id limit 1), '') as empresa,
             (select count(*) from information_schema.tables where table_schema='public') as tablas
    `);
  } catch (e) {
    // Una base recién creada todavía no tiene configuracion_agencia: normal.
    if (!/does not exist|no existe|relation/i.test(e.message)) {
      salir(`No pude revisar qué hay en esa base, así que no escribo nada.\n  ${e.message}`);
    }
  }

  if (existentes && existentes[0] && Number(existentes[0].tablas) > 0) {
    const empresa = String(existentes[0].empresa || '').trim();
    const esperado = clienta.replace(/-/g, ' ').toLowerCase();
    if (empresa && !empresa.toLowerCase().startsWith(esperado)) {
      salir(
        `Esa base ya tiene datos de "${empresa}".\n` +
        '  Si de verdad quieres sobrescribirla, hazlo a mano. Este script no pisa la base de otra clienta.'
      );
    }
    console.log(`  (la base ya tenía ${existentes[0].tablas} tablas; el esquema es idempotente)\n`);
  }

  // ── Esquema y datos ────────────────────────────────────────────────
  console.log('Corriendo SQL:');
  await correrArchivo('sql/esquema.sql');
  await correrArchivo(path.join('sql', 'clientes', clienta, 'datos.sql'));

  // ── Verificación ───────────────────────────────────────────────────
  console.log('\nVerificando:');
  const TABLAS = ['configuracion_agencia', 'visitas', 'proyectos', 'mensajes_whatsapp', 'enlaces_agenda', 'desarrolladoras'];
  const tablas = await ejecutar(
    `select table_name from information_schema.tables where table_schema='public' and table_name in (${TABLAS.map(t => `'${t}'`).join(',')})`
  );
  const faltan = TABLAS.filter(t => !tablas.some(f => f.table_name === t));
  if (faltan.length) salir(`Faltan tablas: ${faltan.join(', ')}. NO despliegues.`);
  console.log(`  ok  las ${TABLAS.length} tablas existen`);

  const [r] = await ejecutar(`
    select (select nombre_agencia from configuracion_agencia order by id limit 1) as empresa,
           (select count(*) from proyectos where activo) as proyectos,
           (select count(*) from desarrolladoras) as constructoras,
           (select count(*) from desarrolladoras where coalesce(pago_imagen_url,'') <> '') as con_cuentas
  `);
  console.log(`  ok  empresa: ${r.empresa}`);
  console.log(`  ok  ${r.proyectos} proyectos activos, ${r.constructoras} constructoras`);

  const huerfanos = await ejecutar(`
    select p.nombre, coalesce(p.desarrolladora,'(sin asignar)') as desarrolladora
    from proyectos p
    left join desarrolladoras d on d.nombre = p.desarrolladora
    where p.activo and d.id is null
  `);
  if (huerfanos.length) {
    console.log(`\n  ATENCION  ${huerfanos.length} proyecto(s) sin constructora válida — el agente no dará datos de pago de estos:`);
    for (const h of huerfanos) console.log(`      ${h.nombre} -> ${h.desarrolladora}`);
  }
  if (Number(r.con_cuentas) < Number(r.constructoras)) {
    console.log(`\n  ATENCION  ${r.constructoras - r.con_cuentas} constructora(s) sin gráfica de cuentas.`);
    console.log('      Súbela en el panel, pestaña Constructoras. Mientras falte, el agente deriva a un asesor.');
  }

  console.log(`
Base lista. Falta, en el proyecto de Vercel de esta clienta:
  SUPABASE_URL              https://${ref}.supabase.co
  SUPABASE_SERVICE_KEY      Supabase -> Project Settings -> API -> service_role
  OPENAI_API_KEY, PANEL_PASSWORD, TWILIO_*   (y RESEND_API_KEY si quiere alertas)

Después, /api/health del despliegue dice si quedó algo suelto.
`);
}

main().catch((e) => {
  console.error('\n' + (e instanceof Abortar ? '' : 'Error inesperado: ') + e.message + '\n');
  process.exitCode = 1;
});
