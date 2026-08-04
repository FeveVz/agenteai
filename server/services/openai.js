const OpenAI = require('openai');
const { obtenerSupabase } = require('../db');
const { calcularHorariosLibres, formatearFechaCompleta } = require('../utils/fechas');
const { crearEnlaceAgenda } = require('../routes/agenda');
const { enviarAlertaVisita } = require('./email');

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
      name: 'consultar_proyectos',
      description: 'Devuelve el detalle de los proyectos inmobiliarios de Ceinys (ubicación, tipo, precios, áreas, financiamiento). Usar SIEMPRE antes de dar cualquier dato concreto sobre un proyecto. Si se pasa "nombre", devuelve solo ese proyecto.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre del proyecto a consultar. Omitir para traer todos. Ej: "Altos de Sacta"' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enviar_link_agenda',
      description: 'Genera un enlace personal para que el cliente elija fecha y horario en un calendario, y agende su visita solo. Es la forma preferida de agendar: mucho más cómoda que pedirle la fecha por chat. Usarla apenas el cliente muestre intención de visitar.',
      parameters: {
        type: 'object',
        properties: {
          proyecto: { type: 'string', description: 'Proyecto que le interesa, si ya lo definió. Opcional: el calendario lo deja elegir.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enviar_fotos_proyecto',
      description: 'Envía por WhatsApp las fotos, planos o renders de un proyecto. Usar cuando el cliente pide ver imágenes, fotos, el plano, cómo se ve el proyecto, o cuando mostrar una imagen ayuda a que se decida a visitarlo.',
      parameters: {
        type: 'object',
        properties: {
          nombre_proyecto: { type: 'string', description: 'Nombre exacto del proyecto cuyas imágenes enviar.' },
          maximo: { type: 'integer', description: 'Cuántas imágenes enviar como máximo. Por defecto 3. Nunca más de 5 para no saturar el chat.' },
        },
        required: ['nombre_proyecto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_disponibilidad',
      description: 'Consulta los horarios disponibles para agendar una visita en una fecha específica.',
      parameters: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD. Ej: "2026-08-14"' },
        },
        required: ['fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ver_visitas_cliente',
      description: 'Muestra las visitas activas de un cliente dado su número de teléfono.',
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
      name: 'agendar_visita',
      description: 'Agenda una visita guiada a uno de los proyectos de Ceinys.',
      parameters: {
        type: 'object',
        properties: {
          numero_telefono: { type: 'string' },
          nombre_cliente: { type: 'string', description: 'Nombre completo real del cliente.' },
          fecha_visita: { type: 'string', description: 'Formato ISO: "2026-08-14T10:30:00"' },
          proyecto_interes: { type: 'string', description: 'Nombre exacto del proyecto que va a visitar. Debe ser uno de los proyectos reales de Ceinys.' },
          notas: { type: 'string', description: 'Información adicional: cuántas personas van, si necesita movilidad, presupuesto aproximado, uso (vivienda o inversión). Opcional.' },
        },
        required: ['numero_telefono', 'nombre_cliente', 'fecha_visita', 'proyecto_interes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_visita',
      description: 'Cancela una visita existente dado su ID.',
      parameters: {
        type: 'object',
        properties: {
          id_visita: { type: 'integer' },
        },
        required: ['id_visita'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reprogramar_visita',
      description: 'Reprograma una visita a una nueva fecha y hora.',
      parameters: {
        type: 'object',
        properties: {
          id_visita: { type: 'integer' },
          nueva_fecha: { type: 'string', description: 'Formato ISO: "2026-08-16T15:00:00"' },
        },
        required: ['id_visita', 'nueva_fecha'],
      },
    },
  },
];

// ── Ejecución de herramientas contra Supabase ─────────────────────────────────

/**
 * Parsea el campo `imagenes`: una URL por línea, con descripción opcional
 * tras " | ". Descarta lo que no sea una URL http(s) — Twilio solo acepta
 * URLs públicas, y una entrada mal escrita haría fallar el envío entero.
 */
function parsearImagenes(texto) {
  if (!texto) return [];
  return texto
    .split('\n')
    .map(linea => {
      const [url, descripcion] = linea.split('|').map(p => (p || '').trim());
      return { url, descripcion: descripcion || null };
    })
    .filter(img => /^https?:\/\/\S+$/i.test(img.url));
}

/**
 * @param contexto  Acumula efectos que no viajan en el texto de la respuesta,
 *                  como las imágenes que el webhook tiene que adjuntar.
 */
async function ejecutarHerramienta(nombre, argumentos, contexto = {}) {
  const supabase = obtenerSupabase();

  switch (nombre) {
    case 'enviar_link_agenda': {
      const { proyecto } = argumentos;
      const telefono = contexto.numeroTelefono;

      if (!telefono) {
        return { exito: false, mensaje: 'No pude generar el enlace. Pedile los datos por chat y usá agendar_visita.' };
      }

      const base = (process.env.APP_URL || 'https://wspai.vercel.app').replace(/\/+$/, '');

      let codigo;
      try {
        codigo = await crearEnlaceAgenda(telefono, proyecto);
      } catch (err) {
        console.error('[Agenda] No se pudo crear el enlace:', err.message);
        return { exito: false, mensaje: 'No pude generar el enlace. Pedile los datos por chat y usá agendar_visita.' };
      }

      return {
        exito: true,
        enlace: `${base}/visita/${codigo}`,
        mensaje: 'Pasale el enlace tal cual, en una línea aparte para que WhatsApp lo haga clickeable. '
               + 'Decile en una frase corta que ahí elige el día y la hora que le queden cómodos. '
               + 'No le pidas la fecha por chat: el calendario ya se la muestra. El enlace es personal y dura 7 días.',
      };
    }

    case 'enviar_fotos_proyecto': {
      const { nombre_proyecto, maximo } = argumentos;
      const tope = Math.min(Math.max(Number(maximo) || 3, 1), 5);

      const { data: encontrados } = await supabase
        .from('proyectos')
        .select('nombre, imagenes')
        .ilike('nombre', `%${nombre_proyecto}%`)
        .eq('activo', true)
        .limit(1);

      if (!encontrados || encontrados.length === 0) {
        return { exito: false, mensaje: `No encontré un proyecto llamado "${nombre_proyecto}".` };
      }

      const proyecto = encontrados[0];
      const imagenes = parsearImagenes(proyecto.imagenes).slice(0, tope);

      if (imagenes.length === 0) {
        return {
          exito: false,
          mensaje: `Todavía no hay imágenes cargadas de ${proyecto.nombre}. NO inventes ni describas fotos que no viste: ofrecé agendar una visita para que lo vea en persona, o que un asesor se las envíe.`,
        };
      }

      contexto.imagenes = (contexto.imagenes || []).concat(imagenes.map(i => i.url));

      return {
        exito: true,
        proyecto: proyecto.nombre,
        enviadas: imagenes.length,
        detalle: imagenes.map(i => i.descripcion).filter(Boolean),
        mensaje: `Se están enviando ${imagenes.length} imagen(es) de ${proyecto.nombre} por WhatsApp. Acompañalas con un mensaje corto que las presente; no las describas en detalle porque el cliente las va a ver.`,
      };
    }

    case 'consultar_proyectos': {
      const { nombre: nombreProyecto } = argumentos;

      let consulta = supabase
        .from('proyectos')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (nombreProyecto) consulta = consulta.ilike('nombre', `%${nombreProyecto}%`);

      const { data: proyectos, error } = await consulta;

      if (error) return { error: `No pude consultar los proyectos: ${error.message}` };

      if (!proyectos || proyectos.length === 0) {
        return {
          proyectos: [],
          mensaje: nombreProyecto
            ? `No encontré un proyecto llamado "${nombreProyecto}".`
            : 'No hay proyectos cargados.',
        };
      }

      // Solo devolvemos los campos con dato real. Los vacíos se omiten para que
      // el modelo no tenga nada que "completar" por su cuenta.
      const limpios = proyectos.map(p => {
        const salida = { nombre: p.nombre };
        if (p.ubicacion) salida.ubicacion = p.ubicacion;
        if (p.tipo) salida.tipo = p.tipo;
        if (p.descripcion) salida.descripcion = p.descripcion;
        if (p.precio_desde) salida.precio_desde = p.precio_desde;
        if (p.area_desde) salida.area_desde = p.area_desde;
        if (p.caracteristicas) salida.caracteristicas = p.caracteristicas;
        if (p.financiamiento) salida.financiamiento = p.financiamiento;
        if (p.estado_comercial) salida.estado_comercial = p.estado_comercial;
        if (p.entrega_titulo) salida.entrega_titulo = p.entrega_titulo;

        const fotos = parsearImagenes(p.imagenes);
        if (fotos.length > 0) {
          salida.fotos_disponibles = fotos.length;
          salida.fotos_de = fotos.map(f => f.descripcion).filter(Boolean);
        }
        if (!p.entrega_titulo) {
          salida.nota_titulo = 'No hay dato cargado sobre la entrega del título de este proyecto. NO afirmes que ya tiene título: decí que un asesor te confirma la fecha exacta.';
        }

        const camposCargados = Object.keys(salida).length - 1;
        if (camposCargados === 0) {
          salida.sin_detalle_cargado = true;
          salida.nota = 'Este proyecto todavía no tiene datos cargados. NO inventes ubicación, precio ni área: ofrecé que un asesor le pase el detalle en la visita o por teléfono.';
        }
        return salida;
      });

      return { proyectos: limpios, total: limpios.length };
    }

    case 'consultar_disponibilidad': {
      const { fecha } = argumentos;
      const { data: visitas } = await supabase
        .from('visitas')
        .select('*')
        .gte('fecha_visita', `${fecha}T00:00:00`)
        .lte('fecha_visita', `${fecha}T23:59:59`)
        .neq('estado', 'cancelada')
        .order('fecha_visita', { ascending: true });

      const libres = calcularHorariosLibres(visitas || []);
      const ocupados = (visitas || []).map(v => ({
        hora: v.fecha_visita.substring(11, 16),
        proyecto: v.proyecto_interes,
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

    case 'ver_visitas_cliente': {
      const { numero_telefono } = argumentos;
      const { data: visitas } = await supabase
        .from('visitas')
        .select('*')
        .eq('numero_telefono', numero_telefono)
        .neq('estado', 'cancelada')
        .order('fecha_visita', { ascending: false })
        .limit(10);

      if (!visitas || visitas.length === 0) {
        return { visitas: [], mensaje: 'No tenés visitas agendadas.' };
      }

      return {
        visitas: visitas.map(v => ({
          id: v.id,
          fecha: formatearFechaCompleta(v.fecha_visita),
          proyecto_interes: v.proyecto_interes,
          estado: v.estado,
          notas: v.notas,
        })),
        total: visitas.length,
      };
    }

    case 'agendar_visita': {
      const { numero_telefono, nombre_cliente, fecha_visita, proyecto_interes, notas } = argumentos;

      // El proyecto tiene que existir de verdad
      const { data: proyectoValido } = await supabase
        .from('proyectos')
        .select('nombre')
        .ilike('nombre', proyecto_interes)
        .eq('activo', true)
        .limit(1);

      if (!proyectoValido || proyectoValido.length === 0) {
        const { data: disponibles } = await supabase
          .from('proyectos')
          .select('nombre')
          .eq('activo', true)
          .order('orden', { ascending: true });

        return {
          exito: false,
          mensaje: `"${proyecto_interes}" no es un proyecto de Ceinys. Preguntale al cliente cuál de estos quiere visitar: ${(disponibles || []).map(p => p.nombre).join(', ')}.`,
        };
      }

      const { data: existente } = await supabase
        .from('visitas')
        .select('id')
        .eq('fecha_visita', fecha_visita)
        .neq('estado', 'cancelada')
        .limit(1);

      if (existente && existente.length > 0) {
        return {
          exito: false,
          mensaje: `El horario ${formatearFechaCompleta(fecha_visita)} ya está ocupado. ¿Te viene bien otro horario?`,
        };
      }

      const { data: nuevaVisita, error } = await supabase
        .from('visitas')
        .insert({
          numero_telefono,
          nombre_cliente,
          fecha_visita,
          proyecto_interes: proyectoValido[0].nombre,
          estado: 'confirmada',
          notas: notas || null,
        })
        .select()
        .single();

      if (error) return { exito: false, mensaje: `Error al agendar: ${error.message}` };

      // Aviso al equipo. Sin await: el flujo del cliente no espera por un
      // correo interno, y despues de esto viene otra llamada a OpenAI que
      // mantiene viva la función el tiempo suficiente.
      enviarAlertaVisita({ ...nuevaVisita, origen: 'whatsapp' }, contexto.config)
        .catch(err => console.error('[Email] Falló la alerta:', err.message));

      return {
        exito: true,
        id_visita: nuevaVisita.id,
        mensaje: `✅ Visita confirmada para ${nombre_cliente} el ${formatearFechaCompleta(fecha_visita)} — ${proyectoValido[0].nombre}.`,
      };
    }

    case 'cancelar_visita': {
      const { id_visita } = argumentos;

      const { data: visita } = await supabase
        .from('visitas')
        .select('*')
        .eq('id', id_visita)
        .single();

      if (!visita) {
        return { exito: false, mensaje: `No encontré ninguna visita con el ID ${id_visita}.` };
      }

      await supabase.from('visitas').update({ estado: 'cancelada' }).eq('id', id_visita);

      return {
        exito: true,
        mensaje: `✅ Visita del ${formatearFechaCompleta(visita.fecha_visita)} cancelada correctamente.`,
      };
    }

    case 'reprogramar_visita': {
      const { id_visita, nueva_fecha } = argumentos;

      const { data: visita } = await supabase
        .from('visitas')
        .select('*')
        .eq('id', id_visita)
        .single();

      if (!visita) {
        return { exito: false, mensaje: `No encontré ninguna visita con el ID ${id_visita}.` };
      }

      const { data: conflicto } = await supabase
        .from('visitas')
        .select('id')
        .eq('fecha_visita', nueva_fecha)
        .neq('estado', 'cancelada')
        .neq('id', id_visita)
        .limit(1);

      if (conflicto && conflicto.length > 0) {
        return {
          exito: false,
          mensaje: `El horario ${formatearFechaCompleta(nueva_fecha)} ya está ocupado. ¿Querés otro?`,
        };
      }

      await supabase.from('visitas').update({ fecha_visita: nueva_fecha }).eq('id', id_visita);

      return {
        exito: true,
        mensaje: `✅ Visita reprogramada para el ${formatearFechaCompleta(nueva_fecha)}.`,
      };
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ── Construcción del system prompt ────────────────────────────────────────────

/**
 * Devuelve los nombres de los proyectos activos. Se inyectan en el prompt para
 * que Valeria nunca invente un proyecto que Ceinys no tiene.
 */
async function obtenerNombresProyectos() {
  try {
    const supabase = obtenerSupabase();
    const { data } = await supabase
      .from('proyectos')
      .select('nombre')
      .eq('activo', true)
      .order('orden', { ascending: true });
    return (data || []).map(p => p.nombre);
  } catch (err) {
    console.error('[OpenAI] No pude cargar los proyectos:', err.message);
    return [];
  }
}

/**
 * Agrega una línea al prompt solo si el dato existe. Evita que el agente
 * reciba "undefined" o un valor de relleno que podría terminar en WhatsApp.
 */
function lineaSiExiste(etiqueta, valor) {
  return valor && String(valor).trim() ? `\n- ${etiqueta}: ${String(valor).trim()}` : '';
}

function construirSystemPrompt(numeroTelefono, config, nombresProyectos) {
  const nombreEmpresa = config.nombre_agencia || 'Ceinys';

  let serviciosTexto = config.servicios || '[]';
  try { serviciosTexto = JSON.parse(serviciosTexto).join(', '); } catch { /* usa como string */ }

  const ahora = new Date().toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const listaProyectos = nombresProyectos.length
    ? nombresProyectos.map(n => `  • ${n}`).join('\n')
    : '  (no hay proyectos cargados — derivá al asesor)';

  const casosTexto = config.casos_exito ? `\n\nCasos y resultados que podés mencionar:\n${config.casos_exito}` : '';
  const faqTexto = config.preguntas_frecuentes ? `\n\nPreguntas frecuentes y cómo responderlas:\n${config.preguntas_frecuentes}` : '';
  const reglasTexto = config.reglas_agente ? `\n\n⚠️ REGLAS FUNDAMENTALES (prioridad máxima — siempre se aplican):\n${config.reglas_agente}` : '';

  // Contacto para derivar. Si no hay ningún dato cargado, se lo decimos
  // explícitamente al modelo para que no improvise un teléfono o email.
  const contacto = [
    lineaSiExiste('Dirección', config.direccion),
    lineaSiExiste('Teléfono / WhatsApp', config.telefono),
    lineaSiExiste('Email', config.email),
    lineaSiExiste('Horarios de atención', config.horarios),
    lineaSiExiste('Redes sociales', config.redes_sociales),
  ].join('');

  const notaSinContacto = contacto
    ? ''
    : '\n\n⚠️ IMPORTANTE: no hay datos de contacto cargados (teléfono, email, dirección, horarios). '
      + 'NO inventes ninguno. Si el cliente pide un teléfono, dirección u horario, decile que un asesor '
      + 'lo va a contactar por este mismo WhatsApp para coordinar.';

  return `Sos Valeria, la asesora virtual de ${nombreEmpresa}, constructora e inmobiliaria peruana. Sos cercana, clara y orientada a que el cliente conozca el proyecto en persona.${reglasTexto}

FECHA Y HORA ACTUAL (Perú, Lima): ${ahora}
Usá esta fecha como referencia para toda consulta de disponibilidad y agendamiento. Nunca agendes en el pasado.

Tu rol es:
- Responder consultas sobre los proyectos inmobiliarios de ${nombreEmpresa}
- Agendar, consultar, cancelar o reprogramar VISITAS a los proyectos
- Entender qué busca el cliente (vivienda o inversión, presupuesto, zona preferida, forma de pago)
- Generar confianza y llevar la conversación hacia una visita agendada

PROYECTOS DE ${nombreEmpresa.toUpperCase()} (los únicos que existen — nunca menciones ni inventes otro):
${listaProyectos}

Información de ${nombreEmpresa}:
- Empresa: ${nombreEmpresa}${config.slogan ? ` — ${config.slogan}` : ''}${contacto}
- Qué ofrecemos: ${serviciosTexto}${config.sobre_agencia ? `\n- Sobre nosotros: ${config.sobre_agencia}` : ''}${casosTexto}${faqTexto}${notaSinContacto}

El número de WhatsApp del cliente es: ${numeroTelefono}

Reglas importantes:
- MENSAJES CORTOS: máximo 120 palabras. WhatsApp no es email — sé directa y conversacional. Si te piden todos los proyectos, mencioná los 3-4 más relevantes según lo que busca y ofrecé ampliar.
- DATOS DE PROYECTOS: antes de dar ubicación, precio, área o financiamiento de un proyecto, SIEMPRE llamá a consultar_proyectos. Si el proyecto viene con "sin_detalle_cargado", NO inventes nada: ofrecé que un asesor le dé el detalle exacto y proponé agendar la visita.
- NUNCA inventes precios, metrajes, cuotas, plazos ni disponibilidad de lotes. Es información sensible de una compra grande; un dato inventado puede costarle dinero al cliente y a la empresa.
- TÍTULO DE PROPIEDAD: no todos los proyectos tienen el título entregado hoy. La mayoría está en PRE-VENTA y el título llega más adelante. Nunca digas que un proyecto "ya tiene título" salvo que su campo entrega_titulo lo diga explícitamente. Si no hay dato, decí que un asesor confirma la fecha exacta.
- LA PRE-VENTA ES UNA VENTAJA, presentala así con naturalidad: es la etapa de precio más bajo de todo el proyecto, con el mayor potencial de revalorización, y permite elegir entre los mejores lotes antes de que se vendan. Además el respaldo está desde el día uno: partida registral, empresa inscrita y contrato firmado. Nunca la presentes como una limitación ni pidas disculpas por ella, pero tampoco la disfraces: si preguntan cuándo llega el título, dalo con claridad.
- FOTOS: si el cliente pide ver el proyecto, fotos, el plano o cómo se ve, usá enviar_fotos_proyecto. También ofrecelas por tu cuenta cuando ayuden a que se entusiasme y agende la visita. Mandá 2 o 3, no más. Nunca describas una foto que no enviaste ni afirmes que mandaste algo si la herramienta te dijo que no hay imágenes cargadas.
- CONSULTAR VISITAS: si el cliente menciona que ya tiene una visita agendada, que quiere cambiarla o cancelarla, SIEMPRE llamá primero a ver_visitas_cliente antes de responder. Nunca asumas.
- AGENDAR: la forma preferida es enviar_link_agenda. Apenas el cliente muestre intención de visitar, mandale el enlace: ahí ve un calendario con los días y horarios libres y reserva solo, sin tener que escribir fechas por chat. Es mucho más cómodo para él y evita malentendidos.
- Usá agendar_visita solo si el cliente no quiere o no puede abrir el enlace, o si ya te dio fecha y hora concretas por chat. En ese caso necesitás confirmados: nombre completo real, fecha y hora, y proyecto. Si falta alguno, preguntá primero. NUNCA uses placeholders como "[Tu Nombre]".
- Si el cliente solo dice una hora sin dar su nombre, pedile el nombre ANTES de confirmar.
- Las visitas son de lunes a domingo, de 09:00 a 17:00, cada 30 minutos.
- No prometas separaciones, descuentos, reservas de lote ni condiciones especiales: eso lo confirma un asesor.
- Usá español latinoamericano neutro, profesional pero cercano.
- Si no podés resolver algo, decile que un asesor de ${nombreEmpresa} lo va a contactar${config.email ? ` o que escriba a ${config.email}` : ''}.`;
}

// ── Función principal ─────────────────────────────────────────────────────────

async function procesarMensajeConIA(numeroTelefono, mensajeUsuario, configEmpresa, historial) {
  const openai = obtenerClienteOpenAI();
  const config = configEmpresa || {};

  const nombresProyectos = await obtenerNombresProyectos();
  const systemPrompt = construirSystemPrompt(numeroTelefono, config, nombresProyectos);

  // Efectos que no viajan en el texto: las herramientas lo van llenando y el
  // webhook lo usa para adjuntar media al mensaje de WhatsApp.
  const contexto = { imagenes: [], numeroTelefono, config };

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
      const resultado = await ejecutarHerramienta(toolCall.function.name, args, contexto);
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

  const nombreEmpresa = config.nombre_agencia || 'Ceinys';
  const texto = mensaje.content || `¡Hola! Soy Valeria de ${nombreEmpresa}. ¿Buscás un lote o una casa? Contame qué tenés en mente.`;

  // Sin duplicados: si el modelo pide las fotos del mismo proyecto dos veces
  // en el mismo turno, el cliente recibiría la imagen repetida.
  return { texto, imagenes: [...new Set(contexto.imagenes)] };
}

module.exports = { procesarMensajeConIA };
