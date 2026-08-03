-- ================================================================
-- Enlaces cortos de agenda
--
-- Antes el enlace llevaba el token firmado entero en la query string:
--   .../agendar?token=KzUxOTM3NzcwMTU5.1786369186378.ZXC3E1mwBHk...
-- Larguisimo y con pinta de spam, que en WhatsApp baja los clics.
--
-- Ahora se guarda el enlace en esta tabla y se comparte un codigo de 7
-- caracteres:  .../visita/k7m2xqp
--
-- El codigo sale de un alfabeto sin caracteres ambiguos (nada de 0/O ni
-- 1/l/I) por si alguien lo dicta por telefono.
-- ================================================================

CREATE TABLE IF NOT EXISTS enlaces_agenda (
  codigo TEXT PRIMARY KEY,
  numero_telefono TEXT NOT NULL,
  proyecto TEXT,
  expira_en TIMESTAMPTZ NOT NULL,
  usos INTEGER DEFAULT 0,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enlaces_expira ON enlaces_agenda (expira_en);

ALTER TABLE enlaces_agenda DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE enlaces_agenda IS
  'Enlaces cortos que Valeria manda por WhatsApp para agendar visitas. El codigo reemplaza al token firmado en la URL.';

-- Limpieza de los vencidos hace mas de 30 dias, para que no crezca sin control
DELETE FROM enlaces_agenda WHERE expira_en < NOW() - INTERVAL '30 days';

SELECT count(*) AS enlaces_activos FROM enlaces_agenda WHERE expira_en > NOW();
