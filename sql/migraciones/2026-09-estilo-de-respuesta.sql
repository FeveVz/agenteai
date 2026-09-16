-- MIGRACIÓN — para bases que YA EXISTEN
--
-- Agrega el estilo de respuesta configurable desde el panel.
--
-- El agente escribía párrafos corridos: el prompt no tenía ninguna regla de
-- formato más allá de un límite de palabras. La base del estilo vive en el
-- código (así ninguna clienta nueva arranca sin formato), y esta columna
-- permite ajustarlo desde el panel sin desplegar.
--
-- Es idempotente: se puede correr las veces que haga falta.

ALTER TABLE configuracion_agencia
  ADD COLUMN IF NOT EXISTS estilo_respuesta TEXT;

COMMENT ON COLUMN configuracion_agencia.estilo_respuesta IS
  'Ajustes de formato del mensaje de WhatsApp. Se suma a las reglas del codigo y manda sobre ellas.';
