const OpenAI = require('openai');
const { obtenerSupabase } = require('../db');
const {
  calcularHorariosLibres,
  formatearFechaCompleta,
  resolverHorario,
  esDiaDeAtencion,
  describirHorario,
  generarHorariosDelDia,
} = require('../utils/fechas');
const { buscarPorNombre, normalizar } = require('../utils/proyectos');
const { limpiarWhatsApp } = require('../utils/formatoWhatsApp');
const { obtenerCorreccionesParaPrompt, obtenerMemoriaComprador } = require('./aprendizaje');
const { instruccionSegunHistorial } = require('../utils/conversacion');
const { crearEnlaceAgenda } = require('../routes/agenda');
const { enviarAlertaVisita } = require('./email');

// El modelo se elige por variable de entorno para poder comparar candidatos
// en produccion sin desplegar codigo. Vino clavado en 'gpt-4o' desde el
// principio, y toda la arquitectura de este agente —el estado calculado en
// codigo, las instrucciones pegadas al payload de cada herramienta— depende de
// que el modelo respete esa pila. Uno mas debil la obedece peor.
const MODELO = (process.env.MODELO_OPENAI || 'gpt-4o').trim();

// El ciclo de herramientas no tenia tope. Si el modelo pide una herramienta
// inexistente, el `default` devuelve un error que no corta nada y puede
// volver a pedirla: cada ronda es una llamada mas a la API y mas segundos
// contra el limite de 9 que da Twilio.
const MAX_RONDAS_HERRAMIENTAS = 5;

const TOPE_DE_RESPUESTA = 500;
const TEMPERATURA = 0.7;

/**
 * Los parametros de muestreo que acepta cada modelo.
 *
 * No son iguales entre familias, y probado contra la API con la clave de
 * Pamela: gpt-4o quiere `max_tokens`; gpt-5.4 y gpt-5.4-mini quieren
 * `max_completion_tokens` y aceptan temperatura; gpt-5.5 y la familia gpt-5.6
 * quieren `max_completion_tokens` y rechazan cualquier temperatura que no sea
 * la de fabrica ("Unsupported value: 'temperature' does not support 0.7").
 *
 * Mandar el parametro equivocado no degrada la respuesta: devuelve 400 y el
 * comprador no recibe nada. Por eso esto vive en codigo y no en la confianza
 * de que quien cambie MODELO_OPENAI se acuerde.
 */
