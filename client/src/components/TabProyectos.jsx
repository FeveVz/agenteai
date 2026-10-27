import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { obtenerProyectos, actualizarProyecto, crearProyecto } from '../lib/api';
import SubirImagen from './SubirImagen';
import { useNombreAgente } from './ui/useNombreAgente';

// Campos que el agente puede citar. Si están todos vacíos, deriva al asesor.
const CAMPOS_DE_DATO = ['ubicacion', 'tipo', 'descripcion', 'precio_desde', 'area_desde', 'caracteristicas', 'financiamiento', 'estado_comercial', 'entrega_titulo', 'desarrolladora'];

function tieneDatos(proyecto) {
  return CAMPOS_DE_DATO.some(c => proyecto[c] && String(proyecto[c]).trim());
}

/**
 * Las líneas del campo `imagenes`, con el mismo criterio que usa el servidor.
 *
 * El formato es "url | descripcion", una por línea. parsearImagenes
 * (server/services/openai.js) descarta en silencio toda línea cuya URL no
 * cumpla este formato: antes el panel guardaba con el toast verde y el agente
 * después le decía al comprador que no hay fotos cargadas.
 */
function lineasDeImagen(texto) {
  return String(texto == null ? '' : texto)
    .split('\n')
    .map((linea, i) => ({ linea, numero: i + 1 }))
    .filter(({ linea }) => linea.trim())
    .map(({ linea, numero }) => {
      const [url, descripcion] = linea.split('|').map(p => (p || '').trim());
      return {
        numero,
        url,
        descripcion: descripcion || '',
        formatoOk: /^https?:\/\/\S+$/i.test(url || ''),
      };
    });
}

/**
 * Prueba si la URL carga de verdad.
 *
 * El formato correcto no alcanza: un enlace para compartir de Drive, una foto
 * borrada del bucket o un typo en el nombre del archivo pasan el regex y
 * fallan recién cuando Twilio va a buscarlas. Con el texto primero y la
 * primera imagen adjunta en el mismo mensaje, eso deja al comprador sin
 * respuesta: ni fotos ni texto. El dato "esta URL responde" es verificable,
 * así que se verifica acá y se muestra.
 */
function EstadoDeUrl({ url, formatoOk }) {
  const [estado, setEstado] = useState('probando');

  useEffect(() => {
    if (!formatoOk) return;
    let vivo = true;
    setEstado('probando');
    const img = new Image();
    img.onload = () => { if (vivo) setEstado('carga'); };
    img.onerror = () => { if (vivo) setEstado('falla'); };
    img.src = url;
    return () => { vivo = false; img.onload = null; img.onerror = null; };
  }, [url, formatoOk]);

  if (!formatoOk) {
    return <span className="text-[11px] font-semibold text-ios-rojo shrink-0">no es una URL</span>;
  }
  if (estado === 'probando') {
    return <span className="text-[11px] text-gray-400 shrink-0">probando…</span>;
  }
  if (estado === 'falla') {
    return <span className="text-[11px] font-semibold text-ios-rojo shrink-0">no carga</span>;
  }
  return <span className="text-[11px] font-semibold text-ios-verde shrink-0">carga</span>;
}

function RevisionDeImagenes({ texto }) {
  // Se espera a que deje de tipear para no disparar una prueba por tecla.
  const [estable, setEstable] = useState(texto);
  useEffect(() => {
    const t = setTimeout(() => setEstable(texto), 800);
    return () => clearTimeout(t);
  }, [texto]);

  const lineas = lineasDeImagen(estable);
  const malas = lineas.filter(l => !l.formatoOk);

  if (lineas.length === 0) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Sin fotos cargadas. Cuando el comprador pida ver el proyecto, el agente no va a poder
        mandarle nada y va a ofrecer la visita a ciegas.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
      <p className="px-3 py-2 text-xs font-medium text-gray-600">
        {lineas.length} foto{lineas.length !== 1 ? 's' : ''} cargada{lineas.length !== 1 ? 's' : ''}
        {malas.length > 0 && (
          <span className="text-ios-rojo"> · {malas.length} con el formato mal</span>
        )}
      </p>
      {lineas.map(l => (
        <div key={l.numero} className="px-3 py-2 flex items-center gap-2">
          <span className="text-[11px] text-gray-400 w-4 shrink-0">{l.numero}</span>
          <span className="flex-1 min-w-0 text-[11px] text-gray-500 truncate" title={l.url}>
            {l.descripcion || l.url}
          </span>
          <EstadoDeUrl url={l.url} formatoOk={l.formatoOk} />
        </div>
      ))}
      {malas.length > 0 && (
        <p className="px-3 py-2 text-[11px] text-ios-rojo">
          Cada línea tiene que ser una URL que empiece con http:// o https://, sin espacios, y la
          descripción después de una barra |. Mientras esté así, el guardado va a ser rechazado.
        </p>
      )}
    </div>
  );
}

