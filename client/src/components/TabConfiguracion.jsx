import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { obtenerConfiguracion, actualizarConfiguracion } from '../lib/api';
import { MARCA } from '../config/marca';
import { Grupo, Fila, Campo, CampoLargo } from './ui/Grupo';

const DIAS = [
  { n: 1, corto: 'L' }, { n: 2, corto: 'M' }, { n: 3, corto: 'M' },
  { n: 4, corto: 'J' }, { n: 5, corto: 'V' }, { n: 6, corto: 'S' },
  { n: 0, corto: 'D' },
];

const VACIO = {
  nombre_agencia: '', slogan: '', direccion: '', telefono: '',
  email: '', horarios: '', servicios: '', sobre_agencia: '',
  casos_exito: '', redes_sociales: '', preguntas_frecuentes: '', reglas_agente: '',
  email_alertas: '', nombre_agente: '', tipo_negocio: '', estilo_respuesta: '',
  hora_apertura: 9, hora_cierre: 17, minutos_por_slot: 30, dias_atencion: '0,1,2,3,4,5,6',
};

/**
 * Horario de atención.
 *
 * Lo usan el calendario público Y el agente, así que no hay ningún texto
 * suelto que pueda contradecirlo: la frase que ve el comprador sale de estos
 * mismos valores.
 */
