import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { obtenerConfiguracion, actualizarConfiguracion } from '../lib/api';

function InputField({ label, name, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type} name={name} value={value || ''} onChange={onChange} placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
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
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all resize-none"
      />
    </div>
  );
}

export default function TabConfiguracion() {
  const queryClient = useQueryClient();
  const [copiado, setCopiado] = useState(false);
  const [formulario, setFormulario] = useState({
    nombre_agencia: '', slogan: '', direccion: '', telefono: '',
    email: '', horarios: '', servicios: '', sobre_agencia: '',
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

  const manejarCambio = (e) => {
    const { name, value } = e.target;
    setFormulario(prev => ({ ...prev, [name]: value }));
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
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
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
          <p className="text-xs text-gray-500 mt-0.5">Pegá esta URL en la configuración de Twilio WhatsApp.</p>
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
                'Ingresá a Twilio Console → Messaging → WhatsApp Sandbox',
                'Pegá la URL del webhook en "When a message comes in"',
                'Seleccioná el método HTTP POST',
                'Guardá y probá enviando un WhatsApp al número del sandbox',
              ].map((paso, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <span>{paso}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                <strong>Para desarrollo local:</strong> usá <code className="bg-gray-200 px-1.5 py-0.5 rounded font-mono">ngrok http 3001</code> para exponer el servidor.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Formulario de configuración */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-black">
          <h2 className="text-base font-bold text-white">Datos de Suggestion</h2>
          <p className="text-xs text-gray-500 mt-0.5">Valeria usa esta información para responder consultas de los prospectos.</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); mutacion.mutate(formulario); }} className="p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-5">
            <InputField label="Nombre de la agencia" name="nombre_agencia" value={formulario.nombre_agencia} onChange={manejarCambio} placeholder="Suggestion" />
            <InputField label="Slogan" name="slogan" value={formulario.slogan} onChange={manejarCambio} placeholder="Consigue lo posible haciendo lo imposible" />
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <InputField label="Teléfono / WhatsApp" name="telefono" value={formulario.telefono} onChange={manejarCambio} placeholder="+51 937770159" type="tel" />
            <InputField label="Email" name="email" value={formulario.email} onChange={manejarCambio} placeholder="suggesion.mk@gmail.com" type="email" />
          </div>
          <InputField label="Dirección" name="direccion" value={formulario.direccion} onChange={manejarCambio} placeholder="Residencial Jardin C4, Urb San Jose, Perú" />
          <TextareaField label="Horarios de atención" name="horarios" value={formulario.horarios} onChange={manejarCambio} placeholder="Lunes a Viernes: 9:00 - 18:00 hs&#10;Sábados: 9:00 - 13:00 hs" rows={2} />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Servicios (separados por coma)</label>
            <textarea
              name="servicios" value={formulario.servicios} onChange={manejarCambio} rows={2}
              placeholder="Marketing Digital, Redes Sociales, Meta Ads, SEO, Branding..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all resize-none"
            />
          </div>
          <TextareaField label="Sobre la agencia" name="sobre_agencia" value={formulario.sobre_agencia} onChange={manejarCambio} placeholder="Descripción de Suggestion, logros, clientes..." rows={4} />

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
