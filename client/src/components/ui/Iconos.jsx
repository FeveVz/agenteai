/**
 * Iconos de la navegación.
 *
 * Son SVG de trazo y no emoji a propósito. El emoji se ve distinto en cada
 * sistema — en Windows son los de Segoe, coloridos y algo infantiles —, no
 * hereda el color del texto, así que no puede volverse naranja al estar
 * activo, y a tamaño chico se lee como una manchita.
 *
 * Trazo de 1.6 y esquinas redondeadas para acercarse a SF Symbols, que es la
 * familia que usa iOS. `currentColor` en todo: el color lo decide quien los
 * usa, con las clases de texto de siempre.
 */

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  // Decorativos: al lado de cada icono ya va su texto. Sin esto el lector de
  // pantalla intenta nombrar el SVG y los botones de navegacion terminan
  // anunciandose sin nombre, aunque la etiqueta este ahi al lado.
  'aria-hidden': 'true',
  focusable: 'false',
};

export function IconoMensajes(props) {
  return (
    <svg {...base} {...props}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3.9-.8L3 21l1.9-4.6A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" />
    </svg>
  );
}

export function IconoVisitas(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconoProyectos(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 21h18M5 21V8l7-5 7 5v13" />
      <path d="M10 21v-5h4v5" />
    </svg>
  );
}

export function IconoConstructoras(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 21h18M5 21V4h9v17M14 21V9h5v12" />
      <path d="M8 8h3M8 12h3M8 16h3" />
    </svg>
  );
}

export function IconoConfiguracion(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.4a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H2.8a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V2.8a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function IconoInicio(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

export function IconoSalir(props) {
  return (
    <svg {...base} {...props}>
      <path d="M15 17l5-5-5-5" />
      <path d="M20 12H9" />
      <path d="M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
    </svg>
  );
}
