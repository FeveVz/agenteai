import { useQuery } from '@tanstack/react-query';
import { obtenerTurnos } from '../lib/api';

const ESTADO_CONFIG = {
  confirmado: { clase: 'bg-emerald-100 text-emerald-700 border-emerald-200', icono: '✅' },
  pendiente: { clase: 'bg-amber-100 text-amber-700 border-amber-200', icono: '⏳' },
  cancelado: { clase: 'bg-red-100 text-red-700 border-red-200', icono: '❌' },
  completado: { clase: 'bg-blue-100 text-blue-700 border-blue-200', icono: '🏁' },
};

function formatearFechaCompleta(fechaStr) {
  if (!fechaStr) return 'Sin fecha';
  const fecha = new Date(fechaStr);
  return fecha.toLocaleString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CardTurnoLista({ turno }) {
  const estadoConfig = ESTADO_CONFIG[turno.estado] || { clase: 'bg-slate-100 text-slate-600', icono: '❓' };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow duration-200">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Info principal */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">{estadoConfig.icono}</span>
            <div>
              <p className="font-semibold text-slate-800 text-base">
                {turno.nombre_paciente || 'Paciente sin nombre'}
              </p>
              <p className="text-sm text-slate-400">{turno.numero_telefono}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600 ml-9">
            <span className="flex items-center gap-1.5">
              📅 {formatearFechaCompleta(turno.fecha_turno)}
            </span>
          </div>

          {turno.tipo_turno && (
            <div className="ml-9 mt-1">
              <span className="text-sm text-slate-500">
                🦷 <strong>{turno.tipo_turno}</strong>
              </span>
            </div>
          )}

          {turno.notas && (
            <div className="ml-9 mt-2">
              <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                📝 {turno.notas}
              </p>
            </div>
          )}
        </div>

        {/* Badge de estado */}
        <span
          className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${estadoConfig.clase}`}
        >
          {turno.estado}
        </span>
      </div>
    </div>
  );
}

export default function ListaTurnos() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['turnos'],
    queryFn: obtenerTurnos,
    refetchInterval: 5000,
  });

  const turnos = data?.turnos || [];

  // Agrupar turnos por estado para el resumen
  const resumen = turnos.reduce((acc, t) => {
    acc[t.estado] = (acc[t.estado] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Resumen de estadísticas */}
      {!isLoading && turnos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {Object.entries(ESTADO_CONFIG).map(([estado, config]) => (
            <div key={estado} className={`rounded-xl border p-4 ${config.clase}`}>
              <p className="text-2xl font-bold">{resumen[estado] || 0}</p>
              <p className="text-sm capitalize font-medium mt-1">{estado}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista de turnos */}
      <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
        {isLoading && (
          <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando turnos...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <p className="text-4xl">⚠️</p>
            <p className="text-sm">{error?.message || 'Error al cargar los turnos.'}</p>
          </div>
        )}

        {!isLoading && !isError && turnos.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <p className="text-5xl">📅</p>
            <p className="text-sm">No hay turnos todavía.</p>
            <p className="text-xs text-center max-w-xs">
              Los turnos aparecerán aquí cuando los pacientes agenden por WhatsApp.
            </p>
          </div>
        )}

        {!isLoading && turnos.map((turno) => (
          <CardTurnoLista key={turno.id} turno={turno} />
        ))}
      </div>
    </div>
  );
}
