import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { obtenerDesarrolladoras, crearDesarrolladora, actualizarDesarrolladora, obtenerProyectos } from '../lib/api';
import SubirImagen from './SubirImagen';

function Campo({ label, name, value, onChange, placeholder, textarea = false, rows = 2 }) {
  const clases = 'w-full px-3.5 py-2.5 rounded-[10px] bg-black/[0.04] text-[15px] text-ios-etiqueta placeholder:text-ios-etiqueta-3 border-0 outline-none focus:ring-2 focus:ring-marca-orange/40 transition-all';
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      {textarea
        ? <textarea name={name} value={value || ''} onChange={onChange} placeholder={placeholder} rows={rows} className={`${clases} resize-none`} />
        : <input type="text" name={name} value={value || ''} onChange={onChange} placeholder={placeholder} className={clases} />}
    </div>
  );
}

function Tarjeta({ empresa, proyectos }) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(empresa);

  const mutacion = useMutation({
    mutationFn: actualizarDesarrolladora,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['desarrolladoras'] });
      toast.success(`"${form.nombre}" guardada.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const cambiar = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const suyos = proyectos.filter(p => (p.desarrolladora || '').trim().toLowerCase() === empresa.nombre.trim().toLowerCase());
  const tienePago = Boolean((empresa.pago_imagen_url || '').trim());

  return (
    <div className="bg-ios-tarjeta rounded-ios shadow-tarjeta ring-1 ring-black/[0.04] overflow-hidden">
      <button onClick={() => setAbierto(!abierto)} className="w-full px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors text-left">
        <div className="min-w-0">
          <p className="font-bold text-gray-900 truncate">{empresa.nombre}</p>
          <p className="text-xs text-gray-400 truncate">
            {suyos.length === 0 ? 'Sin proyectos asignados' : `${suyos.length} proyecto${suyos.length === 1 ? '' : 's'}: ${suyos.map(p => p.nombre).join(', ')}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!tienePago && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              Sin cuentas
            </span>
          )}
          <span className="text-gray-400 text-sm">{abierto ? '▲' : '▼'}</span>
        </div>
      </button>

      {abierto && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Nombre" name="nombre" value={form.nombre} onChange={cambiar} placeholder="Mi Casa" />
            <Campo label="Razón social" name="razon_social" value={form.razon_social} onChange={cambiar} placeholder="Inmobiliaria y Constructora Mi Casa S.A.C." />
          </div>
          <p className="text-xs text-gray-400 -mt-2">
            El <strong>nombre</strong> tiene que coincidir exactamente con lo que pusiste en el campo
            “Constructora dueña del proyecto” de cada proyecto. La <strong>razón social</strong> es la que
            el agente le dice al cliente que verifique como titular antes de transferir.
          </p>

          <Campo
            label="Gráfica de cuentas (URL de la imagen)"
            name="pago_imagen_url"
            value={form.pago_imagen_url}
            onChange={cambiar}
            placeholder="https://.../cuentas-mi-casa.jpg"
          />
          <div className="-mt-2">
            <SubirImagen
              carpeta="pagos"
              etiqueta="Subir la gráfica oficial"
              onSubida={(url) => setForm(prev => ({ ...prev, pago_imagen_url: url }))}
            />
          </div>
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
            <p>
              El agente manda <strong>esta imagen</strong> y nunca escribe números de cuenta en el chat.
              Es deliberado: un número tipeado es el vector clásico de estafa inmobiliaria, y la imagen
              oficial viene con logo, así que el cliente puede verificarla.
            </p>
            <p>
              Si está vacía, el agente <strong>no da datos de pago</strong> y deriva a un asesor.
              Tiene que ser una URL pública — Twilio no puede leer imágenes protegidas, y los enlaces
              para compartir de Drive o Dropbox no sirven porque devuelven una página, no la imagen.
            </p>
          </div>

          {form.pago_imagen_url && (
            <img
              src={form.pago_imagen_url}
              alt={`Cuentas de ${empresa.nombre}`}
              className="w-full rounded-lg border border-gray-200"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}

          <Campo label="Notas internas" name="notas" value={form.notas} onChange={cambiar} placeholder="Contacto, condiciones, lo que necesites recordar" textarea rows={2} />
          <p className="text-xs text-gray-400 -mt-2">Solo para tu equipo: el agente nunca las menciona.</p>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => mutacion.mutate(form)}
              disabled={mutacion.isPending}
              className="bg-marca-orange hover:bg-marca-orange-light disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-full transition-all duration-200 text-[14px] active:scale-95"
            >
              {mutacion.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormularioNueva() {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState('');

  const mutacion = useMutation({
    mutationFn: crearDesarrolladora,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['desarrolladoras'] });
      toast.success(`"${nombre}" creada.`);
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
        <label className="block text-xs font-medium text-gray-600 mb-1">Agregar una constructora</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre comercial"
          className="w-full px-3.5 py-2.5 rounded-[10px] bg-black/[0.04] text-[15px] border-0 outline-none focus:ring-2 focus:ring-marca-orange/40 transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={mutacion.isPending || !nombre.trim()}
        className="bg-marca-orange hover:bg-marca-orange-light disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-full transition-all duration-200 text-[14px] whitespace-nowrap active:scale-95"
      >
        {mutacion.isPending ? 'Creando...' : 'Agregar'}
      </button>
    </form>
  );
}

export default function TabConstructoras() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['desarrolladoras'], queryFn: obtenerDesarrolladoras });
  const { data: dataProy } = useQuery({ queryKey: ['proyectos'], queryFn: obtenerProyectos });

  const empresas = data?.desarrolladoras || [];
  const proyectos = dataProy?.proyectos || [];

  // Un proyecto activo cuya constructora no existe no puede dar datos de pago.
  const huerfanos = proyectos.filter(p =>
    p.activo && (p.desarrolladora || '').trim() &&
    !empresas.some(e => e.nombre.trim().toLowerCase() === p.desarrolladora.trim().toLowerCase()));

  const sinAsignar = proyectos.filter(p => p.activo && !(p.desarrolladora || '').trim());

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ios-etiqueta-2 px-4 sm:px-1 mb-4 leading-snug">
        Los datos de pago viven acá y no en cada proyecto: así todos los proyectos de una misma
        constructora comparten las mismas cuentas y es imposible que se desincronicen.
      </p>

      {(huerfanos.length > 0 || sinAsignar.length > 0) && (
        <div className="bg-ios-ambar/[0.10] rounded-ios p-4 text-[13px] text-ios-etiqueta-2 space-y-1 leading-snug">
          {sinAsignar.length > 0 && (
            <p>Sin constructora asignada: <strong>{sinAsignar.map(p => p.nombre).join(', ')}</strong>.</p>
          )}
          {huerfanos.length > 0 && (
            <p>Apuntan a una constructora que no existe acá: <strong>{huerfanos.map(p => `${p.nombre} → “${p.desarrolladora}”`).join(', ')}</strong>.</p>
          )}
          <p className="text-xs">El agente no va a dar datos de pago de esos proyectos hasta que se corrija.</p>
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-400 py-8 text-center">Cargando...</p>}
      {isError && <p className="text-sm text-red-500 py-8 text-center">{error?.message}</p>}

      {!isLoading && empresas.map(e => <Tarjeta key={e.id} empresa={e} proyectos={proyectos} />)}

      <FormularioNueva />
    </div>
  );
}
