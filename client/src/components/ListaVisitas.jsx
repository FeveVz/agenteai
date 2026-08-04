import { useQuery } from '@tanstack/react-query';
import { obtenerVisitas } from '../lib/api';

const ESTADO_CONFIG = {
  confirmada: { clase: 'bg-emerald-100 text-emerald-700 border-emerald-200', icono: '✅' },
  pendiente: { clase: 'bg-amber-100 text-amber-700 border-amber-200', icono: '⏳' },
  cancelada: { clase: 'bg-red-100 text-red-700 border-red-200', icono: '❌' },
  completada: { clase: 'bg-sky-100 text-sky-700 border-sky-200', icono: '🏁' },
};

function formatearFecha(fechaStr) {
  if (!fechaStr) return 'Sin fecha';
  return new Date(fechaStr).toLocaleString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function CardVisitaLista({ visita }) {
  const cfg = ESTADO_CONFIG[visita.estado] || { clase: 'bg-gray-100 text-gray-600', icono: '❓' };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">{cfg.icono}</span>
            <div>
              <p className="font-bold text-gray-900">{visita.nombre_cliente || 'Cliente sin nombre'}</p>
              {visita.proyecto_interes && (
                <p className="text-sm text-ceinys-orange font-medium">{visita.proyecto_interes}</p>
              )}
              <p className="text-xs text-gray-400">{visita.numero_telefono}</p>
            </div>
          </div>
          <div className="ml-9 space-y-1 text-sm text-gray-600">
            <p>{formatearFecha(visita.fecha_visita)}</p>
            {visita.notas && (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mt-2">{visita.notas}</p>
            )}
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${cfg.clase}`}>
          {visita.estado}
        </span>
      </div>
    </div>
  );
}

export default function ListaVisitas() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['visitas'],
    queryFn: obtenerVisitas,
    refetchInterval: 5000,
  });

  const visitas = data?.visitas || [];
  const resumen = visitas.reduce((acc, v) => { acc[v.estado] = (acc[v.estado] || 0) + 1; return acc; }, {});

  return (
    <div>
      {!isLoading && visitas.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {Object.entries(ESTADO_CONFIG).map(([estado, cfg]) => (
            <div key={estado} className={`rounded-xl border p-4 ${cfg.clase}`}>
              <p className="text-2xl font-bold">{resumen[estado] || 0}</p>
              <p className="text-sm capitalize font-medium mt-1">{estado}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
        {isLoading && (
          <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
            <div className="w-6 h-6 border-2 border-ceinys-orange border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando visitas...</span>
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
            <p className="text-4xl">⚠️</p>
            <p className="text-sm">{error?.message}</p>
          </div>
        )}
        {!isLoading && !isError && visitas.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
            <p className="text-5xl">📅</p>
            <p className="text-sm font-medium">No hay visitas todavía.</p>
            <p className="text-xs text-center max-w-xs">
              Las visitas aparecerán aquí cuando Valeria las agende por WhatsApp.
            </p>
          </div>
        )}
        {!isLoading && visitas.map(v => <CardVisitaLista key={v.id} visita={v} />)}
      </div>
    </div>
  );
}