function HorarioAtencion({ formulario, setFormulario, manejarCambio }) {
  const seleccionados = String(formulario.dias_atencion || '')
    .split(',').map(d => Number(d)).filter(d => Number.isInteger(d));

  const alternarDia = (n) => {
    const nuevos = seleccionados.includes(n)
      ? seleccionados.filter(d => d !== n)
      : [...seleccionados, n];
    setFormulario(prev => ({ ...prev, dias_atencion: nuevos.sort().join(',') }));
  };

  const hh = (n) => `${String(n).padStart(2, '0')}:00`;
  const turnos = Math.max(0, Math.floor(
    ((formulario.hora_cierre - formulario.hora_apertura) * 60) / (formulario.minutos_por_slot || 30)) + 1);

  const selectClase = `w-full bg-black/[0.04] rounded-[10px] px-3 py-2 text-[15px] text-ios-etiqueta
                       border-0 outline-none focus:ring-2 focus:ring-marca-orange/40 appearance-none`;

  return (
    <>
      <Fila>
        <span className="block text-[13px] font-medium text-ios-etiqueta-2 mb-2">Días que atiende</span>
        <div className="flex gap-1.5">
          {DIAS.map((d, i) => {
            const activo = seleccionados.includes(d.n);
            return (
              <button
                key={i}
                type="button"
                onClick={() => alternarDia(d.n)}
                aria-pressed={activo}
                className={`w-9 h-9 rounded-full text-[14px] font-semibold transition-all duration-150
                  active:scale-90
                  ${activo
                    ? 'bg-marca-orange text-white shadow-sm'
                    : 'bg-black/[0.05] text-ios-etiqueta-3 hover:bg-black/[0.08]'}`}
              >
                {d.corto}
              </button>
            );
          })}
        </div>
      </Fila>

      <Fila>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[12px] font-medium text-ios-etiqueta-2 mb-1.5">Abre</label>
            <select name="hora_apertura" value={formulario.hora_apertura} onChange={manejarCambio} className={selectClase}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{hh(i)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-ios-etiqueta-2 mb-1.5">Cierra</label>
            <select name="hora_cierre" value={formulario.hora_cierre} onChange={manejarCambio} className={selectClase}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{hh(i)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-ios-etiqueta-2 mb-1.5">Cada</label>
            <select name="minutos_por_slot" value={formulario.minutos_por_slot} onChange={manejarCambio} className={selectClase}>
              {[15, 30, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
      </Fila>

      <Fila className="bg-black/[0.015]">
        {seleccionados.length === 0 ? (
          <p className="text-[13px] text-ios-ambar">
            Sin días marcados se atienden todos. Marca al menos uno para restringirlo.
          </p>
        ) : (
          <p className="text-[13px] text-ios-etiqueta-2">
            El comprador va a ver <strong className="text-ios-etiqueta">{turnos}</strong>{' '}
            {turnos === 1 ? 'horario' : 'horarios'} por día, de {hh(formulario.hora_apertura)} a {hh(formulario.hora_cierre)}.
          </p>
        )}
      </Fila>
    </>
  );
}

export default function TabConfiguracion() {
  const queryClient = useQueryClient();
  const [copiado, setCopiado] = useState(false);
  const [formulario, setFormulario] = useState(VACIO);
  const [guardado, setGuardado] = useState(VACIO);

  const { data, isLoading } = useQuery({ queryKey: ['configuracion'], queryFn: obtenerConfiguracion });

  useEffect(() => {
    if (data?.config) {
      const c = data.config;
      const cargado = {
        ...VACIO,
        ...Object.fromEntries(Object.keys(VACIO).map(k => [k, c[k] ?? VACIO[k]])),
        servicios: Array.isArray(c.servicios) ? c.servicios.join(', ') : c.servicios || '',
      };
      setFormulario(cargado);
      setGuardado(cargado);
    }
  }, [data]);

  const mutacion = useMutation({
    mutationFn: actualizarConfiguracion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion'] });
      setGuardado(formulario);
      toast.success('Configuración guardada.');
    },
    onError: (e) => toast.error(`No se pudo guardar: ${e.message}`),
  });

  // Los <select> del horario devuelven strings; se guardan como números para
  // que la vista previa no dependa de la coerción implícita de JavaScript.
  const NUMERICOS = ['hora_apertura', 'hora_cierre', 'minutos_por_slot'];

  const manejarCambio = (e) => {
    const { name, value } = e.target;
    setFormulario(prev => ({ ...prev, [name]: NUMERICOS.includes(name) ? Number(value) : value }));
  };

  // Antes cada sección tenía su propio botón "Guardar X", pero todos mandaban
  // el formulario entero: el que decía "Guardar Reglas" guardaba también el
  // horario. Ahora hay un solo guardado y aparece únicamente cuando de verdad
  // cambió algo, así el botón nunca promete un alcance que no tiene.
  const hayCambios = useMemo(
    () => Object.keys(VACIO).some(k => String(formulario[k] ?? '') !== String(guardado[k] ?? '')),
    [formulario, guardado],
  );

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const webhookURL = isLocal
    ? 'http://localhost:3001/api/webhook/whatsapp'
    : `${window.location.origin}/api/webhook/whatsapp`;

  function copiarWebhook() {
    navigator.clipboard.writeText(webhookURL).then(() => {
      setCopiado(true);
      toast.success('URL copiada');
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-ios-etiqueta-3">
        <div className="w-5 h-5 border-2 border-marca-orange border-t-transparent rounded-full animate-spin" />
        <span className="text-[15px]">Cargando…</span>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <Grupo
        titulo="Identidad"
        descripcion={`Así se presenta ${MARCA.agente} al iniciar cada conversación.`}
      >
        <Campo etiqueta="Nombre de la empresa" name="nombre_agencia" value={formulario.nombre_agencia}
          onChange={manejarCambio} placeholder="Nombre comercial" />
        <Campo etiqueta="Slogan o descriptor" name="slogan" value={formulario.slogan}
          onChange={manejarCambio} placeholder="Ej: Asesora Inmobiliaria" />
        <Campo etiqueta="Nombre del agente" name="nombre_agente" value={formulario.nombre_agente}
          onChange={manejarCambio} placeholder="Ej: Camila"
          pista="Si lo dejas vacío se presenta como “la asesora virtual”." />
        <Campo etiqueta="Rubro (cómo se presenta)" name="tipo_negocio" value={formulario.tipo_negocio}
          onChange={manejarCambio} placeholder="Ej: asesora inmobiliaria en Ica" />
      </Grupo>

      <Grupo
        titulo="Contacto"
        descripcion="Lo que dejes vacío, el agente no lo inventa: deriva al asesor."
      >
        <Campo etiqueta="Dirección" name="direccion" value={formulario.direccion}
          onChange={manejarCambio} placeholder="Av. Principal 123, Ica" />
        <Campo etiqueta="Teléfono" name="telefono" value={formulario.telefono}
          onChange={manejarCambio} placeholder="+51 999 999 999" />
        <Campo etiqueta="Email" name="email" type="email" value={formulario.email}
          onChange={manejarCambio} placeholder="contacto@empresa.com" />
        <Campo etiqueta="Redes sociales" name="redes_sociales" value={formulario.redes_sociales}
          onChange={manejarCambio} placeholder="Instagram: @tuempresa" />
      </Grupo>

      <Grupo
        titulo="Horario de visitas"
        descripcion="Define qué días y horas ofrece el calendario que el agente le manda al comprador."
      >
        <HorarioAtencion formulario={formulario} setFormulario={setFormulario} manejarCambio={manejarCambio} />
      </Grupo>

      <Grupo
        titulo="Qué sabe el agente"
        descripcion="Cuanto más completo esté esto, menos deriva al asesor."
      >
        <Campo etiqueta="Servicios" name="servicios" value={formulario.servicios}
          onChange={manejarCambio} placeholder="Venta de lotes, Asesoría de inversión"
          pista="Sepáralos con comas." />
        <CampoLargo etiqueta="Sobre la empresa" name="sobre_agencia" value={formulario.sobre_agencia}
          onChange={manejarCambio} filas={3}
          placeholder="Quiénes son, cuántos años llevan, qué los diferencia." />
        <CampoLargo etiqueta="Respaldo y logros" name="casos_exito" value={formulario.casos_exito}
          onChange={manejarCambio} filas={3}
          placeholder={'Datos concretos que puede mencionar:\n• X familias ya viviendo en tus proyectos\n• Lotes con partida registral en SUNARP'} />
        <CampoLargo etiqueta="Preguntas frecuentes" name="preguntas_frecuentes" value={formulario.preguntas_frecuentes}
          onChange={manejarCambio} filas={6}
          placeholder={'P: ¿Los lotes tienen título de propiedad?\nR: Sí, cada lote se entrega con partida registral independiente.'} />
      </Grupo>

      <Grupo
        titulo="Reglas"
        descripcion="Tienen prioridad máxima sobre todo lo demás. Una por línea."
      >
        <CampoLargo name="reglas_agente" value={formulario.reglas_agente} onChange={manejarCambio} filas={7}
          placeholder={'- Solo hablar de nuestros proyectos. Si preguntan otro tema, redirigir con amabilidad.\n- NUNCA inventar precios ni condiciones de financiamiento.\n- El objetivo de cada conversación es agendar una visita.'} />
      </Grupo>

      <Grupo
        titulo="Estilo de las respuestas"
        descripcion="WhatsApp solo entiende *negrita*, _cursiva_ y ~tachado~. No hay títulos, tablas ni colores."
      >
        <CampoLargo name="estilo_respuesta" value={formulario.estilo_respuesta} onChange={manejarCambio} filas={5}
          placeholder={`Por defecto ${MARCA.agente} separa los datos en líneas, usa *negrita* para nombres y precios, y un emoji por dato.\n\nEscribe acá solo lo que quieras CAMBIAR. Por ejemplo:\n- Sin emojis, solo negritas.\n- Mensajes más cortos, máximo 60 palabras.`} />
      </Grupo>

      <Grupo
        titulo="Aviso por correo"
        descripcion="Cada vez que se agende una visita llega un correo con los datos del cliente."
      >
        <Campo etiqueta="Destinatarios" name="email_alertas" value={formulario.email_alertas}
          onChange={manejarCambio} placeholder="tu@correo.com, otro@correo.com"
          pista="Sepáralos con comas. Vacío desactiva el aviso." />
      </Grupo>

      <Grupo
        titulo="Conexión con WhatsApp"
        descripcion="Esto se configura una sola vez, al conectar el número."
      >
        <Fila>
          <label className="block text-[13px] font-medium text-ios-etiqueta-2 mb-2">URL del webhook</label>
          <div className="flex gap-2 items-center">
            <code className="flex-1 min-w-0 bg-black/[0.04] rounded-[10px] px-3 py-2.5 text-[13px]
                             text-ios-etiqueta-2 break-all font-mono">
              {webhookURL}
            </code>
            <button
              onClick={copiarWebhook}
              className={`shrink-0 px-4 py-2.5 rounded-full text-[14px] font-semibold transition-all
                active:scale-95 ${copiado
                  ? 'bg-ios-verde/10 text-ios-verde'
                  : 'bg-marca-orange/10 text-marca-orange hover:bg-marca-orange/20'}`}
            >
              {copiado ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-[12px] text-ios-etiqueta-3 mt-2">
            En Twilio va en el remitente de WhatsApp, campo “When a message comes in”, método POST.
          </p>
        </Fila>
      </Grupo>

      {/* Barra de guardado: aparece solo cuando hay algo sin guardar.
          Flota sobre el contenido para que no haya que buscar el botón
          después de editar algo al final de la página. */}
      <div
        className={`fixed inset-x-0 bottom-0 md:bottom-6 z-40 flex justify-center px-4
          pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-0
          transition-all duration-300 ${hayCambios ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0 pointer-events-none'}`}
      >
        <div className="flex items-center gap-3 bg-ios-etiqueta/95 backdrop-blur-xl text-white
                        rounded-full shadow-flotante pl-5 pr-2 py-2">
          <span className="text-[14px] font-medium">Cambios sin guardar</span>
          <button
            onClick={() => setFormulario(guardado)}
            className="text-[14px] text-white/60 hover:text-white px-2 transition-colors"
          >
            Descartar
          </button>
          <button
            onClick={() => mutacion.mutate(formulario)}
            disabled={mutacion.isPending}
            className="bg-marca-orange hover:bg-marca-orange-light disabled:opacity-60
                       text-white text-[14px] font-semibold px-5 py-2 rounded-full
                       transition-all active:scale-95"
          >
            {mutacion.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
