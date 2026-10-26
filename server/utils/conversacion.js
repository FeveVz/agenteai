/**
 * Lo que ya pasó en esta conversación, leído del historial.
 *
 * Una regla estática del prompt ("no repitas la invitación") pierde contra
 * el objetivo que el mismo prompt declara ("lleva la conversación hacia una
 * visita"). Probado contra el modelo real, el agente invitaba a agendar en
 * los tres turnos seguidos aunque la regla estuviera escrita.
 *
 * Lo que sí funciona es lo mismo que funcionó con los datos del catálogo:
 * calcular el estado acá, en código, y pasárselo como una instrucción
 * concreta que llega junto al mensaje. "No repitas" es abstracto; "ya se lo
 * propusiste dos veces y no te dijo que sí" no deja lugar a interpretación.
 *
 * Auditoría del mes del 27 de septiembre al 26 de octubre, 96 contactos:
 * 94 invitaciones a visitar → 11 enlaces de calendario → 6 que dijeron que sí
 * → 1 visita agendada. Casi todo lo que sigue sale de rastrear por qué se
 * rompió cada uno de esos tres eslabones.
 */

// Ojo con las conjugaciones. La primera versión buscaba "agendar" y el
// modelo escribía "agendemos", "agendamos", "coordinemos": el detector no
// disparaba nunca y el agente seguía invitando en todos los turnos. Por eso
// se busca la raíz del verbo y no la forma exacta.
//
// Las frases de las pruebas son todas reales, salidas de correr el agente
// contra el modelo.
const INVITACIONES = [
  /agend\w*[^.?!]{0,25}(visita|cita)/i,
  /coordin\w*[^.?!]{0,25}(visita|cita)/i,
  /program\w*[^.?!]{0,25}(visita|cita)/i,
  /(visita|cita)[^.?!]{0,25}(en persona|presencial)/i,
  /(conocer|ver|visitar)(lo|la|los)?[^.?!]{0,20}en persona/i,
];

/** ¿Este mensaje del agente propone una visita? */
function proponeVisita(texto) {
  return INVITACIONES.some(re => re.test(String(texto || '')));
}

/** ¿Este mensaje del agente ya llevaba el enlace del calendario? */
function mandoEnlace(texto) {
  return /\/visita\/[a-z0-9]+/i.test(String(texto || ''));
}

