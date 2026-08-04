-- ================================================================
-- Correo de alerta al agendarse una visita
--
-- Se guarda en la configuracion (no en variables de entorno) para que
-- se pueda cambiar desde el panel sin redesplegar.
--
-- Admite varios destinatarios separados por coma, util para que le
-- llegue a todo el equipo comercial.
--
-- Si queda vacio, no se envia nada y el agendamiento funciona igual.
-- ================================================================

ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS email_alertas TEXT;

COMMENT ON COLUMN configuracion_agencia.email_alertas IS
  'Destinatarios del aviso cuando se agenda una visita. Separados por coma. Vacio = no se envia.';

SELECT COALESCE(email_alertas, '(sin configurar)') AS destinatarios_de_alerta
FROM configuracion_agencia ORDER BY id LIMIT 1;
