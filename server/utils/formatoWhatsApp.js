/**
 * Deja el texto del modelo en el formato que WhatsApp entiende de verdad.
 *
 * Por qué esto existe en código y no como una regla más del prompt: al
 * prompt ya se le pidió dos veces que no usara Markdown, con ejemplos y en
 * mayúsculas, y siguió mandando `**Ubicación:**` y `[Ver mapa](url)` a
 * compradores reales. Markdown es un reflejo entrenado del modelo, no una
 * decisión que tome; pedirle que no lo use baja la frecuencia pero no la
 * lleva a cero, y en una venta de decenas de miles de soles el asterisco
 * crudo en pantalla es el detalle que delata que del otro lado no hay nadie.
 *
 * La regla del prompt se queda igual —es mejor que el modelo no lo escriba—
 * pero esta función garantiza el resultado.
 *
 * WhatsApp entiende: *negrita*, _cursiva_, ~tachado~ y ```monoespaciado```.
 * Nada más: ni títulos, ni tablas, ni enlaces con texto.
 */

/** Une las líneas de un bloque de código para no tocar lo que va adentro. */
const MARCA_CODIGO = '\u0000BLOQUE\u0000';

function limpiarWhatsApp(texto) {
  if (typeof texto !== 'string' || texto === '') return texto;

  // Los bloques ``` se apartan: adentro los asteriscos son literales y
  // reescribirlos cambiaría lo que el cliente tiene que copiar.
  const bloques = [];
  let t = texto.replace(/```[\s\S]*?```/g, (m) => {
    bloques.push(m);
    return `${MARCA_CODIGO}${bloques.length - 1}${MARCA_CODIGO}`;
  });

  // ── Enlaces con texto: [texto](url) ────────────────────────────
  // WhatsApp los muestra tal cual, corchetes incluidos. Se conserva el
  // texto porque suele ser la frase que le da sentido al enlace
  // ("Ver ubicación"), y la URL sola queda clickeable.
  t = t.replace(/\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, etiqueta, url) => {
    const limpia = etiqueta.trim();
    return limpia ? `${limpia}: ${url}` : url;
  });

  // ── Negrita de Markdown: **texto** ─────────────────────────────
  // Va antes que la cursiva para que ***texto*** no quede a medias.
  t = t.replace(/\*\*\*([^*\n]+)\*\*\*/g, '*$1*');
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '*$1*');

  // ── Cursiva de Markdown: __texto__ ─────────────────────────────
  t = t.replace(/__([^_\n]+)__/g, '_$1_');

  // ── Títulos: ## Algo ───────────────────────────────────────────
  t = t.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, '*$1*');

  // ── Viñetas con asterisco ──────────────────────────────────────
  // Un "* " al inicio de línea le abre una negrita al resto del párrafo.
  t = t.replace(/^([ \t]*)\*[ \t]+/gm, '$1• ');

  // ── Guiones de viñeta ──────────────────────────────────────────
  // Se dejan como están: WhatsApp los muestra bien y son los que el
  // prompt pide. Solo se normaliza el guion largo al principio.
  t = t.replace(/^([ \t]*)[–—][ \t]+/gm, '$1- ');

  // ── Asteriscos sueltos ─────────────────────────────────────────
  // Uno impar deja el resto del mensaje en negrita a partir de ahí.
  const sueltos = (t.match(/\*/g) || []).length;
  if (sueltos % 2 === 1) t = t.replace(/\*([^*]*)$/, '$1');

  // ── Aire de más ────────────────────────────────────────────────
  // Con un dato por línea el modelo separa todo con líneas en blanco y el
  // mensaje queda larguísimo en un celular.
  t = t.replace(/[ \t]+$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n');

  // Devolver los bloques de código a su lugar.
  t = t.replace(new RegExp(`${MARCA_CODIGO}(\\d+)${MARCA_CODIGO}`, 'g'), (_, i) => bloques[Number(i)]);

  return t.trim();
}

module.exports = { limpiarWhatsApp };
