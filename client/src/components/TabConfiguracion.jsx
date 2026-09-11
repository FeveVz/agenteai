import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { obtenerConfiguracion, actualizarConfiguracion } from '../lib/api';
import { MARCA } from '../config/marca';

function InputField({ label, name, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type} name={name} value={value || ''} onChange={onChange} placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ceinys-orange focus:border-transparent transition-all"
      />
    </div>
  );
}

function TextareaField({ label, name, value, onChange, placeholder, rows = 3 }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <textarea
        name={name} value={value || ''} onChange={onChange} placeholder={placeholder} rows={rows}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ceinys-orange focus:border-transparent transition-all resize-none"
      />
    </div>
  );
}

const DIAS = [
  { n: 1, corto: 'Lun' }, { n: 2, corto: 'Mar' }, { n: 3, corto: 'Mié' },
  { n: 4, corto: 'Jue' }, { n: 5, corto: 'Vie' }, { n: 6, corto: 'Sáb' },
  { n: 0, corto: 'Dom' },
];

/**
 * Horario de atención.
 *
 * Es lo que usan el calendario público Y el agente, así que no hay un texto
 * suelto que pueda contradecirlo: la frase que ve el cliente se deriva de
 * estos mismos valores.
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
  const turnos = Math.max(0, Math.floor(((formulario.hora_cierre - formulario.hora_apertura) * 60) / (formulario.minutos_por_slot || 30)) + 1);

  return (
    <div className="space-y-3 border border-gray-200 rounded-xl p-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Horario de visitas</label>
        <p className="text-xs text-gray-400 mt-0.5">
          Define qué días y horas ofrece el calendario que el agente le manda al cliente.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DIAS.map(d => (
          <button
            key={d.n}
            type="button"
            onClick={() => alternarDia(d.n)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              seleccionados.includes(d.n)
                ? 'bg-ceinys-orange text-white border-ceinys-orange'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            {d.corto}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">Abre</label>
          <select name="hora_apertura" value={formulario.hora_apertura} onChange={manejarCambio}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ceinys-orange">
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{hh(i)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">Cierra</label>
          <select name="hora_cierre" value={formulario.hora_cierre} onChange={manejarCambio}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ceinys-orange">
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{hh(i)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">Cada</label>
          <select name="minutos_por_slot" value={formulario.minutos_por_slot} onChange={manejarCambio}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ceinys-orange">
            {[15, 30, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
      </div>

      {seleccionados.length === 0 ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Sin días marcados se atienden todos. Marca al menos uno para restringirlo.
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          El cliente verá <strong>{turnos}</strong> {turnos === 1 ? 'horario' : 'horarios'} por día,
          de {hh(formulario.hora_apertura)} a {hh(formulario.hora_cierre)}.
        </p>
      )}
    </div>
  );
}

export default function TabConfiguracion() {
  const queryClient = useQueryClient();
  const [copiado, setCopiado] = useState(false);
  const [formulario, setFormulario] = useState({
    nombre_agencia: '', slogan: '', direccion: '', telefono: '',
    email: '', horarios: '', servicios: '', sobre_agencia: '',
    casos_exito: '', redes_sociales: '', preguntas_frecuentes: '', reglas_agente: '',
    email_alertas: '',
    nombre_agente: '', tipo_negocio: '',
    hora_apertura: 9, hora_cierre: 17, minutos_por_slot: 30, dias_atencion: '0,1,2,3,4,5,6',
  });

  const { data, isLoading } = useQuery({ queryKey: ['configuracion'], queryFn: obtenerConfiguracion });

  useEffect(() => {
    if (data?.config) {
      const c = data.config;
      setFormulario({
        nombre_agencia: c.nombre_agencia || '',
        slogan: c.slogan || '',
        direccion: c.direccion || '',
        telefono: c.telefono || '',
        email: c.email || '',
        horarios: c.horarios || '',
        servicios: Array.isArray(c.servicios) ? c.servicios.join(', ') : c.servicios || '',
        sobre_agencia: c.sobre_agencia || '',
        casos_exito: c.casos_exito || '',
        redes_sociales: c.redes_sociales || '',
        preguntas_frecuentes: c.preguntas_frecuentes || '',
        reglas_agente: c.reglas_agente || '',
        email_alertas: c.email_alertas || '',
        nombre_agente: c.nombre_agente || '',
        tipo_negocio: c.tipo_negocio || '',
        hora_apertura: c.hora_apertura ?? 9,
        hora_cierre: c.hora_cierre ?? 17,
        minutos_por_slot: c.minutos_por_slot ?? 30,
        dias_atencion: c.dias_atencion ?? '0,1,2,3,4,5,6',
      });
    }
  }, [data]);

  const mutacion = useMutation({
    mutationFn: actualizarConfiguracion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion'] });
      toast.success('Configuración guardada correctamente.');
    },
    onError: (e) => toast.error(`Error al guardar: ${e.message}`),
  });

  // Los <select> del horario devuelven strings; se guardan como números para
  // que la vista previa no dependa de la coerción implícita de JavaScript.
  const NUMERICOS = ['hora_apertura', 'hora_cierre', 'minutos_por_slot'];

  const manejarCambio = (e) => {
    const { name, value } = e.target;
    setFormulario(prev => ({ ...prev, [name]: NUMERICOS.includes(name) ? Number(value) : value }));
  };

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const webhookURL = isLocal
    ? 'http://localhost:3001/api/webhook/whatsapp'
    : `${window.location.origin}/api/webhook/whatsapp`;

  function copiarWebhook() {
    navigator.clipboard.writeText(webhookURL).then(() => {
      setCopiado(true);
      toast.success('URL copiada al portapapeles');
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
        <div className="w-6 h-6 border-2 border-ceinys-orange border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Cargando configuración...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* URL del Webhook */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-black">
          <h2 className="text-base font-bold text-white">URL del Webhook de Twilio</h2>
          <p className="text-xs text-gray-500 mt-0.5">Pega esta URL en la configuración de Twilio WhatsApp.</p>
        </div>
        <div className="p-6">
          <div className="flex gap-3 items-center mb-6">
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 break-all font-mono">
              {webhookURL}
            </code>
            <button
              onClick={copiarWebhook}
              className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                copiado ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-black hover:bg-gray-800 text-white'
              }`}
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              Cómo configurar Twilio WhatsApp
            </h3>
            <ol className="space-y-2.5 text-sm text-gray-600">
              {[
                'Ingresa a Twilio Console → Messaging → WhatsApp Sandbox',
                'Pega la URL del webhook en "When a message comes in"',
                'Selecciona el método HTTP POST',
                'Guarda y prueba enviando un WhatsApp al número del sandbox',
              ].map((paso, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <span>{paso}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                <strong>Para desarrollo local:</strong> usa <code className="bg-gray-200 px-1.5 py-0.5 rounded font-mono">ngrok http 3001</code> para exponer el servidor.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Reglas fundamentales del agente */}
      <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-orange-100 bg-black">
          <h2 className="text-base font-bold text-white">Reglas fundamentales de Valeria</h2>
          <p className="text-xs text-gray-400 mt-0.5">Estas reglas tienen prioridad máxima — definen qué puede y qué no puede hacer Valeria.</p>
        </div>
        <div className="p-6">
          <TextareaField
            label=""
            name="reglas_agente"
            value={formulario.reglas_agente}
            onChange={manejarCambio}
            placeholder={`Ejemplos de reglas que puedes definir:\n- Solo hablar de nuestros proyectos inmobiliarios. Si preguntan otro tema, redirigir con amabilidad.\n- NUNCA inventar precios, metrajes ni condiciones de financiamiento. Si el dato no está cargado, derivar a un asesor.\n- El objetivo de cada conversación es agendar una visita al proyecto.\n- Nunca prometer separación, descuento ni reserva de lote.\n- No hablar negativamente de otras inmobiliarias.`}
            rows={7}
          />
          <p className="text-xs text-gray-400 mt-3">
            Escribe una regla por línea. Puedes ser tan específico como necesites — Valeria las va a respetar en cada conversación.
          </p>
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => mutacion.mutate(formulario)}
              disabled={mutacion.isPending}
              className="bg-black hover:bg-gray-900 disabled:bg-gray-400 text-white font-bold px-6 py-2.5 rounded-xl transition-all duration-200 text-sm"
            >
              {mutacion.isPending ? 'Guardando...' : 'Guardar Reglas'}
            </button>
          </div>
        </div>
      </div>

      {/* Alertas por correo */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-black">
          <h2 className="text-base font-bold text-white">Aviso por correo al agendarse una visita</h2>
          <p className="text-xs text-gray-500 mt-0.5">Cada vez que Valeria agende una visita, se envía un correo con los datos del cliente.</p>
        </div>
        <div className="p-6">
          <InputField
            label="Destinatarios (separados por coma)"
            name="email_alertas"
            value={formulario.email_alertas}
            onChange={manejarCambio}
            placeholder="ventas@tuempresa.pe, asesor@tuempresa.pe"
          />
          <p className="text-xs text-gray-400 mt-3">
            Puedes poner varios para que le llegue a todo el equipo comercial. Si lo dejas vacío, no se envía
            ningún correo y el agendamiento funciona igual.
          </p>
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => mutacion.mutate(formulario)}
              disabled={mutacion.isPending}
              className="bg-black hover:bg-gray-900 disabled:bg-gray-400 text-white font-bold px-6 py-2.5 rounded-xl transition-all duration-200 text-sm"
            >
              {mutacion.isPending ? 'Guardando...' : 'Guardar Destinatarios'}
            </button>
          </div>
        </div>
      </div>

      {/* Formulario de configuración */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-black">
          <h2 className="text-base font-bold text-white">{MARCA.nombre ? `Datos de ${MARCA.nombre}` : "Datos de la empresa"}</h2>
          <p className="text-xs text-gray-500 mt-0.5">Valeria usa esta información para responder a los interesados. Lo que dejes vacío, no lo inventa: deriva al asesor.</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); mutacion.mutate(formulario); }} className="p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-5">
            <InputField label="Nombre de la empresa" name="nombre_agencia" value={formulario.nombre_agencia} onChange={manejarCambio} placeholder="Nombre comercial" />
            <InputField label="Slogan / descriptor" name="slogan" value={formulario.slogan} onChange={manejarCambio} placeholder="Constructora e Inmobiliaria" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <InputField label="Nombre del agente" name="nombre_agente" value={formulario.nombre_agente} onChange={manejarCambio} placeholder="Valeria" />
            <InputField label="Rubro (como se presenta)" name="tipo_negocio" value={formulario.tipo_negocio} onChange={manejarCambio} placeholder="asesora inmobiliaria en Ica" />
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <InputField label="Teléfono / WhatsApp" name="telefono" value={formulario.telefono} onChange={manejarCambio} placeholder="+51 ..." type="tel" />
            <InputField label="Email" name="email" value={formulario.email} onChange={manejarCambio} placeholder="ventas@tuempresa.pe" type="email" />
          </div>
          <InputField label="Dirección de la oficina" name="direccion" value={formulario.direccion} onChange={manejarCambio} placeholder="Av. ..., distrito, ciudad" />
          <HorarioAtencion formulario={formulario} setFormulario={setFormulario} manejarCambio={manejarCambio} />

          <TextareaField label="Nota sobre horarios (texto libre para el FAQ)" name="horarios" value={formulario.horarios} onChange={manejarCambio} placeholder="Ofrecemos movilidad desde puntos céntricos." rows={2} />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Qué ofrecemos (separado por coma)</label>
            <textarea
              name="servicios" value={formulario.servicios} onChange={manejarCambio} rows={2}
              placeholder="Venta de lotes, Venta de viviendas, Financiamiento directo, Asesoría de inversión inmobiliaria..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ceinys-orange transition-all resize-none"
            />
          </div>
          <TextareaField label="Sobre la empresa" name="sobre_agencia" value={formulario.sobre_agencia} onChange={manejarCambio} placeholder="Años en el mercado, respaldo legal, cuántas familias ya compraron..." rows={4} />
          <TextareaField
            label="Respaldo y logros"
            name="casos_exito"
            value={formulario.casos_exito}
            onChange={manejarCambio}
            placeholder={`Datos concretos que Valeria puede mencionar:\n• X familias ya viviendo en Altos de Sacta\n• Todos los lotes con partida registral independiente en SUNARP\n• X años desarrollando proyectos en la región`}
            rows={5}
          />
          <InputField label="Redes sociales" name="redes_sociales" value={formulario.redes_sociales} onChange={manejarCambio} placeholder="Instagram: @tuempresa | Facebook: facebook.com/tuempresa" />
          <TextareaField
            label="Preguntas frecuentes (FAQ)"
            name="preguntas_frecuentes"
            value={formulario.preguntas_frecuentes}
            onChange={manejarCambio}
            placeholder={`Preguntas y respuestas que Valeria debe saber:\nP: ¿Los lotes tienen título de propiedad?\nR: Sí, cada lote se entrega con partida registral independiente en SUNARP.\n\nP: ¿Puedo pagar en cuotas?\nR: Sí, tenemos financiamiento directo. Un asesor te arma el plan en la visita.`}
            rows={7}
          />

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={mutacion.isPending}
              className="bg-black hover:bg-gray-900 disabled:bg-gray-400 text-white font-bold px-8 py-3 rounded-xl transition-all duration-200 flex items-center gap-2"
            >
              {mutacion.isPending ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</>
              ) : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
