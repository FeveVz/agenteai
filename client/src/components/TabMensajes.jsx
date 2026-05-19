import { useQuery } from '@tanstack/react-query';
import { obtenerMensajes } from '../lib/api';

function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const fecha = new Date(fechaStr);
  return fecha.toLocaleString('es-PE', {
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
        <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm mt-1">
          📱
        </div>
      )}

      <div className={`max-w-[70%] ${esUsuario ? '' : 'items-end'} flex flex-col gap-1`}>
        <div className={`flex items-center gap-2 text-xs text-gray-400 ${esUsuario ? '' : 'flex-row-reverse'}`}>
          <span className="font-medium">{mensaje.numero_telefono}</span>
          <span className={`px-2 py-0.5 rounded-full font-medium text-xs ${
            esUsuario ? 'bg-gray-100 text-gray-600' : 'bg-sky-100 text-sky-700'
          }`}>
            {esUsuario ? 'Usuario' : 'Valeria'}
          </span>
          <span>{formatearFecha(mensaje.recibido_en)}</span>
        </div>

        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          esUsuario
            ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
            : 'bg-black text-white rounded-tr-sm'
        }`}>
          {mensaje.contenido_mensaje}
        </div>
      </div>

      {!esUsuario && (
        <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center text-white text-xs font-bold mt-1">
          V
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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-black">
        <div>
          <h2 className="text-base font-bold text-white">Mensajes Recientes</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isLoading ? 'Cargando...' : `${mensajes.length} mensajes · actualización automática cada 5s`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-green-400 border border-green-800 bg-green-950 px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          En vivo
        </div>
      </div>

      <div className="h-[600px] overflow-y-auto p-6 space-y-5 bg-gray-50">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Cargando mensajes...</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-4xl">⚠️</p>
            <p className="text-gray-500 text-sm text-center">
              No se pudieron cargar los mensajes.
              <br />
              <span className="text-gray-400">{error?.message}</span>
            </p>
          </div>
        )}

        {!isLoading && !isError && mensajes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <p className="text-5xl">💬</p>
            <p className="text-sm font-medium">No hay mensajes todavía.</p>
            <p className="text-xs text-center max-w-xs text-gray-400">
              Los mensajes de WhatsApp aparecerán aquí cuando los prospectos escriban.
            </p>
          </div>
        )}

        {!isLoading && mensajes.length > 0 && (
          <>
            {[...mensajes].reverse().map((msg) => (
              <BurbujaMensaje key={msg.id} mensaje={msg} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