/** Minúsculas y sin tildes, que es como hay que comparar lo que llega por WhatsApp. */
function sinTildes(texto) {
  return String(texto || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Un mensaje corto que arranca con una de estas PUEDE ser un sí.
const AFIRMACION = /^(si|dale|ok|okey|okay|claro|perfecto|listo|bueno|de una|ya)\b/;

// ...pero solo si lo que sigue habla de la visita o de avanzar.
//
// "Ya, me interesa" quedaba afuera, y es de las formas más comunes de decir
// que sí: apareció en la comparación de modelos y ninguno de los dos pasó al
// cierre porque el código no lo había reconocido como aceptación.
const SIGUE_ACEPTANDO = /\b(agend\w*|coordin\w*|visit\w*|ir|voy|vamos|conocer\w*|llam\w*|cuando|dia|dias|hora|horas|fecha|manda\w*|pasa\w*|envia\w*|interesa\w*|me gusta\w*|avanz\w*)\b/;

// ...o es puro relleno, que en Perú es como se remata un sí.
const RELLENO = new Set([
  'pues', 'ps', 'pe', 'nomas', 'mas', 'no', 'esta', 'bien', 'claro', 'ok', 'si',
  'dale', 'gracias', 'porfa', 'por', 'favor', 'listo', 'perfecto', 'bueno', 'genial',
]);

// Señales de que el mensaje está hablando de cerrar algo concreto: un día,
// una hora, una fecha o el enlace. Si aparecen, la persona está avanzando,
// no despidiéndose, y ningún detector de despedida debe dispararse.
const HABLA_DE_CERRAR = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|hoy|pasado manana|enlace|link|calendario)\b|\b\d{1,2}\s*(y\s*media|:\d{2}|am|pm|de la (manana|tarde))\b|\b(el|para el)\s*\d{1,2}\b/;

// Frases con las que una persona se despide sin cerrar nada. Es el momento
// más caro de la conversación y el agente lo estaba dejando pasar con un
// "tómate tu tiempo": el comprador se iba y nadie volvía a escribirle nunca.
//
// "por ahora no" estaba suelto y sin objeto, y se comió al lead más caliente
// del mes: el contacto PE.1393664369419421 escribió "Si yo te confirmo para
// el 17 o 18 de octubre", recibió el enlace, y contestó "Por ahora no puedo
// ingresar a ningún enlace" — o sea que no podía abrir el enlace, no que se
// estaba yendo. El agente lo trató como despedida.
const SE_VA_A_PENSAR = /(lo (voy a |vamos a )?pens|conversar con mi (familia|esposa|esposo|pareja)|consultar con mi|lo veo y te (digo|aviso)|te (aviso|escribo|confirmo) (luego|despues|mas tarde)|mas adelante|por ahora (no (lo |me )?(voy|puedo decidir|me decido|quiero)|solo estoy viendo)|voy a ver)/i;

/** ¿La persona está diciendo que se va a pensar sin cerrar nada? */
function seVaAPensar(texto) {
  const t = sinTildes(texto);
  // Corte duro: si en el mismo mensaje hay un día, una hora o el enlace, está
  // avanzando. Esto es lo que evita el falso positivo del mensaje 722.
  if (HABLA_DE_CERRAR.test(t)) return false;
  return SE_VA_A_PENSAR.test(t);
}

/**
 * ¿El comprador aceptó la visita? Un "sí" suelto cuenta: es como se contesta
 * en WhatsApp.
 *
 * La primera versión daba por aceptado CUALQUIER mensaje corto que empezara
 * con una afirmación, y en el tráfico real eso incluyó "Ya tienen título?",
 * "ya tiene luz ?" y "Ok foto" — preguntas sobre el proyecto, no un sí. Con
 * un solo falso positivo la conversación quedaba marcada como aceptada para
 * siempre y el freno a la insistencia no volvía a dispararse: en una
 * conversación de 69 mensajes el agente invitó a visitar 54 veces.
 *
 * Ahora la afirmación corta tiene que ser el mensaje entero ("sí", "dale",
 * "ok 👍", "dale pues") o venir seguida de algo que hable de la visita ("sí,
 * cuándo podemos ir"). Y una pregunta nunca es una aceptación, empiece como
 * empiece.
 */
function aceptoVisita(texto) {
  const t = sinTildes(texto);
  if (!t) return false;

  // Despedirse no es aceptar. "Ok voy a conversar con mi familia" empieza con
  // "ok" y habla de ir, y es exactamente lo contrario de un sí.
  if (seVaAPensar(t)) return false;

  if (!t.endsWith('?')) {
    const afirma = t.match(AFIRMACION);
    if (afirma) {
      const resto = t.slice(afirma[0].length).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!resto) return true;
      if (resto.length <= 30 && SIGUE_ACEPTANDO.test(resto)) return true;
      if (resto.split(' ').every(p => RELLENO.has(p))) return true;
    }
  }

  return /(quiero|me gustaria|podemos|vamos a)\s+(ir|visitar|verlo|conocer)/.test(t)
      || /(agendame|coordiname|mandame el (link|enlace)|pasame el (link|enlace))/.test(t);
}

/**
 * ¿La persona ya estuvo en el proyecto?
 *
 * Producción, contacto ...4782: "El que le habla estuvo allí la semana pasada
 * y a mi esposa le gustó la ubicación, me podría dar informe sobre el precio".
 * Ya fue, fue con su esposa y le gustó: es lo más caliente que pasó por el
 * chat en un mes. El agente le dio el precio, le mandó dos fotos y no pidió
 * nada. No había con qué detectarlo.
 */
// Ojo con la persona del verbo: el mensaje real venía en tercera ("el que le
// habla estuvo allí"), no en primera, y la primera versión solo buscaba
// "estuve". Y el objeto va sin artículo, porque la gente escribe "al
// proyecto", "por ahí", "en la zona".
//
// "vi" y "vimos" quedan fuera a propósito: "vi el proyecto en Facebook" es
// justo lo contrario de haber ido.
const YA_VISITO = /\b(estuve|estuvimos|estuvo|fui|fuimos|fue|pase|pasamos|paso|visite|visitamos|conozco|conocemos)\b[^.?!]{0,40}\b(ahi|alli|alla|lote|terreno|proyecto|zona|urbanizacion|condominio|sitio|lugar)\b/;

function yaVisito(texto) {
  return YA_VISITO.test(sinTildes(texto));
}

/**
 * ¿El agente está cerrando la conversación él mismo?
 *
 * El contacto PE.981400590890326 escribió "Ok" siete veces y recibió siete
 * despedidas distintas: "¡Que tengas un excelente día!", "¡Hasta luego!",
 * "¡Cuídate mucho!". El aviso que sí se disparaba le prohibía repetir la
 * ficha del proyecto, y el modelo obedeció al pie de la letra: no repitió la
 * ficha, se despidió. El que cierra una conversación de ventas es el
 * comprador, nunca el vendedor.
 */
