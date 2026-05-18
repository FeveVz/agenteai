import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TabMensajes from '../components/TabMensajes';
import TabTurnos from '../components/TabTurnos';
import TabConfiguracion from '../components/TabConfiguracion';

const PESTANAS = [
  { id: 'mensajes', etiqueta: '💬 Mensajes' },
  { id: 'reuniones', etiqueta: '📅 Reuniones' },
  { id: 'configuracion', etiqueta: '⚙️ Configuración' },
];

export default function Dashboard() {
  const [pestanaActiva, setPestanaActiva] = useState('mensajes');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold">S</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800">Panel de Control</h1>
              <p className="text-xs text-slate-400">Suggestion — Agencia de Marketing Digital</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-slate-700 text-sm transition-colors"
          >
            ← Inicio
          </button>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1">
            {PESTANAS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPestanaActiva(tab.id)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-all duration-200 ${
                  pestanaActiva === tab.id
                    ? 'border-violet-600 text-violet-700 bg-violet-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
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
