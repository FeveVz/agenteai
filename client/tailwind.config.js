/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Debe coincidir con la fuente que carga client/index.html
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        // La del panel. Es la fuente del sistema a proposito: en un Mac o un
        // iPhone cae en San Francisco y en Windows en Segoe, asi que el panel
        // se siente parte del sistema operativo en vez de una pagina web.
        // Space Grotesk se queda para la marca, que si tiene que destacar.
        ios: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"',
          '"Segoe UI Variable Text"', '"Segoe UI"', 'Roboto', 'system-ui', 'sans-serif',
        ],
      },
      colors: {
        // Paleta del producto. Se llamaba "ceinys" por la clienta de cuyo
// logo salio; con varias clientas sobre el mismo codigo, el nombre
// del token tiene que ser neutro. Los colores no cambiaron.
        // Paleta del sistema de iOS. Los grises no son neutros puros: llevan
        // una pizca de azul, que es lo que hace que una pantalla de Ajustes
        // se vea limpia y no sucia.
        ios: {
          fondo: '#F2F2F7',          // systemGroupedBackground
          tarjeta: '#FFFFFF',
          separador: '#E5E5EA',      // separator, para las lineas finitas
          etiqueta: '#1C1C1E',       // label, el texto principal
          'etiqueta-2': '#6B6B70',   // secondaryLabel, descripciones
          'etiqueta-3': '#A1A1A6',   // tertiaryLabel, pistas y placeholders
          azul: '#007AFF',
          verde: '#34C759',
          rojo: '#FF3B30',
          ambar: '#FF9F0A',
        },
        marca: {
          orange: '#F5851F',
          'orange-light': '#FF9F45',
          'orange-dark': '#D96F10',
          blue: '#29A9E0',
          'blue-light': '#5CC1EC',
          gray: '#414042',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      boxShadow: {
        // Sombra de tarjeta de iOS: casi invisible. Si se nota, esta mal.
        tarjeta: '0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03)',
        flotante: '0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04)',
      },
      borderRadius: {
        ios: '0.875rem',   // 14px, el radio de las tarjetas agrupadas
        'ios-lg': '1.25rem',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'fade-in': 'fade-in 0.4s ease-out forwards',
      },
    },
  },
  plugins: [],
};
