#!/usr/bin/env node
/**
 * Conversa con el agente desde la terminal, sin pasar por WhatsApp.
 *
 * Existe porque ajustar el tono del agente a ciegas no funciona: las dos
 * primeras veces que se tocó el prompt se dio por bueno sin probarlo y las
 * dos veces siguió soltando la ficha entera. Acá se ve la respuesta real,
 * con las herramientas y el saneado incluidos, antes de que la vea un
 * comprador.
 *
 * Uso:
 *   node scripts/probar-agente.mjs "hola quiero info de Torres de Parcona"
 *   node scripts/probar-agente.mjs --guion            (varios turnos seguidos)
 *
 * Lee .env. NO escribe mensajes en la base: usa un número de prueba y solo
 * pasa por las herramientas de lectura. Si el agente genera un enlace de
 * agenda, al final se borra.
 */

import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { procesarMensajeConIA } = require('../server/services/openai');
const { obtenerSupabase } = require('../server/db');

const TELEFONO = '+51900000001';   // no existe: no ensucia conversaciones reales

// El guión reproduce lo que hace la gente de verdad: el primer mensaje es el
// texto automático del anuncio, no una consulta redactada.
// Los turnos 3 a 6 son las cuatro preguntas que el agente falló con
// compradores reales, y que Pamela tuvo que corregir a mano en el panel.
const GUION = [
  '¡Hola! Quiero más información de las Urbanización Torres de Parcona',
  'Es para vivir, con mi familia',
  '¿En qué etapa de la urbanización están esos lotes?',
  '¿Trabajan con Techo Propio?',
  '¿Con cuánto puedo entrar?',
  'Ok voy a conversar con mi familia',
];

function separador(t) {
  console.log('\n' + '─'.repeat(68));
  if (t) console.log(t);
  console.log('─'.repeat(68));
}

function medir(texto) {
  const palabras = texto.trim().split(/\s+/).length;
  const lineasDato = texto.split('\n').filter(l => /^\s*[\p{Emoji_Presentation}\u{1F300}-\u{1FAFF}]/u.test(l)).length;
  const markdown = (texto.match(/\*\*|\[[^\]]*\]\(/g) || []).length;
  return { palabras, lineasDato, markdown };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Falta OPENAI_API_KEY en .env');
    process.exitCode = 1;
    return;
  }

  const args = process.argv.slice(2);
  const mensajes = args[0] === '--guion' || args.length === 0 ? GUION : [args.join(' ')];

  const supabase = obtenerSupabase();
  const { data: cfg } = await supabase.from('configuracion_agencia').select('*').order('id').limit(1).single();

  const historial = [];

  for (const texto of mensajes) {
    separador(`COMPRADOR: ${texto}`);

    const inicio = Date.now();
    const r = await procesarMensajeConIA(TELEFONO, texto, cfg || {}, historial);
    const ms = Date.now() - inicio;

    console.log(r.texto);

    const m = medir(r.texto);
    console.log('\n' + '·'.repeat(68));
    console.log(`${m.palabras} palabras · ${m.lineasDato} líneas de dato · ${m.markdown} restos de Markdown · ${(ms / 1000).toFixed(1)}s`
      + (r.imagenes?.length ? ` · ${r.imagenes.length} imagen(es)` : ''));
    if (m.markdown > 0) console.log('  OJO: quedó Markdown sin sanear');
    if (m.palabras > 120) console.log('  OJO: se pasó del límite de 120 palabras');

    historial.push({ remitente: 'usuario', contenido_mensaje: texto });
    historial.push({ remitente: 'asistente', contenido_mensaje: r.texto });
  }

  // Limpieza: si el agente generó un enlace de agenda, no queda dando vueltas.
  const { data: enlaces } = await supabase
    .from('enlaces_agenda').select('codigo').eq('numero_telefono', TELEFONO);
  if (enlaces?.length) {
    await supabase.from('enlaces_agenda').delete().eq('numero_telefono', TELEFONO);
    console.log(`\n(se borraron ${enlaces.length} enlace(s) de prueba)`);
  }
}

main().catch(e => { console.error('\nFALLO: ' + e.message); process.exitCode = 1; });
