import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import TabMensajes from '../components/TabMensajes';
import TabVisitas from '../components/TabVisitas';
import TabProyectos from '../components/TabProyectos';
import TabConfiguracion from '../components/TabConfiguracion';
import LoginGate from '../components/LoginGate';
import { cerrarSesion } from '../lib/api';

const PESTANAS = [
  { id: 'mensajes', etiqueta: 'Mensajes' },
  { id: 'visitas', etiqueta: 'Visitas' },
  { id: 'proyectos', etiqueta: 'Proyectos' },
  { id: 'configuracion', etiqueta: 'Configuración' },
];

export default function Dashboard() {
  return (
    <LoginGate>
      <PanelCeinys />
    </LoginGate>
  );
}

function PanelCeinys() {
  const [pestanaActiva, setPestanaActiva] = useState('mensajes');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  function salir() {
    cerrarSesion();
    queryClient.clear();
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-black border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">CEINYS</h1>
                <span className="w-1.5 h-1.5 bg-ceinys-orange rounded-sm" />
              </div>
              <p className="text-xs text-gray-500">Panel de Control — Agente IA</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              ← Inicio
            </button>
            <button
              onClick={salir}
              className="text-gray-500 hover:text-ceinys-orange text-sm transition-colors"
            >
              Salir
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0 overflow-x-auto">
            {PESTANAS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPestanaActiva(tab.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${
                  pestanaActiva === tab.id
                    ? 'border-ceinys-orange text-ceinys-orange'
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
        {pestanaActiva === 'visitas' && <TabVisitas />}
        {pestanaActiva === 'proyectos' && <TabProyectos />}
        {pestanaActiva === 'configuracion' && <TabConfiguracion />}
      </main>
    </div>
  );
}
