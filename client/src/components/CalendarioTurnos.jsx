import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { obtenerTurnos, obtenerTurnosPorFecha } from '../lib/api';

const ESTADO_COLORES = {
  confirmado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
  cancelado: 'bg-red-100 text-red-700 border-red-200',
  completado: 'bg-blue-100 text-blue-700 border-blue-200',
};

function formatearHora(fechaStr) {
  if (!fechaStr) return '';
  const fecha = new Date(fechaStr);
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function CardTurno({ turno }) {
  const colorEstado = ESTADO_COLORES[turno.estado] || 'bg-slate-100 text-slate-700';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="font-semibold text-slate-800">{turno.nombre_paciente || 'Sin nombre'}</p>
          <p className="text-sm text-slate-400">{turno.numero_telefono}</p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${colorEstado} flex-shrink-0`}>
          {turno.estado}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-slate-600">
        <span className="flex items-center gap-1">
          🕐 <strong>{formatearHora(turno.fecha_turno)}</strong>
        </span>
        <span className="text-slate-300">|</span>
        <span>{turno.tipo_turno || 'Sin especificar'}</span>
      </div>
      {turno.notas && (
        <p className="text-xs text-slate-400 mt-2 bg-slate-50 rounded-lg px-3 py-2">
          📝 {turno.notas}
        </p>
      )}
    </div>
  );
}

// Calendario simple sin dependencias externas pesadas
function CalendarioSimple({ fechaSeleccionada, onSeleccionarFecha, fechasConTurnos }) {
  const [mesActual, setMesActual] = useState(new Date());

  const anio = mesActual.getFullYear();
  const mes = mesActual.getMonth();

  const primerDia = new Date(anio, mes, 1);
  const ultimoDia = new Date(anio, mes + 1, 0);
  const diasEnMes = ultimoDia.getDate();

  // Día de la semana del primer día (0=dom, ajustamos a lunes=0)
  let inicioSemana = primerDia.getDay();
  inicioSemana = inicioSemana === 0 ? 6 : inicioSemana - 1;

  const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const mesAnterior = () => setMesActual(new Date(anio, mes - 1, 1));
  const mesSiguiente = () => setMesActual(new Date(anio, mes + 1, 1));

  const celdas = [];
  // Celdas vacías antes del primer día
  for (let i = 0; i < inicioSemana; i++) {
    celdas.push(null);
  }
  // Días del mes
  for (let d = 1; d <= diasEnMes; d++) {
    celdas.push(d);
  }

  const formatearFechaKey = (dia) => {
    const m = String(mes + 1).padStart(2, '0');
    const d = String(dia).padStart(2, '0');
    return `${anio}-${m}-${d}`;
  };

  const hoy = new Date();
  const esHoy = (dia) =>
    dia === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      {/* Navegación del mes */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={mesAnterior}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
        >
          ←
        </button>
        <h3 className="font-semibold text-slate-800">
          {meses[mes]} {anio}
        </h3>
        <button
          onClick={mesSiguiente}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
        >
          →
        </button>
      </div>

      {/* Días de la semana */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {diasSemana.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Celdas del calendario */}
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia, idx) => {
          if (!dia) return <div key={`vacio-${idx}`} />;

          const fechaKey = formatearFechaKey(dia);
          const tieneTurnos = fechasConTurnos.includes(fechaKey);
          const seleccionado = fechaSeleccionada === fechaKey;
          const hoyFlag = esHoy(dia);

          return (
            <button
              key={fechaKey}
              onClick={() => onSeleccionarFecha(fechaKey)}
              className={`
                relative aspect-square rounded-xl text-sm font-medium transition-all duration-150
                ${seleccionado
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : hoyFlag
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'hover:bg-slate-100 text-slate-700'}
              `}
            >
              {dia}
              {tieneTurnos && !seleccionado && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-sky-400 rounded-full" />
              )}
              {tieneTurnos && seleccionado && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-sky-400 rounded-full" /> Con turnos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-blue-600 rounded-full" /> Seleccionado
        </span>
      </div>
    </div>
  );
}

export default function CalendarioTurnos() {
  const hoy = new Date();
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const [fechaSeleccionada, setFechaSeleccionada] = useState(fechaHoy);

  // Obtener todos los turnos para resaltar días en el calendario
  const { data: todosTurnos } = useQuery({
    queryKey: ['turnos'],
    queryFn: obtenerTurnos,
    refetchInterval: 5000,
  });

  // Obtener turnos de la fecha seleccionada
  const { data: turnosDia, isLoading: cargandoDia } = useQuery({
    queryKey: ['turnos', fechaSeleccionada],
    queryFn: () => obtenerTurnosPorFecha(fechaSeleccionada),
    enabled: !!fechaSeleccionada,
    refetchInterval: 5000,
  });

  // Extraer fechas únicas que tienen turnos
  const fechasConTurnos = [
    ...new Set(
      (todosTurnos?.turnos || [])
        .filter((t) => t.estado !== 'cancelado')
        .map((t) => t.fecha_turno?.substring(0, 10))
        .filter(Boolean)
    ),
  ];

  const turnosDelDia = turnosDia?.turnos || [];

  const formatearFechaLegible = (fechaStr) => {
    if (!fechaStr) return '';
    const [a, m, d] = fechaStr.split('-');
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${a}`;
  };

  return (
    <div className="grid md:grid-cols-[340px_1fr] gap-6">
      {/* Calendario */}
      <div>
        <CalendarioSimple
          fechaSeleccionada={fechaSeleccionada}
          onSeleccionarFecha={setFechaSeleccionada}
          fechasConTurnos={fechasConTurnos}
        />
      </div>

      {/* Panel de turnos del día */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-800">
              {fechaSeleccionada ? `Turnos del ${formatearFechaLegible(fechaSeleccionada)}` : 'Seleccioná una fecha'}
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">
              {turnosDelDia.length} turno{turnosDelDia.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {cargandoDia && (
          <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando...</span>
          </div>
        )}

        {!cargandoDia && turnosDelDia.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <p className="text-4xl">📅</p>
            <p className="text-sm">No hay turnos para este día.</p>
          </div>
        )}

        {!cargandoDia && turnosDelDia.length > 0 && (
          <div className="space-y-3 overflow-y-auto max-h-[500px]">
            {turnosDelDia.map((turno) => (
              <CardTurno key={turno.id} turno={turno} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
