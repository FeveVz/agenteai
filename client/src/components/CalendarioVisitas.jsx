import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { obtenerVisitas, obtenerVisitasPorFecha } from '../lib/api';

const ESTADO_COLORES = {
  confirmada: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
  cancelada: 'bg-red-100 text-red-700 border-red-200',
  completada: 'bg-sky-100 text-sky-700 border-sky-200',
};

function formatearHora(fechaStr) {
  if (!fechaStr) return '';
  const f = new Date(fechaStr);
  return `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
}

function CardVisita({ visita }) {
  const color = ESTADO_COLORES[visita.estado] || 'bg-gray-100 text-gray-700';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition-all">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="font-bold text-gray-900">{visita.nombre_cliente || 'Sin nombre'}</p>
          <p className="text-xs text-gray-400">{visita.numero_telefono}</p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0 ${color}`}>
          {visita.estado}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <span className="font-bold">{formatearHora(visita.fecha_visita)}</span>
        <span className="text-gray-300">|</span>
        <span className="text-ceinys-orange font-medium">{visita.proyecto_interes || 'Sin proyecto'}</span>
      </div>
      {visita.notas && (
        <p className="text-xs text-gray-400 mt-2 bg-gray-50 rounded-lg px-3 py-2">{visita.notas}</p>
      )}
    </div>
  );
}

function CalendarioSimple({ fechaSeleccionada, onSeleccionarFecha, fechasConVisitas }) {
  const [mesActual, setMesActual] = useState(new Date());
  const anio = mesActual.getFullYear();
  const mes = mesActual.getMonth();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  let inicio = new Date(anio, mes, 1).getDay();
  inicio = inicio === 0 ? 6 : inicio - 1;

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const diasSemana = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  const celdas = [...Array(inicio).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)];

  const fmtKey = (d) => `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const hoy = new Date();
  const esHoy = (d) => d === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setMesActual(new Date(anio, mes - 1, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">←</button>
        <h3 className="font-bold text-gray-900">{meses[mes]} {anio}</h3>
        <button onClick={() => setMesActual(new Date(anio, mes + 1, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {diasSemana.map((d) => <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia, idx) => {
          if (!dia) return <div key={`v-${idx}`} />;
          const key = fmtKey(dia);
          const tieneVisitas = fechasConVisitas.includes(key);
          const seleccionado = fechaSeleccionada === key;
          return (
            <button
              key={key}
              onClick={() => onSeleccionarFecha(key)}
              className={`relative aspect-square rounded-xl text-sm font-medium transition-all duration-150 ${
                seleccionado ? 'bg-black text-white shadow-md'
                : esHoy(dia) ? 'bg-orange-50 text-ceinys-orange border border-orange-200'
                : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              {dia}
              {tieneVisitas && (
                <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${seleccionado ? 'bg-ceinys-orange-light' : 'bg-ceinys-orange'}`} />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-ceinys-orange rounded-full" /> Con visitas</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-black rounded-full" /> Seleccionado</span>
      </div>
    </div>
  );
}

export default function CalendarioVisitas() {
  const hoy = new Date();
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const [fechaSeleccionada, setFechaSeleccionada] = useState(fechaHoy);

  const { data: todasVisitas } = useQuery({
    queryKey: ['visitas'],
    queryFn: obtenerVisitas,
    refetchInterval: 5000,
  });

  const { data: visitasDia, isLoading } = useQuery({
    queryKey: ['visitas', fechaSeleccionada],
    queryFn: () => obtenerVisitasPorFecha(fechaSeleccionada),
    enabled: !!fechaSeleccionada,
    refetchInterval: 5000,
  });

  const fechasConVisitas = [...new Set(
    (todasVisitas?.visitas || [])
      .filter(v => v.estado !== 'cancelada')
      .map(v => v.fecha_visita?.substring(0, 10))
      .filter(Boolean)
  )];

  const visitasDelDia = visitasDia?.visitas || [];

  const fmtFecha = (f) => {
    if (!f) return '';
    const [a, m, d] = f.split('-');
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${a}`;
  };

  return (
    <div className="grid md:grid-cols-[340px_1fr] gap-6">
      <CalendarioSimple
        fechaSeleccionada={fechaSeleccionada}
        onSeleccionarFecha={setFechaSeleccionada}
        fechasConVisitas={fechasConVisitas}
      />
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="mb-4">
          <h3 className="font-bold text-gray-900">
            {fechaSeleccionada ? `Visitas del ${fmtFecha(fechaSeleccionada)}` : 'Seleccioná una fecha'}
          </h3>
          <p className="text-sm text-gray-400 mt-0.5">{visitasDelDia.length} visita{visitasDelDia.length !== 1 ? 's' : ''}</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-ceinys-orange border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando...</span>
          </div>
        )}

        {!isLoading && visitasDelDia.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
            <p className="text-4xl">📅</p>
            <p className="text-sm">No hay visitas para este día.</p>
          </div>
        )}

        {!isLoading && visitasDelDia.length > 0 && (
          <div className="space-y-3 overflow-y-auto max-h-[500px]">
            {visitasDelDia.map(v => <CardVisita key={v.id} visita={v} />)}
          </div>
        )}
      </div>
    </div>
  );
}
