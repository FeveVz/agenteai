-- ================================================================
-- Enlace de Google Maps por proyecto
--
-- Valeria lo comparte cuando preguntan donde queda o como llegar, y
-- aparece en la pantalla de confirmacion despues de agendar la visita,
-- que es cuando el cliente realmente lo necesita.
--
-- Idempotente.
-- ================================================================

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS mapa_url TEXT;

COMMENT ON COLUMN proyectos.mapa_url IS
  'Enlace de Google Maps del proyecto. Debe empezar con http:// o https://.';

SELECT nombre,
       CASE WHEN mapa_url IS NULL OR trim(mapa_url) = '' THEN 'sin mapa' ELSE 'ok' END AS mapa
FROM proyectos ORDER BY orden;
