const OpenAI = require('openai');
const { obtenerSupabase } = require('../db');
const { calcularHorariosLibres, formatearFechaCompleta } = require('../utils/fechas');

let clienteOpenAI;

function obtenerClienteOpenAI() {
  if (!clienteOpenAI) {
    clienteOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return clienteOpenAI;
}

// ── Herramientas disponibles para el agente ───────────────────────────────────

const HERRAMIENTAS = [
  {
    type: 'function',
    function: {
      name: 'consultar_disponibilidad',
      description: 'Consulta los horarios disponibles para una reunión en una fecha específica.',
      parameters: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD. Ej: "2026-03-22"' },
        },
        required: ['fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ver_reuniones_cliente',
      description: 'Muestra las reuniones activas de un cliente dado su número de teléfono.',
      parameters: {
        type: 'object',
        properties: {
          numero_telefono: { type: 'string', description: 'Número de teléfono del cliente.' },
        },
        required: ['numero_telefono'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_reunion',
      description: 'Agenda una nueva reunión de consultoría o presentación de servicios.',
      parameters: {
        type: 'object',
        properties: {
          numero_telefono: { type: 'string' },
          nombre_cliente: { type: 'string', description: 'Nombre completo del cliente o contacto.' },
          empresa: { type: 'string', description: 'Empresa u organización del cliente (opcional).' },
          fecha_reunion: { type: 'string', description: 'Formato ISO: "2026-03-22T14:30:00"' },
          tipo_servicio: { type: 'string', description: 'Servicio de interés. Ej: "Consultoría de Marketing", "Auditoría de Redes Sociales"' },
          notas: { type: 'string', description: 'Información adicional o necesidades específicas del cliente (opcional).' },
        },
        required: ['numero_telefono', 'nombre_cliente', 'fecha_reunion', 'tipo_servicio'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_reunion',
      description: 'Cancela una reunión existente dado su ID.',
      parameters: {
        type: 'object',
        properties: {
          id_reunion: { type: 'integer' },
        },
        required: ['id_reunion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reprogramar_reunion',
      description: 'Reprograma una reunión a una nueva fecha y hora.',
      parameters: {
        type: 'object',
        properties: {
          id_reunion: { type: 'integer' },
          nueva_fecha: { type: 'string', description: 'Formato ISO: "2026-03-25T10:00:00"' },
        },
        required: ['id_reunion', 'nueva_fecha'],
      },
    },
  },
];

// ── Ejecución de herramientas contra Supabase ─────────────────────────────────

async function ejecutarHerramienta(nombre, argumentos) {
  const supabase = obtenerSupabase();

  switch (nombre) {
    case 'consultar_disponibilidad': {
      const { fecha } = argumentos;
      const { data: reuniones } = await supabase
        .from('reuniones')
        .select('*')
        .gte('fecha_reunion', `${fecha}T00:00:00`)
        .lte('fecha_reunion', `${fecha}T23:59:59`)
        .neq('estado', 'cancelada')
        .order('fecha_reunion', { ascending: true });

      const libres = calcularHorariosLibres(reuniones || []);
      const ocupados = (reuniones || []).map(r => ({
        hora: r.fecha_reunion.substring(11, 16),
        servicio: r.tipo_servicio,
      }));

      return {
        fecha,
        horarios_libres: libres.slice(0, 6),
        horarios_libres_nota: libres.length > 6 ? `Mostrando 6 de ${libres.length} horarios disponibles. Podés pedir más opciones.` : undefined,
        horarios_ocupados: ocupados,
        total_disponibles: libres.length,
        mensaje: libres.length === 0
          ? `No hay horarios disponibles el ${fecha}.`
          : `Hay ${libres.length} horarios disponibles el ${fecha}. Mostrando los primeros 6.`,
      };
    }

    case 'ver_reuniones_cliente': {
      const { numero_telefono } = argumentos;
      const { data: reuniones } = await supabase
        .from('reuniones')
        .select('*')
        .eq('numero_telefono', numero_telefono)
        .neq('estado', 'cancelada')
        .order('fecha_reunion', { ascending: false })
        .limit(10);

      if (!reuniones || reuniones.length === 0) {
        return { reuniones: [], mensaje: 'No tenés reuniones agendadas.' };
      }

      return {
        reuniones: reuniones.map(r => ({
          id: r.id,
          fecha: formatearFechaCompleta(r.fecha_reunion),
          tipo_servicio: r.tipo_servicio,
          empresa: r.empresa,
          estado: r.estado,
          notas: r.notas,
        })),
        total: reuniones.length,
      };
    }

    case 'agendar_reunion': {
      const { numero_telefono, nombre_cliente, empresa, fecha_reunion, tipo_servicio, notas } = argumentos;

      const { data: existente } = await supabase
        .from('reuniones')
        .select('id')
        .eq('fecha_reunion', fecha_reunion)
        .neq('estado', 'cancelada')
        .limit(1);

      if (existente && existente.length > 0) {
        return {
          exito: false,
          mensaje: `El horario ${formatearFechaCompleta(fecha_reunion)} ya está ocupado. ¿Te viene bien otro horario?`,
        };
      }

      const { data: nuevaReunion, error } = await supabase
        .from('reuniones')
        .insert({
          numero_telefono,
          nombre_cliente,
          empresa: empresa || null,
          fecha_reunion,
          tipo_servicio,
          estado: 'confirmada',
          notas: notas || null,
        })
        .select()
        .single();

      if (error) return { exito: false, mensaje: `Error al agendar: ${error.message}` };

      return {
        exito: true,
        id_reunion: nuevaReunion.id,
        mensaje: `✅ Reunión confirmada para ${nombre_cliente}${empresa ? ` (${empresa})` : ''} el ${formatearFechaCompleta(fecha_reunion)} — ${tipo_servicio}.`,
      };
    }

    case 'cancelar_reunion': {
      const { id_reunion } = argumentos;

      const { data: reunion } = await supabase
        .from('reuniones')
        .select('*')
        .eq('id', id_reunion)
        .single();

      if (!reunion) {
        return { exito: false, mensaje: `No encontré ninguna reunión con el ID ${id_reunion}.` };
      }

      await supabase.from('reuniones').update({ estado: 'cancelada' }).eq('id', id_reunion);

      return {
        exito: true,
        mensaje: `✅ Reunión del ${formatearFechaCompleta(reunion.fecha_reunion)} cancelada correctamente.`,
      };
    }

    case 'reprogramar_reunion': {
      const { id_reunion, nueva_fecha } = argumentos;

      const { data: reunion } = await supabase
        .from('reuniones')
        .select('*')
        .eq('id', id_reunion)
        .single();

      if (!reunion) {
        return { exito: false, mensaje: `No encontré ninguna reunión con el ID ${id_reunion}.` };
      }

      const { data: conflicto } = await supabase
        .from('reuniones')
        .select('id')
        .eq('fecha_reunion', nueva_fecha)
        .neq('estado', 'cancelada')
        .neq('id', id_reunion)
        .limit(1);

      if (conflicto && conflicto.length > 0) {
        return {
          exito: false,
          mensaje: `El horario ${formatearFechaCompleta(nueva_fecha)} ya está ocupado. ¿Querés otro?`,
        };
      }

      await supabase.from('reuniones').update({ fecha_reunion: nueva_fecha }).eq('id', id_reunion);

      return {
        exito: true,
        mensaje: `✅ Reunión reprogramada para el ${formatearFechaCompleta(nueva_fecha)}.`,
      };
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

async function procesarMensajeConIA(numeroTelefono, mensajeUsuario, configAgencia, historial) {
  const openai = obtenerClienteOpenAI();

  let serviciosTexto = configAgencia.servicios || '[]';
  try { serviciosTexto = JSON.parse(serviciosTexto).join(', '); } catch { /* usa como string */ }

  const ahora = new Date().toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const redesTexto = configAgencia.redes_sociales ? `\n- Redes sociales: ${configAgencia.redes_sociales}` : '';
  const casosTexto = configAgencia.casos_exito ? `\n\nCasos de éxito y resultados concretos:\n${configAgencia.casos_exito}` : '';
  const faqTexto = configAgencia.preguntas_frecuentes ? `\n\nPreguntas frecuentes y cómo responderlas:\n${configAgencia.preguntas_frecuentes}` : '';

  const systemPrompt = `Sos Valeria, la asistente virtual de Suggestion, agencia de marketing digital. Sos profesional, dinámica y orientada a resultados.

FECHA Y HORA ACTUAL (Perú, Lima): ${ahora}
Usá esta fecha como referencia para todas las consultas de disponibilidad y agendamiento. Nunca uses fechas del pasado para agendar reuniones.

Slogan de la agencia: "${configAgencia.slogan || 'Consigue lo posible haciendo lo imposible'}"

Tu rol es:
- Responder consultas sobre los servicios de Suggestion
- Agendar, consultar, cancelar o reprogramar reuniones con el equipo
- Calificar el interés del prospecto (qué servicio le interesa, tamaño de empresa, objetivo)
- Ser entusiasta pero concisa — generás confianza en la agencia

Información de Suggestion:
- Agencia: ${configAgencia.nombre_agencia || 'Suggestion'}
- Dirección: ${configAgencia.direccion || 'Perú'}
- Teléfono / WhatsApp: ${configAgencia.telefono || '+51 937770159'}
- Email: ${configAgencia.email || 'suggesion.mk@gmail.com'}
- Horarios de atención: ${configAgencia.horarios || 'Lunes a Viernes 9:00 - 18:00'}
- Servicios que ofrecemos: ${serviciosTexto}${redesTexto}
- Sobre nosotros: ${configAgencia.sobre_agencia || 'Agencia de marketing digital con +10 años de experiencia, 150+ clientes satisfechos y clientes como Mazda, Renault y Repsol.'}${casosTexto}${faqTexto}

El número de WhatsApp del cliente es: ${numeroTelefono}

Reglas importantes:
- MENSAJES CORTOS: Respondé siempre en máximo 120 palabras. WhatsApp no es email — sé directa y conversacional. Si te piden una lista larga de servicios, mencioná los 3-4 más relevantes y ofrecé ampliar en la reunión.
- CONSULTAR REUNIONES: Si el cliente menciona que ya tiene una reunión agendada, que quiere cambiarla, cancelarla o preguntar por ella, SIEMPRE llamá primero a ver_reuniones_cliente para ver sus reuniones reales antes de responder. Nunca asumas que el cliente tiene o no tiene reuniones sin consultar.
- ANTES de llamar a agendar_reunion, SIEMPRE tenés que tener confirmados: nombre completo real del cliente, fecha y hora, y servicio de interés. Si falta cualquiera de estos datos, preguntá primero. NUNCA uses placeholders como "[Tu Nombre]", "[Tu Empresa]" o texto de ejemplo.
- Si el cliente solo dice una hora sin dar su nombre, preguntale el nombre ANTES de confirmar la reunión.
- No agendés dos reuniones seguidas para el mismo cliente en el mismo día a menos que lo pida explícitamente.
- Las reuniones son de 9:00 a 18:00 hs, cada 30 minutos
- Si preguntan por precios, explicá que los presupuestos son personalizados y los cotizamos en la reunión
- Siempre invitá a agendar una reunión de consultoría gratuita
- Usá español latinoamericano neutro (sin tuteo excesivo, profesional pero cercano)
- Nunca inventés información sobre clientes, precios o resultados que no tengas
- Si no podés resolver algo, derivá al equipo por email: ${configAgencia.email || 'suggesion.mk@gmail.com'}`;

  const mensajes = [{ role: 'system', content: systemPrompt }];

  for (const msg of historial) {
    mensajes.push({
      role: msg.remitente === 'usuario' ? 'user' : 'assistant',
      content: msg.contenido_mensaje,
    });
  }
  mensajes.push({ role: 'user', content: mensajeUsuario });

  console.log(`[OpenAI] Procesando mensaje de ${numeroTelefono}...`);

  let respuesta = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: mensajes,
    tools: HERRAMIENTAS,
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens: 500,
  });

  let mensaje = respuesta.choices[0].message;

  while (mensaje.tool_calls && mensaje.tool_calls.length > 0) {
    console.log(`[OpenAI] Ejecutando ${mensaje.tool_calls.length} herramienta(s)...`);
    mensajes.push(mensaje);

    for (const toolCall of mensaje.tool_calls) {
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments); } catch { /* args vacíos */ }

      console.log(`[OpenAI] → ${toolCall.function.name}`, args);
      const resultado = await ejecutarHerramienta(toolCall.function.name, args);
      console.log(`[OpenAI] ← Resultado:`, resultado);

      mensajes.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(resultado),
      });
    }

    respuesta = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: mensajes,
      tools: HERRAMIENTAS,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 500,
    });

    mensaje = respuesta.choices[0].message;
  }

  return mensaje.content || '¡Hola! Soy Valeria de Suggestion. ¿En qué puedo ayudarte hoy?';
}

module.exports = { procesarMensajeConIA };
