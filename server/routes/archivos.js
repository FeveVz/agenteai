const express = require('express');
const crypto = require('crypto');
const { obtenerSupabase } = require('../db');

const router = express.Router();

/**
 * Subida de imágenes a Supabase Storage.
 *
 * El navegador sube el archivo DIRECTO a Supabase con un token de un solo uso
 * que emite este endpoint. El archivo no pasa por acá, y eso importa por dos
 * razones:
 *
 *   · Vercel corta el cuerpo de las requests en 4.5 MB. Una foto de celular
 *     pesa eso o más; pasándola por la función serverless no entraría.
 *   · La clave de servicio nunca sale del backend. El navegador solo recibe un
 *     token que sirve para escribir UN archivo en UNA ruta, y nada más.
 *
 * (Verificado contra Supabase: la ruta de subida firmada no exige API key, el
 * token alcanza.)
 *
 * El bucket es público a propósito: estas imágenes se le mandan al cliente
 * por WhatsApp, y Twilio las descarga desde sus servidores sin autenticarse.
 * Una foto de proyecto o la gráfica oficial de cuentas no son secretas.
 */

const BUCKET = 'archivos';

// Twilio acepta imágenes de hasta 5 MB por WhatsApp. Más que eso se sube
// bien pero después no se puede enviar, y el error aparece recién en el chat.
const TAMANO_MAXIMO = 5 * 1024 * 1024;

const TIPOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Solo estas carpetas: el cliente elige el destino, no la ruta.
const CARPETAS = new Set(['proyectos', 'pagos']);

let bucketListo = false;

/**
 * Crea el bucket la primera vez. Así una clienta nueva no necesita ningún
 * paso manual en Supabase: el primer archivo que sube lo crea.
 *
 * Las restricciones de tipo y tamaño quedan en el bucket, que las hace
 * cumplir Supabase: aunque alguien manipule el navegador, no puede subir un
 * ejecutable ni un archivo de 50 MB.
 */
async function asegurarBucket(supabase) {
  if (bucketListo) return;

  const opciones = {
    public: true,
    fileSizeLimit: TAMANO_MAXIMO,
    allowedMimeTypes: Object.keys(TIPOS),
  };

  const { data: existente } = await supabase.storage.getBucket(BUCKET);

  if (!existente) {
    const { error } = await supabase.storage.createBucket(BUCKET, opciones);
    // Dos requests en paralelo pueden intentar crearlo a la vez: si ya existe, está bien.
    if (error && !/already exists|duplicate/i.test(error.message || '')) throw error;
  } else if (!existente.public) {
    // Un bucket privado rompe el envío por WhatsApp sin ningún aviso visible.
    const { error } = await supabase.storage.updateBucket(BUCKET, opciones);
    if (error) throw error;
  }

  bucketListo = true;
}

// POST /api/archivos/firma  { carpeta, tipo, tamano }
router.post('/firma', async (req, res) => {
  const { carpeta, tipo, tamano } = req.body || {};

  if (!CARPETAS.has(carpeta)) {
    return res.status(400).json({ error: 'Carpeta no válida.' });
  }
  if (!TIPOS[tipo]) {
    return res.status(400).json({ error: 'Solo se aceptan imágenes JPG, PNG o WEBP.' });
  }
  if (!Number.isFinite(Number(tamano)) || Number(tamano) <= 0) {
    return res.status(400).json({ error: 'No se pudo leer el tamaño del archivo.' });
  }
  if (Number(tamano) > TAMANO_MAXIMO) {
    return res.status(400).json({ error: 'La imagen pesa más de 5 MB, que es el máximo que acepta WhatsApp. Redúcela e inténtalo de nuevo.' });
  }

  try {
    const supabase = obtenerSupabase();
    await asegurarBucket(supabase);

    // Nombre aleatorio: nunca pisa otro archivo y no depende del nombre
    // original, que puede traer espacios, tildes o caracteres raros.
    const ruta = `${carpeta}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${TIPOS[tipo]}`;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(ruta);
    if (error) throw error;

    const { data: publica } = supabase.storage.from(BUCKET).getPublicUrl(ruta);

    res.json({ ok: true, url_subida: data.signedUrl, url_publica: publica.publicUrl });
  } catch (error) {
    console.error('[Archivos] No se pudo preparar la subida:', error.message || error);
    res.status(500).json({ error: 'No se pudo preparar la subida. Inténtalo de nuevo.' });
  }
});

module.exports = { router, TAMANO_MAXIMO, TIPOS, CARPETAS };
