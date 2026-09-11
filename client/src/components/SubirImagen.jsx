import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { pedirFirmaSubida } from '../lib/api';

// Los mismos límites que valida el backend y que hace cumplir el bucket.
// Se chequean acá primero solo para avisar antes de pedir el token.
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANO_MAXIMO = 5 * 1024 * 1024; // lo máximo que acepta WhatsApp

/**
 * Botón que sube una imagen a Supabase Storage y devuelve su URL pública.
 *
 * El archivo va directo del navegador a Supabase con un token de un solo uso
 * que emite el backend: no pasa por la función de Vercel (que corta en 4.5 MB)
 * y la clave de servicio nunca llega al navegador.
 */
export default function SubirImagen({ carpeta, onSubida, etiqueta = 'Subir imagen' }) {
  const input = useRef(null);
  const [subiendo, setSubiendo] = useState(false);

  async function alElegir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo si falló
    if (!archivo) return;

    if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
      toast.error('Solo se aceptan imágenes JPG, PNG o WEBP.');
      return;
    }
    if (archivo.size > TAMANO_MAXIMO) {
      toast.error('La imagen pesa más de 5 MB, que es el máximo que acepta WhatsApp.');
      return;
    }

    setSubiendo(true);
    try {
      const { url_subida, url_publica } = await pedirFirmaSubida({
        carpeta,
        tipo: archivo.type,
        tamano: archivo.size,
      });

      // Mismo formato que usa la librería oficial de Supabase para subir a
      // una URL firmada desde el navegador (verificado en storage-js).
      const cuerpo = new FormData();
      cuerpo.append('cacheControl', '3600');
      cuerpo.append('', archivo);

      const respuesta = await fetch(url_subida, {
        method: 'PUT',
        body: cuerpo,
        headers: { 'x-upsert': 'false' },
      });

      if (!respuesta.ok) {
        const detalle = await respuesta.json().catch(() => ({}));
        throw new Error(detalle.message || `No se pudo subir (Supabase respondió ${respuesta.status}).`);
      }

      onSubida(url_publica);
      toast.success('Imagen subida. Dale a Guardar para aplicarla.');
    } catch (err) {
      toast.error(err.message || 'No se pudo subir la imagen.');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={TIPOS_PERMITIDOS.join(',')}
        onChange={alElegir}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={subiendo}
        className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:border-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-all"
      >
        {subiendo ? (
          <>
            <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Subiendo...
          </>
        ) : (
          <>⬆ {etiqueta}</>
        )}
      </button>
    </>
  );
}
