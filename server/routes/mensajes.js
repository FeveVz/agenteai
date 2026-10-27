const express = require('express');
const { obtenerSupabase } = require('../db');
const { enviarMensajeWhatsApp } = require('../services/twilio');

const router = express.Router();

const MAX_MENSAJES_CONVERSACION = 300;
// Cuántos mensajes recientes se escanean para armar la lista de conversaciones.
// Postgres no tiene DISTINCT ON via PostgREST, así que se agrupa en memoria.
const VENTANA_CONVERSACIONES = 2000;

// Lo máximo que acepta Twilio en el cuerpo de un mensaje de WhatsApp. Si se
// pasa, la API responde error y el mensaje no llega: conviene avisarlo en el
// panel antes de intentar el envío.
const MAX_LARGO_MENSAJE = 1600;

// Meta solo deja contestar con texto libre dentro de las 24 horas del último
// mensaje del comprador. Fuera de esa ventana hace falta una plantilla
// aprobada, y este despliegue no tiene ninguna cargada.
const VENTANA_LIBRE_HORAS = 24;

const RE_TELEFONO = /^\+?\d{6,20}$/;

// Twilio no siempre manda un teléfono. Cuando el comprador escribe desde un
// anuncio con su identidad de Meta oculta, el remitente llega como
// 'PE.<id de Meta>'. Medido sobre el tráfico real: 10 de 131 contactos son
// así, 72 mensajes en total, y entre ellos están la conversación de 22
// mensajes de PE.981400590890326 y la de 12 de PE.1393664369419421, que puso
// fecha para el 17 o 18 de octubre. Mientras esto se trató como entrada
// inválida, el panel respondía 400 al abrirlas: justo las que Pamela necesita
// leer para rescatar el lead a mano.
const RE_IDENTIDAD_WA = /^[A-Z]{2}\.\d{6,24}$/;

function esTelefono(n) {
  return typeof n === 'string' && RE_TELEFONO.test(n);
}

function esIdentidadWhatsApp(n) {
  return typeof n === 'string' && RE_IDENTIDAD_WA.test(n);
}

/**
 * Se puede LEER la conversación. Es a propósito más ancho que lo que se puede
 * escribir: el identificador de Meta es opaco y el riesgo de inyección es el
 * mismo que con un número, pero sirve para abrir el historial.
 */
function esDestinoLegible(n) {
  return esTelefono(n) || esIdentidadWhatsApp(n);
}

/**
 * Estado del destino, calculado en código y devuelto como dato.
 *
 * El panel no tiene que adivinar nada: con esto desactiva el cuadro de texto y
 * dice por qué, en vez de dejar a Pamela escribir un mensaje que Twilio va a
 * rechazar por dirección inválida.
 *
 * @param numero    Identidad tal como la guardó el webhook.
 * @param mensajes  Historial del más nuevo al más viejo (el orden en el que lo
 *                  devuelven las consultas de este archivo).
 */
function estadoDelDestino(numero, mensajes = []) {
  const canal = esTelefono(numero) ? 'telefono' : 'wa_id';
  const ultimoDelComprador = (mensajes || []).find(m => m.remitente === 'usuario');
  const fecha = ultimoDelComprador ? new Date(ultimoDelComprador.recibido_en) : null;
  const horas = fecha && !Number.isNaN(fecha.getTime())
    ? Math.round(((Date.now() - fecha.getTime()) / 3600000) * 10) / 10
    : null;

  return {
    canal,
    // Sin teléfono no hay a dónde mandar: a ese contacto hay que contestarle
    // DENTRO del hilo, y nunca prometerle que un asesor lo va a llamar.
    se_le_puede_escribir: canal === 'telefono',
    horas_desde_su_ultimo_mensaje: horas,
    ventana_24h_abierta: horas === null ? null : horas < VENTANA_LIBRE_HORAS,
  };
}

