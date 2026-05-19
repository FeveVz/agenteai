import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TabMensajes from '../components/TabMensajes';
import TabTurnos from '../components/TabTurnos';
import TabConfiguracion from '../components/TabConfiguracion';

const PESTANAS = [
  { id: 'mensajes', etiqueta: 'Mensajes' },
  { id: 'reuniones', etiqueta: 'Reuniones' },
  { id: 'configuracion', etiqueta: 'Configuración' },
];

export default function Dashboard() {
  const [pestanaActiva, setPestanaActiva] = useState('mensajes');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-black border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">Sugpestion</h1>
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full" />
              </div>
              <p className="text-xs text-gray-500">Panel de Control — Agente IA</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            ← Inicio
          </button>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0">
            {PESTANAS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPestanaActiva(tab.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-all duration-200 ${
                  pestanaActiva === tab.id
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
                }`}
              >
                {tab.etiqueta}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {pestanaActiva === 'mensajes' && <TabMensajes />}
        {pestanaActiva === 'reuniones' && <TabTurnos />}
        {pestanaActiva === 'configuracion' && <TabConfiguracion />}
      </main>
    </div>
  );
}