const DESPEDIDA = /(hasta luego|hasta pronto|que tengas (un |una )?(excelente|buen|gran|lindo)|cuidate|te deseo (mucho )?(exito|suerte)|exito en tu busqueda|que te vaya bien|avisame si te decides|estare (aqui|aca) (para|si)|no dudes en (escribirme|contactarme))/i;

function seDespidio(texto) {
  return DESPEDIDA.test(sinTildes(texto));
}

/** Pistas sobre quién es la persona, sacadas de lo que ella misma escribió. */
const PISTAS = [
  [/(famili|hijo|hija|ni[ñn]o|esposa|esposo|pareja)/i, 'está pensando en su familia'],
  [/(vivir|habitar|mi casa|construir|hogar)/i, 'lo quiere para vivir, no para invertir'],
  [/(invertir|inversi[óo]n|rentar|revaloriza)/i, 'lo está viendo como inversión'],
  [/(cr[ée]dito|cuota|financia|letras|banco)/i, 'quiere pagarlo en cuotas'],
  [/(al contado|efectivo)/i, 'puede pagar al contado'],
];

/**
 * Qué sabemos y qué no sabemos de esta persona, leído de lo que escribió.
 *
 * El prompt pide hacer descubrimiento desde hace semanas, en prosa. Medido
 * sobre las 302 respuestas del mes: 2 preguntaron presupuesto, 0 preguntaron
 * el plazo, 4 preguntaron el nombre. La tabla de compradores tiene 47 filas
 * y ninguna con nombre. Una vez más: la prosa no se cumple, el dato sí — así
 * que lo que falta viaja como lista, con UNA sola pregunta marcada para este
 * turno, que es la forma en que el modelo sí lo ejecuta.
 */
const DATOS_DEL_PERFIL = [
  ['uso', /(vivir|habitar|mi casa|construir|hogar|invertir|inversi[óo]n|rentar|revaloriza|verano|campo)/i,
    'si lo quiere para vivir, para construir más adelante o como inversión'],
  ['forma_de_pago', /(al contado|efectivo|cr[ée]dito|cuota|letras|financia|banco|bono|mi vivienda)/i,
    'si lo piensa al contado o en cuotas'],
  ['inicial', /(inicial|ahorrad|tengo s\/|cuento con|dispongo)/i,
    'con cuánto podría arrancar hoy'],
  ['plazo', /(este mes|este a[ñn]o|pr[óo]ximo mes|en \d+ meses|apenas|urgente|ya mismo|m[áa]s adelante)/i,
    'para cuándo lo está pensando'],
];

function perfilComprador(mensajesDelCliente) {
  const texto = mensajesDelCliente.map(m => String(m.contenido_mensaje || '')).join(' \n ');
  const falta = DATOS_DEL_PERFIL.filter(([, re]) => !re.test(texto)).map(([, , pregunta]) => pregunta);
  const tiene = DATOS_DEL_PERFIL.filter(([, re]) => re.test(texto)).map(([clave]) => clave);
  return { falta, tiene };
}

/**
 * La instrucción que corresponde al estado actual de la conversación.
 * Cadena vacía si no hace falta decirle nada.
 *
 * @param historial      Mensajes previos, del más viejo al más nuevo.
 * @param mensajeActual  El mensaje que acaba de llegar y que todavía no está
 *                       en el historial. Sin esto los avisos miraban el
 *                       mensaje ANTERIOR del comprador: iban un turno
 *                       atrasados, y por eso "voy a conversar con mi familia"
 *                       no disparaba nada en el turno que importaba.
 */
