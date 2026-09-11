-- ================================================================
-- MIGRACIÓN — para bases que YA EXISTEN (Ceinys)
--
-- ⚠️ OBLIGATORIA antes de desplegar, o la página de agenda deja de
-- funcionar. El código ahora consulta columnas que esta migración crea;
-- si no existen, PostgREST devuelve error y /visita/:codigo se rompe.
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


-- ── 1. Horario de atención configurable ──────────────────────────
-- Estaba clavado en el código (09:00–17:00, todos los días). Cada
-- clienta atiende distinto, y una que no trabaja domingos no puede
-- tener un calendario que se los ofrezca.
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS hora_apertura    INTEGER DEFAULT 9;
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS hora_cierre      INTEGER DEFAULT 17;
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS minutos_por_slot INTEGER DEFAULT 30;
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS dias_atencion    TEXT DEFAULT '0,1,2,3,4,5,6';

-- Las filas que ya existían quedan con NULL, no con el DEFAULT.
-- El código tolera NULL (cae al horario por defecto), pero dejarlo
-- explícito hace que el panel muestre los valores reales desde el inicio.
UPDATE configuracion_agencia SET
  hora_apertura    = COALESCE(hora_apertura, 9),
  hora_cierre      = COALESCE(hora_cierre, 17),
  minutos_por_slot = COALESCE(minutos_por_slot, 30),
  dias_atencion    = COALESCE(dias_atencion, '0,1,2,3,4,5,6');


-- ── 2. Identidad del agente ──────────────────────────────────────
-- El nombre estaba clavado como "Valeria" y el rubro como "constructora
-- e inmobiliaria peruana". Afirmar lo segundo de una asesora que solo
-- intermedia la hace responsable de obras ajenas.
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS nombre_agente TEXT;
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS tipo_negocio  TEXT;

-- Para las bases que ya venían andando, conservar lo que decían antes
-- de esta migración: si no, el agente cambiaría de nombre de golpe.
UPDATE configuracion_agencia SET
  nombre_agente = COALESCE(NULLIF(TRIM(nombre_agente), ''), 'Valeria'),
  tipo_negocio  = COALESCE(NULLIF(TRIM(tipo_negocio), ''), 'constructora e inmobiliaria peruana')
WHERE nombre_agencia IS NOT NULL;


-- ── 3. Constructoras dueñas de los proyectos ─────────────────────
-- Para una constructora que vende lo suyo, esta tabla tiene una fila y
-- casi no se nota. Para una asesora que intermedia entre varias, es la
-- pieza central: cada proyecto es de una empresa distinta, con SUS
-- PROPIAS cuentas bancarias.
CREATE TABLE IF NOT EXISTS desarrolladoras (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  razon_social TEXT,
  pago_imagen_url TEXT,
  notas TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE desarrolladoras ENABLE ROW LEVEL SECURITY;

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS desarrolladora TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'actualizar_desarrolladora_timestamp') THEN
    CREATE TRIGGER actualizar_desarrolladora_timestamp
      BEFORE UPDATE ON desarrolladoras FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();
  END IF;
END $$;


-- ── Verificación ─────────────────────────────────────────────────
-- Las siete columnas nuevas tienen que aparecer. Si falta alguna, NO
-- despliegues: la página de agenda va a fallar.
SELECT column_name
FROM information_schema.columns
WHERE table_name IN ('configuracion_agencia', 'proyectos')
  AND column_name IN ('hora_apertura', 'hora_cierre', 'minutos_por_slot',
                      'dias_atencion', 'nombre_agente', 'tipo_negocio', 'desarrolladora')
ORDER BY column_name;
