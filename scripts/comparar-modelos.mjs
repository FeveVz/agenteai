#!/usr/bin/env node
/**
 * Corre el mismo guión contra varios modelos y mide la diferencia.
 *
 * Existe porque el agente estuvo tres meses sobre gpt-4o sin que nadie
 * comparara, y porque toda la arquitectura de este proyecto —el estado
 * calculado en código, las instrucciones pegadas al payload de cada
 * herramienta, los datos del catálogo— depende de que el modelo respete esa
 * pila. Un modelo que la obedece peor se ve exactamente como el síntoma que
 * reportó Pamela: información plana y cero cierre.
 *
 * Mide tres cosas, y las tres mandan:
 *   - qué contesta (palabras, ficha de datos, restos de Markdown, herramientas)
 *   - cuánto tarda, contra los 9 segundos que da Twilio antes de cortar
 *   - si acepta los parámetros (las familias nuevas rechazan `max_tokens` y
 *     algunas rechazan cualquier temperatura que no sea la de fábrica)
 *
 * Uso:
 *   node scripts/comparar-modelos.mjs
 *   node scripts/comparar-modelos.mjs gpt-4o gpt-5.5
 *
 * NO escribe en la base: usa un número de prueba y borra los enlaces que haya
 * generado al terminar.
 */

import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const TELEFONO = '+51900000002';

const POR_DEFECTO = ['gpt-4o', 'gpt-5.4', 'gpt-5.5', 'gpt-5.6-sol'];

// Los seis turnos son los que fallaron con compradores reales, en el orden en
// que fallaron. El último es el momento más caro de la conversación.
const GUION = [
  '¡Hola! Quiero más información de las Urbanización Torres de Parcona',
  'Es para vivir, con mi familia',
  '¿En qué etapa de la urbanización están esos lotes?',
  '¿Con cuánto puedo entrar?',
  'Ya, me interesa',
  'Ok voy a conversar con mi familia',
];

function medir(texto) {
  const palabras = texto.trim().split(/\s+/).length;
  // Tres o más líneas con emoji son una ficha; dos son una respuesta normal
  // bien escrita. Medido contra el tráfico de noviembre: el umbral de 1 marcaba
  // como ficha respuestas que daban dos datos y una pregunta, que es justo lo
  // que queremos. De 190 respuestas, 25 tenían una o dos y solo 6 tenían tres.
  const conEmoji = texto.split('\n')
    .filter(l => /^\s*[\p{Emoji_Presentation}\u{1F300}-\u{1FAFF}]/u.test(l)).length;
  const lineasDeFicha = conEmoji >= 3 ? conEmoji : 0;
  const markdown = (texto.match(/\*\*|\[[^\]]*\]\(/g) || []).length;
  const seDespide = /(hasta luego|cuidate|que tengas un (excelente|buen)|te deseo)/i.test(texto);
  const horaConcreta = /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(texto);
  return { palabras, lineasDeFicha, markdown, seDespide, horaConcreta };
}

async function correr(modelo) {
  // El modelo se lee de process.env en el momento de requerir el módulo, así
  // que hay que limpiar la caché entre corridas.
  process.env.MODELO_OPENAI = modelo;
  for (const k of Object.keys(require.cache)) {
    if (k.includes('server')) delete require.cache[k];
  }

  const { procesarMensajeConIA } = require('../server/services/openai');
  const { obtenerSupabase } = require('../server/db');
  const supabase = obtenerSupabase();

  const { data: cfg } = await supabase
    .from('configuracion_agencia').select('*').order('id').limit(1).single();

  const historial = [];
  const turnos = [];

  for (const texto of GUION) {
    const inicio = Date.now();
    let respuesta;
    try {
      respuesta = await procesarMensajeConIA(TELEFONO, texto, cfg || {}, historial);
    } catch (e) {
      return { modelo, error: e.message };
    }
    const segundos = (Date.now() - inicio) / 1000;

    turnos.push({ pregunta: texto, texto: respuesta.texto, segundos, ...medir(respuesta.texto), imagenes: (respuesta.imagenes || []).length });
    historial.push({ remitente: 'usuario', contenido_mensaje: texto });
    historial.push({ remitente: 'asistente', contenido_mensaje: respuesta.texto });
  }

  await supabase.from('enlaces_agenda').delete().eq('numero_telefono', TELEFONO);
  return { modelo, turnos };
}

const modelos = process.argv.slice(2).length ? process.argv.slice(2) : POR_DEFECTO;
const resultados = [];

for (const modelo of modelos) {
  console.log('\n' + '═'.repeat(72));
  console.log('MODELO: ' + modelo);
  console.log('═'.repeat(72));

  const r = await correr(modelo);
  resultados.push(r);

  if (r.error) {
    console.log('FALLÓ: ' + r.error);
    continue;
  }

  for (const t of r.turnos) {
    console.log('\n> ' + t.pregunta);
    console.log(t.texto);
    console.log(`  [${t.palabras} palabras · ${t.segundos.toFixed(1)}s`
      + (t.lineasDeFicha ? ` · ${t.lineasDeFicha} líneas de ficha` : '')
      + (t.markdown ? ` · ${t.markdown} restos de Markdown` : '')
      + (t.imagenes ? ` · ${t.imagenes} imagen(es)` : '')
      + (t.horaConcreta ? ' · ofrece hora concreta' : '')
      + (t.seDespide ? ' · SE DESPIDE' : '') + ']');
  }
}

console.log('\n\n' + '═'.repeat(72));
console.log('RESUMEN');
console.log('═'.repeat(72));
console.log('modelo'.padEnd(16) + 'palabras  pico   ficha  markdown  horario  despedidas');

for (const r of resultados) {
  if (r.error) { console.log(r.modelo.padEnd(16) + 'no corrió: ' + r.error.slice(0, 50)); continue; }
  const n = r.turnos.length;
  const prom = Math.round(r.turnos.reduce((s, t) => s + t.palabras, 0) / n);
  const pico = Math.max(...r.turnos.map(t => t.segundos)).toFixed(1);
  const ficha = r.turnos.reduce((s, t) => s + t.lineasDeFicha, 0);
  const md = r.turnos.reduce((s, t) => s + t.markdown, 0);
  const horario = r.turnos.filter(t => t.horaConcreta).length;
  const desp = r.turnos.filter(t => t.seDespide).length;
  console.log(r.modelo.padEnd(16)
    + String(prom).padEnd(10) + (pico + 's').padEnd(7)
    + String(ficha).padEnd(7) + String(md).padEnd(10)
    + String(horario).padEnd(9) + String(desp));
}

console.log('\nTwilio corta a los 9s: un pico por encima de eso sale por REST y llega igual,');
console.log('pero el comprador lo siente como demora. La columna "horario" cuenta los turnos');
console.log('donde ofreció una hora concreta, que es lo que agenda visitas.');