function instruccionSegunHistorial(historial, mensajeActual) {
  const mensajes = Array.isArray(historial) ? historial : [];
  const avisos = [];

  const delAgente = mensajes.filter(m => m.remitente === 'asistente');
  const delCliente = mensajes.filter(m => m.remitente === 'usuario');

  // Lo que acaba de escribir manda; si no vino, se mira lo último que hay.
  const textoActual = mensajeActual != null ? String(mensajeActual).trim() : '';
  const ultimo = textoActual
    ? { contenido_mensaje: textoActual }
    : delCliente[delCliente.length - 1];

  const dichoPorElCliente = textoActual
    ? delCliente.concat([{ contenido_mensaje: textoActual }])
    : delCliente;

  // ── El estado de la visita ──────────────────────────────────────
  const propuestas = delAgente.filter(m => proponeVisita(m.contenido_mensaje)).length;
  const conEnlace = delAgente.some(m => mandoEnlace(m.contenido_mensaje));

  // El "sí" se detectaba un turno tarde porque solo miraba el historial, y el
  // mensaje que acepta todavía no está ahí. Reproducido sobre la conversación
  // real PE.981400590890326: en el turno del "Ok" que acepta, el aviso seguía
  // diciendo "todavía no te dijo que sí".
  // Y solo cuenta como aceptar LA VISITA si antes hubo una visita de la cual
  // hablar: un "me interesa" en el primer mensaje es interés en el proyecto,
  // no un sí a conocerlo, y saltar al cierre ahí espanta al comprador.
  const acepto = (propuestas >= 1 || conEnlace)
    && dichoPorElCliente.some(m => aceptoVisita(m.contenido_mensaje));

  if (acepto) {
    // Esta rama no existía, y era la que más plata valía. Las dos ramas que
    // había exigían `!acepto`, así que en el momento exacto en que el
    // comprador decía que sí, el código se callaba y dejaba al modelo solo.
    // Seis dijeron que sí en el mes y una sola llegó a agendar.
    avisos.push(
      'YA TE DIJO QUE SÍ a conocer el proyecto. Este es el turno que decide la venta, no lo dejes '
      + 'en el aire: no vuelvas a preguntarle si quiere visitar y no le des más datos del proyecto '
      + 'si no los pidió. ' + (conEnlace
        ? 'Ya tiene el enlace del calendario: recuérdale en una línea que ahí elige el día y la hora, '
          + 'y si te dice que no puede abrirlo, pídele el día y la hora que le quedan y confírmale con agendar_visita.'
        : 'Llama a proponer_horarios y ofrécele dos o tres horarios concretos de los que te devuelva, '
          + 'o mándale el enlace con enviar_link_agenda. Si te da un día y una hora, pídele el nombre '
          + 'completo y confirma con agendar_visita.'),
    );
  } else if (propuestas >= 1 && !conEnlace) {
    // Medido en el tráfico real: 94 invitaciones en un mes, 11 enlaces de
    // calendario y 1 visita. Preguntar "¿te gustaría agendar?" obliga al
    // comprador a contestar que sí antes de que pase nada, y casi nadie
    // contesta eso. El enlace y el horario concreto no le piden una
    // respuesta: le piden un clic o un "ese me va".
    avisos.push(
      `Ya le propusiste agendar una visita ${propuestas === 1 ? 'una vez' : `${propuestas} veces`} `
      + 'en esta conversación y todavía no te dijo que sí. NO vuelvas a hacerle la misma pregunta: '
      + 'insistir con lo mismo es lo que hace que suene a robot. Si sigue interesada, deja de '
      + 'preguntar y pasa a lo concreto: llama a proponer_horarios y ofrécele dos horarios reales, '
      + 'o mándale el enlace con enviar_link_agenda para que elija ella. Si no viene a cuento, '
      + 'avanza con otra cosa: un dato que todavía no le diste, una foto, o una pregunta sobre lo que busca.',
    );
  } else if (propuestas >= 1 && conEnlace) {
    avisos.push(
      'Ya le propusiste la visita y ya le mandaste el enlace del calendario. No insistas más con eso: '
      + 'el enlace sigue vivo y ella decide cuándo usarlo. Dedícate a resolverle lo que pregunte.',
    );
  }

  // ── Ya estuvo en el proyecto ────────────────────────────────────
  if (dichoPorElCliente.some(m => yaVisito(m.contenido_mensaje))) {
    avisos.push(
      'Esta persona YA ESTUVO en el proyecto. No la invites a conocer algo que ya conoció ni le '
      + 'describas la ubicación: quedas como un folleto. Da por hecho que le gustó, retoma lo que '
      + 'ella misma dijo que le gustó, y lleva la conversación al siguiente paso real: qué lote le '
      + 'interesa, con cuánto puede arrancar, y una reunión con Pamela para cerrar. Pregúntale '
      + 'directamente si quiere que le reserven el lote.',
    );
  }

  // ── El agente se está despidiendo solo ──────────────────────────
  const despedidas = delAgente.filter(m => seDespidio(m.contenido_mensaje)).length;
  if (despedidas >= 1 && ultimo && !seDespidio(ultimo.contenido_mensaje)) {
    avisos.push(
      `Ya te despediste ${despedidas === 1 ? 'una vez' : `${despedidas} veces`} en esta conversación `
      + 'y la persona siguió escribiendo. El que cierra una conversación de ventas es el comprador, '
      + 'nunca tú. PROHIBIDO despedirte en este mensaje: nada de "hasta luego", "que tengas un buen '
      + 'día", "cuídate", "avísame si te decides" ni "estaré aquí para ayudarte". Termina con una '
      + 'pregunta concreta que te falte saber de ella, o con un dato que todavía no le diste.',
    );
  }

  // ── Se despide sin cerrar ───────────────────────────────────────
  if (ultimo && seVaAPensar(ultimo.contenido_mensaje)) {
    avisos.push(
      'Se está despidiendo sin decidir nada. No la dejes ir con un "tómate tu tiempo" y ya: eso es '
      + 'perder el contacto. Recíbelo bien, dale UNA razón concreta para volver (los lotes que quedan, '
      + 'el precio de contado, lo que sea real de este proyecto) y pídele permiso para escribirle en '
      + 'unos días: "¿te parece si te escribo el fin de semana para saber qué decidieron?". Que quede '
      + 'una puerta abierta, no un cierre.',
    );
  }

  // ── Acaba de decir que no a algo ────────────────────────────────
  // Contacto ...2241: pidió Techo Propio, el agente dijo que no trabajan con
  // eso (correcto) y se despidió con un "te deseo mucho éxito". La alternativa
  // real existía y estaba cargada.
  const ultimaDelAgente = delAgente[delAgente.length - 1];
  if (ultimaDelAgente && /\b(no (trabajamos|tenemos|contamos|manejamos|tengo)|no está disponible|no aplica)\b/i
    .test(String(ultimaDelAgente.contenido_mensaje || ''))) {
    avisos.push(
      'En tu mensaje anterior le dijiste que no a algo. Decir que no y despedirse es regalar el '
      + 'cliente: usa el campo lo_que_si_puedo_ofrecer que te devuelve consultar_proyectos y ofrécele '
      + 'la alternativa más parecida a lo que pedía, con el número concreto. Si de verdad no hay nada '
      + 'que le sirva, pregúntale qué presupuesto maneja antes de dejarlo ir.',
    );
  }

  // ── Lo último que dijo ──────────────────────────────────────────
  // El agente respondía con frases de folleto aunque la persona acabara de
  // contarle algo concreto. Nombrar el dato acá lo obliga a usarlo.
  if (ultimo) {
    const texto = String(ultimo.contenido_mensaje || '');
    const encontradas = PISTAS.filter(([re]) => re.test(texto)).map(([, frase]) => frase);

    if (encontradas.length > 0) {
      avisos.push(
        `Lo último que te dijo importa: ${encontradas.join(' y ')}. Tu respuesta tiene que partir de ahí `
        + 'y elegir los datos que le sirven A ESA persona, no los de siempre. Si te contó algo de su '
        + 'vida, recíbelo antes de seguir vendiendo.',
      );
    }
  }

  // ── Mensajes sueltos que no dicen nada ──────────────────────────
  // "Quiero información", "👀👀👀", "Hola" a mitad de conversación. El agente
  // los tomaba como pie para volver a soltar la ficha entera del proyecto.
  if (ultimo && delAgente.length > 0) {
    const texto = String(ultimo.contenido_mensaje || '').trim();
    const palabras = texto ? texto.split(/\s+/).length : 0;
    const generico = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|informacion|info|quiero informacion|mas informacion)\b/i
      .test(sinTildes(texto));

    if (palabras <= 3 || generico) {
      avisos.push(
        'Ese último mensaje no pide nada nuevo. NO le repitas la ficha del proyecto: ya se la diste, '
        + 'y tampoco te despidas. Un "Ok" no es una despedida: es una persona esperando que tú lleves '
        + 'la conversación. Retoma el hilo y hazle una pregunta corta que te sirva para asesorarla.',
      );
    }
  }

  // ── Lo que todavía no sabemos de ella ───────────────────────────
  const perfil = perfilComprador(dichoPorElCliente);
  if (perfil.falta.length > 0 && dichoPorElCliente.length >= 1) {
    avisos.push(
      `Todavía no sabes ${perfil.falta.join(', ni ')}. Mete UNA de esas preguntas en este mensaje, `
      + 'la que más te sirva según lo que venían hablando, y solo una: sin eso no puedes asesorar a '
      + 'nadie, solo recitar precios. Pregúntala al final, después de haberle respondido lo que pidió.',
    );
  }

  if (avisos.length === 0) return '';
  return '\n\nSOBRE ESTA CONVERSACIÓN (esto pesa más que cualquier regla general):\n'
       + avisos.map(a => `- ${a}`).join('\n');
}

module.exports = {
  proponeVisita,
  aceptoVisita,
  mandoEnlace,
  seVaAPensar,
  yaVisito,
  seDespidio,
  perfilComprador,
  instruccionSegunHistorial,
};
