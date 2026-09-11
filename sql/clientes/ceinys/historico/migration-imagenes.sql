-- ================================================================
-- Imagenes por proyecto
--
-- Valeria puede enviar fotos, planos y renders por WhatsApp. Twilio
-- exige URLs publicas y accesibles sin autenticacion.
--
-- Formato del campo: una imagen por linea, con descripcion opcional
-- separada por " | ". La descripcion es para que Valeria sepa que esta
-- mandando y elija la adecuada; no se le muestra al cliente.
--
--   https://wspai.vercel.app/proyectos/sol-plano.jpg | Plano de etapas
--   https://wspai.vercel.app/proyectos/sol-portico.jpg | Portico de ingreso
--
-- Idempotente.
-- ================================================================

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS imagenes TEXT;

COMMENT ON COLUMN proyectos.imagenes IS
  'Una URL publica por linea, con descripcion opcional tras " | ". Las envia Valeria por WhatsApp.';

-- ── Imagenes extraidas de los brochures oficiales ────────────────
-- Renderizadas de los PDF y publicadas en client/public/proyectos/,
-- que Vercel sirve como estaticos en el dominio del proyecto.

UPDATE proyectos SET imagenes =
  'https://wspai.vercel.app/proyectos/altos-de-sacta-portada.jpg | Portada del proyecto' || chr(10) ||
  'https://wspai.vercel.app/proyectos/altos-de-sacta-plano.jpg | Plano y cuadro técnico de lotes' || chr(10) ||
  'https://wspai.vercel.app/proyectos/altos-de-sacta-club.jpg | Club privado (render)' || chr(10) ||
  'https://wspai.vercel.app/proyectos/altos-de-sacta-ubicacion.jpg | Mapa de ubicación'
WHERE nombre = 'Altos de Sacta';

UPDATE proyectos SET imagenes =
  'https://wspai.vercel.app/proyectos/valle-sacta-plano.jpg | Plano del proyecto' || chr(10) ||
  'https://wspai.vercel.app/proyectos/valle-sacta-portico.jpg | Pórtico de ingreso' || chr(10) ||
  'https://wspai.vercel.app/proyectos/valle-sacta-club.jpg | Club house' || chr(10) ||
  'https://wspai.vercel.app/proyectos/valle-sacta-casa.jpg | Casa modelo'
WHERE nombre = 'Valle Sacta';

UPDATE proyectos SET imagenes =
  'https://wspai.vercel.app/proyectos/arenas-del-valle-portada.jpg | Portada del proyecto' || chr(10) ||
  'https://wspai.vercel.app/proyectos/arenas-del-valle-laguna.jpg | Laguna central (render)' || chr(10) ||
  'https://wspai.vercel.app/proyectos/arenas-del-valle-canchas.jpg | Canchas deportivas (render)' || chr(10) ||
  'https://wspai.vercel.app/proyectos/arenas-del-valle-ubicacion.jpg | Mapa de ubicación'
WHERE nombre = 'Arenas del Valle';

UPDATE proyectos SET imagenes =
  'https://wspai.vercel.app/proyectos/sol-de-carhuaz-etapas.jpg | Plano de las 5 etapas' || chr(10) ||
  'https://wspai.vercel.app/proyectos/sol-de-carhuaz-portico.jpg | Pórtico de ingreso' || chr(10) ||
  'https://wspai.vercel.app/proyectos/sol-de-carhuaz-areas.jpg | Áreas verdes' || chr(10) ||
  'https://wspai.vercel.app/proyectos/sol-de-carhuaz-ubicacion.jpg | Mapa de ubicación'
WHERE nombre = 'Sol de Carhuaz';

UPDATE proyectos SET imagenes =
  'https://wspai.vercel.app/proyectos/los-sauces-portada.jpg | Portada del condominio' || chr(10) ||
  'https://wspai.vercel.app/proyectos/los-sauces-piscina.jpg | Área de esparcimiento con piscina' || chr(10) ||
  'https://wspai.vercel.app/proyectos/los-sauces-plano.jpg | Plano del condominio'
WHERE nombre = 'Los Sauces';

UPDATE proyectos SET imagenes =
  'https://wspai.vercel.app/proyectos/monte-alegre-portico.jpg | Pórtico de ingreso' || chr(10) ||
  'https://wspai.vercel.app/proyectos/monte-alegre-ubicacion.jpg | Mapa de ubicación'
WHERE nombre = 'Monte Alegre';

UPDATE proyectos SET imagenes =
  'https://wspai.vercel.app/proyectos/la-palma-paracas-portada.jpg | Portada del proyecto' || chr(10) ||
  'https://wspai.vercel.app/proyectos/la-palma-paracas-vista.jpg | Vista del proyecto' || chr(10) ||
  'https://wspai.vercel.app/proyectos/la-palma-paracas-plano.jpg | Plano del proyecto'
WHERE nombre = 'La Palma Paracas';

UPDATE proyectos SET imagenes =
  'https://wspai.vercel.app/proyectos/casa-sauces-portada.jpg | Portada del proyecto' || chr(10) ||
  'https://wspai.vercel.app/proyectos/casa-sauces-vista.jpg | Vista del proyecto'
WHERE nombre = 'Casa Sauces';


-- ── Verificacion ─────────────────────────────────────────────────
SELECT nombre,
       CASE WHEN imagenes IS NULL OR trim(imagenes) = '' THEN 'sin imagenes'
            ELSE (length(imagenes) - length(replace(imagenes, chr(10), '')) + 1)::text || ' imagen(es)'
       END AS estado
FROM proyectos ORDER BY orden;
