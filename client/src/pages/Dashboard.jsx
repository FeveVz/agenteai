import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import TabMensajes from '../components/TabMensajes';
import TabVisitas from '../components/TabVisitas';
import TabProyectos from '../components/TabProyectos';
import TabConfiguracion from '../components/TabConfiguracion';
import TabConstructoras from '../components/TabConstructoras';
import LoginGate from '../components/LoginGate';
import { cerrarSesion } from '../lib/api';
import { MARCA } from '../config/marca';
import {
  IconoMensajes, IconoVisitas, IconoProyectos, IconoConstructoras,
  IconoConfiguracion, IconoInicio, IconoSalir,
} from '../components/ui/Iconos';

/**
 * Las cinco zonas del panel.
 *
 * `resumen` no es decoración: es lo que le dice a alguien que entra por
 * primera vez qué se edita en cada lugar antes de hacer clic. Era justo lo
 * que faltaba cuando esto eran cinco pestañas con una palabra cada una.
 */
const ZONAS = [
  { id: 'mensajes', etiqueta: 'Mensajes', Icono: IconoMensajes, resumen: 'Lo que conversa el agente con cada interesado' },
  { id: 'visitas', etiqueta: 'Visitas', Icono: IconoVisitas, resumen: 'Las visitas agendadas, en lista y en calendario' },
  { id: 'proyectos', etiqueta: 'Proyectos', Icono: IconoProyectos, resumen: 'El catálogo. Solo habla de lo que esté acá' },
  { id: 'constructoras', etiqueta: 'Constructoras', Icono: IconoConstructoras, resumen: 'Las empresas dueñas y sus cuentas de pago' },
  { id: 'configuracion', etiqueta: 'Configuración', Icono: IconoConfiguracion, resumen: 'Datos de la empresa, horarios, reglas y estilo' },
];

export default function Dashboard() {
  return (
    <LoginGate>
      <Panel />
    </LoginGate>
  );
}

function Panel() {
  const [zonaActiva, setZonaActiva] = useState('mensajes');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const zona = ZONAS.find(z => z.id === zonaActiva) ?? ZONAS[0];

  function salir() {
    cerrarSesion();
    queryClient.clear();
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-ios-fondo font-ios text-ios-etiqueta antialiased">
      <div className="flex min-h-screen">

        {/* ── Barra lateral (escritorio) ──────────────────────────
            El patron de Ajustes de iPad: las zonas siempre visibles a la
            izquierda. Antes eran pestañas que no entraban en el ancho y
            terminaban con una barra de scroll horizontal cruzando la
            pantalla: nadie sabia que habia una quinta seccion. */}
        <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col bg-ios-tarjeta/80 backdrop-blur-xl border-r border-ios-separador">
          <div className="px-5 pt-6 pb-4">
            <div className="flex items-center gap-1.5">
              <span className="font-sans text-[15px] font-bold uppercase tracking-tight text-ios-etiqueta">
                {MARCA.nombre}
              </span>
              <span className="w-1.5 h-1.5 bg-marca-orange rounded-full" />
            </div>
            <p className="text-[12px] text-ios-etiqueta-3 mt-0.5">Panel de control</p>
          </div>

          <nav className="flex-1 px-2.5 space-y-0.5">
            {ZONAS.map((z) => {
              const activa = z.id === zonaActiva;
              return (
                <button
                  key={z.id}
                  onClick={() => setZonaActiva(z.id)}
                  aria-current={activa ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left
                    transition-all duration-150 active:scale-[0.98]
                    ${activa
                      ? 'bg-marca-orange text-white shadow-sm'
                      : 'text-ios-etiqueta hover:bg-black/[0.04]'}`}
                >
                  <z.Icono className="w-[19px] h-[19px] shrink-0" />
                  <span className="text-[15px] font-medium">{z.etiqueta}</span>
                </button>
              );
            })}
          </nav>

          <div className="px-2.5 pb-5 pt-3 space-y-0.5 border-t border-ios-separador mt-3">
            <button
              onClick={() => navigate('/')}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-left text-[14px]
                         text-ios-etiqueta-2 hover:bg-black/[0.04] transition-colors"
            >
              <IconoInicio className="w-[17px] h-[17px] shrink-0" /> Ver la página pública
            </button>
            <button
              onClick={salir}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-left text-[14px]
                         text-ios-rojo hover:bg-ios-rojo/[0.06] transition-colors"
            >
              <IconoSalir className="w-[17px] h-[17px] shrink-0" /> Cerrar sesión
            </button>
          </div>
        </aside>

        {/* ── Contenido ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">

          {/* Cabecera movil: translucida y pegada arriba, como en iOS */}
          <header className="md:hidden sticky top-0 z-20 bg-ios-fondo/85 backdrop-blur-xl border-b border-ios-separador">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-sans text-[14px] font-bold uppercase tracking-tight">{MARCA.nombre}</span>
                <span className="w-1.5 h-1.5 bg-marca-orange rounded-full" />
              </div>
              <button onClick={salir} className="text-[14px] text-ios-rojo">Salir</button>
            </div>
          </header>

          <main className="flex-1 px-0 sm:px-6 lg:px-10 pt-6 pb-28 md:pb-10 max-w-4xl w-full mx-auto">
            {/* Titulo grande: la firma de iOS. Dice donde estas sin que
                haya que buscar cual pestaña quedo resaltada. */}
            <div className="px-4 sm:px-1 mb-5">
              <h1 className="text-[30px] sm:text-[34px] font-bold tracking-tight leading-tight">
                {zona.etiqueta}
              </h1>
              <p className="text-[14px] text-ios-etiqueta-2 mt-0.5">{zona.resumen}</p>
            </div>

            {zonaActiva === 'mensajes' && <TabMensajes />}
            {zonaActiva === 'visitas' && <TabVisitas />}
            {zonaActiva === 'proyectos' && <TabProyectos />}
            {zonaActiva === 'constructoras' && <TabConstructoras />}
            {zonaActiva === 'configuracion' && <TabConfiguracion />}
          </main>
        </div>
      </div>

      {/* ── Barra inferior (movil) ────────────────────────────────
          En un celular la mano llega abajo, no arriba. Es ademas donde
          iOS pone la navegacion principal en todas sus apps. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-ios-tarjeta/90 backdrop-blur-xl
                      border-t border-ios-separador pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {ZONAS.map((z) => {
            const activa = z.id === zonaActiva;
            return (
              <button
                key={z.id}
                onClick={() => setZonaActiva(z.id)}
                aria-current={activa ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors
                  ${activa ? 'text-marca-orange' : 'text-ios-etiqueta-3'}`}
              >
                <z.Icono className="w-[22px] h-[22px]" />
                <span className="text-[10px] font-medium leading-none">{z.etiqueta}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
