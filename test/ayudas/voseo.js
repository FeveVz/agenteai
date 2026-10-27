/**
 * Detector de voseo argentino, para las pruebas que barren el código buscando
 * textos que no deberían llegarle a un comprador peruano ni a Pamela.
 *
 * Vive en un solo archivo porque las dos primeras versiones, escritas por
 * separado, tenían el MISMO defecto: usaban `\b` después de una vocal con
 * tilde. El `\b` de JavaScript es ASCII, así que después de "í" siempre
 * encuentra un límite de palabra y /\bdecí\b/ da positivo dentro de "decía",
 * que es castellano perfectamente normal. Las dos pruebas se marcaban a sí
 * mismas por sus propios comentarios.
 *
 * Es la tercera vez que el `\b` con tildes muerde en este proyecto: antes fue
 * en el detector de "sí" como aceptación de la visita, y antes de eso en el de
 * las invitaciones repetidas.
 *
 * El criterio es que la palabra TERMINE en la vocal acentuada: así "mirá"
 * cuenta y "mirará" no, "decí" cuenta y "decía" no.
 */

const VOSEO = new RegExp([
  // Imperativos.
  String.raw`\b(dec|escrib|ven|sal|ped|segu|sub|viv)í(?![a-záéíóúñ])`,
  String.raw`\b(mir|and|carg|apret|marc|dej|pas|agend|llam|cont|prob|entr|habl|tom|busc|fij)á(?![a-záéíóúñ])`,
  String.raw`\b(pon|ten|com|corr|volv|hac|respond)é(?![a-záéíóúñ])`,
  // Presente.
  String.raw`\b(ten|pod|quer|sab|hac|dec|ven|sos|and)és(?![a-záéíóúñ])`,
  // Pronominales pegados, que es como más se cuela.
  String.raw`\b(fij|lleg|acord|qued|sent|and|ped)ate(?![a-záéíóúñ])`,
  // Pronombres.
  String.raw`\b(vos|sos)\b`,
].join('|'), 'i');

/** Las líneas con voseo de un texto, con su número de línea empezando en 1. */
function lineasConVoseo(contenido) {
  return String(contenido || '').split('\n')
    .map((texto, i) => ({ linea: i + 1, texto }))
    .filter(({ texto }) => VOSEO.test(texto));
}

/** ¿Hay voseo en este texto? */
function tieneVoseo(texto) {
  return VOSEO.test(String(texto || ''));
}

module.exports = { VOSEO, tieneVoseo, lineasConVoseo };
