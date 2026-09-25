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

function fecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
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

  const analizar = useMutation({
    mutationFn: () => analizarConversaciones(0),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['analisis'] });
      queryClient.invalidateQueries({ queryKey: ['compradores'] });
      toast.success(r.sinDatos ? r.mensaje : `Analicé ${r.mensajes_analizados} mensajes.`);
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
  const correcciones = dCorrecciones?.correcciones || [];
  const activas = correcciones.filter(c => c.activa);
  const compradores = dCompradores?.compradores || [];

  return (
    <div className="pb-10">
      {/* ── Informe ─────────────────────────────────────────── */}
      <Grupo
        titulo="Informe de las conversaciones"
        descripcion={
          analisis
            ? `Último análisis: ${fecha(analisis.generado_en)} · ${analisis.mensajes_analizados} mensajes.`
            : 'Todavía no se corrió ninguno.'
        }
        accion={
          <button
            type="button"
            onClick={() => analizar.mutate()}
            disabled={analizar.isPending}
            className="text-[14px] font-semibold px-3.5 py-1.5 rounded-full bg-marca-orange/10
                       text-marca-orange hover:bg-marca-orange/20 disabled:opacity-50
                       transition-all active:scale-95"
          >
            {analizar.isPending ? 'Analizando…' : 'Analizar ahora'}
          </button>
        }
      >
        {cargandoAnalisis && <Fila><p className="text-[14px] text-ios-etiqueta-3">Cargando…</p></Fila>}

        {!cargandoAnalisis && !analisis && (
          <Fila>
            <p className="text-[14px] text-ios-etiqueta-2 leading-snug">
              Lee todas las conversaciones y te dice qué le preguntaron a {MARCA.agente} que no supo
              contestar, dónde respondió mal y qué datos convendría cargar.
            </p>
            <p className="text-[13px] text-ios-etiqueta-3 mt-2">
              Cuesta unos centavos por corrida, así que se dispara a mano y no sola.
            </p>
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
          descripcion="Cada uno es un dato que falta cargar. Son las respuestas que perdieron una venta."
        >
          {r.huecos.map((h, i) => (
            <Fila key={i}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-medium leading-snug">{h.pregunta}</p>
                <Etiqueta gravedad={h.gravedad} />
              </div>
              <p className="text-[13px] text-ios-etiqueta-2 mt-1">
                {h.veces > 1 && <strong className="text-ios-etiqueta">{h.veces} personas · </strong>}
                Cargar en: {h.donde}
              </p>
            </Fila>
          ))}
        </Grupo>
      )}

      {/* ── Fallas ──────────────────────────────────────────── */}
      {Array.isArray(r.fallas) && r.fallas.length > 0 && (
        <Grupo
          titulo={`Dónde respondió mal (${r.fallas.length})`}
          descripcion="Esto se arregla con una corrección acá abajo, sin tocar código."
        >
          {r.fallas.map((f, i) => (
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
          placeholder="Escríbela como la diría tú"
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
              {activas.length > 6 && ' · solo las 6 más nuevas viajan en el prompt'}
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
          descripcion="Desactiva una si dejó de aplicar. No se borran: sirve ver qué se probó."
        >
          {correcciones.map((c) => (
            <Fila key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-ios-etiqueta-3 line-through leading-snug">{c.dijo}</p>
                  <p className="text-[14px] leading-snug mt-1">{c.debio_decir}</p>
                  {c.nota && <p className="text-[12px] text-ios-etiqueta-3 mt-1">{c.nota}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => alternar.mutate({ id: c.id, activa: !c.activa })}
                  className={`text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0 transition-colors
                    ${c.activa
                      ? 'bg-ios-verde/10 text-ios-verde hover:bg-ios-verde/20'
                      : 'bg-black/[0.06] text-ios-etiqueta-3 hover:bg-black/[0.1]'}`}
                >
                  {c.activa ? 'Activa' : 'Inactiva'}
                </button>
              </div>
            </Fila>
          ))}
        </Grupo>
      )}

      {/* ── Compradores ─────────────────────────────────────── */}
      {compradores.length > 0 && (
        <Grupo
          titulo={`Compradores (${compradores.length})`}
          descripcion={`Lo que ${MARCA.agente} recuerda de cada persona entre una conversación y otra. Lo completa el análisis.`}
        >
          {compradores.map((c) => (
            <Fila key={c.numero_telefono}>
              <p className="text-[15px] font-medium">{c.nombre || c.numero_telefono}</p>
              {c.nombre && <p className="text-[12px] text-ios-etiqueta-3">{c.numero_telefono}</p>}
              <p className="text-[14px] text-ios-etiqueta-2 mt-1 leading-snug">{c.resumen}</p>
            </Fila>
          ))}
        </Grupo>
      )}
    </div>
  );
}