// GET /api/mensajes/conversaciones — Una entrada por número, con su último mensaje
router.get('/conversaciones', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: mensajes, error } = await supabase
      .from('mensajes_whatsapp')
      .select('numero_telefono, contenido_mensaje, remitente, recibido_en')
      .order('recibido_en', { ascending: false })
      .limit(VENTANA_CONVERSACIONES);

    if (error) throw error;

    // Vienen ordenados de más nuevo a más viejo: el primero de cada número es su último mensaje
    const porNumero = new Map();
    for (const m of mensajes || []) {
      let conv = porNumero.get(m.numero_telefono);
      if (!conv) {
        conv = {
          numero_telefono: m.numero_telefono,
          ultimo_mensaje: m.contenido_mensaje,
          ultimo_remitente: m.remitente,
          ultima_fecha: m.recibido_en,
          total: 0,
          // El canal viaja en la lista, calculado acá, para que la marca de
          // "sin número" se vea ANTES de abrir el chat.
          canal: esTelefono(m.numero_telefono) ? 'telefono' : 'wa_id',
          se_le_puede_escribir: esTelefono(m.numero_telefono),
        };
        porNumero.set(m.numero_telefono, conv);
      }
      conv.total++;
    }

    res.json({
      ok: true,
      conversaciones: [...porNumero.values()],
      // Avisa si la ventana se llenó: podría haber conversaciones más viejas fuera
      ventana_completa: (mensajes || []).length >= VENTANA_CONVERSACIONES,
    });
  } catch (error) {
    console.error('[API Mensajes] Error al listar conversaciones:', error);
    res.status(500).json({ error: 'Error al obtener las conversaciones', detalle: error.message });
  }
});

// GET /api/mensajes/:numero — Historial completo de un número
router.get('/:numero', async (req, res) => {
  const numero = req.params.numero;

  if (!esDestinoLegible(numero)) {
    return res.status(400).json({ error: 'Identidad de contacto inválida.' });
  }

  try {
    const supabase = obtenerSupabase();
    const { data: mensajes, error } = await supabase
      .from('mensajes_whatsapp')
      .select('id, numero_telefono, contenido_mensaje, remitente, tipo_mensaje, procesado, recibido_en')
      .eq('numero_telefono', numero)
      .order('recibido_en', { ascending: false })
      .limit(MAX_MENSAJES_CONVERSACION);

    if (error) throw error;

    res.json({
      ok: true,
      numero,
      mensajes: mensajes || [],
      destino: estadoDelDestino(numero, mensajes || []),
    });
  } catch (error) {
    console.error(`[API Mensajes] Error para ${numero}:`, error);
    res.status(500).json({ error: 'Error al obtener la conversación', detalle: error.message });
  }
});

/**
 * POST /api/mensajes/:numero — Pamela contesta a mano.
 *
 * Por qué existe: el panel era de solo lectura. El lead de mayor intención del
 * mes, el de 22 mensajes, quedó esperando con la asesora mirando la pantalla en
 * vivo, porque el agente prometió que "un asesor lo va a contactar" y no había
 * ningún cuadro de texto donde contestarle. En un embudo de 96 contactos y 1
 * visita agendada, estos rescates a mano son la diferencia.
 *
 * El mensaje se guarda recién cuando Twilio lo aceptó. Guardarlo antes repetía
 * el error de las imágenes: el panel mostraba como enviado algo que al celular
 * del comprador nunca llegó.
 */
