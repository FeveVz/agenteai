import { useState } from 'react';
import CalendarioVisitas from './CalendarioVisitas';
import ListaVisitas from './ListaVisitas';

export default function TabVisitas() {
  const [vista, setVista] = useState('calendario');

  return (
    <div className="space-y-5">
      <div className="bg-black rounded-2xl border border-gray-800 shadow-sm p-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-white">Visitas a proyectos</h2>
        <div className="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800">
          <button
            onClick={() => setVista('calendario')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              vista === 'calendario'
                ? 'bg-ceinys-orange text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Calendario
          </button>
          <button
            onClick={() => setVista('lista')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              vista === 'lista'
                ? 'bg-ceinys-orange text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Lista
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        {vista === 'calendario' ? <CalendarioVisitas /> : <ListaVisitas />}
      </div>
    </div>
  );
}
