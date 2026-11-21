import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  obtenerAnalisis, analizarConversaciones, obtenerCorrecciones,
  crearCorreccion, actualizarCorreccion, obtenerCompradores,
} from '../lib/api';
import { MARCA } from '../config/marca';
import { Grupo, Fila, CampoLargo } from './ui/Grupo';

const COLOR_GRAVEDAD = {
  alta: 'bg-ios-rojo/10 text-ios-rojo',
  media: 'bg-ios-ambar/15 text-ios-ambar',
  baja: 'bg-black/[0.06] text-ios-etiqueta-2',
};

function Etiqueta({ gravedad }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${COLOR_GRAVEDAD[gravedad] || COLOR_GRAVEDAD.baja}`}>
      {gravedad}
    </span>
  );
}

function Chip({ children, tono = 'neutro' }) {
  const tonos = {
    neutro: 'bg-black/[0.06] text-ios-etiqueta-2',
    falta: 'bg-ios-ambar/15 text-ios-ambar',
    bien: 'bg-ios-verde/10 text-ios-verde',
  };
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tonos[tono]}`}>
      {children}
    </span>
  );
}

function fecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Dónde se carga cada tipo de hueco, con el nombre exacto de la pantalla y
 * del campo.
 *
 * Antes el panel mostraba "Cargar en: FAQ" y nada más: Pamela tenía que
 * saber que FAQ es el campo "Preguntas frecuentes" dentro de Configuración →
 * "Qué sabe el agente", bajar hasta ahí y acertarle al formato "P:" / "R:",
 * que solo aparece como texto gris de ejemplo. Las claves son las mismas del
 * enum DESTINOS de server/services/aprendizaje.js: si cambia una, cambian
 * las dos.
 */
const DESTINOS = {
  'configuracion.preguntas_frecuentes': {
    ruta: 'Configuración → Qué sabe el agente → Preguntas frecuentes',
    como: 'Agrega dos líneas al final del campo, una que empiece con "P:" y la de abajo con "R:".',
    plantilla: (h) => `P: ${h.pregunta}\nR: ${h.respuesta_sugerida || ''}`,
  },
  'configuracion.horarios': {
    ruta: 'Configuración → Horario de visitas',
    como: 'Marca los días y las horas en las que sí puedes recibir a alguien.',
  },
  'configuracion.direccion': {
    ruta: 'Configuración → Contacto → Dirección',
    como: 'Escribe la dirección completa, como se la darías a alguien que va a llegar en taxi.',
  },
  'configuracion.telefono': {
    ruta: 'Configuración → Contacto → Teléfono',
    como: 'El número al que puede llamar un interesado.',
  },
  'proyectos.precio': {
    ruta: (p) => `Proyectos → ${p || 'el proyecto'} → Precio desde`,
    como: 'Un solo precio por proyecto. Si hay dos distintos cargados, el agente dicta los dos.',
  },
  'proyectos.financiamiento': {
    ruta: (p) => `Proyectos → ${p || 'el proyecto'} → Financiamiento`,
    como: 'La inicial y las cuotas en una línea. Ejemplo de forma: inicial 20% + 36 cuotas de S/ X.',
  },
  'proyectos.disponibilidad': {
    ruta: (p) => `Proyectos → ${p || 'el proyecto'} → Estado comercial`,
    // No hay campo de stock en el catálogo: es el hueco que más veces
    // terminó en "no tengo esa información". Mejor decirlo que fingir que
    // existe un lugar donde cargarlo.
    como: 'Ojo: hoy no existe un campo para los lotes libres ni para su número o manzana. '
        + 'En "Estado comercial" entra el estado general (pre-venta, en obra, entregado); '
        + 'para el stock lote por lote hace falta un campo nuevo, avísale a Fernando.',
  },
  'proyectos.caracteristicas': {
    ruta: (p) => `Proyectos → ${p || 'el proyecto'} → Características`,
    como: 'Una por línea, y solo las que ese proyecto tiene de verdad.',
  },
  'proyectos.ubicacion': {
    ruta: (p) => `Proyectos → ${p || 'el proyecto'} → Ubicación y Enlace de Google Maps`,
    como: 'En Ubicación va el distrito; dos proyectos con la misma calle se confunden sin él.',
  },
  'proyectos.imagenes': {
    ruta: (p) => `Proyectos → ${p || 'el proyecto'} → Imágenes, o el botón Subir una foto o plano`,
    como: 'Una URL por línea. Si subes la foto desde el botón, el enlace se agrega solo.',
  },
};