router.post('/:numero', async (req, res) => {
  const numero = req.params.numero;

  if (!esDestinoLegible(numero)) {
    return res.status(400).json({ error: 'Identidad de contacto inválida.' });
  }

  const texto = String(req.body?.texto == null ? '' : req.body.texto).trim();
  if (!texto) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
  }
  if (texto.length > MAX_LARGO_MENSAJE) {
    return res.status(400).json({
      error: `El mensaje tiene ${texto.length} caracteres y WhatsApp acepta hasta ${MAX_LARGO_MENSAJE}. Mándalo en dos partes.`,
    });
  }

  if (!esTelefono(numero)) {
    // Twilio rechaza 'whatsapp:PE.1393664369419421' por dirección inválida.
    // Se dice acá, con el motivo, en vez de dejar que falle el envío.
    return res.status(422).json({
      error: 'Este contacto llegó sin número de teléfono (identidad de Meta oculta), así que no se le '
        + 'puede escribir desde el panel. Contéstale dentro del chat de WhatsApp.',
      canal: 'wa_id',
    });
  }

  try {
    const supabase = obtenerSupabase();

    // La ventana se calcula ANTES de enviar: así, si Twilio rechaza, el panel
    // recibe el motivo probable medido y no una falla genérica.
    const { data: ultimos } = await supabase
      .from('mensajes_whatsapp')
      .select('remitente, recibido_en')
      .eq('numero_telefono', numero)
      .order('recibido_en', { ascending: false })
      .limit(MAX_MENSAJES_CONVERSACION);

    const estado = estadoDelDestino(numero, ultimos || []);

    const enviado = await enviarMensajeWhatsApp(numero, texto);

    if (!enviado) {
      const porVentana = estado.ventana_24h_abierta === false
        ? ` Su último mensaje fue hace ${estado.horas_desde_su_ultimo_mensaje} horas: pasadas las `
          + `${VENTANA_LIBRE_HORAS}, WhatsApp solo entrega plantillas aprobadas por Meta, y todavía no hay ninguna cargada.`
        : '';
      return res.status(502).json({
        error: `Twilio no aceptó el mensaje, así que no se guardó nada.${porVentana}`,
        destino: estado,
      });
    }

    // remitente va como 'asistente' porque la tabla solo acepta
    // 'usuario' | 'asistente' (CHECK del esquema). Lo que distingue a este
    // mensaje es tipo_mensaje: 'manual', que no necesita migración y le
    // permite al panel pintarlo como escrito por una persona.
    const { data: guardado, error: errorInsert } = await supabase
      .from('mensajes_whatsapp')
      .insert({
        numero_telefono: numero,
        contenido_mensaje: texto,
        remitente: 'asistente',
        tipo_mensaje: 'manual',
        procesado: 1,
      })
      .select()
      .single();

    if (errorInsert) {
      // El mensaje YA llegó al comprador: esto no es una falla de envío. Se
      // responde ok con el aviso, porque decir "falló" haría que Pamela lo
      // mande dos veces.
      console.error(`[API Mensajes] Enviado a ${numero} pero no se pudo guardar:`, errorInsert);
      return res.json({
        ok: true,
        guardado: false,
        aviso: 'El mensaje se envió, pero no quedó registrado en la conversación.',
        destino: estado,
      });
    }

    console.log(`[API Mensajes] Mensaje manual enviado a ${numero} (${texto.length} caracteres).`);
    res.status(201).json({ ok: true, guardado: true, mensaje: guardado, destino: estado });
  } catch (error) {
    console.error(`[API Mensajes] Error al enviar a ${numero}:`, error);
    res.status(500).json({ error: 'Error al enviar el mensaje', detalle: error.message });
  }
});

// GET /api/mensajes — Últimos 50 mensajes de todos los números (vista global)
router.get('/', async (req, res) => {
  try {
    const supabase = obtenerSupabase();
    const { data: mensajes, error } = await supabase
      .from('mensajes_whatsapp')
      .select('id, numero_telefono, contenido_mensaje, remitente, tipo_mensaje, procesado, recibido_en')
      .order('recibido_en', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ ok: true, mensajes: mensajes || [] });
  } catch (error) {
    console.error('[API Mensajes] Error:', error);
    res.status(500).json({ error: 'Error al obtener mensajes', detalle: error.message });
  }
});

module.exports = router;

// Se cuelgan del router (que app.js monta tal cual) para poder probar la
// validación sin levantar el servidor y sin tocar app.js, que es de otra zona.
module.exports.esTelefono = esTelefono;
module.exports.esIdentidadWhatsApp = esIdentidadWhatsApp;
module.exports.esDestinoLegible = esDestinoLegible;
module.exports.estadoDelDestino = estadoDelDestino;
module.exports.MAX_LARGO_MENSAJE = MAX_LARGO_MENSAJE;
