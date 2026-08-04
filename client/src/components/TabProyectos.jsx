import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { obtenerProyectos, actualizarProyecto, crearProyecto } from '../lib/api';

// Campos que Valeria puede citar. Si están todos vacíos, deriva al asesor.
const CAMPOS_DE_DATO = ['ubicacion', 'tipo', 'descripcion', 'precio_desde', 'area_desde', 'caracteristicas', 'financiamiento', 'estado_comercial', 'entrega_titulo'];

function tieneDatos(proyecto) {
  return CAMPOS_DE_DATO.some(c => proyecto[c] && String(proyecto[c]).trim());
}

function Campo({ label, name, value, onChange, placeholder, textarea = false, rows = 2 }) {
  const clases = 'w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ceinys-orange focus:border-transparent transition-all';
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      {textarea ? (
        <textarea name={name} value={value || ''} onChange={onChange} placeholder={placeholder} rows={rows} className={`${clases} resize-none`} />
      ) : (
        <input type="text" name={name} value={value || ''} onChange={onChange} placeholder={placeholder} className={clases} />
      )}
    </div>
  );
}

function TarjetaProyecto({ proyecto }) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(proyecto);

  const mutacion = useMutation({
    mutationFn: actualizarProyecto,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proyectos'] });
      toast.success(`"${form.nombre}" guardado.`);
    },
    onError: (e) => toast.error(`Error al guardar: ${e.message}`),
  });

  const cambiar = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const completo = tieneDatos(proyecto);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex-shrink-0 w-2 h-2 rounded-full ${proyecto.activo ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{proyecto.nombre}</p>
            <p className="text-xs text-gray-400 truncate">
              {proyecto.ubicacion || 'Sin ubicación cargada'}
              {proyecto.tipo ? ` · ${proyecto.tipo}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!completo && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              Sin datos
            </span>
          )}
          {!proyecto.activo && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              Inactivo
            </span>
          )}
          <span className="text-gray-400 text-sm">{abierto ? '▲' : '▼'}</span>
        </div>
      </button>

      {abierto && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 space-y-4">
          {!completo && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Mientras este proyecto no tenga datos, Valeria no va a dar precios ni ubicación:
              va a ofrecer que un asesor le pase el detalle. Es a propósito, para que no invente nada.
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Nombre" name="nombre" value={form.nombre} onChange={cambiar} placeholder="Altos de Sacta" />
            <Campo label="Ubicación" name="ubicacion" value={form.ubicacion} onChange={cambiar} placeholder="Distrito, provincia, referencia" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Tipo" name="tipo" value={form.tipo} onChange={cambiar} placeholder="Lotes con servicios / Casas" />
            <Campo label="Área desde" name="area_desde" value={form.area_desde} onChange={cambiar} placeholder="Desde 120 m²" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Precio desde" name="precio_desde" value={form.precio_desde} onChange={cambiar} placeholder="S/ 25,000" />
            <Campo label="Financiamiento" name="financiamiento" value={form.financiamiento} onChange={cambiar} placeholder="Inicial 20% + 36 cuotas" />
          </div>
          <Campo
            label="Enlace de Google Maps"
            name="mapa_url"
            value={form.mapa_url}
            onChange={cambiar}
            placeholder="https://maps.app.goo.gl/..."
          />
          <p className="text-xs text-gray-400 -mt-2">
            Valeria lo manda cuando preguntan dónde queda, y se le muestra al cliente al confirmar la visita.
            Sacalo desde Google Maps → Compartir → Copiar vínculo.
          </p>

          <Campo label="Estado comercial" name="estado_comercial" value={form.estado_comercial} onChange={cambiar} placeholder="Pre-venta / En obra / Entregado" />
          <Campo
            label="Entrega del título de propiedad"
            name="entrega_titulo"
            value={form.entrega_titulo}
            onChange={cambiar}
            placeholder="Ej: Título proyectado para diciembre 2026, entrega física en 2029. Ya cuenta con partida registral."
            textarea
            rows={3}
          />
          <p className="text-xs text-gray-400 -mt-2">
            Si dejás esto vacío, Valeria no va a afirmar que el proyecto tiene título: deriva al asesor.
            Es a propósito — prometer un título que todavía no existe es un problema serio en una venta de terreno.
          </p>

          <Campo label="Descripción" name="descripcion" value={form.descripcion} onChange={cambiar} placeholder="Cómo describirías el proyecto a un interesado" textarea rows={3} />
          <Campo
            label="Imágenes (una URL por línea)"
            name="imagenes"
            value={form.imagenes}
            onChange={cambiar}
            placeholder={'https://wspai.vercel.app/proyectos/ejemplo.jpg | Plano de etapas\nhttps://wspai.vercel.app/proyectos/otra.jpg | Pórtico de ingreso'}
            textarea
            rows={4}
          />
          <p className="text-xs text-gray-400 -mt-2">
            Valeria las manda por WhatsApp cuando el cliente pide ver el proyecto. La descripción
            después de <code className="bg-gray-100 px-1 rounded">|</code> es para que sepa cuál elegir; el cliente no la ve.
            Tienen que ser URLs públicas — Twilio no puede leer imágenes protegidas.
          </p>

          <Campo
            label="Características"
            name="caracteristicas"
            value={form.caracteristicas}
            onChange={cambiar}
            placeholder={'Una por línea:\nAgua y desagüe\nPistas y veredas\nParques y áreas verdes'}
            textarea
            rows={4}
          />

          <div className="flex items-center justify-between gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.activo}
                onChange={(e) => setForm(prev => ({ ...prev, activo: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-ceinys-orange focus:ring-ceinys-orange"
              />
              Valeria puede ofrecer este proyecto
            </label>
            <button
              onClick={() => mutacion.mutate(form)}
              disabled={mutacion.isPending}
              className="bg-black hover:bg-gray-900 disabled:bg-gray-400 text-white font-bold px-6 py-2.5 rounded-xl transition-all duration-200 text-sm"
            >
              {mutacion.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormularioNuevo() {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState('');

  const mutacion = useMutation({
    mutationFn: crearProyecto,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proyectos'] });
      toast.success(`Proyecto "${nombre}" creado.`);
      setNombre('');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) mutacion.mutate({ nombre: nombre.trim() }); }}
      className="bg-white rounded-xl border border-dashed border-gray-300 p-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end"
    >
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-600 mb-1">Agregar un proyecto nuevo</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del proyecto"
          className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ceinys-orange transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={mutacion.isPending || !nombre.trim()}
        className="bg-ceinys-orange hover:bg-ceinys-orange-light disabled:bg-gray-300 text-white font-bold px-6 py-2.5 rounded-xl transition-all duration-200 text-sm whitespace-nowrap"
      >
        {mutacion.isPending ? 'Creando...' : 'Agregar'}
      </button>
    </form>
  );
}

export default function TabProyectos() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['proyectos'],
    queryFn: obtenerProyectos,
  });

  const proyectos = data?.proyectos || [];
  const sinDatos = proyectos.filter(p => !tieneDatos(p)).length;

  return (
    <div className="space-y-5">
      <div className="bg-black rounded-2xl border border-gray-800 shadow-sm p-5">
        <h2 className="text-base font-bold text-white">Proyectos de Ceinys</h2>
        <p className="text-xs text-gray-500 mt-1">
          Valeria solo habla de los proyectos cargados acá, y solo cita los datos que completes.
          {sinDatos > 0 && (
            <span className="text-amber-400"> {sinDatos} proyecto{sinDatos !== 1 ? 's' : ''} sin datos todavía.</span>
          )}
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
          <div className="w-6 h-6 border-2 border-ceinys-orange border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Cargando proyectos...</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
          <p className="text-4xl">⚠️</p>
          <p className="text-sm text-center max-w-md">{error?.message}</p>
          <p className="text-xs text-center max-w-md text-gray-400">
            Si dice que la tabla no existe, todavía falta correr <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">supabase-migration-ceinys.sql</code> en Supabase.
          </p>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-3">
          {proyectos.map(p => <TarjetaProyecto key={p.id} proyecto={p} />)}
          <FormularioNuevo />
        </div>
      )}
    </div>
  );
}
