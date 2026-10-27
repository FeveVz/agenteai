import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { obtenerConversaciones, obtenerConversacion, obtenerToken } from '../lib/api';
import { useNombreAgente } from './ui/useNombreAgente';

// Lo mismo que valida el backend (server/routes/mensajes.js): el máximo que
// acepta Twilio en el cuerpo de un WhatsApp.
const MAX_LARGO_MENSAJE = 1600;

/**
 * Envía un mensaje escrito a mano por Pamela.
 *
 * Vive acá y no en lib/api.js solo porque es la única escritura del panel
 * contra /api/mensajes; cuando haya otra, conviene moverla junto al resto.
 * El token sale de la misma sesión que el resto del panel.
 */
async function enviarMensajeManual({ numero, texto }) {
  const token = obtenerToken();
  const res = await fetch(`/api/mensajes/${encodeURIComponent(numero)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ texto }),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`);
  return datos;
}

function formatearHora(fechaStr) {
  if (!fechaStr) return '';
  return new Date(fechaStr).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

/** En la lista: "14:32" si es de hoy, "ayer", o "12 ago". */
function formatearRelativo(fechaStr) {
  if (!fechaStr) return '';
  const fecha = new Date(fechaStr);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mismoDia(fecha, hoy)) return formatearHora(fechaStr);
  if (mismoDia(fecha, ayer)) return 'ayer';
  return fecha.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}