function destinoDe(hueco) {
  const d = DESTINOS[hueco.campo];
  if (!d) {
    return {
      ruta: hueco.donde ? `Cargar en: ${hueco.donde}` : 'Sin destino: el análisis no indicó el campo.',
      como: 'Este informe es de una corrida anterior, que todavía no decía el campo exacto. '
          + 'Corre el análisis de nuevo y te va a decir dónde.',
      plantilla: null,
    };
  }
  return {
    ruta: typeof d.ruta === 'function' ? d.ruta(hueco.proyecto) : d.ruta,
    como: d.como,
    plantilla: d.plantilla ? d.plantilla(hueco) : null,
  };
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success('Copiado. Pégalo en el campo que dice el aviso.');
  } catch {
    toast.error('No pude copiarlo. Selecciónalo a mano desde el recuadro.');
  }
}

export default function TabAprendizaje() {
  const queryClient = useQueryClient();
  const [dijo, setDijo] = useState('');
  const [debioDecir, setDebioDecir] = useState('');
  const [nota, setNota] = useState('');

  const { data: dAnalisis, isLoading: cargandoAnalisis } = useQuery({
    queryKey: ['analisis'], queryFn: obtenerAnalisis,
  });
  const { data: dCorrecciones } = useQuery({ queryKey: ['correcciones'], queryFn: obtenerCorrecciones });
  const { data: dCompradores } = useQuery({ queryKey: ['compradores'], queryFn: obtenerCompradores });

  // 'auto' sigue desde donde quedó la corrida anterior; 0 relee todo. Antes
  // el panel mandaba siempre 0 y la lectura era ascendente, así que las 9
  // corridas de la base releyeron los mismos 400 mensajes más viejos y los
  // 525 más nuevos no se analizaron nunca.
  const analizar = useMutation({
    mutationFn: (desde) => analizarConversaciones(desde),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['analisis'] });
      queryClient.invalidateQueries({ queryKey: ['compradores'] });
      if (r.sinDatos) {
        toast.success(r.mensaje);
        return;
      }
      toast.success(
        `Leí ${r.mensajes_analizados} mensajes, del ${r.desde_mensaje + 1} al ${r.hasta_mensaje}.`
        + (r.faltan ? ` Quedan ${r.pendientes} sin leer.` : ' No queda nada pendiente.'),
      );
      if (r.falta_migracion) {
        toast.error('Las fichas se guardaron incompletas: falta aplicar la migración de la base. Avísale a Fernando.');
      }
    },
    onError: (e) => toast.error(`No se pudo analizar: ${e.message}`),
  });

  const guardar = useMutation({
    mutationFn: crearCorreccion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correcciones'] });
      setDijo(''); setDebioDecir(''); setNota('');
      toast.success('Corrección guardada. Ya aplica en la próxima conversación.');
    },
    onError: (e) => toast.error(`No se pudo guardar: ${e.message}`),
  });

  const alternar = useMutation({
    mutationFn: actualizarCorreccion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['correcciones'] }),
    onError: (e) => toast.error(e.message),
  });

  const analisis = dAnalisis?.analisis;
  const r = analisis?.resultado || {};
  const pendientes = dAnalisis?.pendientes;
  const porTanda = dAnalisis?.por_tanda || 400;
  const correcciones = dCorrecciones?.correcciones || [];
  const cupo = dCorrecciones?.cupo;
  const activas = correcciones.filter(c => c.activa);
  const desalojadas = cupo?.desalojadas || [];
  const contradicciones = cupo?.contradicciones || [];
  const compradores = dCompradores?.compradores || [];

  // Las de conducta no se arreglan con un ejemplo de texto: el botón de
  // corregir sobre una repetición rellenaba el formulario con una frase que
  // estuvo BIEN y le enseñaba al agente a no decirla.
  const fallas = Array.isArray(r.fallas) ? r.fallas : [];
  const fallasContenido = fallas.filter(f => f.tipo !== 'conducta');
  const fallasConducta = fallas.filter(f => f.tipo === 'conducta');

  const rango = analisis && analisis.hasta_mensaje
    ? (analisis.desde_mensaje != null
        ? `del mensaje ${analisis.desde_mensaje + 1} al ${analisis.hasta_mensaje}`
        : `hasta el mensaje ${analisis.hasta_mensaje}`)
    : null;

  return (
    <div className="pb-10">
      {/* ── Informe ─────────────────────────────────────────── */}
      <Grupo
        titulo="Informe de las conversaciones"
        descripcion={
          `Cada corrida lee hasta ${porTanda} mensajes por tanda y arranca donde terminó la anterior. `
          + 'Es lo único del panel que cuesta plata: unos centavos de dólar por tanda.'
        }
        accion={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => analizar.mutate('auto')}
              disabled={analizar.isPending}
              className="text-[14px] font-semibold px-3.5 py-1.5 rounded-full bg-marca-orange/10
                         text-marca-orange hover:bg-marca-orange/20 disabled:opacity-50
                         transition-all active:scale-95"
            >
              {analizar.isPending ? 'Leyendo…' : 'Analizar lo nuevo'}
            </button>
            <button
              type="button"
              onClick={() => analizar.mutate(0)}
              disabled={analizar.isPending}
              title="Vuelve a leer las conversaciones desde la primera. Solo hace falta si se cambió cómo responde el agente."
              className="text-[13px] font-medium px-3 py-1.5 rounded-full text-ios-etiqueta-2
                         hover:bg-black/[0.06] disabled:opacity-50 transition-all active:scale-95"
            >
              Releer todo
            </button>
          </div>
        }
      >
        {cargandoAnalisis && <Fila><p className="text-[14px] text-ios-etiqueta-3">Cargando…</p></Fila>}

        {!cargandoAnalisis && (
          <Fila>
            <p className="text-[14px] text-ios-etiqueta-2 leading-snug">
              Lee las conversaciones y te dice qué le preguntaron a {MARCA.agente} que no supo
              contestar, dónde respondió mal y qué datos convendría cargar. También arma la ficha
              de cada comprador, que es lo que {MARCA.agente} recuerda cuando esa persona vuelve.
            </p>
            <div className="mt-2.5 space-y-1">
              <p className="text-[13px] text-ios-etiqueta-2">
                <strong className="text-ios-etiqueta">Última vez:</strong>{' '}
                {analisis
                  ? `${fecha(analisis.generado_en)} · leyó ${analisis.mensajes_analizados} mensajes${rango ? `, ${rango}` : ''}`
                  : 'nunca se corrió'}
              </p>
              {pendientes != null && (
                <p className={`text-[13px] ${pendientes > 0 ? 'text-ios-ambar font-medium' : 'text-ios-verde'}`}>
                  {pendientes > 0
                    ? `Quedan ${pendientes} mensajes sin leer. Apretando "Analizar lo nuevo" se leen `
                      + `hasta ${porTanda * 3} de una vez; si quedan más, se vuelve a apretar.`
                    : 'Al día: no hay mensajes nuevos sin leer.'}
                </p>
              )}
              {dAnalisis?.modelo && (
                <p className="text-[12px] text-ios-etiqueta-3">Modelo que lo lee: {dAnalisis.modelo}</p>
              )}
            </div>
          </Fila>
        )}

        {r.resumen && (
          <Fila className="bg-black/[0.015]">
            <p className="text-[14px] leading-relaxed">{r.resumen}</p>
          </Fila>
        )}
      </Grupo>

      {/* ── Huecos ──────────────────────────────────────────── */}
      {Array.isArray(r.huecos) && r.huecos.length > 0 && (
        <Grupo
          titulo={`Lo que no supo contestar (${r.huecos.length})`}
          descripcion="Cada uno es un dato que falta cargar, con la pantalla y el campo exactos donde va."
        >
          {r.huecos.map((h, i) => {
            const destino = destinoDe(h);
            return (
              <Fila key={i}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-medium leading-snug">{h.pregunta}</p>
                  <Etiqueta gravedad={h.gravedad} />
                </div>

                {h.veces > 1 && (
                  <p className="text-[13px] text-ios-etiqueta mt-1">
                    <strong>{h.veces} personas distintas</strong> lo preguntaron
                  </p>
                )}

                <div className="mt-2 rounded-[10px] bg-black/[0.03] px-3 py-2.5">
                  <p className="text-[13px] font-semibold text-ios-etiqueta leading-snug">
                    {destino.ruta}
                  </p>
                  <p className="text-[13px] text-ios-etiqueta-2 mt-1 leading-snug">{destino.como}</p>

                  {destino.plantilla && (
                    <>
                      <pre className="text-[12px] text-ios-etiqueta-2 mt-2 whitespace-pre-wrap font-ios leading-snug">
                        {destino.plantilla}
                      </pre>
                      {!h.respuesta_sugerida && (
                        <p className="text-[12px] text-ios-ambar mt-1 leading-snug">
                          La respuesta va vacía a propósito: este dato no aparece en ninguna
                          conversación, así que lo tienes que escribir tú. Nadie lo puede adivinar.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => copiar(destino.plantilla)}
                        className="text-[13px] font-medium text-marca-orange mt-2 hover:underline"
                      >
                        Copiar este borrador
                      </button>
                    </>
                  )}
                </div>
              </Fila>
            );
          })}
        </Grupo>
      )}

      {/* ── Fallas de contenido ─────────────────────────────── */}
      {fallasContenido.length > 0 && (
        <Grupo
          titulo={`Dijo un dato equivocado (${fallasContenido.length})`}
          descripcion="Esto se arregla con una corrección acá abajo, sin tocar código."
        >
          {fallasContenido.map((f, i) => (
            <Fila key={i}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-medium leading-snug">{f.que_paso}</p>
                <Etiqueta gravedad={f.gravedad} />
              </div>
              {f.ejemplo && (
                <p className="text-[13px] text-ios-etiqueta-2 mt-1.5 italic leading-snug">“{f.ejemplo}”</p>
              )}
              <button
                type="button"
                onClick={() => { setDijo(f.ejemplo || ''); setDebioDecir(''); }}
                className="text-[13px] font-medium text-marca-orange mt-2 hover:underline"
              >
                Corregir esta respuesta
              </button>
            </Fila>
          ))}
        </Grupo>
      )}

      {/* ── Fallas de conducta ──────────────────────────────── */}
      {fallasConducta.length > 0 && (
        <Grupo
          titulo={`Cómo se comportó (${fallasConducta.length})`}
          descripcion="Estas no se arreglan enseñándole una frase: se arreglan en el programa. Pásaselas a Fernando."
        >
          {fallasConducta.map((f, i) => (
            <Fila key={i}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-medium leading-snug">{f.que_paso}</p>
                <Etiqueta gravedad={f.gravedad} />
              </div>
              {f.ejemplo && (
                <p className="text-[13px] text-ios-etiqueta-2 mt-1.5 italic leading-snug">“{f.ejemplo}”</p>
              )}
              {/* Antes acá había un botón "Corregir esta respuesta". Sobre una
                  repetición rellenaba el formulario con una frase que estuvo
                  bien y la guardaba como prohibida: el botón que arreglaba el
                  problema degradaba la mejor respuesta que tenía el agente. */}
              <p className="text-[13px] text-ios-etiqueta-3 mt-2 leading-snug">
                Repetir, despedirse antes de hora o contestar dos veces no es un dato equivocado:
                es el programa decidiendo mal cuándo hablar. Una corrección de texto no lo cambia.
              </p>
            </Fila>
          ))}
        </Grupo>
      )}

      {/* ── Corrección nueva ────────────────────────────────── */}
      <Grupo
        titulo="Enseñarle una respuesta"
        descripcion={`Escribe lo que ${MARCA.agente} respondió y lo que tenía que haber respondido. Viaja como ejemplo en cada conversación, así que corrige el estilo sin esperar a nadie.`}
      >
        <CampoLargo
          etiqueta="Lo que respondió"
          value={dijo}
          onChange={(e) => setDijo(e.target.value)}
          filas={3}
          placeholder="Pega acá la respuesta que estuvo mal"
        />
        <CampoLargo
          etiqueta="Lo que tenía que responder"
          value={debioDecir}
          onChange={(e) => setDebioDecir(e.target.value)}
          filas={3}
          placeholder="Escríbela como la dirías tú"
        />
        <CampoLargo
          etiqueta="Por qué estuvo mal (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          filas={2}
          placeholder="Ej: soltó el precio antes de saber si es para vivir o invertir"
        />
        <Fila>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-ios-etiqueta-3">
              {activas.length} {activas.length === 1 ? 'corrección activa' : 'correcciones activas'}
              {cupo && ` · viajan ${cupo.viajan.length} de ${cupo.max} en cada conversación`}
            </p>
            <button
              type="button"
              onClick={() => guardar.mutate({ dijo, debio_decir: debioDecir, nota })}
              disabled={guardar.isPending || !dijo.trim() || !debioDecir.trim()}
              className="bg-marca-orange hover:bg-marca-orange-light disabled:opacity-40
                         text-white text-[14px] font-semibold px-5 py-2 rounded-full
                         transition-all active:scale-95 shrink-0"
            >
              {guardar.isPending ? 'Guardando…' : 'Enseñar'}
            </button>
          </div>
        </Fila>
      </Grupo>

      {/* ── Correcciones cargadas ───────────────────────────── */}
      {correcciones.length > 0 && (
        <Grupo
          titulo="Correcciones"
          descripcion={
            `Solo ${cupo?.max || 6} viajan en cada conversación: son ejemplos, y un manual largo `
            + 'rinde menos que pocos ejemplos buenos. Marca "Ya lo cargué" cuando el dato quede '
            + 'guardado en el proyecto o en las preguntas frecuentes: esa corrección libera su lugar.'
          }
        >
          {/* Dos correcciones diciendo lo contrario sobre el mismo tema es lo
              más caro que puede pasar acá, y nadie podía verlo: el panel las
              lista una debajo de otra sin cruzarlas. Pasó de verdad — una
              decía que no trabajan con Techo Propio y otra que sí, y como al
              agente solo le llegan las más nuevas, estuvo ofreciéndole a
              compradores reales un bono que la inmobiliaria no maneja. */}
          {contradicciones.length > 0 && (
            <Fila className="bg-ios-rojo/[0.06]">
              <p className="text-[14px] font-semibold text-ios-rojo leading-snug">
                {contradicciones.length === 1
                  ? 'Dos correcciones se contradicen'
                  : `Hay ${contradicciones.length} temas con correcciones que se contradicen`}
              </p>
              <p className="text-[13px] text-ios-etiqueta-2 mt-1 leading-snug">
                El agente le hace caso a la más nueva. Mientras no borres una, puede estar
                diciéndole a los compradores lo contrario de lo que tú quieres.
              </p>
              {contradicciones.map((c) => (
                <div key={c.tema} className="mt-2.5">
                  <p className="text-[13px] font-medium text-ios-etiqueta">Sobre {c.tema}:</p>
                  <p className="text-[13px] text-ios-etiqueta-2 mt-1 leading-snug">
                    · “{c.niega}”
                  </p>
                  <p className="text-[13px] text-ios-etiqueta-2 mt-1 leading-snug">
                    · “{c.afirma}”
                  </p>
                </div>
              ))}
              <p className="text-[13px] text-ios-etiqueta-2 mt-2 leading-snug">
                Apaga la que esté mal con el interruptor de su fila.
              </p>
            </Fila>
          )}

          {/* El tope se cruzaba en silencio: con 6 correcciones cargadas y 6
              de cupo, la séptima desalojaba a otra y Pamela veía la fila en
              el panel asumiendo que el agente ya había aprendido. */}
          {desalojadas.length > 0 && (
            <Fila className="bg-ios-rojo/[0.06]">
              <p className="text-[14px] font-semibold text-ios-rojo leading-snug">
                {desalojadas.length === 1
                  ? 'Hay 1 corrección que NO le está llegando al agente'
                  : `Hay ${desalojadas.length} correcciones que NO le están llegando al agente`}
              </p>
              <p className="text-[13px] text-ios-etiqueta-2 mt-1 leading-snug">
                Entran {cupo.max} y tienes {cupo.viajan.length + desalojadas.length} sin resolver.
                Estas quedaron afuera:
              </p>
              <ul className="mt-1.5 space-y-1">
                {desalojadas.map((c) => (
                  <li key={c.id} className="text-[13px] text-ios-etiqueta leading-snug">
                    · {c.debio_decir}
                  </li>
                ))}
              </ul>
              <p className="text-[13px] text-ios-etiqueta-2 mt-1.5 leading-snug">
                Para que vuelvan: marca "Ya lo cargué" en las que ya tengas en el catálogo, o
                aprieta "Que no se caiga" en las que sigan fallando.
              </p>
            </Fila>
          )}

          {correcciones.map((c) => {
            const viaja = cupo ? cupo.viajan.some(v => v.id === c.id) : c.activa;
            return (
              <Fila key={c.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-ios-etiqueta-3 line-through leading-snug">{c.dijo}</p>
                    <p className="text-[14px] leading-snug mt-1">{c.debio_decir}</p>
                    {c.nota && <p className="text-[12px] text-ios-etiqueta-3 mt-1">{c.nota}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {c.activa && (viaja
                        ? <Chip tono="bien">Le llega al agente</Chip>
                        : <Chip tono="falta">No le llega: no hay cupo</Chip>)}
                      {c.resuelta_en_catalogo && <Chip>Ya está en el catálogo</Chip>}
                      {c.fijada && <Chip>Fijada</Chip>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => alternar.mutate({ id: c.id, activa: !c.activa })}
                      className={`text-[12px] font-semibold px-2.5 py-1 rounded-full transition-colors
                        ${c.activa
                          ? 'bg-ios-verde/10 text-ios-verde hover:bg-ios-verde/20'
                          : 'bg-black/[0.06] text-ios-etiqueta-3 hover:bg-black/[0.1]'}`}
                    >
                      {c.activa ? 'Activa' : 'Inactiva'}
                    </button>
                    <button
                      type="button"
                      onClick={() => alternar.mutate({ id: c.id, resuelta_en_catalogo: !c.resuelta_en_catalogo })}
                      title="El dato ya quedó cargado en el proyecto o en las preguntas frecuentes, así que esta corrección deja de ocupar un lugar."
                      className="text-[12px] font-medium px-2.5 py-1 rounded-full text-ios-etiqueta-2
                                 bg-black/[0.04] hover:bg-black/[0.08] transition-colors"
                    >
                      {c.resuelta_en_catalogo ? 'No, todavía no' : 'Ya lo cargué'}
                    </button>
                    <button
                      type="button"
                      onClick={() => alternar.mutate({ id: c.id, fijada: !c.fijada })}
                      title="Esta corrección no se cae del cupo aunque cargues otras más nuevas."
                      className="text-[12px] font-medium px-2.5 py-1 rounded-full text-ios-etiqueta-2
                                 bg-black/[0.04] hover:bg-black/[0.08] transition-colors"
                    >
                      {c.fijada ? 'Dejar que se caiga' : 'Que no se caiga'}
                    </button>
                  </div>
                </div>
              </Fila>
            );
          })}
        </Grupo>
      )}

      {/* ── Compradores ─────────────────────────────────────── */}
      {compradores.length > 0 && (
        <Grupo
          titulo={`Compradores (${compradores.length})`}
          descripcion={
            `Lo que ${MARCA.agente} recuerda de cada persona entre una conversación y otra, y lo que `
            + 'te sirve para volver a escribirle. Lo que dice "falta" es lo que nadie le preguntó todavía.'
          }
        >
          {compradores.map((c) => {
            const faltan = [
              !(c.uso && c.uso !== 'sin_dato') && 'para qué lo quiere',
              !c.presupuesto && 'presupuesto',
              !c.plazo && 'para cuándo',
            ].filter(Boolean);

            return (
              <Fila key={c.numero_telefono}>
                <p className="text-[15px] font-medium">{c.nombre || c.numero_telefono}</p>
                {c.nombre && <p className="text-[12px] text-ios-etiqueta-3">{c.numero_telefono}</p>}

                {c.dato_para_retomar && (
                  <p className="text-[14px] mt-1.5 italic leading-snug">“{c.dato_para_retomar}”</p>
                )}
                {c.resumen && (
                  <p className="text-[14px] text-ios-etiqueta-2 mt-1 leading-snug">{c.resumen}</p>
                )}
                {c.objecion && (
                  <p className="text-[13px] text-ios-etiqueta-2 mt-1 leading-snug">
                    Lo frenó: {c.objecion}
                  </p>
                )}
                {c.telefono_alternativo && (
                  <p className="text-[13px] text-ios-etiqueta-2 mt-1">
                    Otro número que dejó: {c.telefono_alternativo}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {c.uso && c.uso !== 'sin_dato' && <Chip tono="bien">{c.uso.replace(/_/g, ' ')}</Chip>}
                  {c.forma_pago && c.forma_pago !== 'sin_dato' && <Chip tono="bien">{c.forma_pago.replace(/_/g, ' ')}</Chip>}
                  {c.presupuesto && <Chip tono="bien">{c.presupuesto}</Chip>}
                  {c.plazo && <Chip tono="bien">{c.plazo}</Chip>}
                  {c.ya_visito && <Chip tono="bien">Ya visitó</Chip>}
                  {faltan.map((f) => <Chip key={f} tono="falta">falta: {f}</Chip>)}
                </div>
              </Fila>
            );
          })}
        </Grupo>
      )}
    </div>
  );
}
