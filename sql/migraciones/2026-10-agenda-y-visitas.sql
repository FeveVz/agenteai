-- ================================================================
-- MIGRACIÓN — página pública de agenda y manejo de visitas
--
-- NO es obligatoria para desplegar: el código tolera que estas columnas
-- todavía no existan. Pero sin ella se siguen perdiendo las dos cosas
-- que hoy no se pueden medir ni cargar.
--
-- Una base nueva NO necesita esto: sql/esquema.sql ya las incluye.
-- El motivo de que haga falta un archivo aparte es que
-- `CREATE TABLE IF NOT EXISTS` no agrega columnas a una tabla que ya
-- existe: la salta entera y no avisa.
--
-- Es idempotente: se puede correr varias veces sin romper nada.
--
--   Supabase → SQL Editor → pegar → Run.
-- ================================================================


-- ── 1. El embudo del enlace: enviado → abierto → reservado ───────
--
-- `usos` existe desde el principio y ningún código la escribía: los 16
-- enlaces emitidos están los 16 en cero. Así no se puede distinguir
-- "mandé 11 enlaces y nadie los abrió" (problema del mensaje) de "los
-- abrieron y el formulario los expulsó" (problema de la página), que son
-- dos arreglos opuestos.
--
-- `abierto_en` guarda el PRIMER clic, que es la señal de seguimiento más
-- fuerte que existe: enlace abierto y sin reservar es el lead que hay
-- que llamar el mismo día.
ALTER TABLE enlaces_agenda ADD COLUMN IF NOT EXISTS abierto_en   TIMESTAMPTZ;
ALTER TABLE enlaces_agenda ADD COLUMN IF NOT EXISTS reservado_en TIMESTAMPTZ;

COMMENT ON COLUMN enlaces_agenda.abierto_en IS
  'Primera vez que se cargó /visita/<codigo>. NULL = nunca lo abrió.';
COMMENT ON COLUMN enlaces_agenda.reservado_en IS
  'Momento en que ese enlace produjo una visita. NULL = lo abrió y no reservó.';


-- ── 2. Incremento atómico de usos ────────────────────────────────
--
-- Dos pestañas abiertas a la vez con un read-modify-write desde Node
-- pierden una apertura. Acá el `usos + 1` lo hace Postgres.
--
-- El código llama a esta función y, si no existe (migración sin correr),
-- cae a un UPDATE simple: por eso la página no se rompe sin esto.
CREATE OR REPLACE FUNCTION incrementar_uso_enlace(p_codigo TEXT)
RETURNS VOID AS $$
  UPDATE enlaces_agenda
     SET usos = COALESCE(usos, 0) + 1,
         abierto_en = COALESCE(abierto_en, NOW())
   WHERE codigo = p_codigo;
$$ LANGUAGE sql;


-- ── 3. Teléfono de contacto de la visita ─────────────────────────
--
-- 10 de 131 contactos llegan de Twilio como identidad de WhatsApp sin
-- número ('PE.2104140390227158'), y el enlace vivo de hoy es justo uno
-- de ésos. La página le mostraba "Te contactamos al ••••7158", que son
-- los últimos cuatro dígitos de un id interno, y si reservaba Pamela se
-- quedaba con una visita confirmada sin a quién llamar.
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS telefono_contacto TEXT;

COMMENT ON COLUMN visitas.telefono_contacto IS
  'Celular que dejó el comprador en el formulario. Se pide solo cuando numero_telefono no es un número alcanzable.';


-- ── 4. Índice para el tope de reservas por número ────────────────
--
-- El tope vivía en un Map de memoria y en Vercel cada instancia arranca
-- con el suyo vacío, así que no era un tope real. Ahora se cuenta en la
-- base: `where numero_telefono = ? and creado_en > now() - 1 hour`.
CREATE INDEX IF NOT EXISTS idx_visitas_numero_creado ON visitas (numero_telefono, creado_en);