function Campo({ label, name, value, onChange, placeholder, textarea = false, rows = 2, type = 'text' }) {
  const clases = 'w-full px-3.5 py-2.5 rounded-[10px] bg-black/[0.04] text-[15px] text-ios-etiqueta placeholder:text-ios-etiqueta-3 border-0 outline-none focus:ring-2 focus:ring-marca-orange/40 transition-all';
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      {textarea ? (
        <textarea name={name} value={value || ''} onChange={onChange} placeholder={placeholder} rows={rows} className={`${clases} resize-none`} />
      ) : (
        <input type={type} name={name} value={value ?? ''} onChange={onChange} placeholder={placeholder} className={clases} />
      )}
    </div>
  );
}

function TarjetaProyecto({ proyecto, posicion, total, columnasOpcionales }) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(proyecto);

  const mutacion = useMutation({
    mutationFn: actualizarProyecto,
    onSuccess: (datos) => {
      queryClient.invalidateQueries({ queryKey: ['proyectos'] });
      // El backend avisa cuando guardó todo menos un campo opcional porque
      // falta correr la migración. Si eso se mostrara como éxito, Pamela
      // creería que cargó la disponibilidad y el agente nunca la tendría.
      if (datos?.aviso) toast.warning(datos.aviso);
      else toast.success(`"${form.nombre}" guardado.`);
    },
    onError: (e) => toast.error(`Error al guardar: ${e.message}`),
  });

  const cambiar = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const completo = tieneDatos(proyecto);
  const fotos = lineasDeImagen(proyecto.imagenes);
  const fotosMalas = fotos.filter(f => !f.formatoOk).length;
  // La columna puede no existir todavía: la API dice si está, y mientras no
  // esté no se muestra un campo que no se puede guardar.
  const hayDisponibilidad = columnasOpcionales?.disponibilidad !== false;

  return (
    <div className="bg-ios-tarjeta rounded-ios shadow-tarjeta ring-1 ring-black/[0.04] overflow-hidden">
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
          {/* Cuántas fotos tiene, sin abrir la tarjeta: es lo que el agente
              puede mandar cuando el comprador pide ver el proyecto. */}
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
            fotos.length === 0 || fotosMalas > 0
              ? 'bg-amber-100 text-amber-700 border-amber-200'
              : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {fotos.length === 0 ? 'sin fotos' : `${fotos.length} foto${fotos.length !== 1 ? 's' : ''}`}
            {fotosMalas > 0 ? ` · ${fotosMalas} mal` : ''}
          </span>
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
              Mientras este proyecto no tenga datos, el agente no va a dar precios ni ubicación:
              va a ofrecer que un asesor le pase el detalle. Es a propósito, para que no invente nada.
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Nombre" name="nombre" value={form.nombre} onChange={cambiar} placeholder="Nombre del proyecto" />
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
            El agente lo manda cuando preguntan dónde queda, y se le muestra al cliente al confirmar la visita.
            Sácalo desde Google Maps → Compartir → Copiar vínculo.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Estado comercial" name="estado_comercial" value={form.estado_comercial} onChange={cambiar} placeholder="Pre-venta / En obra / Entregado" />
            <Campo label="Constructora dueña del proyecto" name="desarrolladora" value={form.desarrolladora} onChange={cambiar} placeholder="Mi Casa" />
          </div>
          <p className="text-xs text-gray-400 -mt-2">
            Tiene que coincidir con un nombre cargado en <strong>Constructoras</strong>. De ahí sale
            la gráfica de cuentas que el agente le manda al cliente cuando pregunta dónde pagar.
            Si está vacío o no coincide, el agente <strong>no da datos de pago</strong> y deriva a un asesor —
            a propósito: una cuenta equivocada manda el dinero del cliente a otra empresa.
          </p>
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
            Si dejas esto vacío, el agente no va a afirmar que el proyecto tiene título: deriva al asesor.
            Es a propósito — prometer un título que todavía no existe es un problema serio en una venta de terreno.
          </p>

          {hayDisponibilidad ? (
            <>
              <Campo
                label="Lotes disponibles"
                name="disponibilidad"
                value={form.disponibilidad}
                onChange={cambiar}
                placeholder={'Uno por línea:\nEtapa 2 · lote 14 · 120 m² · frente al parque\nEtapa 3 · lotes 8, 9 y 10 · 109 m²'}
                textarea
                rows={3}
              />
              <p className="text-xs text-gray-400 -mt-2">
                “¿Qué lotes quedan?” es la pregunta que más veces terminó en “no tengo ese dato”.
                Lo que cargues acá es lo único que el agente puede afirmar sobre stock: mientras esté
                vacío no va a inventar lotes ni números de manzana.
              </p>
            </>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Para cargar los lotes disponibles falta correr la migración{' '}
              <code className="bg-amber-100 px-1 rounded">sql/migraciones/2026-10-disponibilidad-de-lotes.sql</code>{' '}
              en Supabase. El resto de los campos se guarda igual.
            </p>
          )}

          <Campo label="Descripción" name="descripcion" value={form.descripcion} onChange={cambiar} placeholder="Cómo describirías el proyecto a un interesado" textarea rows={3} />
          <Campo
            label="Imágenes (una URL por línea)"
            name="imagenes"
            value={form.imagenes}
            onChange={cambiar}
            placeholder={'https://.../plano.jpg | Plano de etapas\nhttps://.../portico.jpg | Pórtico de ingreso'}
            textarea
            rows={4}
          />
          <div className="-mt-2">
            <SubirImagen
              carpeta="proyectos"
              etiqueta="Subir una foto o plano"
              onSubida={(url) => setForm(prev => ({
                ...prev,
                // Se agrega como línea nueva, con el separador listo para la descripción.
                imagenes: [String(prev.imagenes || '').trim(), `${url} | `].filter(Boolean).join('\n'),
              }))}
            />
          </div>
          <RevisionDeImagenes texto={form.imagenes} />
          <p className="text-xs text-gray-400 -mt-2">
            El agente las manda por WhatsApp cuando el cliente pide ver el proyecto. La descripción
            después de <code className="bg-gray-100 px-1 rounded">|</code> es para que sepa cuál elegir; el cliente no la ve.
            Tienen que ser URLs públicas — Twilio no puede leer imágenes protegidas, ni los enlaces
            para compartir de Drive o Dropbox, que devuelven una página en vez de la imagen.
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

          {/* `orden` decide qué proyecto nombra primero el agente y en qué
              orden salen los botones del enlace de agenda. Solo se podía
              cambiar entrando a la base: Torres de Parcona, el proyecto de 14
              de los 16 enlaces emitidos, salía último de los cinco. */}
          <Campo
            label="Orden en el catálogo"
            name="orden"
            type="number"
            value={form.orden}
            onChange={cambiar}
            placeholder="100"
          />
          <p className="text-xs text-gray-400 -mt-2">
            El número más bajo va primero: es el que el agente nombra antes y el que aparece arriba
            en el enlace de agenda. Hoy este proyecto es el <strong>{posicion}</strong> de {total}.
          </p>

          <div className="flex items-center justify-between gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.activo}
                onChange={(e) => setForm(prev => ({ ...prev, activo: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-marca-orange focus:ring-marca-orange"
              />
              El agente puede ofrecer este proyecto
            </label>
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

export default function TabProyectos() {
  const nombreAgente = useNombreAgente();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['proyectos'],
    queryFn: obtenerProyectos,
  });

  const proyectos = data?.proyectos || [];
  const sinDatos = proyectos.filter(p => !tieneDatos(p)).length;
  const sinFotos = proyectos.filter(p => p.activo && lineasDeImagen(p.imagenes).length === 0).length;

  return (
    <div className="space-y-5">
      {sinDatos > 0 && (
        <div className="flex items-start gap-2.5 bg-ios-ambar/[0.10] rounded-ios px-4 py-3">
          <span className="text-[15px] leading-none mt-0.5">⚠️</span>
          <p className="text-[13px] text-ios-etiqueta-2 leading-snug">
            <strong className="text-ios-etiqueta">{sinDatos} proyecto{sinDatos !== 1 ? 's' : ''} sin datos.</strong>{' '}
            {nombreAgente} no va a poder dar precio ni metraje de {sinDatos !== 1 ? 'esos' : 'ese'} hasta que los completes.
          </p>
        </div>
      )}

      {sinFotos > 0 && (
        <div className="flex items-start gap-2.5 bg-ios-ambar/[0.10] rounded-ios px-4 py-3">
          <span className="text-[15px] leading-none mt-0.5">⚠️</span>
          <p className="text-[13px] text-ios-etiqueta-2 leading-snug">
            <strong className="text-ios-etiqueta">{sinFotos} proyecto{sinFotos !== 1 ? 's' : ''} activo{sinFotos !== 1 ? 's' : ''} sin ni una foto.</strong>{' '}
            Un lote se vende mirándolo: cuando el comprador pide ver, el agente no tiene qué mandarle.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
          <div className="w-6 h-6 border-2 border-marca-orange border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Cargando proyectos...</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
          <p className="text-4xl">⚠️</p>
          <p className="text-sm text-center max-w-md">{error?.message}</p>
          <p className="text-xs text-center max-w-md text-gray-400">
            Si dice que la tabla no existe, todavía falta correr <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">sql/esquema.sql</code> en Supabase.
          </p>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-3">
          {proyectos.map((p, i) => (
            <TarjetaProyecto
              key={p.id}
              proyecto={p}
              posicion={i + 1}
              total={proyectos.length}
              columnasOpcionales={data?.columnas_opcionales}
            />
          ))}
          <FormularioNuevo />
        </div>
      )}
    </div>
  );
}