function parametrosDelModelo(modelo) {
  const nuevo = /^(gpt-5|o[0-9])/.test(modelo);
  const sinTemperatura = /^(gpt-5\.[5-9]|gpt-5\.1[0-9]|gpt-6|o[0-9])/.test(modelo);

  return {
    ...(nuevo ? { max_completion_tokens: TOPE_DE_RESPUESTA } : { max_tokens: TOPE_DE_RESPUESTA }),
    ...(sinTemperatura ? {} : { temperature: TEMPERATURA }),
  };
}

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
      description: 'Devuelve el detalle de los proyectos inmobiliarios de la empresa (ubicación, tipo, precios, áreas, financiamiento). Usar SIEMPRE antes de dar cualquier dato concreto sobre un proyecto. Si se pasa "nombre", devuelve solo ese proyecto.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre del proyecto a consultar. Omitir para traer todos.' },
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
      name: 'enviar_datos_pago',
      description: 'Envía por WhatsApp la gráfica oficial con las cuentas bancarias de la empresa dueña del proyecto. Es la ÚNICA forma permitida de dar datos de pago: nunca escribas números de cuenta en el chat. Usar cuando el cliente pregunta dónde pagar, cómo separar, a qué cuenta deposita o pide los datos bancarios.',
      parameters: {
        type: 'object',
        properties: {
          nombre_proyecto: { type: 'string', description: 'Proyecto que el cliente va a pagar. Obligatorio: cada proyecto puede pertenecer a una empresa distinta, con cuentas distintas.' },
        },
        required: ['nombre_proyecto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      // La unica herramienta de horarios que habia exigia una fecha, asi que
      // el modelo tenia que inventar primero el dia para recien enterarse de
      // las horas. Resultado medido en un mes: de 462 respuestas, ninguna
      // ofrecio un horario concreto. Esta no pide nada: devuelve los proximos
      // turnos libres de verdad, ya escritos.
      name: 'proponer_horarios',
      description: 'Devuelve los proximos horarios libres de verdad para una visita, ya escritos para leerselos al cliente. Usala SIEMPRE que corresponda proponer una visita o cuando el cliente ya dijo que si: ofrecerle dos horarios concretos convierte mucho mas que preguntarle si quiere agendar.',
      parameters: {
        type: 'object',
        properties: {
          cuantos: { type: 'integer', description: 'Cuantos horarios ofrecer. Por defecto 3, nunca mas de 4: dar muchas opciones paraliza.' },
        },
        required: [],
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
      description: 'Agenda una visita guiada a uno de los proyectos de la empresa.',
      parameters: {
        type: 'object',
        properties: {
          numero_telefono: { type: 'string' },
          nombre_cliente: { type: 'string', description: 'Nombre completo real del cliente.' },
          fecha_visita: { type: 'string', description: 'Formato ISO: "2026-08-14T10:30:00"' },
          proyecto_interes: { type: 'string', description: 'Nombre exacto del proyecto que va a visitar. Debe ser uno de los proyectos reales del catálogo.' },
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
/**
 * Solo http/https. Un "javascript:..." guardado por error terminaría en un
 * href de la página de confirmación, así que se filtra desde el origen.
 */
function esUrlSegura(url) {
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim());
}

/**
 * Que tiene de malo esta fecha de visita, o null si esta bien.
 *
 * Mismo contrato que exige la pagina publica (server/routes/agenda.js): si el
 * comprador que reserva solo tiene que cumplirlo, el agente tambien.
 */
function revisarFechaDeVisita(fechaVisita, horario) {
  const texto = String(fechaVisita == null ? '' : fechaVisita).trim();

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(texto)) {
    return { mensaje: `"${texto}" no es una fecha y hora valida. Pidele al cliente el dia y la hora, o llama a proponer_horarios.` };
  }

  const cuando = new Date(`${texto}-05:00`);   // Peru es UTC-5 todo el año
  if (Number.isNaN(cuando.getTime())) {
    return { mensaje: `"${texto}" no existe en el calendario. Pidele al cliente otra fecha.` };
  }

  const fecha = texto.substring(0, 10);
  const hora = texto.substring(11, 16);

  if (cuando.getTime() < Date.now()) {
    return { fecha, mensaje: `${texto} ya paso. Ofrecele una fecha de aqui en adelante: llama a proponer_horarios.` };
  }

  if (!esDiaDeAtencion(fecha, horario)) {
    return { fecha, mensaje: `El ${fecha} no es dia de atencion. El horario es: ${describirHorario(horario)}. Ofrecele otro dia.` };
  }

  if (!generarHorariosDelDia(horario).includes(hora)) {
    return { fecha, mensaje: `Las ${hora} no es un horario de atencion. El horario es: ${describirHorario(horario)}, y las visitas arrancan cada media hora.` };
  }

  return null;
}

/** Los horarios que quedan libres un dia, para ofrecerlos en vez de solo decir que no. */
async function horariosLibresDelDia(supabase, fecha, horario) {
  const { data: visitas } = await supabase
    .from('visitas')
    .select('*')
    .gte('fecha_visita', `${fecha}T00:00:00`)
    .lte('fecha_visita', `${fecha}T23:59:59`)
    .neq('estado', 'cancelada');

  return calcularHorariosLibres(visitas || [], horario);
}

/** La primera línea de un campo de varias, sin el resto. */
function primeraLinea(texto) {
  return String(texto == null ? '' : texto).split(/\r?\n/)[0].trim();
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * "hoy", "mañana martes", "el sábado 31" — como lo diría una persona en Ica.
 *
 * Un horario que el cliente tiene que traducir de "2026-10-28T10:30" no lo lee
 * nadie. Vive en este archivo y no en utils/fechas.js porque ese archivo se
 * está tocando en paralelo; cuando se asiente, se muda.
 */
function describirDiaRelativo(fecha, hoyLima) {
  const hoy = hoyLima.toISOString().substring(0, 10);
  const manana = new Date(hoyLima.getTime() + 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const dia = new Date(`${fecha}T12:00:00Z`);

  if (fecha === hoy) return 'hoy';
  if (fecha === manana) return `mañana ${DIAS_SEMANA[dia.getUTCDay()]}`;
  return `el ${DIAS_SEMANA[dia.getUTCDay()]} ${dia.getUTCDate()}`;
}

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
        return { exito: false, mensaje: 'No pude generar el enlace. Pide los datos por chat y usa agendar_visita.' };
      }

      // Sin APP_URL no hay forma de armar un enlace correcto, y adivinarlo es
      // peor que no mandarlo: el fallback anterior apuntaba a un dominio fijo,
      // así que cualquier despliegue nuevo le mandaba a sus clientes el enlace
      // de OTRA empresa — que encima no resuelve, porque el código del enlace
      // vive en otra base de datos. Mejor caer al flujo por chat.
      const base = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');

      if (!base) {
        console.error('[Agenda] Falta APP_URL: no se puede generar el enlace del calendario.');
        return {
          exito: false,
          mensaje: 'No pude generar el enlace. Pide los datos por chat y usa agendar_visita.',
        };
      }

      // El proyecto se guarda canónico, no como lo escribió el modelo.
      //
      // Ese valor sale después como `proyecto_sugerido` y la página lo
      // preselecciona comparando cadenas exactas, así que un "los alamos" no
      // preseleccionaba nada aunque el catálogo tuviera "Los Álamos": el
      // cliente tenía que volver a elegir el proyecto que ya había dicho.
      // Si el nombre es ambiguo se manda null y que elija en el calendario.
      let proyectoSugerido = null;
      if (proyecto) {
        const { data: activos } = await supabase
          .from('proyectos').select('nombre').eq('activo', true).order('orden', { ascending: true });
        const hallado = buscarPorNombre(activos, proyecto);
        if (hallado.coincidencias.length === 1) proyectoSugerido = hallado.coincidencias[0].nombre;
      }

      let codigo;
      try {
        codigo = await crearEnlaceAgenda(telefono, proyectoSugerido);
      } catch (err) {
        console.error('[Agenda] No se pudo crear el enlace:', err.message);
        return { exito: false, mensaje: 'No pude generar el enlace. Pide los datos por chat y usa agendar_visita.' };
      }

      return {
        exito: true,
        enlace: `${base}/visita/${codigo}`,
        mensaje: 'Pásale el enlace tal cual, en una línea aparte para que WhatsApp lo haga clickeable. '
               + 'Dile en una frase corta que ahí elige el día y la hora que le queden cómodos. '
               + 'No le pidas la fecha por chat: el calendario ya se la muestra. El enlace es personal y dura 7 días.',
      };
    }

    case 'enviar_fotos_proyecto': {
      const { nombre_proyecto, maximo } = argumentos;
      const tope = Math.min(Math.max(Number(maximo) || 3, 1), 5);

      const { data: activos, error: errorCatalogo } = await supabase
        .from('proyectos')
        .select('nombre, imagenes')
        .eq('activo', true)
        .order('orden', { ascending: true });

      // Sin esto, una consulta fallida deja `activos` en null y el agente le
      // dice al cliente que el proyecto no existe, en vez de que hubo un error.
      if (errorCatalogo) {
        console.error('[Fotos] No se pudo leer el catalogo:', errorCatalogo.message);
        return { exito: false, mensaje: 'No pude consultar el catalogo ahora. Ofrece agendar una visita o derivar a un asesor.' };
      }

      const { coincidencias, ambiguo } = buscarPorNombre(activos, nombre_proyecto);

      if (coincidencias.length === 0) {
        return { exito: false, mensaje: `No encontré un proyecto llamado "${nombre_proyecto}".` };
      }

      // Nunca mandar fotos "a ver si pega". Con `.limit(1)` sobre un ILIKE,
      // "Sauces" matcheaba "Los Sauces" y "Casa Sauces" y se quedaba con uno
      // en silencio: el cliente terminaba viendo los renders de otro proyecto.
      if (ambiguo) {
        return {
          exito: false,
          mensaje: `"${nombre_proyecto}" coincide con varios proyectos: ${coincidencias.map(p => p.nombre).join(', ')}. Pregúntale al cliente cuál quiere ver antes de mandarle fotos.`,
        };
      }

      const proyecto = coincidencias[0];
      const todasLasFotos = parsearImagenes(proyecto.imagenes);

      if (todasLasFotos.length === 0) {
        return {
          exito: false,
          mensaje: `Todavía no hay imágenes cargadas de ${proyecto.nombre}. NO inventes ni describas fotos que no viste: ofrece agendar una visita para que lo vea en persona, o que un asesor se las envíe.`,
        };
      }

      // Cuantas ya se le mandaron antes en esta conversacion. El contador
      // vivia solo dentro del turno, asi que la herramienta siempre empezaba
      // de cero y mandaba las MISMAS primeras fotos: el contacto ...1746
      // recibio las mismas dos imagenes seis veces mientras escribia "no
      // envies esas fotos, quiero otras" y "solo llego 1 foto".
      const yaEnviadas = (contexto.historial || [])
        .filter(m => m.remitente === 'asistente')
        .reduce((suma, m) => {
          const marca = String(m.contenido_mensaje || '').match(/\[\+(\d+) imagen/);
          return suma + (marca ? Number(marca[1]) : 0);
        }, 0);

      const imagenes = todasLasFotos.slice(yaEnviadas, yaEnviadas + tope);

      if (imagenes.length === 0) {
        return {
          exito: false,
          ya_le_enviaste: todasLasFotos.map(i => i.descripcion).filter(Boolean),
          mensaje: `Ya le enviaste las ${todasLasFotos.length} imagen(es) que hay de ${proyecto.nombre} y no hay mas cargadas. `
                 + 'NO las reenvies: recibir la misma foto otra vez es lo que hace que un agente parezca roto. '
                 + 'Dile derecho que esas son las que tienes y ofrecele verlo en persona, que es donde se ve todo.',
        };
      }

      contexto.imagenes = (contexto.imagenes || []).concat(imagenes.map(i => i.url));

      return {
        exito: true,
        proyecto: proyecto.nombre,
        enviadas: imagenes.length,
        detalle: imagenes.map(i => i.descripcion).filter(Boolean),
        quedan_por_enviar: Math.max(todasLasFotos.length - yaEnviadas - imagenes.length, 0),
        mensaje: `Se están enviando ${imagenes.length} imagen(es) de ${proyecto.nombre} por WhatsApp. Acompáñalas con un mensaje corto que las presente; no las describas en detalle porque el cliente las va a ver.`,
      };
    }

    case 'consultar_proyectos': {
      const { nombre: nombreProyecto } = argumentos;

      const { data: todos, error } = await supabase
        .from('proyectos')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (error) return { error: `No pude consultar los proyectos: ${error.message}` };

      // El filtro por nombre se resuelve en Node, no con ILIKE: así los
      // comodines de LIKE que pueda escribir el modelo no alteran la búsqueda
      // y "Los Alamos" encuentra "Los Álamos".
      //
      // Ojo: acá se filtra por "contiene" en vez de usar la precedencia de
      // buscarPorNombre. Esto es un LISTADO, no una acción sobre un proyecto:
      // preguntar por "Los Álamos" tiene que devolver también "Los Álamos II",
      // que la precedencia escondería al encontrar el match exacto.
      const objetivo = normalizar(nombreProyecto);
      const proyectos = nombreProyecto
        ? (todos || []).filter(p => normalizar(p.nombre).includes(objetivo))
        : (todos || []);

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
      //
      // Ojo con lo que sigue al final de este case: la herramienta devuelve
      // un objeto con once campos, y el reflejo del modelo es relatarlos
      // todos. Una regla del prompt no le gana a un JSON lleno de datos que
      // llega justo antes de escribir, asi que la instruccion viaja pegada a
      // los datos.
      const limpios = proyectos.map(p => {
        const salida = { nombre: p.nombre };
        if (p.ubicacion) salida.ubicacion = p.ubicacion;
        if (p.tipo) salida.tipo = p.tipo;
        if (p.descripcion) salida.descripcion = p.descripcion;
        if (p.precio_desde) salida.precio_desde = p.precio_desde;
        if (p.area_desde) salida.area_desde = p.area_desde;
        if (p.caracteristicas) salida.caracteristicas = p.caracteristicas;
        if (p.financiamiento) salida.financiamiento = p.financiamiento;
        if (p.desarrolladora) salida.desarrolladora = p.desarrolladora;
        if (p.estado_comercial) salida.estado_comercial = p.estado_comercial;
        if (p.entrega_titulo) salida.entrega_titulo = p.entrega_titulo;
        if (p.lotes_disponibles) salida.lotes_disponibles = p.lotes_disponibles;
        if (p.reserva) salida.reserva = p.reserva;
        if (p.bonos) salida.bonos = p.bonos;
        if (p.promocion) salida.promocion = p.promocion;
        if (p.punto_encuentro) salida.punto_encuentro = p.punto_encuentro;
        if (esUrlSegura(p.mapa_url)) salida.mapa_url = p.mapa_url.trim();

        const fotos = parsearImagenes(p.imagenes);
        if (fotos.length > 0) {
          salida.fotos_disponibles = fotos.length;
          salida.fotos_de = fotos.map(f => f.descripcion).filter(Boolean);
        }
        // Decir lo que NO hay, como dato y no como instruccion. Preguntado
        // por la etapa, el modelo contestaba "la etapa de entrega inmediata"
        // usando estado_comercial: para el, un campo parecido respondia la
        // pregunta. Las instrucciones de no hacerlo no alcanzaron; un campo
        // que dice explicitamente que ese dato no existe, si.
        const hablaDeEtapa = /\betapas?\b|\bfases?\b/i.test(
          [p.estado_comercial, p.descripcion, p.caracteristicas].filter(Boolean).join(' '),
        );

        salida.datos_que_no_tengo = [
          ...(hablaDeEtapa ? [] : ['etapa o fase de la urbanizacion']),
          'numero, manzana o ubicacion exacta del lote dentro del proyecto',
          'orientacion del lote',
          'cualquier cosa que no este en los campos de arriba',
        ];

        if (!p.entrega_titulo) {
          salida.nota_titulo = 'No hay dato cargado sobre la entrega del título de este proyecto. NO afirmes que ya tiene título: dile que un asesor le confirma la fecha exacta.';
        }

        const camposCargados = Object.keys(salida).length - 1;
        if (camposCargados === 0) {
          salida.sin_detalle_cargado = true;
          salida.nota = 'Este proyecto todavía no tiene datos cargados. NO inventes ubicación, precio ni área: ofrece que un asesor le pase el detalle en la visita o por teléfono.';
        }
        return salida;
      });

      // Un lote se vende mirandolo. La instruccion de mandar fotos estaba en
      // el prompt desde el principio y el modelo no la ejecutaba nunca; va acá,
      // con el numero de fotos que realmente hay, que es lo que sí lee.
      // Lo que si hay, armado con lo que está cargado de verdad. Nada de esto se
      // inventa: si el campo está vacío, la línea no aparece.
      const ofrecibles = [];
      for (const x of limpios) {
        if (x.bonos) ofrecibles.push(`${x.nombre}: ${x.bonos}`);
        if (x.promocion) ofrecibles.push(`${x.nombre}: ${x.promocion}`);
        if (x.financiamiento) ofrecibles.push(`${x.nombre}: ${primeraLinea(x.financiamiento)}`);
      }

      const sinEtapa = limpios.some(x => (x.datos_que_no_tengo || []).includes('etapa o fase de la urbanizacion'));
      const avisoEtapa = sinEtapa
        ? 'En particular: "etapa" o "fase" de la urbanizacion NO es lo mismo que "estado comercial". '
          + 'Si preguntan en que etapa o fase esta un lote, eso no lo tienes: dilo claro y ofrece que un '
          + 'asesor lo confirme. Responder "la etapa de entrega inmediata" es inventar. '
        : '';

      const conFotos = limpios.filter(x => x.fotos_disponibles > 0);
      const avisoFotos = conFotos.length === 1
        ? ' Hay ' + conFotos[0].fotos_disponibles + ' foto(s) cargadas de ' + conFotos[0].nombre
          + '. Si todavia no le mandaste ninguna, mandalas ahora con enviar_fotos_proyecto: '
          + 'ver el terreno mueve mucho mas que leer la ficha. Nunca describas una foto sin enviarla.'
        : '';

      return {
        proyectos: limpios,
        total: limpios.length,
        ...(ofrecibles.length > 0 ? {
          lo_que_si_puedo_ofrecer: ofrecibles,
          si_tienes_que_decir_que_no: 'Cuando algo que pide no existe (Techo Propio, un proyecto que no es nuestro, '
            + 'una condicion que no manejamos), di que no en una linea y ofrecele de inmediato lo mas parecido de '
            + '`lo_que_si_puedo_ofrecer`, con el numero concreto. Decir que no y despedirse es regalar el cliente. '
            + 'Si de verdad no hay nada que le sirva, preguntale que presupuesto maneja antes de dejarlo ir.',
        } : {}),
        // Esto es lo último que el modelo lee antes de escribir, y por eso
        // pesa mucho más que la misma regla puesta en el prompt: ahí queda
        // miles de tokens atrás, compitiendo contra un JSON recién servido.
        instruccion: limpios.length === 1
          ? 'Estos son TODOS los datos que hay de este proyecto, no un guión para leer. '
            + 'Lo que no esté en estos campos, NO lo tienes: si te preguntan el número de lote, '
            + 'las amenidades o cualquier cosa que no aparezca acá, dilo derecho y ofrece que un asesor lo confirme. '
            + 'No uses un campo parecido como si respondiera la pregunta. '
            + avisoEtapa
            + 'Elige DOS O TRES según lo que la persona te dijo y explica por qué le convienen. '
            + 'El resto guárdalo para cuando pregunte. Cierra con una pregunta que te sirva para '
            + 'asesorarla mejor, no con la invitación de siempre.' + avisoFotos
          : 'Son ' + limpios.length + ' proyectos. NO los describas todos: menciona los que encajen '
            + 'con lo que la persona busca, con una línea cada uno, y pregúntale cuál le llama la '
            + 'atención. Si todavía no sabes qué busca, pregúntaselo antes de listar nada.',
      };
    }

    case 'enviar_datos_pago': {
      const { nombre_proyecto } = argumentos;

      const { data: activos, error: errorCatalogo } = await supabase
        .from('proyectos')
        .select('nombre, desarrolladora')
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (errorCatalogo) {
        console.error('[Pago] No se pudo leer el catalogo:', errorCatalogo.message);
        return { exito: false, mensaje: 'No pude consultar los datos de pago ahora. Dile que un asesor se los envía enseguida.' };
      }

      const { coincidencias, ambiguo } = buscarPorNombre(activos, nombre_proyecto);

      // Acá la ambigüedad no es un detalle de UX: cada proyecto puede ser de una
      // empresa distinta, y mandar las cuentas equivocadas manda la inicial del
      // cliente —decenas de miles de soles— a otra empresa. Ante la duda, no se
      // manda nada.
      if (ambiguo) {
        return {
          exito: false,
          mensaje: `"${nombre_proyecto}" coincide con varios proyectos: ${coincidencias.map(p => p.nombre).join(', ')}. Pregúntale al cliente exactamente cuál es ANTES de darle datos de pago. Cada proyecto puede tener cuentas distintas.`,
        };
      }

      if (coincidencias.length === 0) {
        return { exito: false, mensaje: `No encontré un proyecto llamado "${nombre_proyecto}". Confirma con el cliente cuál es antes de darle datos de pago.` };
      }

      const proyecto = coincidencias[0];

      if (!proyecto.desarrolladora) {
        console.error(`[Pago] El proyecto "${proyecto.nombre}" no tiene desarrolladora asignada.`);
        return { exito: false, mensaje: 'No tengo los datos de pago de ese proyecto cargados. Dile que un asesor se los envía enseguida y NO inventes ninguna cuenta.' };
      }

      const { data: empresas } = await supabase
        .from('desarrolladoras')
        .select('nombre, razon_social, pago_imagen_url');

      const empresa = (empresas || []).find(e => normalizar(e.nombre) === normalizar(proyecto.desarrolladora));

      if (!empresa || !esUrlSegura(empresa.pago_imagen_url)) {
        console.error(`[Pago] Sin gráfica de cuentas para "${proyecto.desarrolladora}".`);
        return { exito: false, mensaje: 'No tengo la gráfica de cuentas de esa empresa cargada. Dile que un asesor se la envía enseguida y NO dictes ningún número de cuenta.' };
      }

      contexto.imagenes = (contexto.imagenes || []).concat([empresa.pago_imagen_url.trim()]);

      // Una constructora con varios proyectos tiene UNA sola grafica, y suele
      // venir encabezada con el nombre de uno de ellos. El comprador de otro
      // condominio ve un nombre que no es el suyo justo antes de transferir, y
      // duda. Las cuentas son correctas —son de la empresa, no del proyecto—,
      // asi que conviene decirlo antes de que lo pregunte.
      const hermanos = (activos || []).filter(p => normalizar(p.desarrolladora || '') === normalizar(proyecto.desarrolladora));
      const avisoDeEncabezado = hermanos.length > 1
        ? `OJO: ${empresa.razon_social || empresa.nombre} tiene varios proyectos y la grafica es una sola, `
          + `asi que puede venir encabezada con el nombre de otro condominio. Aclarale que las cuentas son de la empresa `
          + `y valen igual para ${proyecto.nombre}, sin que el cliente tenga que preguntarlo. `
        : '';

      return {
        exito: true,
        proyecto: proyecto.nombre,
        empresa: empresa.razon_social || empresa.nombre,
        mensaje: `Se está enviando la gráfica oficial de cuentas de ${empresa.razon_social || empresa.nombre}, la empresa de ${proyecto.nombre}. `
               + 'Dile en una frase corta que ahí están las cuentas y que el titular es esa empresa, para que verifique el nombre antes de transferir. '
               + avisoDeEncabezado
               + 'NUNCA escribas números de cuenta en el chat, ni los repitas, ni los resumas: la imagen es el único medio.',
      };
    }

    case 'proponer_horarios': {
      const cuantos = Math.min(Math.max(Number(argumentos.cuantos) || 3, 1), 4);
      const horario = resolverHorario(contexto.config);

      // Se busca dia por dia hasta llenar el cupo. Dos semanas alcanzan de
      // sobra incluso si atiende dos dias por semana, y acota el bucle.
      const propuestas = [];
      const hoyLima = new Date(Date.now() - 5 * 60 * 60 * 1000);

      for (let d = 0; d < 14 && propuestas.length < cuantos; d++) {
        const dia = new Date(hoyLima.getTime() + d * 24 * 60 * 60 * 1000);
        const fecha = dia.toISOString().substring(0, 10);
        if (!esDiaDeAtencion(fecha, horario)) continue;

        const { data: visitas } = await supabase
          .from('visitas')
          .select('*')
          .gte('fecha_visita', `${fecha}T00:00:00`)
          .lte('fecha_visita', `${fecha}T23:59:59`)
          .neq('estado', 'cancelada');

        let libres = calcularHorariosLibres(visitas || [], horario);

        // Hoy no se ofrece lo que ya paso, y menos la hora en curso: que el
        // cliente lea "hoy 9:00" a las 14:00 lo manda a otra inmobiliaria.
        // Se deja un margen de dos horas para que alcance a llegar.
        if (d === 0) {
          const corte = new Date(hoyLima.getTime() + 2 * 60 * 60 * 1000)
            .toISOString().substring(11, 16);
          libres = libres.filter(h => h > corte);
        }

        for (const hora of libres) {
          if (propuestas.length >= cuantos) break;
          propuestas.push({
            fecha_hora: `${fecha}T${hora}`,
            como_decirlo: `${describirDiaRelativo(fecha, hoyLima)} a las ${hora}`,
          });
        }
      }

      if (propuestas.length === 0) {
        return {
          exito: false,
          mensaje: `No quedan horarios libres en los proximos dias. El horario de atencion es: ${describirHorario(horario)}. `
                 + 'Preguntale que dia le queda comodo y usa consultar_disponibilidad con esa fecha.',
        };
      }

      return {
        exito: true,
        horarios: propuestas,
        instruccion: 'Ofrecele DOS de estos horarios, con las palabras de `como_decirlo`, en una sola frase y sin lista. '
          + 'Ejemplo de la forma: "te puedo reservar <el primero> o <el segundo>, cual te queda mejor?". '
          + 'NO le preguntes si quiere agendar: eso ya se lo preguntaste y no funciono. Cuando elija uno, '
          + 'pidele su nombre completo y confirma con agendar_visita usando el `fecha_hora` exacto de este listado. '
          + 'Si te dice que ninguno le va, recien ahi pasale el enlace con enviar_link_agenda para que elija ella.',
      };
    }

    case 'consultar_disponibilidad': {
      const { fecha } = argumentos;

      // El horario sale de la configuracion de cada clienta, no del codigo.
      // `contexto.config` es la fila completa (el webhook hace select('*')).
      const horario = resolverHorario(contexto.config);

      if (!esDiaDeAtencion(fecha, horario)) {
        return {
          fecha,
          horarios_libres: [],
          total_disponibles: 0,
          mensaje: `El ${fecha} no es dia de atencion. El horario es: ${describirHorario(horario)}. Ofrecele otro dia.`,
        };
      }

      const { data: visitas } = await supabase
        .from('visitas')
        .select('*')
        .gte('fecha_visita', `${fecha}T00:00:00`)
        .lte('fecha_visita', `${fecha}T23:59:59`)
        .neq('estado', 'cancelada')
        .order('fecha_visita', { ascending: true });

      const libres = calcularHorariosLibres(visitas || [], horario);
      const ocupados = (visitas || []).map(v => ({
        hora: v.fecha_visita.substring(11, 16),
        proyecto: v.proyecto_interes,
      }));

      return {
        fecha,
        horarios_libres: libres.slice(0, 6),
        horarios_libres_nota: libres.length > 6 ? `Mostrando 6 de ${libres.length} horarios disponibles. Puedes pedir más opciones.` : undefined,
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
        return { visitas: [], mensaje: 'No tienes visitas agendadas.' };
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

      // La fecha se insertaba tal como la escribia el modelo. La columna es
      // texto, asi que la base acepta cualquier cadena, y formatearFechaCompleta
      // convierte una fecha invalida en algo que suena real: el cliente recibia
      // la confirmacion de una visita que no existe en ningun calendario. La
      // ruta publica si valida esto; el agente no.
      const horarioConfig = resolverHorario(contexto.config);
      const problema = revisarFechaDeVisita(fecha_visita, horarioConfig);

      if (problema) {
        const sugeridos = problema.fecha && esDiaDeAtencion(problema.fecha, horarioConfig)
          ? await horariosLibresDelDia(supabase, problema.fecha, horarioConfig)
          : [];

        return {
          exito: false,
          mensaje: problema.mensaje,
          ...(sugeridos.length > 0 ? { horarios_libres_ese_dia: sugeridos } : {}),
          instruccion: 'No confirmes nada todavia. Si hay horarios libres en el listado, ofrecele dos. '
            + 'Si no hay, llama a proponer_horarios y ofrecele los que te devuelva.',
        };
      }

      // El proyecto tiene que existir de verdad
      const { data: disponibles, error: errorCatalogo } = await supabase
        .from('proyectos')
        .select('nombre')
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (errorCatalogo) {
        console.error('[Agendar] No se pudo leer el catalogo:', errorCatalogo.message);
        return { exito: false, mensaje: 'No pude validar el proyecto ahora. Pidele disculpas al cliente y ofrece que un asesor lo contacte.' };
      }

      const hallazgo = buscarPorNombre(disponibles, proyecto_interes);
      const listaDisponibles = (disponibles || []).map(p => p.nombre).join(', ');

      if (hallazgo.coincidencias.length === 0) {
        return {
          exito: false,
          mensaje: `"${proyecto_interes}" no es uno de los proyectos disponibles. Pregúntale al cliente cuál de estos quiere visitar: ${listaDisponibles}.`,
        };
      }

      // Agendar sobre un nombre ambiguo dejaría la visita colgando del proyecto
      // equivocado, y eso recién se descubre cuando el cliente llega al lugar.
      if (hallazgo.ambiguo) {
        return {
          exito: false,
          mensaje: `"${proyecto_interes}" coincide con varios proyectos: ${hallazgo.coincidencias.map(p => p.nombre).join(', ')}. Pregúntale al cliente cuál es antes de agendar.`,
        };
      }

      // La visita se guarda con el nombre tal cual está en el catálogo, no con
      // lo que escribió el modelo: así el panel y los reportes no terminan con
      // "los sauces", "Los Sauces" y "LOS SAUCES" como si fueran tres proyectos.
      const proyectoCanonico = hallazgo.coincidencias[0].nombre;

      const { data: existente } = await supabase
        .from('visitas')
        .select('id')
        .eq('fecha_visita', fecha_visita)
        .neq('estado', 'cancelada')
        .limit(1);

      if (existente && existente.length > 0) {
        return {
          exito: false,
          mensaje: `El horario ${formatearFechaCompleta(fecha_visita)} ya está ocupado. ¿Te parece bien otro horario?`,
        };
      }

      const { data: nuevaVisita, error } = await supabase
        .from('visitas')
        .insert({
          numero_telefono,
          nombre_cliente,
          fecha_visita,
          proyecto_interes: proyectoCanonico,
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
        mensaje: `✅ Visita confirmada para ${nombre_cliente} el ${formatearFechaCompleta(fecha_visita)} — ${proyectoCanonico}.`,
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
          mensaje: `El horario ${formatearFechaCompleta(nueva_fecha)} ya está ocupado. ¿Quieres otro?`,
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
  // Sin nombre cargado NO se cae a una marca concreta. El esquema deja este
  // campo en NULL a proposito, y un fallback a 'Ceinys' haria que el agente de
  // otra clienta se presente con el nombre de otra empresa ante sus propios
  // compradores: exactamente el fallo silencioso que se quiso eliminar.
  const nombreEmpresa = (config.nombre_agencia || '').trim();
  if (!nombreEmpresa) {
    console.error('[Config] nombre_agencia esta vacio: carga los datos de la empresa en el panel.');
  }
  const empresaODefecto = nombreEmpresa || 'la empresa';

  // El nombre del agente y el rubro salen de la configuracion. Estaban clavados
  // como "Valeria" y "constructora e inmobiliaria peruana", que para una asesora
  // independiente es directamente falso: la haria afirmarle a un comprador que
  // ella construye las obras que solo intermedia.
  //
  // Sin nombre cargado se presenta como "la asesora virtual" y nada mas. El
  // respaldo NO puede ser un nombre propio: con varias clientas en el mismo
  // codigo, el agente de una terminaria presentandose con el nombre de otra.
  const nombreAgente = (config.nombre_agente || '').trim();
  const tipoNegocio = (config.tipo_negocio || '').trim();

  let serviciosTexto = config.servicios || '[]';
  try { serviciosTexto = JSON.parse(serviciosTexto).join(', '); } catch { /* usa como string */ }

  const ahora = new Date().toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const horarioTexto = describirHorario(resolverHorario(config));

  const listaProyectos = nombresProyectos.length
    ? nombresProyectos.map(n => `  • ${n}`).join('\n')
    : '  (no hay proyectos cargados — deriva al asesor)';

  const casosTexto = config.casos_exito ? `\n\nCasos y resultados que puedes mencionar:\n${config.casos_exito}` : '';
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

  // ── Como se VE la respuesta ────────────────────────────────────────
  //
  // Sin esto el modelo escribe parrafos corridos: el unico limite que habia
  // era de palabras. En WhatsApp, leido en un celular, un bloque de texto se
  // saltea. La base vive aca para que ninguna clienta nueva arranque sin
  // formato, y `estilo_respuesta` la ajusta desde el panel sin desplegar.
  //
  // Nada de markdown: WhatsApp solo entiende *negrita*, _cursiva_, ~tachado~
  // y monoespaciado. Un `## titulo` o un `[texto](url)` se ven literales y
  // quedan peor que el parrafo que venian a arreglar.
  const FORMATO_BASE = [
    'FORMATO DEL MENSAJE (esto es WhatsApp en un celular, no un email):',
    '- Separa las ideas en bloques cortos con una línea en blanco entre ellos. Ningún párrafo de más de dos líneas.',
    '- Cuando hables de un proyecto, ábrelo con un emoji y su nombre en *negrita*, solo en esa línea.',
    '- Lo normal es escribir en frases, como una persona. SOLO si das tres o más datos juntos conviene ponerlos uno por línea, cada uno con un emoji que venga al caso. No existe una lista fija de campos que haya que completar: eso convierte cada respuesta en un formulario.',
    '- La negrita de WhatsApp es UN SOLO asterisco a cada lado: *Los Viñedos*. NUNCA uses dos (**Los Viñedos**): eso es Markdown y WhatsApp lo muestra con los asteriscos a la vista.',
    '- Usa *negrita* en nombres de proyecto, precios, metrajes y fechas. Que el ojo los encuentre sin leer todo.',
    '- Cierra con UNA sola pregunta, en su propia línea, y que NO sea la misma que ya hiciste antes en esta conversación. Nunca dos preguntas en el mismo mensaje.',
    '- Nada de Markdown: ni ## para títulos, ni **doble asterisco**, ni tablas, ni enlaces tipo [texto](url). WhatsApp no los interpreta y el cliente ve los símbolos crudos. Los enlaces van pelados, en su propia línea.',
    '- Para viñetas usa un guión o un emoji al principio de la línea, nunca asteriscos: un asterisco suelto al inicio le desordena la negrita al cliente.',
    '- El emoji ordena, no decora: uno por línea de dato y nada más. Estás vendiendo un lote de decenas de miles de soles, no una promoción.',
  ].join('\n');

  const estiloPersonalizado = (config.estilo_respuesta || '').trim();
  const formatoTexto = '\n\n' + FORMATO_BASE
    + (estiloPersonalizado
      ? `\n\nAJUSTES DE ESTILO DE ${empresaODefecto.toUpperCase()} (mandan sobre lo anterior si se contradicen):\n${estiloPersonalizado}`
      : '');

  const notaSinContacto = contacto
    ? ''
    : '\n\n⚠️ IMPORTANTE: no hay datos de contacto cargados (teléfono, email, dirección, horarios). '
      + 'NO inventes ninguno. Si el cliente pide un teléfono, dirección u horario, dile que un asesor '
      + 'lo va a contactar por este mismo WhatsApp para coordinar.';

  return `Eres ${nombreAgente ? `${nombreAgente}, ` : ''}la asesora virtual de ${empresaODefecto}${tipoNegocio ? `, ${tipoNegocio}` : ''}. Eres cercana, clara y orientada a que el cliente conozca el proyecto en persona.${reglasTexto}

FECHA Y HORA ACTUAL (Perú, Lima): ${ahora}
Usa esta fecha como referencia para toda consulta de disponibilidad y agendamiento. Nunca agendes en el pasado.

CÓMO CONVERSAS (esto manda sobre todo lo demás):

Eres una asesora conversando por WhatsApp, no un catálogo que se imprime.
La diferencia se nota en el primer mensaje.

- NO SUELTES LA FICHA COMPLETA. Aunque tengas ubicación, precio, área, etapa,
  títulos y financiamiento, en un mensaje van DOS O TRES datos: los que más
  enganchan según lo que la persona dijo. El resto se lo guardas para cuando
  pregunte. Un muro de datos no deja nada que preguntar y la conversación se
  muere ahí.
- Da la ficha completa SOLO si te la piden ("mandame todos los datos",
  "qué más incluye") o si estás comparando dos proyectos.

- NUNCA REPITAS UNA PREGUNTA QUE YA HICISTE. Antes de escribir, mira lo que ya
  dijiste en esta conversación. Si ya invitaste a agendar y no te dijeron que
  sí, no lo vuelvas a preguntar igual: avanza con otra cosa — un dato nuevo,
  una pregunta sobre lo que busca, o una foto. Preguntar cinco veces "¿te
  gustaría agendar una visita?" es lo que hace que suene a robot.

- PRIMERO CONTESTA LO QUE TE PREGUNTARON, con esas palabras. Si no entendiste,
  pide que te lo aclaren; no respondas otra cosa parecida. Si alguien pregunta
  en qué ETAPA está un lote y tú no tienes ese dato, dilo: no contestes con el
  estado de entrega como si fuera lo mismo.

- CONOCE A LA PERSONA, de a una cosa por mensaje y con naturalidad: cómo se
  llama, si lo busca para vivir o como inversión, si compra al contado o en
  cuotas, para cuándo lo piensa. Eso sirve para recomendarle bien y para que
  el asesor sepa con quién habla. Nunca lo pidas como un formulario.

- VARÍA CÓMO ABRES Y CÓMO CIERRAS. No empieces todos los mensajes igual ni
  termines todos con la misma frase.

Tu objetivo sigue siendo que la persona conozca el proyecto en persona, pero
se llega conversando, no repitiendo la invitación.

ASÍ SE VE LA DIFERENCIA. Alguien escribe "Quiero más información de Torres de
Parcona" (es el texto automático de un anuncio, no una consulta detallada).

ATENCION CON LO QUE SIGUE: es la FORMA de una buena respuesta, con los datos
tapados a propósito. Los corchetes se llenan SIEMPRE con lo que te devuelva
consultar_proyectos para ese proyecto, nunca con lo que leas acá ni con lo que
recuerdes de otra conversación. Si copias una cifra de este ejemplo le estás
mintiendo a un comprador.

MAL — esto es un catálogo, y ahí se muere la conversación:
"*[nombre del proyecto]*
Ubicación: [ubicación]
Área: [área]
Precio: [precio]
[estado de entrega]
[títulos]
[movilidad]
¿Te gustaría agendar una visita?"
Siete datos por línea, con emoji adelante, y la misma pregunta de siempre.

BIEN — engancha con lo justo y abre la conversación:
"¡Hola! Qué bueno que te interese [proyecto].

[UN dato del proyecto que venga del payload] y [otro dato], o sea que [por qué
eso le conviene a ella].

[UNA pregunta que te sirva para asesorarla]"

Mira la diferencia: el segundo da DOS datos en vez de siete, explica por qué
importan, y termina con una pregunta que sirve para asesorar. El resto sale
después, cuando pregunten o cuando sepas qué busca. Eso es asesorar; lo otro es
imprimir un folleto.

Y no abras siempre con la misma frase: si en el historial ya saludaste así, usa
otra. Dos compradores distintos no tienen por qué recibir el mismo mensaje.

PROYECTOS DE ${empresaODefecto.toUpperCase()} (los únicos que existen — nunca menciones ni inventes otro):
${listaProyectos}

Horario de visitas: ${horarioTexto}. No ofrezcas días ni horas fuera de eso.

Información de ${empresaODefecto}:
- Empresa: ${empresaODefecto}${config.slogan ? ` — ${config.slogan}` : ''}${contacto}
- Qué ofrecemos: ${serviciosTexto}${config.sobre_agencia ? `\n- Sobre nosotros: ${config.sobre_agencia}` : ''}${casosTexto}${faqTexto}${notaSinContacto}

El número de WhatsApp del cliente es: ${numeroTelefono}${formatoTexto}

Reglas importantes:
- MENSAJES CORTOS: máximo 120 palabras, y el PRIMERO de la conversación no pasa de 60. Casi todos los que escriben llegan de un anuncio con un texto ya armado ("Quiero más información de X"): eso no es una pregunta detallada, es alguien que recién asoma. Respondérle con la ficha entera lo espanta. Si te piden todos los proyectos, menciona los 3-4 más relevantes y ofrece ampliar.
- DATOS DE PROYECTOS: antes de decir CUALQUIER cosa concreta de un proyecto —ubicación, precio, área, financiamiento, amenidades, áreas verdes, servicios, seguridad, cuántos lotes quedan, lo que sea— SIEMPRE llama a consultar_proyectos, aunque creas recordarlo de un mensaje anterior. Lo que no venga en esa respuesta NO existe: no lo completes con lo que sabes de otro proyecto ni con lo que suele tener un condominio. Si el proyecto viene con "sin_detalle_cargado", NO inventes nada: ofrece que un asesor le dé el detalle exacto y propón agendar la visita.
- NUNCA inventes NINGÚN dato: ni precios, metrajes, cuotas, plazos, disponibilidad, etapas, numeración de lotes ni orientación. Si te preguntan algo que no está en el catálogo, di con todas las letras que eso lo confirma un asesor. Es una compra de decenas de miles de soles: un dato inventado le cuesta dinero al cliente y la credibilidad a la empresa. Decir "no lo tengo a la mano" no es un fracaso; inventarlo sí.
- TÍTULO DE PROPIEDAD: no todos los proyectos tienen el título entregado hoy. La mayoría está en PRE-VENTA y el título llega más adelante. Nunca digas que un proyecto "ya tiene título" salvo que su campo entrega_titulo lo diga explícitamente. Si no hay dato, di que un asesor confirma la fecha exacta.
- LA PRE-VENTA ES UNA VENTAJA, preséntala así con naturalidad: es la etapa de precio más bajo de todo el proyecto, con el mayor potencial de revalorización, y permite elegir entre los mejores lotes antes de que se vendan. Además el respaldo está desde el día uno: partida registral, empresa inscrita y contrato firmado. Nunca la presentes como una limitación ni pidas disculpas por ella, pero tampoco la disfraces: si preguntan cuándo llega el título, dilo con claridad.
- UBICACIÓN: si preguntan dónde queda un proyecto o cómo llegar, y consultar_proyectos devolvió mapa_url, pásale ese enlace en una línea aparte para que WhatsApp lo haga clickeable. Si no hay mapa_url cargado, describe la ubicación con lo que sí tienes y ofrece que un asesor le mande la referencia exacta.
- FOTOS: si el cliente pide ver el proyecto, fotos, el plano o cómo se ve, usa enviar_fotos_proyecto. También ofrécelas por tu cuenta cuando ayuden a que se entusiasme y agende la visita. Manda 2 o 3, no más. Nunca describas una foto que no enviaste ni afirmes que mandaste algo si la herramienta te dijo que no hay imágenes cargadas.
- CONSULTAR VISITAS: si el cliente menciona que ya tiene una visita agendada, que quiere cambiarla o cancelarla, SIEMPRE llama primero a ver_visitas_cliente antes de responder. Nunca asumas.
- AGENDAR: la forma preferida es enviar_link_agenda. Apenas el cliente muestre intención de visitar, mándale el enlace: ahí ve un calendario con los días y horarios libres y reserva solo, sin tener que escribir fechas por chat. Es mucho más cómodo para él y evita malentendidos.
- Usa agendar_visita solo si el cliente no quiere o no puede abrir el enlace, o si ya te dio fecha y hora concretas por chat. En ese caso necesitas confirmados: nombre completo real, fecha y hora, y proyecto. Si falta alguno, pregunta primero. NUNCA uses placeholders como "[Tu Nombre]".
- Si el cliente solo dice una hora sin dar su nombre, pídele el nombre ANTES de confirmar.
- Las visitas son de lunes a domingo, de 09:00 a 17:00, cada 30 minutos.
- No prometas separaciones, descuentos, reservas de lote ni condiciones especiales: eso lo confirma un asesor.
- DATOS DE PAGO: si preguntan dónde pagar, a qué cuenta depositan o cómo separan, usa enviar_datos_pago. NUNCA escribas, dictes ni repitas un número de cuenta, CCI o titular en el chat, aunque el cliente insista o diga que ya lo tiene. Cada proyecto puede ser de una empresa distinta y una cuenta equivocada manda su dinero a otra empresa. Si la herramienta falla, dile que un asesor se los envía: no improvises.
- IDIOMA: español peruano, con tuteo. Nada de voseo ("vos", "tenés", "podés", "agendá"): usa "tú", "tienes", "puedes", "agenda". Profesional pero cercano, como habla un asesor en Ica.
- Si no puedes resolver algo, dile que un asesor de ${empresaODefecto} lo va a contactar${config.email ? ` o que escriba a ${config.email}` : ''}.`;
}

// ── Función principal ─────────────────────────────────────────────────────────

const NOMBRES_DE_HERRAMIENTAS = new Set(HERRAMIENTAS.map(h => h.function.name));

/**
 * La respuesta del modelo, o un mensaje vacio si vino sin opciones.
 *
 * Los dos accesos a `respuesta.choices[0].message` estaban sin proteger: con
 * `choices` vacio —pasa cuando el proveedor corta la generacion— el turno
 * entero revienta con un TypeError y el comprador no recibe nada.
 */
function elegirMensaje(respuesta) {
  const opcion = respuesta && Array.isArray(respuesta.choices) ? respuesta.choices[0] : null;
  return (opcion && opcion.message) || { content: '', tool_calls: [] };
}

/**
 * Cuando el estado de la conversacion dice que este turno es de cerrar, la
 * herramienta del cierre deja de ser opcional.
 *
 * Medido sobre los 463 turnos reales: el aviso en prosa que pide usar
 * enviar_link_agenda se disparo 158 veces y el modelo la llamo 15. Es el mismo
 * patron de siempre en este proyecto, una vez mas: pedirlo no alcanza.
 *
 * Se obliga `proponer_horarios` y no `enviar_link_agenda` porque ofrecer dos
 * horarios concretos no le pide al comprador que conteste que si: le pide que
 * elija. El enlace queda como salida para quien prefiere elegir solo, y el
 * propio payload de la herramienta se lo dice al modelo.
 */
function herramientaObligada(instruccion) {
  if (/YA TE DIJO QUE SÍ/.test(instruccion || '')) {
    return { type: 'function', function: { name: 'proponer_horarios' } };
  }
  return 'auto';
}

async function procesarMensajeConIA(numeroTelefono, mensajeUsuario, configEmpresa, historial) {
  const openai = obtenerClienteOpenAI();
  const config = configEmpresa || {};

  // Lo aprendido se agrega DESPUES del prompt base, no adentro: asi
  // construirSystemPrompt sigue siendo sincrona y se puede probar sin base de
  // datos, y ademas lo ultimo que lee el modelo es lo que mas peso tiene.
  //
  // Las tres lecturas van juntas porque ninguna depende de la otra y son lo
  // primero que ocurre en cada mensaje: encadenarlas le sumaria latencia al
  // turno, que ya pelea contra el limite de 9 segundos de Twilio.
  const [nombresProyectos, correcciones, memoria] = await Promise.all([
    obtenerNombresProyectos(),
    obtenerCorreccionesParaPrompt(),
    obtenerMemoriaComprador(numeroTelefono),
  ]);
  // El estado de la conversacion va al final, que es lo que el modelo lee
  // mas cerca de escribir. Probado contra el modelo real: la regla estatica
  // de no repetir la invitacion perdia contra el objetivo declarado de
  // llevar a una visita, y el agente invitaba en los tres turnos seguidos.
  const instruccionConversacion = instruccionSegunHistorial(historial, mensajeUsuario);
  const systemPrompt = construirSystemPrompt(numeroTelefono, config, nombresProyectos)
    + memoria + correcciones + instruccionConversacion;

  // Efectos que no viajan en el texto: las herramientas lo van llenando y el
  // webhook lo usa para adjuntar media al mensaje de WhatsApp.
  // El historial viaja en el contexto para que las herramientas sepan que ya
  // paso en la conversacion: sin esto, enviar_fotos_proyecto no tenia forma de
  // saber cuales fotos ya habia mandado.
  const contexto = { imagenes: [], numeroTelefono, config, historial: historial || [] };

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
    model: MODELO,
    messages: mensajes,
    tools: HERRAMIENTAS,
    // Pedirlo en prosa no alcanzo: reproducido sobre los 463 turnos reales, el
    // aviso que dice "usa enviar_link_agenda" se disparo 158 veces y el modelo
    // llamo la herramienta en 15. Cuando el estado calculado dice que este
    // turno es de cerrar, la herramienta deja de ser opcional.
    tool_choice: herramientaObligada(instruccionConversacion),
    ...parametrosDelModelo(MODELO),
  });

  let mensaje = elegirMensaje(respuesta);
  let rondas = 0;

  while (mensaje.tool_calls && mensaje.tool_calls.length > 0) {
    rondas++;
    console.log(`[OpenAI] Ejecutando ${mensaje.tool_calls.length} herramienta(s)... (ronda ${rondas})`);
    mensajes.push(mensaje);

    for (const toolCall of mensaje.tool_calls) {
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments); } catch { /* args vacíos */ }

      const nombre = toolCall.function.name;

      // Una herramienta que no existe no se ejecuta: se le dice y se sigue.
      // Antes caia en el `default`, que devolvia un error sin cortar el ciclo.
      if (!NOMBRES_DE_HERRAMIENTAS.has(nombre)) {
        console.warn(`[OpenAI] Pidio una herramienta que no existe: ${nombre}`);
        mensajes.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            exito: false,
            mensaje: `La herramienta "${nombre}" no existe. Contesta con lo que ya tienes.`,
          }),
        });
        continue;
      }

      console.log(`[OpenAI] → ${nombre}`, args);
      const resultado = await ejecutarHerramienta(nombre, args, contexto);
      console.log(`[OpenAI] ← Resultado:`, resultado);

      mensajes.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(resultado),
      });
    }

    // Al agotarse las rondas se le quitan las herramientas: tiene que redactar
    // con lo que junto, que es mejor que seguir pidiendo o que quedarse sin
    // respuesta cuando Twilio corte.
    const seAgoto = rondas >= MAX_RONDAS_HERRAMIENTAS;
    if (seAgoto) console.warn(`[OpenAI] Tope de ${MAX_RONDAS_HERRAMIENTAS} rondas: se fuerza la respuesta`);

    respuesta = await openai.chat.completions.create({
      model: MODELO,
      messages: mensajes,
      ...(seAgoto ? {} : { tools: HERRAMIENTAS, tool_choice: 'auto' }),
      ...parametrosDelModelo(MODELO),
    });

    mensaje = elegirMensaje(respuesta);
    if (seAgoto) break;
  }

  const empresaODefecto = (config.nombre_agencia || '').trim() || 'la empresa';
  // Sin nombre cargado, "la asesora virtual de X" — nunca el nombre propio de
  // otra clienta. Ver el comentario en construirSystemPrompt.
  const quienSaluda = (config.nombre_agente || '').trim();
  const texto = mensaje.content
    || `¡Hola! Soy ${quienSaluda ? `${quienSaluda} de ${empresaODefecto}` : `la asesora virtual de ${empresaODefecto}`}. ¿Buscas un lote o una casa? Cuéntame qué tienes en mente.`;

  // Sin duplicados: si el modelo pide las fotos del mismo proyecto dos veces
  // en el mismo turno, el cliente recibiría la imagen repetida.
  //
  // El saneado va acá y no en cada ruta de envío porque las dos —TwiML para
  // la respuesta rápida y REST para la tardía— salen de este mismo texto.
  return { texto: limpiarWhatsApp(texto), imagenes: [...new Set(contexto.imagenes)] };
}

// construirSystemPrompt se exporta para poder probarlo: el respaldo del
// nombre del agente es justo el tipo de detalle que se rompe en silencio
// y termina presentando a una clienta con el nombre de otra.
//
// revisarFechaDeVisita, describirDiaRelativo y herramientaObligada también:
// son las tres piezas que deciden si una visita se agenda de verdad, y las
// tres se pueden probar sin tocar la base ni gastar una llamada al modelo.
module.exports = {
  parametrosDelModelo,
  procesarMensajeConIA,
  construirSystemPrompt,
  obtenerClienteOpenAI,
  revisarFechaDeVisita,
  describirDiaRelativo,
  herramientaObligada,
  MODELO,
};
