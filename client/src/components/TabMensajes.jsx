import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { obtenerConversaciones, obtenerConversacion } from '../lib/api';

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
      <div className="w-5 h-5 border-2 border-ceinys-orange border-t-transparent rounded-full animate-spin" />
      {texto && <span className="text-sm">{texto}</span>}
    </div>
  );
}

function ItemConversacion({ conv, activa, onClick }) {
  const esDeValeria = conv.ultimo_remitente === 'asistente';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
        activa ? 'bg-orange-50 border-l-4 border-l-ceinys-orange' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className={`text-sm truncate ${activa ? 'font-bold text-ceinys-orange-dark' : 'font-semibold text-gray-900'}`}>
          {conv.numero_telefono}
        </span>
        <span className="text-[11px] text-gray-400 flex-shrink-0">{formatearRelativo(conv.ultima_fecha)}</span>
      </div>
      <p className="text-xs text-gray-500 truncate">
        {esDeValeria && <span className="text-gray-400">Valeria: </span>}
        {conv.ultimo_mensaje}
      </p>
      <p className="text-[11px] text-gray-300 mt-0.5">{conv.total} mensaje{conv.total !== 1 ? 's' : ''}</p>
    </button>
  );
}

function Burbuja({ mensaje }) {
  const esUsuario = mensaje.remitente === 'usuario';
  const conImagen = mensaje.tipo_mensaje === 'texto_e_imagen';

  return (
    <div className={`flex ${esUsuario ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
        esUsuario ? 'bg-white border border-gray-200 rounded-tl-sm' : 'bg-ceinys-orange text-white rounded-tr-sm'
      }`}>
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${esUsuario ? 'text-gray-800' : 'text-white'}`}>
          {mensaje.contenido_mensaje}
        </p>
        <div className={`flex items-center gap-1.5 mt-1 ${esUsuario ? 'text-gray-400' : 'text-orange-100'}`}>
          {conImagen && <span className="text-[11px]" title="Incluyó imágenes">📎</span>}
          <span className="text-[11px]">{formatearHora(mensaje.recibido_en)}</span>
        </div>
      </div>
    </div>
  );
}

export default function TabMensajes() {
  const [numeroActivo, setNumeroActivo] = useState(null);
  const finDeLista = useRef(null);

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

  useEffect(() => {
    finDeLista.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes.length, numeroActivo]);

  if (isError) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="text-sm text-gray-500">{error?.message}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-black">
        <div>
          <h2 className="text-base font-bold text-white">Conversaciones</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {cargandoConvs ? 'Cargando...' : `${conversaciones.length} chat${conversaciones.length !== 1 ? 's' : ''} · se actualiza cada 5s`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-green-400 border border-green-800 bg-green-950 px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          En vivo
        </div>
      </div>

      <div className="grid md:grid-cols-[300px_1fr] h-[600px]">
        {/* Lista de chats */}
        <aside className="border-r border-gray-200 overflow-y-auto">
          {cargandoConvs && <Spinner texto="Cargando..." className="h-40" />}

          {!cargandoConvs && conversaciones.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 px-6 text-center">
              <p className="text-4xl">💬</p>
              <p className="text-sm font-medium">Sin conversaciones</p>
              <p className="text-xs">Aparecerán acá cuando alguien le escriba a Valeria.</p>
            </div>
          )}

          {conversaciones.map(c => (
            <ItemConversacion
              key={c.numero_telefono}
              conv={c}
              activa={c.numero_telefono === numeroActivo}
              onClick={() => setNumeroActivo(c.numero_telefono)}
            />
          ))}

          {dataConvs?.ventana_completa && (
            <p className="text-[11px] text-gray-400 px-4 py-3 border-t border-gray-100">
              Mostrando los chats más recientes. Puede haber conversaciones antiguas fuera de esta lista.
            </p>
          )}
        </aside>

        {/* Conversación */}
        <section className="flex flex-col bg-gray-50 min-w-0">
          {!numeroActivo && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
              <p className="text-4xl">👈</p>
              <p className="text-sm">Elegí una conversación</p>
            </div>
          )}

          {numeroActivo && (
            <>
              <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-sm">📱</div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{numeroActivo}</p>
                  <p className="text-xs text-gray-400">{mensajes.length} mensajes</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
                <div ref={finDeLista} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
