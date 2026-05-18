import { useQuery } from '@tanstack/react-query';
import { obtenerMensajes } from '../lib/api';

function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const fecha = new Date(fechaStr);
  return fecha.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BurbujaMensaje({ mensaje }) {
  const esUsuario = mensaje.remitente === 'usuario';

  return (
    <div className={`flex gap-3 ${esUsuario ? 'justify-start' : 'justify-end'}`}>
      {esUsuario && (
        <div className="flex-shrink-0 w-9 h-9 bg-slate-200 rounded-full flex items-center justify-center text-lg mt-1">
          📱
        </div>
      )}

      <div className={`max-w-[70%] ${esUsuario ? '' : 'items-end'} flex flex-col gap-1`}>
        {/* Encabezado del mensaje */}
        <div className={`flex items-center gap-2 text-xs text-slate-400 ${esUsuario ? '' : 'flex-row-reverse'}`}>
          <span className="font-medium">{mensaje.numero_telefono}</span>
          <span
            className={`px-2 py-0.5 rounded-full font-medium ${
              esUsuario
                ? 'bg-slate-100 text-slate-600'
                : 'bg-blue-100 text-blue-600'
            }`}
          >
            {esUsuario ? 'Usuario' : 'Sarah'}
          </span>
          <span>{formatearFecha(mensaje.recibido_en)}</span>
        </div>

        {/* Burbuja del mensaje */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            esUsuario
              ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
              : 'bg-blue-600 text-white rounded-tr-sm'
          }`}
        >
          {mensaje.contenido_mensaje}
        </div>
      </div>

      {!esUsuario && (
        <div className="flex-shrink-0 w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-lg mt-1">
          🤖
        </div>
      )}
    </div>
  );
}

export default function TabMensajes() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mensajes'],
    queryFn: obtenerMensajes,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const mensajes = data?.mensajes || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Encabezado del card */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Mensajes Recientes</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {isLoading ? 'Cargando...' : `${mensajes.length} mensajes · actualización automática cada 5s`}
          </p>
        </div>
        {/* Indicador de actualización en vivo */}
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          En vivo
        </div>
      </div>

      {/* Área de mensajes */}
      <div className="h-[600px] overflow-y-auto p-6 space-y-5">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Cargando mensajes...</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-4xl">⚠️</p>
            <p className="text-slate-500 text-sm text-center">
              No se pudieron cargar los mensajes.
              <br />
              <span className="text-slate-400">{error?.message}</span>
            </p>
          </div>
        )}

        {!isLoading && !isError && mensajes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <p className="text-5xl">💬</p>
            <p className="text-sm">No hay mensajes todavía.</p>
            <p className="text-xs text-center max-w-xs">
              Los mensajes de WhatsApp aparecerán aquí cuando los pacientes escriban.
            </p>
          </div>
        )}

        {!isLoading && mensajes.length > 0 && (
          <>
            {/* Los mensajes vienen en orden descendente, los mostramos del más antiguo al más reciente */}
            {[...mensajes].reverse().map((msg) => (
              <BurbujaMensaje key={msg.id} mensaje={msg} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
