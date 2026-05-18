import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { obtenerReuniones, obtenerReunionesPorFecha } from '../lib/api';

const ESTADO_COLORES = {
  confirmada: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
  cancelada: 'bg-red-100 text-red-700 border-red-200',
  completada: 'bg-violet-100 text-violet-700 border-violet-200',
};

function formatearHora(fechaStr) {
  if (!fechaStr) return '';
  const f = new Date(fechaStr);
  return `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
}

function CardReunion({ reunion }) {
  const color = ESTADO_COLORES[reunion.estado] || 'bg-slate-100 text-slate-700';
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="font-semibold text-slate-800">{reunion.nombre_cliente || 'Sin nombre'}</p>
          {reunion.empresa && <p className="text-xs text-slate-400">{reunion.empresa}</p>}
          <p className="text-xs text-slate-400">{reunion.numero_telefono}</p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0 ${color}`}>
          {reunion.estado}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span>🕐 <strong>{formatearHora(reunion.fecha_reunion)}</strong></span>
        <span className="text-slate-300">|</span>
        <span>{reunion.tipo_servicio || 'Sin especificar'}</span>
      </div>
      {reunion.notas && (
        <p className="text-xs text-slate-400 mt-2 bg-slate-50 rounded-lg px-3 py-2">📝 {reunion.notas}</p>
      )}
    </div>
  );
}

function CalendarioSimple({ fechaSeleccionada, onSeleccionarFecha, fechasConReuniones }) {
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
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setMesActual(new Date(anio, mes - 1, 1))} className="p-1.5 hover:bg-slate-100 rounded-lg">←</button>
        <h3 className="font-semibold text-slate-800">{meses[mes]} {anio}</h3>
        <button onClick={() => setMesActual(new Date(anio, mes + 1, 1))} className="p-1.5 hover:bg-slate-100 rounded-lg">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {diasSemana.map((d) => <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia, idx) => {
          if (!dia) return <div key={`v-${idx}`} />;
          const key = fmtKey(dia);
          const tieneReuniones = fechasConReuniones.includes(key);
          const seleccionado = fechaSeleccionada === key;
          return (
            <button
              key={key}
              onClick={() => onSeleccionarFecha(key)}
              className={`relative aspect-square rounded-xl text-sm font-medium transition-all duration-150 ${
                seleccionado ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                : esHoy(dia) ? 'bg-violet-50 text-violet-700 border border-violet-200'
                : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              {dia}
              {tieneReuniones && (
                <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${seleccionado ? 'bg-white' : 'bg-violet-400'}`} />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-violet-400 rounded-full" /> Con reuniones</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-violet-600 rounded-full" /> Seleccionado</span>
      </div>
    </div>
  );
}

export default function CalendarioTurnos() {
  const hoy = new Date();
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const [fechaSeleccionada, setFechaSeleccionada] = useState(fechaHoy);

  const { data: todasReuniones } = useQuery({
    queryKey: ['reuniones'],
    queryFn: obtenerReuniones,
    refetchInterval: 5000,
  });

  const { data: reunionesDia, isLoading } = useQuery({
    queryKey: ['reuniones', fechaSeleccionada],
    queryFn: () => obtenerReunionesPorFecha(fechaSeleccionada),
    enabled: !!fechaSeleccionada,
    refetchInterval: 5000,
  });

  const fechasConReuniones = [...new Set(
    (todasReuniones?.reuniones || [])
      .filter(r => r.estado !== 'cancelada')
      .map(r => r.fecha_reunion?.substring(0, 10))
      .filter(Boolean)
  )];

  const reunionesDelDia = reunionesDia?.reuniones || [];

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
        fechasConReuniones={fechasConReuniones}
      />
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-800">
            {fechaSeleccionada ? `Reuniones del ${fmtFecha(fechaSeleccionada)}` : 'Seleccioná una fecha'}
          </h3>
          <p className="text-sm text-slate-400 mt-0.5">{reunionesDelDia.length} reunión{reunionesDelDia.length !== 1 ? 'es' : ''}</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
            <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando...</span>
          </div>
        )}

        {!isLoading && reunionesDelDia.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <p className="text-4xl">📅</p>
            <p className="text-sm">No hay reuniones para este día.</p>
          </div>
        )}

        {!isLoading && reunionesDelDia.length > 0 && (
          <div className="space-y-3 overflow-y-auto max-h-[500px]">
            {reunionesDelDia.map(r => <CardReunion key={r.id} reunion={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
