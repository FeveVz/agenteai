import { useState } from 'react';
import CalendarioVisitas from './CalendarioVisitas';
import ListaVisitas from './ListaVisitas';

const VISTAS = [
  { id: 'calendario', etiqueta: 'Calendario' },
  { id: 'lista', etiqueta: 'Lista' },
];

/**
 * Control segmentado, como el de iOS.
 *
 * La pastilla blanca se desliza entre las opciones en lugar de aparecer y
 * desaparecer: ese movimiento es lo que hace que se lea como un interruptor
 * de dos posiciones y no como dos botones sueltos que se encienden.
 */
function Segmentado({ opciones, valor, onChange }) {
  const indice = Math.max(0, opciones.findIndex(o => o.id === valor));

  return (
    <div className="relative flex bg-black/[0.06] rounded-[10px] p-[3px] select-none">
      <div
        className="absolute top-[3px] bottom-[3px] rounded-[8px] bg-white shadow-sm
                   transition-transform duration-300 ease-out"
        style={{
          width: `calc((100% - 6px) / ${opciones.length})`,
          transform: `translateX(calc(${indice} * 100%))`,
          left: '3px',
        }}
      />
      {opciones.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={o.id === valor}
          className={`relative z-10 flex-1 py-1.5 text-[14px] font-medium rounded-[8px]
            transition-colors duration-200
            ${o.id === valor ? 'text-ios-etiqueta' : 'text-ios-etiqueta-2 hover:text-ios-etiqueta'}`}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export default function TabVisitas() {
  const [vista, setVista] = useState('calendario');

  return (
    <div>
      <div className="px-4 sm:px-1 mb-4 max-w-[280px]">
        <Segmentado opciones={VISTAS} valor={vista} onChange={setVista} />
      </div>

      <div className="bg-ios-tarjeta rounded-ios shadow-tarjeta ring-1 ring-black/[0.04] p-4 sm:p-5">
        {vista === 'calendario' ? <CalendarioVisitas /> : <ListaVisitas />}
      </div>
    </div>
  );
}
