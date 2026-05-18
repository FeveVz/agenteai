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

// ── Herramientas disponibles para la IA ───────────────────────────────────────

const HERRAMIENTAS = [
  {
    type: 'function',
    function: {
      name: 'consultar_disponibilidad',
      description: 'Consulta los horarios disponibles para una fecha específica en la clínica dental.',
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
      name: 'ver_turnos_paciente',
      description: 'Muestra los turnos activos de un paciente dado su número de teléfono.',
      parameters: {
        type: 'object',
        properties: {
          numero_telefono: { type: 'string', description: 'Número de teléfono del paciente.' },
        },
        required: ['numero_telefono'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_turno',
      description: 'Agenda un nuevo turno para un paciente.',
      parameters: {
        type: 'object',
        properties: {
          numero_telefono: { type: 'string' },
          nombre_paciente: { type: 'string' },
          fecha_turno: { type: 'string', description: 'Formato ISO: "2026-03-22T14:30:00"' },
          tipo_turno: { type: 'string' },
          notas: { type: 'string' },
        },
        required: ['numero_telefono', 'nombre_paciente', 'fecha_turno', 'tipo_turno'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_turno',
      description: 'Cancela un turno existente dado su ID.',
      parameters: {
        type: 'object',
        properties: {
          id_turno: { type: 'integer' },
        },
        required: ['id_turno'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reprogramar_turno',
      description: 'Reprograma un turno a una nueva fecha y hora.',
      parameters: {
        type: 'object',
        properties: {
          id_turno: { type: 'integer' },
          nueva_fecha: { type: 'string', description: 'Formato ISO: "2026-03-25T10:00:00"' },
        },
        required: ['id_turno', 'nueva_fecha'],
      },
    },
  },
];

// ── Ejecución de herramientas (async) contra Supabase ────────────────────────

async function ejecutarHerramienta(nombre, argumentos) {
  const supabase = obtenerSupabase();

  switch (nombre) {
    case 'consultar_disponibilidad': {
      const { fecha } = argumentos;
      const { data: turnos } = await supabase
        .from('turnos')
        .select('*')
        .gte('fecha_turno', `${fecha}T00:00:00`)
        .lte('fecha_turno', `${fecha}T23:59:59`)
        .neq('estado', 'cancelado')
        .order('fecha_turno', { ascending: true });

      const libres = calcularHorariosLibres(turnos || []);
      const ocupados = (turnos || []).map(t => ({
        hora: t.fecha_turno.substring(11, 16),
        tipo: t.tipo_turno,
      }));

      return {
        fecha,
        horarios_libres: libres,
        horarios_ocupados: ocupados,
        total_disponibles: libres.length,
        mensaje: libres.length === 0
          ? `No hay turnos disponibles para el ${fecha}.`
          : `Hay ${libres.length} horarios disponibles el ${fecha}.`,
      };
    }

    case 'ver_turnos_paciente': {
      const { numero_telefono } = argumentos;
      const { data: turnos } = await supabase
        .from('turnos')
        .select('*')
        .eq('numero_telefono', numero_telefono)
        .neq('estado', 'cancelado')
        .order('fecha_turno', { ascending: false })
        .limit(10);

      if (!turnos || turnos.length === 0) {
        return { turnos: [], mensaje: 'No tenés turnos activos.' };
      }

      return {
        turnos: turnos.map(t => ({
          id: t.id,
          fecha: formatearFechaCompleta(t.fecha_turno),
          tipo: t.tipo_turno,
          estado: t.estado,
          notas: t.notas,
        })),
        total: turnos.length,
      };
    }

    case 'agendar_turno': {
      const { numero_telefono, nombre_paciente, fecha_turno, tipo_turno, notas } = argumentos;

      // Verificar que el horario no esté ocupado
      const { data: existente } = await supabase
        .from('turnos')
        .select('id')
        .eq('fecha_turno', fecha_turno)
        .neq('estado', 'cancelado')
        .limit(1);

      if (existente && existente.length > 0) {
        return {
          exito: false,
          mensaje: `El horario ${formatearFechaCompleta(fecha_turno)} ya está ocupado. Por favor elegí otro.`,
        };
      }

      const { data: nuevoTurno, error } = await supabase
        .from('turnos')
        .insert({
          numero_telefono,
          nombre_paciente,
          fecha_turno,
          tipo_turno,
          estado: 'confirmado',
          notas: notas || null,
        })
        .select()
        .single();

      if (error) return { exito: false, mensaje: `Error al agendar: ${error.message}` };

      return {
        exito: true,
        id_turno: nuevoTurno.id,
        mensaje: `✅ Turno confirmado para ${nombre_paciente} el ${formatearFechaCompleta(fecha_turno)} — ${tipo_turno}.`,
      };
    }

    case 'cancelar_turno': {
      const { id_turno } = argumentos;

      const { data: turno } = await supabase
        .from('turnos')
        .select('*')
        .eq('id', id_turno)
        .single();

      if (!turno) {
        return { exito: false, mensaje: `No encontré ningún turno con el ID ${id_turno}.` };
      }

      await supabase.from('turnos').update({ estado: 'cancelado' }).eq('id', id_turno);

      return {
        exito: true,
        mensaje: `✅ Turno del ${formatearFechaCompleta(turno.fecha_turno)} cancelado correctamente.`,
      };
    }

    case 'reprogramar_turno': {
      const { id_turno, nueva_fecha } = argumentos;

      const { data: turno } = await supabase
        .from('turnos')
        .select('*')
        .eq('id', id_turno)
        .single();

      if (!turno) {
        return { exito: false, mensaje: `No encontré ningún turno con el ID ${id_turno}.` };
      }

      const { data: conflicto } = await supabase
        .from('turnos')
        .select('id')
        .eq('fecha_turno', nueva_fecha)
        .neq('estado', 'cancelado')
        .neq('id', id_turno)
        .limit(1);

      if (conflicto && conflicto.length > 0) {
        return {
          exito: false,
          mensaje: `El horario ${formatearFechaCompleta(nueva_fecha)} ya está ocupado. Elegí otro.`,
        };
      }

      await supabase.from('turnos').update({ fecha_turno: nueva_fecha }).eq('id', id_turno);

      return {
        exito: true,
        mensaje: `✅ Turno reprogramado para el ${formatearFechaCompleta(nueva_fecha)}.`,
      };
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

async function procesarMensajeConIA(numeroTelefono, mensajeUsuario, configClinica, historial) {
  const openai = obtenerClienteOpenAI();

  let serviciosTexto = configClinica.servicios || '[]';
  try { serviciosTexto = JSON.parse(serviciosTexto).join(', '); } catch { /* usa como string */ }

  const systemPrompt = `Sos Sarah, la recepcionista virtual de ${configClinica.nombre_clinica || 'la clínica'}. Sos amable, profesional y eficiente.

Tu rol es:
- Responder preguntas sobre la clínica, servicios y horarios
- Ayudar a los pacientes a agendar, consultar, cancelar o reprogramar turnos
- Ser cálida y concisa en tus respuestas
- Usar español rioplatense (tuteo con "vos", no "usted")
- Usar emojis moderadamente

Información de la clínica:
- Nombre: ${configClinica.nombre_clinica || 'No especificado'}
- Dirección: ${configClinica.direccion || 'No especificada'}
- Teléfono: ${configClinica.telefono || 'No especificado'}
- Email: ${configClinica.email || 'No especificado'}
- Horarios: ${configClinica.horarios || 'No especificados'}
- Servicios: ${serviciosTexto}
- Sobre nosotros: ${configClinica.sobre_clinica || ''}

El número del paciente es: ${numeroTelefono}

Reglas:
- Para agendar, pedí siempre: nombre completo, fecha/hora preferida y tipo de consulta
- Turnos disponibles de 9:00 a 18:00 hs, cada 30 minutos
- Nunca inventés información que no tengas
- Usá el número de teléfono del paciente que te indiqué arriba al agendar`;

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
    max_tokens: 1000,
  });

  let mensaje = respuesta.choices[0].message;

  // Ejecutar herramientas si las hay
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
      max_tokens: 1000,
    });

    mensaje = respuesta.choices[0].message;
  }

  return mensaje.content || 'Disculpá, no pude procesar tu mensaje. ¿Podés repetirlo?';
}

module.exports = { procesarMensajeConIA };
