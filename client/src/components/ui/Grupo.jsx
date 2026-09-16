/**
 * Las piezas del panel, al estilo de Ajustes de iOS.
 *
 * La idea de fondo: en iOS un formulario no es una pared de campos, es una
 * lista de GRUPOS. Cada grupo tiene un titulito gris ARRIBA — fuera de la
 * tarjeta — que dice de qué va, y adentro las filas que le corresponden.
 * Ese titulito flotando afuera es lo que hace que se entienda de un vistazo
 * dónde termina una zona editable y empieza la otra, sin tener que pintar
 * barras negras ni encerrar todo en marcos.
 *
 * Antes cada sección abría con una cabecera negra adentro de la tarjeta:
 * pesaba mucho y hacía que dos secciones seguidas se leyeran como una sola
 * mancha oscura.
 */

/**
 * Un grupo: título afuera, contenido en tarjeta.
 *
 * @param titulo       Corto y en mayúsculas. Es una etiqueta, no una frase.
 * @param descripcion  Qué hace esta zona. Va DEBAJO de la tarjeta, como en
 *                     iOS: quien ya sabe no la lee, quien no sabe la tiene.
 * @param accion       Lo que va a la derecha del título (un botón chico).
 */
export function Grupo({ titulo, descripcion, accion, children, className = '' }) {
  return (
    <section className={`mb-8 ${className}`}>
      {(titulo || accion) && (
        <div className="flex items-end justify-between px-4 sm:px-1 mb-2">
          {titulo && (
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ios-etiqueta-2">
              {titulo}
            </h2>
          )}
          {accion}
        </div>
      )}

      <div className="bg-ios-tarjeta rounded-ios shadow-tarjeta ring-1 ring-black/[0.04] overflow-hidden">
        {children}
      </div>

      {descripcion && (
        <p className="text-[13px] leading-snug text-ios-etiqueta-2 mt-2 px-4 sm:px-1">
          {descripcion}
        </p>
      )}
    </section>
  );
}

/**
 * Una fila dentro de un grupo.
 *
 * El separador va por dentro de la fila y no como borde del contenedor para
 * que la última no lo lleve: una línea colgando justo arriba del borde
 * redondeado es el detalle que delata que algo no es nativo.
 */
export function Fila({ children, className = '', onClick }) {
  const Elemento = onClick ? 'button' : 'div';
  return (
    <Elemento
      {...(onClick ? { onClick, type: 'button' } : {})}
      className={`w-full text-left px-4 py-3 border-b border-ios-separador last:border-b-0
        ${onClick ? 'hover:bg-black/[0.02] active:bg-black/[0.04] transition-colors' : ''} ${className}`}
    >
      {children}
    </Elemento>
  );
}

/**
 * Campo de texto de una línea.
 *
 * `pista` es la explicación corta bajo el campo. Se usa para lo que el
 * usuario no puede adivinar, no para repetir la etiqueta con otras palabras.
 */
export function Campo({ etiqueta, pista, className = '', ...props }) {
  return (
    <Fila className={className}>
      {etiqueta && (
        <label className="block text-[13px] font-medium text-ios-etiqueta-2 mb-1">
          {etiqueta}
        </label>
      )}
      <input
        {...props}
        className="w-full bg-transparent text-[15px] text-ios-etiqueta placeholder:text-ios-etiqueta-3
                   outline-none border-0 p-0 focus:ring-0"
      />
      {pista && <p className="text-[12px] text-ios-etiqueta-3 mt-1">{pista}</p>}
    </Fila>
  );
}

/** Campo de varias líneas. Mismo trato que Campo. */
export function CampoLargo({ etiqueta, pista, filas = 4, className = '', ...props }) {
  return (
    <Fila className={className}>
      {etiqueta && (
        <label className="block text-[13px] font-medium text-ios-etiqueta-2 mb-1">
          {etiqueta}
        </label>
      )}
      <textarea
        {...props}
        rows={filas}
        className="w-full bg-transparent text-[15px] text-ios-etiqueta placeholder:text-ios-etiqueta-3
                   outline-none border-0 p-0 resize-y leading-relaxed focus:ring-0"
      />
      {pista && <p className="text-[12px] text-ios-etiqueta-3 mt-1.5">{pista}</p>}
    </Fila>
  );
}

/**
 * Botón de guardar de un grupo.
 *
 * Cada zona guarda lo suyo: un único botón global obligaría a adivinar qué
 * se está por escribir. El estado "Guardado" se queda un momento porque sin
 * confirmación visible la gente vuelve a apretar por las dudas.
 */
export function BotonGuardar({ onClick, guardando, guardado, children = 'Guardar' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={guardando}
      className={`text-[15px] font-semibold px-4 py-2 rounded-full transition-all duration-200
        disabled:opacity-50
        ${guardado
          ? 'bg-ios-verde/10 text-ios-verde'
          : 'bg-marca-orange/10 text-marca-orange hover:bg-marca-orange/20 active:scale-[0.97]'}`}
    >
      {guardando ? 'Guardando…' : guardado ? '✓ Guardado' : children}
    </button>
  );
}
