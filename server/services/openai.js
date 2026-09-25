const OpenAI = require('openai');
const { obtenerSupabase } = require('../db');
const {
  calcularHorariosLibres,
  formatearFechaCompleta,
  resolverHorario,
  esDiaDeAtencion,
  describirHorario,
} = require('../utils/fechas');
const { buscarPorNombre, normalizar } = require('../utils/proyectos');
const { limpiarWhatsApp } = require('../utils/formatoWhatsApp');
const { obtenerCorreccionesParaPrompt, obtenerMemoriaComprador } = require('./aprendizaje');
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
      const imagenes = parsearImagenes(proyecto.imagenes).slice(0, tope);

      if (imagenes.length === 0) {
        return {
          exito: false,
          mensaje: `Todavía no hay imágenes cargadas de ${proyecto.nombre}. NO inventes ni describas fotos que no viste: ofrece agendar una visita para que lo vea en persona, o que un asesor se las envíe.`,
        };
      }

      contexto.imagenes = (contexto.imagenes || []).concat(imagenes.map(i => i.url));

      return {
        exito: true,
        proyecto: proyecto.nombre,
        enviadas: imagenes.length,
        detalle: imagenes.map(i => i.descripcion).filter(Boolean),
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
        if (esUrlSegura(p.mapa_url)) salida.mapa_url = p.mapa_url.trim();

        const fotos = parsearImagenes(p.imagenes);
        if (fotos.length > 0) {
          salida.fotos_disponibles = fotos.length;
          salida.fotos_de = fotos.map(f => f.descripcion).filter(Boolean);
        }
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

      return { proyectos: limpios, total: limpios.length };
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
    '- CUANDO des varios datos juntos —y solo entonces— van uno por línea con su emoji adelante: 📍 ubicación, 📐 área o metraje, 💰 precio, 🏗️ etapa y entrega, ✅ disponibilidad, 🗓️ fechas y visitas, 🚗 movilidad. Para uno o dos datos esto no aplica: van en una frase normal, como los diría una persona.',
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

PROYECTOS DE ${empresaODefecto.toUpperCase()} (los únicos que existen — nunca menciones ni inventes otro):
${listaProyectos}

Horario de visitas: ${horarioTexto}. No ofrezcas días ni horas fuera de eso.

Información de ${empresaODefecto}:
- Empresa: ${empresaODefecto}${config.slogan ? ` — ${config.slogan}` : ''}${contacto}
- Qué ofrecemos: ${serviciosTexto}${config.sobre_agencia ? `\n- Sobre nosotros: ${config.sobre_agencia}` : ''}${casosTexto}${faqTexto}${notaSinContacto}

El número de WhatsApp del cliente es: ${numeroTelefono}${formatoTexto}

Reglas importantes:
- MENSAJES CORTOS: máximo 120 palabras, y el PRIMERO de la conversación no pasa de 60. Casi todos los que escriben llegan de un anuncio con un texto ya armado ("Quiero más información de X"): eso no es una pregunta detallada, es alguien que recién asoma. Respondérle con la ficha entera lo espanta. Si te piden todos los proyectos, menciona los 3-4 más relevantes y ofrece ampliar.
- DATOS DE PROYECTOS: antes de dar ubicación, precio, área o financiamiento de un proyecto, SIEMPRE llama a consultar_proyectos. Si el proyecto viene con "sin_detalle_cargado", NO inventes nada: ofrece que un asesor le dé el detalle exacto y propón agendar la visita.
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
  const systemPrompt = construirSystemPrompt(numeroTelefono, config, nombresProyectos) + memoria + correcciones;

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
module.exports = { procesarMensajeConIA, construirSystemPrompt, obtenerClienteOpenAI };
