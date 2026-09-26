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

// ...pero solo si lo que sigue habla de la visita...
const SIGUE_ACEPTANDO = /\b(agend\w*|coordin\w*|visit\w*|ir|voy|vamos|conocer\w*|llam\w*|cuando|dia|dias|hora|horas|fecha|manda\w*|pasa\w*|envia\w*)\b/;

// ...o es puro relleno, que en Perú es como se remata un sí.
const RELLENO = new Set([
  'pues', 'ps', 'pe', 'nomas', 'mas', 'no', 'esta', 'bien', 'claro', 'ok', 'si',
  'dale', 'gracias', 'porfa', 'por', 'favor', 'listo', 'perfecto', 'bueno', 'genial',
]);

// Frases con las que una persona se despide sin cerrar nada. Es el momento
// más caro de la conversación y el agente lo estaba dejando pasar con un
// "tómate tu tiempo": el comprador se iba y nadie volvía a escribirle nunca.
const SE_VA_A_PENSAR = /(lo (voy a |vamos a )?pens|conversar con mi (familia|esposa|esposo|pareja)|consultar con mi|lo veo y te (digo|aviso)|te (aviso|escribo|confirmo) (luego|despues|mas tarde)|mas adelante|por ahora no|voy a ver)/i;

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
  if (SE_VA_A_PENSAR.test(t)) return false;

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

/** Pistas sobre quién es la persona, sacadas de lo que ella misma escribió. */
const PISTAS = [
  [/(famili|hijo|hija|ni[ñn]o|esposa|esposo|pareja)/i, 'está pensando en su familia'],
  [/(vivir|habitar|mi casa|construir|hogar)/i, 'lo quiere para vivir, no para invertir'],
  [/(invertir|inversi[óo]n|rentar|revaloriza)/i, 'lo está viendo como inversión'],
  [/(cr[ée]dito|cuota|financia|letras|banco)/i, 'quiere pagarlo en cuotas'],
  [/(al contado|efectivo)/i, 'puede pagar al contado'],
];

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

  // ── La invitación repetida ──────────────────────────────────────
  const propuestas = delAgente.filter(m => proponeVisita(m.contenido_mensaje)).length;
  const acepto = delCliente.some(m => aceptoVisita(m.contenido_mensaje));
  const conEnlace = delAgente.some(m => mandoEnlace(m.contenido_mensaje));

  if (propuestas >= 1 && !acepto && !conEnlace) {
    // Medido en el tráfico real: 9 invitaciones en un día, 0 enlaces de
    // calendario y 0 visitas agendadas. Preguntar "¿te gustaría agendar?"
    // obliga al comprador a contestar que sí antes de que pase nada, y casi
    // nadie contesta eso. El enlace no le pide una respuesta: le pide un clic.
    avisos.push(
      `Ya le propusiste agendar una visita ${propuestas === 1 ? 'una vez' : `${propuestas} veces`} `
      + 'en esta conversación y todavía no te dijo que sí. NO vuelvas a hacerle la misma pregunta: '
      + 'insistir con lo mismo es lo que hace que suene a robot. Si sigue interesada, usa '
      + 'enviar_link_agenda y pásale el enlace del calendario, para que elija el día ella misma sin '
      + 'tener que contestarte nada. Si no viene a cuento, avanza con otra cosa: un dato que todavía '
      + 'no le diste, una foto, o una pregunta sobre lo que busca.',
    );
  } else if (propuestas >= 1 && !acepto && conEnlace) {
    avisos.push(
      'Ya le propusiste la visita y ya le mandaste el enlace del calendario. No insistas más con eso: '
      + 'el enlace sigue vivo y ella decide cuándo usarlo. Dedícate a resolverle lo que pregunte.',
    );
  }

  // ── Se despide sin cerrar ───────────────────────────────────────
  // Lo que acaba de escribir manda; si no vino, se mira lo último que hay.
  const ultimo = mensajeActual != null && String(mensajeActual).trim()
    ? { contenido_mensaje: String(mensajeActual) }
    : delCliente[delCliente.length - 1];

  if (ultimo && SE_VA_A_PENSAR.test(String(ultimo.contenido_mensaje || ''))) {
    avisos.push(
      'Se está despidiendo sin decidir nada. No la dejes ir con un "tómate tu tiempo" y ya: eso es '
      + 'perder el contacto. Recíbelo bien, dale UNA razón concreta para volver (los lotes que quedan, '
      + 'el precio de contado, lo que sea real de este proyecto) y pídele permiso para escribirle en '
      + 'unos días: "¿te parece si te escribo el fin de semana para saber qué decidieron?". Que quede '
      + 'una puerta abierta, no un cierre.',
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
        'Ese último mensaje no pide nada nuevo. NO le repitas la ficha del proyecto: ya se la diste. '
        + 'Retoma el hilo de lo que venían hablando y hazle una pregunta corta que te sirva para '
        + 'asesorarla (para qué lo quiere, qué presupuesto maneja, cuándo podría verlo).',
      );
    }
  }

  if (avisos.length === 0) return '';
  return '\n\nSOBRE ESTA CONVERSACIÓN (esto pesa más que cualquier regla general):\n'
       + avisos.map(a => `- ${a}`).join('\n');
}

module.exports = { proponeVisita, aceptoVisita, mandoEnlace, instruccionSegunHistorial };
