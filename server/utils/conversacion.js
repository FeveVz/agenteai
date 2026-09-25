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

/**
 * ¿El comprador aceptó? Un "sí" suelto cuenta: es como se contesta en WhatsApp.
 *
 * Se le quitan las tildes antes de comparar porque el \b de JavaScript solo
 * reconoce letras ASCII: con "sí" el límite de palabra no cierra nunca y la
 * primera versión no detectaba la respuesta más común de todas.
 */
function aceptoVisita(texto) {
  const t = String(texto || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  // "si" también significa condición ("si me pasas el precio, vemos"), así que
  // solo cuenta como aceptación en un mensaje corto, que es como se dice que sí.
  if (t.length <= 20 && /^(si|dale|ya|ok|okay|claro|perfecto|bueno|de una)\b/.test(t)) return true;

  return /(quiero|me gustaria|podemos|vamos a)\s+(ir|visitar|verlo|conocer)/.test(t)
      || /(agendame|coordiname|mandame el (link|enlace)|pasame el (link|enlace))/.test(t);
}

/** Pistas sobre quién es la persona, sacadas de lo que ella misma escribió. */
const PISTAS = [
  [/(famili|hijo|hija|ni[ñn]o|esposa|esposo|pareja)/i, 'está pensando en su familia'],
  [/(vivir|habitar|mi casa|construir)/i, 'lo quiere para vivir, no para invertir'],
  [/(invertir|inversi[óo]n|rentar|revaloriza)/i, 'lo está viendo como inversión'],
  [/(cr[ée]dito|cuota|financia|letras|banco)/i, 'quiere pagarlo en cuotas'],
  [/(al contado|efectivo)/i, 'puede pagar al contado'],
];

/**
 * La instrucción que corresponde al estado actual de la conversación.
 * Cadena vacía si no hace falta decirle nada.
 *
 * @param historial  Mensajes previos, del más viejo al más nuevo.
 */
function instruccionSegunHistorial(historial) {
  const mensajes = Array.isArray(historial) ? historial : [];
  const avisos = [];

  const delAgente = mensajes.filter(m => m.remitente === 'asistente');
  const delCliente = mensajes.filter(m => m.remitente === 'usuario');

  // ── La invitación repetida ──────────────────────────────────────
  const propuestas = delAgente.filter(m => proponeVisita(m.contenido_mensaje)).length;
  const acepto = delCliente.some(m => aceptoVisita(m.contenido_mensaje));

  if (propuestas >= 1 && !acepto) {
    avisos.push(
      `Ya le propusiste agendar una visita ${propuestas === 1 ? 'una vez' : `${propuestas} veces`} `
      + 'en esta conversación y todavía no te dijo que sí. NO se lo vuelvas a proponer en este mensaje: '
      + 'insistir con lo mismo es lo que hace que suene a robot. Avanza con otra cosa — un dato que '
      + 'todavía no le diste, una foto, o una pregunta sobre lo que busca. Ya volverá el momento de invitarla.',
    );
  }

  // ── Lo último que dijo ──────────────────────────────────────────
  // El agente respondía con frases de folleto aunque la persona acabara de
  // contarle algo concreto. Nombrar el dato acá lo obliga a usarlo.
  const ultimo = delCliente[delCliente.length - 1];
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

  if (avisos.length === 0) return '';
  return '\n\nSOBRE ESTA CONVERSACIÓN (esto pesa más que cualquier regla general):\n'
       + avisos.map(a => `- ${a}`).join('\n');
}

module.exports = { proponeVisita, aceptoVisita, instruccionSegunHistorial };
