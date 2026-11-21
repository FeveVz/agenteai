import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { obtenerEmbudo } from '../lib/api';
import { Grupo, Fila } from './ui/Grupo';

/**
 * El embudo de Pamela y los leads que se enfriaron.
 *
 * Dos cosas que la auditoría de noviembre dejó medidas y que no existían en
 * ninguna pantalla:
 *
 *   - Nadie le decía cuántos entraron y cuántos llegaron a agendar. El panel
 *     mostraba mensajes, proyectos y visitas, pero ningún número del negocio.
 *   - El 45% de los contactos escribe una vez y no vuelve, y nunca hubo nada
 *     que volviera a tocarlos: 26 personas en 25 días.
 *
 * Escribir solo pasadas 24 horas necesita una plantilla aprobada por Meta.
 * Esto resuelve la mitad que no depende de nadie: la lista, con el contexto de
 * cada uno y el mensaje ya redactado, a un clic de WhatsApp.
 */
export default function TabEmbudo() {
  const { data, isLoading } = useQuery({ queryKey: ['embudo'], queryFn: obtenerEmbudo });

  if (isLoading) {
    return <p className="text-[15px] text-ios-etiqueta-2 px-1">Armando el embudo…</p>;
  }

  const resumen = (data && data.resumen) || {};
  const frios = (data && data.frios) || [];
  const totales = (data && data.frios_totales) || 0;

  return (
    <div className="space-y-6">
      <Grupo
        titulo="Los últimos 30 días"
        descripcion="De cada interesado que escribió, cuántos llegaron a conversar y cuántos agendaron una visita."
      >
        <div className="grid grid-cols-3 divide-x divide-ios-separador">
          <Numero valor={resumen.contactos} etiqueta="escribieron" />
          <Numero valor={resumen.conversaron} etiqueta="conversaron" />
          <Numero valor={resumen.visitas} etiqueta="agendaron" destacado />
        </div>
      </Grupo>

      <Grupo
        titulo={`Se enfriaron (${totales})`}
        descripcion={
          'Conversaron y dejaron de responder. Nadie les vuelve a escribir solo: el mensaje ya está '
          + 'redactado con lo que te dijeron, revísalo y mándalo. Los de arriba son los que más hablaron.'
        }
      >
        {frios.length === 0 && (
          <Fila>
            <p className="text-[15px] text-ios-etiqueta-2">Ninguno por ahora. Todos los que escribieron siguen activos o ya tienen visita.</p>
          </Fila>
        )}

        {frios.map(lead => <LeadFrio key={lead.numero_telefono} lead={lead} />)}

        {totales > frios.length && (
          <Fila>
            <p className="text-[13px] text-ios-etiqueta-3">
              Hay {totales - frios.length} más. Escribe primero a estos, que son los más recuperables.
            </p>
          </Fila>
        )}
      </Grupo>
    </div>
  );
}

function Numero({ valor, etiqueta, destacado }) {
  return (
    <div className="px-3 py-4 text-center">
      <p className={`text-[30px] font-semibold tabular-nums leading-none ${destacado ? 'text-marca-orange' : 'text-ios-etiqueta'}`}>
        {valor ?? '—'}
      </p>
      <p className="text-[13px] text-ios-etiqueta-2 mt-1.5">{etiqueta}</p>
    </div>
  );
}

function LeadFrio({ lead }) {
  const [texto, setTexto] = useState(lead.sugerido);
  const [abierto, setAbierto] = useState(false);

  const numeroLimpio = String(lead.numero_telefono).replace(/\D/g, '');
  const enlace = `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(texto)}`;

  return (
    <Fila>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-snug">
            {lead.proyecto || 'Sin proyecto definido'}
          </p>
          <p className="text-[13px] text-ios-etiqueta-2 mt-0.5">
            {lead.dias_en_silencio} días en silencio · {lead.mensajes_suyos} mensajes suyos
          </p>
        </div>
        <span className="text-[13px] text-ios-etiqueta-3 tabular-nums shrink-0">
          ···{numeroLimpio.slice(-4)}
        </span>
      </div>

      {lead.donde_quedo && (
        <p className="text-[13px] text-ios-etiqueta-2 mt-2 italic leading-snug">
          Lo último que te dijo: “{lead.donde_quedo}”
        </p>
      )}

      {!lead.alcanzable ? (
        // Pasa con 1 de cada 13 contactos: WhatsApp los entrega con una
        // identidad de Meta en vez de un número, y a esos no se les puede
        // escribir primero. Mejor decirlo que dejar un botón que no funciona.
        <p className="text-[13px] text-ios-etiqueta-3 mt-2.5 leading-snug">
          Este contacto llegó sin número de teléfono, así que no se le puede escribir primero.
          Solo podrás responderle si vuelve a escribir él.
        </p>
      ) : (
        <div className="mt-2.5 space-y-2">
          {abierto && (
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-[10px] border border-ios-separador bg-ios-fondo-2
                         text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-marca-orange/40"
            />
          )}

          <div className="flex gap-2">
            <a
              href={enlace}
              target="_blank"
              rel="noreferrer"
              onClick={() => toast.success('Se abrió WhatsApp con el mensaje listo')}
              className="flex-1 text-center py-2 rounded-[10px] bg-marca-orange text-white
                         text-[15px] font-medium active:opacity-80 transition-opacity"
            >
              Escribirle
            </a>
            <button
              type="button"
              onClick={() => setAbierto(v => !v)}
              className="px-4 py-2 rounded-[10px] bg-black/[0.06] text-[15px] font-medium
                         text-ios-etiqueta active:opacity-70 transition-opacity"
            >
              {abierto ? 'Listo' : 'Editar'}
            </button>
          </div>
        </div>
      )}
    </Fila>
  );
}