/** Separador de día dentro de la conversación. */
function formatearDia(fechaStr) {
  const fecha = new Date(fechaStr);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mismoDia(fecha, hoy)) return 'Hoy';
  if (mismoDia(fecha, ayer)) return 'Ayer';
  return fecha.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function Spinner({ texto, className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-gray-400 ${className}`}>
      <div className="w-5 h-5 border-2 border-marca-orange border-t-transparent rounded-full animate-spin" />
      {texto && <span className="text-sm">{texto}</span>}
    </div>
  );
}

/**
 * Qué marca lleva cada burbuja según `tipo_mensaje`.
 *
 * Antes era un booleano que solo conocía 'texto_e_imagen', el tipo que escribe
 * el asistente cuando adjunta fotos. En cuanto empiezan a entrar filas de
 * medios del comprador (nota de voz, foto, ubicación), un booleano las pinta
 * como texto plano y Pamela no puede distinguir una transcripción de algo que
 * el comprador escribió. El mapa deja lugar para esos tipos sin volver a
 * tocar este archivo.
 */
const MARCA_POR_TIPO = {
  texto_e_imagen: { icono: '📎', titulo: 'Incluyó imágenes' },
  imagen: { icono: '🖼️', titulo: 'El comprador mandó una foto' },
  audio: { icono: '🎙️', titulo: 'El comprador mandó una nota de voz' },
  ubicacion: { icono: '📍', titulo: 'El comprador compartió su ubicación' },
  manual: { icono: '✍️', titulo: 'Lo escribiste tú, no el agente' },
};

function ItemConversacion({ conv, activa, onClick, nombreAgente }) {
  const esDelAgente = conv.ultimo_remitente === 'asistente';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
        activa ? 'bg-orange-50 border-l-4 border-l-marca-orange' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className={`text-sm truncate ${activa ? 'font-bold text-marca-orange-dark' : 'font-semibold text-gray-900'}`}>
          {conv.numero_telefono}
        </span>
        <span className="text-[11px] text-gray-400 flex-shrink-0">{formatearRelativo(conv.ultima_fecha)}</span>
      </div>
      <p className="text-xs text-gray-500 truncate">
        {esDelAgente && <span className="text-gray-400">{nombreAgente}: </span>}
        {conv.ultimo_mensaje}
      </p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[11px] text-gray-300">{conv.total} mensaje{conv.total !== 1 ? 's' : ''}</span>
        {/* El canal lo calcula la API. 10 de 131 contactos llegaron sin número
            de teléfono: hay que verlo antes de abrir el chat, porque a esos no
            se les puede escribir primero. */}
        {conv.se_le_puede_escribir === false && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
            sin número
          </span>
        )}
      </div>
    </button>
  );
}

function Burbuja({ mensaje }) {
  const esUsuario = mensaje.remitente === 'usuario';
  const marca = MARCA_POR_TIPO[mensaje.tipo_mensaje];
  const escritoAMano = mensaje.tipo_mensaje === 'manual';

  // Un mensaje que escribió Pamela no puede verse igual que uno del agente:
  // si no, al leer la conversación no hay forma de saber qué dijo el agente
  // solo y qué se corrigió a mano.
  const fondo = esUsuario
    ? 'bg-white border border-gray-200 rounded-tl-sm'
    : escritoAMano
      ? 'bg-ios-etiqueta text-white rounded-tr-sm'
      : 'bg-marca-orange text-white rounded-tr-sm';

  return (
    <div className={`flex ${esUsuario ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 ${fondo}`}>
        {escritoAMano && (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60 mb-0.5">
            Escrito por ti
          </p>
        )}
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${esUsuario ? 'text-gray-800' : 'text-white'}`}>
          {mensaje.contenido_mensaje}
        </p>
        <div className={`flex items-center gap-1.5 mt-1 ${esUsuario ? 'text-gray-400' : 'text-white/70'}`}>
          {marca && <span className="text-[11px]" title={marca.titulo}>{marca.icono}</span>}
          {/* Un tipo que este panel todavía no conoce se muestra igual, en
              texto: es preferible a esconderlo. */}
          {!marca && mensaje.tipo_mensaje && mensaje.tipo_mensaje !== 'texto' && (
            <span className="text-[10px]" title={`tipo: ${mensaje.tipo_mensaje}`}>{mensaje.tipo_mensaje}</span>
          )}
          <span className="text-[11px]">{formatearHora(mensaje.recibido_en)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Cuadro para contestar a mano.
 *
 * Por qué existe: el panel era de solo lectura. El lead de mayor intención del
 * mes quedó esperando mientras el agente prometía que "un asesor lo va a
 * contactar", con la asesora mirando la conversación en vivo y sin un cuadro
 * de texto. Del último mes: 96 contactos, 6 dijeron que sí, 1 visita agendada.
 */
function CuadroDeRespuesta({ numero, destino }) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const areaTexto = useRef(null);

  const mutacion = useMutation({
    mutationFn: enviarMensajeManual,
    onSuccess: (datos) => {
      setTexto('');
      if (datos?.guardado === false) toast.warning(datos.aviso || 'Se envió, pero no quedó registrado.');
      else toast.success('Mensaje enviado.');
      queryClient.invalidateQueries({ queryKey: ['conversacion', numero] });
      queryClient.invalidateQueries({ queryKey: ['conversaciones'] });
    },
    // El error del backend ya viene explicado (dirección sin número, ventana de
    // 24 horas, largo). Se muestra tal cual en vez de un "falló" genérico.
    onError: (e) => toast.error(e.message),
  });

  const sePuede = destino?.se_le_puede_escribir !== false;
  const limpio = texto.trim();
  const excedido = limpio.length > MAX_LARGO_MENSAJE;

  function enviar() {
    if (!limpio || excedido || mutacion.isPending) return;
    mutacion.mutate({ numero, texto: limpio });
  }

  if (!sePuede) {
    return (
      <div className="border-t border-gray-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 leading-snug">
        Este contacto llegó sin número de teléfono (escribió desde un anuncio con su identidad de
        Meta oculta), así que no se le puede escribir desde acá ni mandarle un recordatorio.
        Para contestarle, abre el chat en tu WhatsApp. Tampoco le prometas que un asesor lo va a
        llamar: no hay a dónde llamarlo.
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-white px-3 py-3 space-y-2">
      {/* La ventana la calcula la API con la fecha real del último mensaje del
          comprador. Fuera de las 24 horas, Meta solo entrega plantillas
          aprobadas y este despliegue no tiene ninguna: más vale saberlo antes
          de escribir que después de que falle. */}
      {destino?.ventana_24h_abierta === false && (
        <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-snug">
          Su último mensaje fue hace {destino.horas_desde_su_ultimo_mensaje} horas. Pasadas las 24,
          WhatsApp solo entrega plantillas aprobadas por Meta, así que es probable que este mensaje
          sea rechazado.
        </p>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={areaTexto}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter manda, Shift+Enter hace salto de línea: es lo que ya hace
            // WhatsApp en la computadora.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
          }}
          rows={2}
          placeholder="Escríbele directo a este contacto…"
          className="flex-1 min-w-0 resize-none px-3.5 py-2.5 rounded-[14px] bg-black/[0.04] text-[15px]
                     text-ios-etiqueta placeholder:text-ios-etiqueta-3 border-0 outline-none
                     focus:ring-2 focus:ring-marca-orange/40 transition-all"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!limpio || excedido || mutacion.isPending}
          className="shrink-0 bg-marca-orange hover:bg-marca-orange-light disabled:opacity-40
                     text-white font-semibold px-4 py-2.5 rounded-full text-[14px]
                     transition-all active:scale-95"
        >
          {mutacion.isPending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[11px] text-ios-etiqueta-3">
          Queda guardado en la conversación como escrito por ti, no por el agente.
        </p>
        {limpio.length > MAX_LARGO_MENSAJE - 200 && (
          <span className={`text-[11px] shrink-0 ${excedido ? 'text-ios-rojo font-semibold' : 'text-ios-etiqueta-3'}`}>
            {limpio.length} / {MAX_LARGO_MENSAJE}
          </span>
        )}
      </div>
    </div>
  );
}

export default function TabMensajes() {
  const [numeroActivo, setNumeroActivo] = useState(null);
  // En un celular las dos columnas no entran: se muestra la lista o el chat,
  // con un botón para volver. Antes las dos se apilaban dentro de la misma
  // altura fija y ninguna de las dos se podía leer.
  const [chatEnPrimerPlano, setChatEnPrimerPlano] = useState(false);
  const contenedorMensajes = useRef(null);
  const nombreAgente = useNombreAgente();
  // Número para el que ya bajamos al último mensaje. No alcanza con comparar
  // el número activo: el efecto corre una primera vez con la conversación
  // todavía vacía, y ahí bajar no sirve de nada.
  const yaBajoPara = useRef(null);

  const { data: dataConvs, isLoading: cargandoConvs, isError, error } = useQuery({
    queryKey: ['conversaciones'],
    queryFn: obtenerConversaciones,
    refetchInterval: 5000,
  });

  const conversaciones = dataConvs?.conversaciones || [];

  // Abrir la conversación más reciente al entrar, sin pisar la que el usuario eligió
  useEffect(() => {
    if (!numeroActivo && conversaciones.length > 0) setNumeroActivo(conversaciones[0].numero_telefono);
  }, [conversaciones, numeroActivo]);

  const { data: dataChat, isLoading: cargandoChat } = useQuery({
    queryKey: ['conversacion', numeroActivo],
    queryFn: () => obtenerConversacion(numeroActivo),
    enabled: !!numeroActivo,
    refetchInterval: 5000,
  });

  // Vienen del más nuevo al más viejo; se invierten para leer de arriba hacia abajo
  const mensajes = [...(dataChat?.mensajes || [])].reverse();
  // Lo calcula la API: canal, si se le puede escribir y cuántas horas pasaron
  // desde su último mensaje.
  const destino = dataChat?.destino;

  // Se mueve solo el scroll interno del panel de mensajes.
  // Con scrollIntoView se arrastraban también los contenedores padre y la
  // página entera saltaba al fondo al abrir la pestaña.
  useEffect(() => {
    const cont = contenedorMensajes.current;
    if (!cont || mensajes.length === 0) return;

    // Primera vez que este chat tiene mensajes en pantalla: al final.
    const primeraCarga = yaBajoPara.current !== numeroActivo;
    // Después solo seguimos al último mensaje si ya estaba abajo: si el
    // usuario subió a leer historial, el refresco de 5s no lo arrastra.
    const cercaDelFinal = cont.scrollHeight - cont.scrollTop - cont.clientHeight < 120;

    if (primeraCarga || cercaDelFinal) {
      cont.scrollTop = cont.scrollHeight;
      yaBajoPara.current = numeroActivo;
    }
  }, [mensajes.length, numeroActivo]);

  if (isError) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="text-sm text-gray-500">{error?.message}</p>
      </div>
    );
  }

  const sinNumero = conversaciones.filter(c => c.se_le_puede_escribir === false).length;

  return (
    <div className="bg-ios-tarjeta rounded-ios shadow-tarjeta ring-1 ring-black/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-ios-separador flex items-center justify-between gap-3">
        <p className="text-[13px] text-ios-etiqueta-2 min-w-0 truncate">
          {cargandoConvs ? 'Cargando…' : `${conversaciones.length} chat${conversaciones.length !== 1 ? 's' : ''}`}
          {sinNumero > 0 && (
            <span className="text-ios-etiqueta-3"> · {sinNumero} sin número</span>
          )}
        </p>
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-ios-verde bg-ios-verde/10 px-2.5 py-1 rounded-full shrink-0">
          <span className="w-1.5 h-1.5 bg-ios-verde rounded-full animate-pulse" />
          En vivo
        </div>
      </div>

      <div className="grid md:grid-cols-[300px_1fr] h-[520px] md:h-[620px]">
        {/* Lista de chats */}
        {/* min-h-0 es imprescindible: sin eso el item de grid crece con el
            contenido en vez de scrollear (min-height:auto por defecto). */}
        <aside className={`border-r border-gray-200 overflow-y-auto min-h-0
          ${chatEnPrimerPlano ? 'hidden md:block' : 'block'}`}>
          {cargandoConvs && <Spinner texto="Cargando..." className="h-40" />}

          {!cargandoConvs && conversaciones.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 px-6 text-center">
              <p className="text-4xl">💬</p>
              <p className="text-sm font-medium">Sin conversaciones</p>
              <p className="text-xs">Aparecerán aquí cuando alguien le escriba a {nombreAgente}.</p>
            </div>
          )}

          {conversaciones.map(c => (
            <ItemConversacion
              key={c.numero_telefono}
              conv={c}
              activa={c.numero_telefono === numeroActivo}
              nombreAgente={nombreAgente}
              onClick={() => { setNumeroActivo(c.numero_telefono); setChatEnPrimerPlano(true); }}
            />
          ))}

          {dataConvs?.ventana_completa && (
            <p className="text-[11px] text-gray-400 px-4 py-3 border-t border-gray-100">
              Mostrando los chats más recientes. Puede haber conversaciones antiguas fuera de esta lista.
            </p>
          )}
        </aside>

        {/* Conversación */}
        <section className={`flex-col bg-gray-50 min-w-0 min-h-0
          ${chatEnPrimerPlano ? 'flex' : 'hidden md:flex'}`}>
          {!numeroActivo && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
              <p className="text-4xl">👈</p>
              <p className="text-sm">Elige una conversación</p>
            </div>
          )}

          {numeroActivo && (
            <>
              <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setChatEnPrimerPlano(false)}
                  className="md:hidden shrink-0 text-marca-orange text-[14px] font-medium px-1"
                >
                  ‹ Chats
                </button>
                <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-sm shrink-0">📱</div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{numeroActivo}</p>
                  <p className="text-xs text-gray-400">
                    {mensajes.length} mensajes
                    {destino?.se_le_puede_escribir === false && ' · sin número de teléfono'}
                  </p>
                </div>
              </div>

              <div ref={contenedorMensajes} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3">
                {cargandoChat && mensajes.length === 0 && <Spinner texto="Cargando conversación..." className="h-32" />}

                {mensajes.map((m, i) => {
                  const anterior = mensajes[i - 1];
                  const cambioDeDia = !anterior
                    || new Date(anterior.recibido_en).toDateString() !== new Date(m.recibido_en).toDateString();

                  return (
                    <div key={m.id} className="space-y-3">
                      {cambioDeDia && (
                        <div className="flex justify-center">
                          <span className="text-[11px] text-gray-500 bg-gray-200 rounded-full px-3 py-1 capitalize">
                            {formatearDia(m.recibido_en)}
                          </span>
                        </div>
                      )}
                      <Burbuja mensaje={m} />
                    </div>
                  );
                })}
              </div>

              <CuadroDeRespuesta numero={numeroActivo} destino={destino} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
