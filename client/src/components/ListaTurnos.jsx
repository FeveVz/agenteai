import { useQuery } from '@tanstack/react-query';
import { obtenerReuniones } from '../lib/api';

const ESTADO_CONFIG = {
  confirmada: { clase: 'bg-emerald-100 text-emerald-700 border-emerald-200', icono: '✅' },
  pendiente: { clase: 'bg-amber-100 text-amber-700 border-amber-200', icono: '⏳' },
  cancelada: { clase: 'bg-red-100 text-red-700 border-red-200', icono: '❌' },
  completada: { clase: 'bg-violet-100 text-violet-700 border-violet-200', icono: '🏁' },
};

function formatearFecha(fechaStr) {
  if (!fechaStr) return 'Sin fecha';
  return new Date(fechaStr).toLocaleString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function CardReunionLista({ reunion }) {
  const cfg = ESTADO_CONFIG[reunion.estado] || { clase: 'bg-slate-100 text-slate-600', icono: '❓' };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">{cfg.icono}</span>
            <div>
              <p className="font-semibold text-slate-800">{reunion.nombre_cliente || 'Cliente sin nombre'}</p>
              {reunion.empresa && <p className="text-sm text-violet-600 font-medium">{reunion.empresa}</p>}
              <p className="text-xs text-slate-400">{reunion.numero_telefono}</p>
            </div>
          </div>
          <div className="ml-9 space-y-1 text-sm text-slate-600">
            <p>📅 {formatearFecha(reunion.fecha_reunion)}</p>
            {reunion.tipo_servicio && <p>🎯 <strong>{reunion.tipo_servicio}</strong></p>}
            {reunion.notas && (
              <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2 mt-2">📝 {reunion.notas}</p>
            )}
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${cfg.clase}`}>
          {reunion.estado}
        </span>
      </div>
    </div>
  );
}

export default function ListaTurnos() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reuniones'],
    queryFn: obtenerReuniones,
    refetchInterval: 5000,
  });

  const reuniones = data?.reuniones || [];
  const resumen = reuniones.reduce((acc, r) => { acc[r.estado] = (acc[r.estado] || 0) + 1; return acc; }, {});

  return (
    <div>
      {!isLoading && reuniones.length > 0 && (
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
          <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando reuniones...</span>
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <p className="text-4xl">⚠️</p>
            <p className="text-sm">{error?.message}</p>
          </div>
        )}
        {!isLoading && !isError && reuniones.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <p className="text-5xl">📅</p>
            <p className="text-sm">No hay reuniones todavía.</p>
            <p className="text-xs text-center max-w-xs">
              Las reuniones aparecerán aquí cuando Valeria las agende por WhatsApp.
            </p>
          </div>
        )}
        {!isLoading && reuniones.map(r => <CardReunionLista key={r.id} reunion={r} />)}
      </div>
    </div>
  );
}
