import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TabMensajes from '../components/TabMensajes';
import TabTurnos from '../components/TabTurnos';
import TabConfiguracion from '../components/TabConfiguracion';

const PESTANAS = [
  { id: 'mensajes', etiqueta: '💬 Mensajes' },
  { id: 'turnos', etiqueta: '📅 Turnos' },
  { id: 'configuracion', etiqueta: '⚙️ Configuración' },
];

export default function Dashboard() {
  const [pestanaActiva, setPestanaActiva] = useState('mensajes');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦷</span>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Panel de Control</h1>
              <p className="text-xs text-slate-400">Clínica Dental Sonrisa</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-slate-500 hover:text-slate-800 text-sm flex items-center gap-1 transition-colors"
          >
            ← Volver al inicio
          </button>
        </div>

        {/* Pestañas de navegación */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 pb-0">
            {PESTANAS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPestanaActiva(tab.id)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-all duration-200 ${
                  pestanaActiva === tab.id
                    ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                {tab.etiqueta}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Contenido de pestañas ────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {pestanaActiva === 'mensajes' && <TabMensajes />}
        {pestanaActiva === 'turnos' && <TabTurnos />}
        {pestanaActiva === 'configuracion' && <TabConfiguracion />}
      </main>
    </div>
  );
}
