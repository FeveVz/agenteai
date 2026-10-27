/**
 * Para las pruebas que barren el código buscando que una frase NO esté.
 *
 * Tres pruebas distintas se marcaron a sí mismas por el mismo motivo: el
 * comentario que explica POR QUÉ no hay que mandar un texto cita ese texto
 * entre comillas, y un `includes` sobre el archivo entero lo encuentra ahí.
 * Dicho de otra forma: documentar bien el arreglo rompía la prueba del arreglo.
 *
 * Los comentarios son justo donde este repositorio guarda la evidencia de cada
 * decisión, así que la respuesta no es escribir menos comentarios: es que la
 * prueba mire el código.
 */

/**
 * El mismo archivo sin comentarios. Saca los de bloque, los de línea y los de
 * JSX, y deja las líneas en su lugar para que los números sigan sirviendo.
 */
function sinComentarios(contenido) {
  return String(contenido || '')
    // {/* ... */} de JSX y /* ... */ de JavaScript, en una o varias líneas.
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, match => match.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
    // Los de línea, solo cuando la línea arranca con // para no comerse una
    // URL con https:// que esté dentro de una cadena.
    .split('\n')
    .map(linea => (/^\s*\/\//.test(linea) ? '' : linea))
    .join('\n');
}

module.exports = { sinComentarios };
