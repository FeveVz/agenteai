/**
 * Búsqueda de proyectos por nombre, resuelta en Node en vez de en la base.
 *
 * Antes esto se hacía con `.ilike('nombre', `%${valor}%`)`, que traía dos
 * problemas serios:
 *
 *   1. `%` y `_` son comodines de LIKE, y el valor llega del modelo o del body
 *      de una ruta pública. Un POST con {"proyecto": "%"} matcheaba el catálogo
 *      entero y la reserva caía sobre el primer proyecto de la lista.
 *
 *   2. Con `.limit(1)`, "Sauces" matcheaba "Los Sauces" y "Casa Sauces" y se
 *      quedaba con el primero que devolviera Postgres. El cliente terminaba
 *      viendo las fotos del proyecto equivocado, sin ningún aviso.
 *
 * Escapar los comodines no alcanzaba: PostgREST además traduce `*` a `%`, así
 * que habría que escapar en dos capas. Un catálogo inmobiliario tiene decenas
 * de proyectos, no miles: traerlos y filtrarlos acá es barato y elimina las dos
 * trampas de raíz.
 *
 * De paso resuelve algo que ILIKE no hace: ignorar tildes. Con un catálogo de
 * varias constructoras ("Los Álamos") el modelo escribe la versión sin tilde y
 * antes no matcheaba nada.
 */

/**
 * Minusculas, sin tildes, sin espacios de mas -- pero CONSERVANDO la n con
 * virgulilla.
 *
 * La enie es una letra propia del espanol, no una n acentuada: "Canete" y
 * "Cañete" son nombres distintos, y en Peru el segundo es una provincia de
 * Lima. Comersela junto con las tildes haria colisionar dos proyectos con
 * esos nombres, y los dos quedarian imposibles de agendar.
 *
 * Las tildes si se ignoran, y a proposito: el modelo escribe "Los Alamos"
 * donde el catalogo dice "Los Álamos".
 */
function normalizar(texto) {
  return String(texto == null ? '' : texto)
    .toLowerCase()
    .normalize('NFD')
    // Todas las marcas de acento menos U+0303, la virgulilla de la enie.
    .replace(/[\u0300-\u0302\u0304-\u036f]/g, '')
    .normalize('NFC')   // recomponer, para que la enie vuelva a ser un solo caracter
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca proyectos por nombre con precedencia explícita:
 * exacto → empieza con → contiene.
 *
 * Nunca desempata sola: si un nivel devuelve varios, los devuelve todos y
 * marca `ambiguo`. Quien llama decide si preguntar o quedarse con uno; lo que
 * no puede volver a pasar es elegir en silencio.
 *
 * @param {Array<{nombre: string}>} proyectos
 * @param {string} consulta
 * @returns {{coincidencias: Array, ambiguo: boolean}}
 */
function buscarPorNombre(proyectos, consulta) {
  const objetivo = normalizar(consulta);
  if (!objetivo) return { coincidencias: [], ambiguo: false };

  const indexados = (proyectos || []).map(p => ({ proyecto: p, nombre: normalizar(p.nombre) }));

  const niveles = [
    nombre => nombre === objetivo,
    nombre => nombre.startsWith(objetivo),
    nombre => nombre.includes(objetivo),
  ];

  for (const coincide of niveles) {
    const encontrados = indexados.filter(({ nombre }) => coincide(nombre)).map(({ proyecto }) => proyecto);
    if (encontrados.length > 0) {
      return { coincidencias: encontrados, ambiguo: encontrados.length > 1 };
    }
  }

  return { coincidencias: [], ambiguo: false };
}

module.exports = { normalizar, buscarPorNombre };
