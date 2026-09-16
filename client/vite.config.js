import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Marca del despliegue en el <head>.
 *
 * El título, la descripción y el favicon tienen que existir ANTES de que
 * corra JavaScript: es lo que lee el bot de WhatsApp cuando alguien reenvía
 * el enlace de agenda, y ese bot no ejecuta scripts. Por eso no pueden salir
 * de la base de datos como el resto de la configuración.
 *
 * Se resuelve con un plugin y no con la sustitución `%VITE_X%` de Vite porque
 * esa tiene dos modos de falla feos: si la variable no está definida deja el
 * placeholder literal en el título ("%VITE_MARCA_NOMBRE% — Agente IA"), y
 * dentro del href del favicon directamente rompe el build con "URI malformed".
 * Acá una variable faltante cae a un valor neutro y listo.
 */
function marcaEnHtml(env) {
  const leer = (clave, porDefecto) => {
    const v = String(env[clave] == null ? '' : env[clave]).trim();
    return v || porDefecto;
  };

  const nombre = leer('VITE_MARCA_NOMBRE', 'Agente IA');
  const agente = leer('VITE_MARCA_AGENTE', 'La asesora virtual');
  const color = /^#[0-9a-fA-F]{6}$/.test(leer('VITE_MARCA_COLOR', '')) ? leer('VITE_MARCA_COLOR', '') : '#F5851F';

  // Escapado para atributos HTML: el nombre lo escribe una persona.
  const attr = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // La inicial del nombre, para el favicon.
  const inicial = (nombre.trim()[0] || 'A').toUpperCase();
  const favicon =
    `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>` +
    `<rect width='100' height='100' rx='16' fill='%23000'/>` +
    `<text x='50' y='72' font-size='60' text-anchor='middle' fill='%23${color.slice(1)}' font-weight='bold'>${encodeURIComponent(inicial)}</text>` +
    `</svg>`;

  return {
    name: 'marca-en-html',
    transformIndexHtml(html) {
      return html
        .replace(/<title>.*?<\/title>/, `<title>${attr(nombre)}</title>`)
        .replace(
          /<meta name="description" content=".*?" \/>/,
          `<meta name="description" content="${attr(agente)} de ${attr(nombre)} — atención por WhatsApp" />`
        )
        .replace(/href="data:image\/svg\+xml,[^"]*"/, `href="${favicon}"`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), 'VITE_');

  return {
    // El .env vive en la raiz del repo, no dentro de client/. Sin esto el
    // plugin de arriba leia la raiz y `import.meta.env` leia client/: dos
    // fuentes distintas para la misma marca, y en local el title decia una
    // cosa y el panel otra. En Vercel no se notaba porque todo llega por
    // process.env.
    envDir: path.resolve(__dirname, '..'),
    plugins: [react(), marcaEnHtml({ ...process.env, ...env })],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
