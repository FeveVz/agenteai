import { useState } from 'react';
import CalendarioTurnos from './CalendarioTurnos';
import ListaTurnos from './ListaTurnos';

export default function TabTurnos() {
  const [vista, setVista] = useState('calendario'); // 'calendario' | 'lista'

  return (
    <div className="space-y-5">
      {/* Toggle de vista */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Gestión de Turnos</h2>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setVista('calendario')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              vista === 'calendario'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            📅 Calendario
          </button>
          <button
            onClick={() => setVista('lista')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              vista === 'lista'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            📋 Lista
          </button>
        </div>
      </div>

      {/* Contenido de la vista */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        {vista === 'calendario' ? <CalendarioTurnos /> : <ListaTurnos />}
      </div>
    </div>
  );
}
