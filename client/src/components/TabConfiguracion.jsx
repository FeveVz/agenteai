import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { obtenerConfiguracion, actualizarConfiguracion } from '../lib/api';

function InputField({ label, name, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        name={name}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
      />
    </div>
  );
}

function TextareaField({ label, name, value, onChange, placeholder, rows = 3 }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <textarea
        name={name}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
      />
    </div>
  );
}

export default function TabConfiguracion() {
  const queryClient = useQueryClient();
  const [copiado, setCopiado] = useState(false);
  const [formulario, setFormulario] = useState({
    nombre_clinica: '',
    direccion: '',
    telefono: '',
    email: '',
    horarios: '',
    servicios: '',
    sobre_clinica: '',
  });

  // Cargar configuración actual
  const { data, isLoading } = useQuery({
    queryKey: ['configuracion'],
    queryFn: obtenerConfiguracion,
  });

  // Sincronizar formulario cuando cargan los datos
  useEffect(() => {
    if (data?.config) {
      const config = data.config;
      setFormulario({
        nombre_clinica: config.nombre_clinica || '',
        direccion: config.direccion || '',
        telefono: config.telefono || '',
        email: config.email || '',
        horarios: config.horarios || '',
        // Convertir array de servicios a string separado por comas
        servicios: Array.isArray(config.servicios)
          ? config.servicios.join(', ')
          : config.servicios || '',
        sobre_clinica: config.sobre_clinica || '',
      });
    }
  }, [data]);

  // Mutación para guardar
  const mutacion = useMutation({
    mutationFn: actualizarConfiguracion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracion'] });
      toast.success('Configuración guardada correctamente. ✅');
    },
    onError: (error) => {
      toast.error(`Error al guardar: ${error.message}`);
    },
  });

  function manejarCambio(e) {
    const { name, value } = e.target;
    setFormulario((prev) => ({ ...prev, [name]: value }));
  }

  function manejarEnvio(e) {
    e.preventDefault();
    mutacion.mutate(formulario);
  }

  // En producción (Vercel) no hay puerto; en local usamos 3001
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const webhookURL = isLocal
    ? `http://localhost:3001/api/webhook/whatsapp`
    : `${window.location.origin}/api/webhook/whatsapp`;

  function copiarWebhook() {
    navigator.clipboard.writeText(webhookURL).then(() => {
      setCopiado(true);
      toast.success('URL del webhook copiada al portapapeles');
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Cargando configuración...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Card: URL del Webhook ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-base font-semibold text-slate-800">🔗 URL del Webhook de Twilio</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Copiá esta URL y pegala en la configuración de Twilio WhatsApp.
          </p>
        </div>
        <div className="p-6">
          {/* URL display */}
          <div className="flex gap-3 items-center mb-6">
            <code className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 break-all font-mono">
              {webhookURL}
            </code>
            <button
              onClick={copiarWebhook}
              className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                copiado
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {copiado ? '✅ Copiado' : '📋 Copiar'}
            </button>
          </div>

          {/* Instrucciones paso a paso */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
            <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
              <span>📱</span> Cómo configurar Twilio WhatsApp
            </h3>
            <ol className="space-y-2.5 text-sm text-blue-700">
              <li className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span>Ingresá a <strong>Twilio Console</strong> → Messaging → WhatsApp Sandbox</span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span>Pegá la URL del webhook en el campo <strong>"When a message comes in"</strong></span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span>Seleccioná el método <strong>HTTP POST</strong></span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                <span>Hacé click en <strong>Save</strong> y probá enviando un mensaje de WhatsApp</span>
              </li>
            </ol>

            <div className="mt-4 pt-4 border-t border-blue-200">
              <p className="text-xs text-blue-600">
                💡 <strong>Tip:</strong> Para exponer tu servidor local a internet podés usar{' '}
                <strong>ngrok</strong>: ejecutá <code className="bg-blue-100 px-1.5 py-0.5 rounded">ngrok http 3001</code>{' '}
                y usá la URL HTTPS que genera.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card: Formulario de configuración ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-base font-semibold text-slate-800">⚙️ Datos de la Clínica</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Esta información la usa Sarah para responder consultas de los pacientes.
          </p>
        </div>

        <form onSubmit={manejarEnvio} className="p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-5">
            <InputField
              label="Nombre de la clínica"
              name="nombre_clinica"
              value={formulario.nombre_clinica}
              onChange={manejarCambio}
              placeholder="Ej: Clínica Dental Sonrisa"
            />
            <InputField
              label="Teléfono"
              name="telefono"
              value={formulario.telefono}
              onChange={manejarCambio}
              placeholder="Ej: +54 11 4567-8900"
              type="tel"
            />
          </div>

          <InputField
            label="Dirección"
            name="direccion"
            value={formulario.direccion}
            onChange={manejarCambio}
            placeholder="Ej: Av. Corrientes 1234, Buenos Aires"
          />

          <InputField
            label="Email"
            name="email"
            value={formulario.email}
            onChange={manejarCambio}
            placeholder="Ej: turnos@clinicasonrisa.com.ar"
            type="email"
          />

          <TextareaField
            label="Horarios de atención"
            name="horarios"
            value={formulario.horarios}
            onChange={manejarCambio}
            placeholder="Ej: Lunes a Viernes: 9:00 - 18:00 hs&#10;Sábados: 9:00 - 13:00 hs"
            rows={3}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Servicios disponibles
            </label>
            <textarea
              name="servicios"
              value={formulario.servicios}
              onChange={manejarCambio}
              placeholder="Ej: Limpieza dental, Ortodoncia, Implantes, Blanqueamiento"
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
            />
            <p className="text-xs text-slate-400">Separalos con comas.</p>
          </div>

          <TextareaField
            label="Sobre la clínica"
            name="sobre_clinica"
            value={formulario.sobre_clinica}
            onChange={manejarCambio}
            placeholder="Breve descripción de la clínica, especialidades, años de experiencia..."
            rows={4}
          />

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={mutacion.isPending}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium px-8 py-3 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-sm"
            >
              {mutacion.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar Cambios'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
