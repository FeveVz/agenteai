-- ================================================================
-- MIGRACIÓN: Suggestion (agencia de marketing) → Ceinys (inmobiliaria)
--
-- Pegar completo en Supabase → SQL Editor → Run.
-- Es IDEMPOTENTE: se puede correr varias veces sin romper nada.
--
-- ⚠️ CORRER ESTO **ANTES** DE DESPLEGAR EL CÓDIGO NUEVO.
--    El código nuevo lee las tablas `visitas` y `proyectos`; si la
--    migración no corrió, la app responde con error 500.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. reuniones → visitas
-- ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Renombrar la tabla solo si todavía se llama "reuniones"
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'reuniones')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_schema = 'public' AND table_name = 'visitas')
  THEN
    ALTER TABLE reuniones RENAME TO visitas;
    RAISE NOTICE 'Tabla reuniones renombrada a visitas.';
  END IF;
END $$;

DO $$
BEGIN
  -- fecha_reunion → fecha_visita
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'visitas'
               AND column_name = 'fecha_reunion')
  THEN
    ALTER TABLE visitas RENAME COLUMN fecha_reunion TO fecha_visita;
    RAISE NOTICE 'Columna fecha_reunion renombrada a fecha_visita.';
  END IF;

  -- tipo_servicio → proyecto_interes
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'visitas'
               AND column_name = 'tipo_servicio')
  THEN
    ALTER TABLE visitas RENAME COLUMN tipo_servicio TO proyecto_interes;
    RAISE NOTICE 'Columna tipo_servicio renombrada a proyecto_interes.';
  END IF;
END $$;

-- La columna "empresa" no aplica a venta de lotes (cliente final, no B2B)
ALTER TABLE visitas DROP COLUMN IF EXISTS empresa;

-- Crear la tabla desde cero si es una instalación nueva
CREATE TABLE IF NOT EXISTS visitas (
  id BIGSERIAL PRIMARY KEY,
  numero_telefono TEXT NOT NULL,
  nombre_cliente TEXT,
  fecha_visita TEXT,
  proyecto_interes TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
  notas TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Renombrar el trigger heredado para que refleje el dominio nuevo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'actualizar_reunion_timestamp')
  THEN
    ALTER TRIGGER actualizar_reunion_timestamp ON visitas
      RENAME TO actualizar_visita_timestamp;
    RAISE NOTICE 'Trigger renombrado a actualizar_visita_timestamp.';
  END IF;
END $$;

-- Asegurar que la función y el trigger existan (instalación nueva)
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'actualizar_visita_timestamp')
  THEN
    CREATE TRIGGER actualizar_visita_timestamp
      BEFORE UPDATE ON visitas
      FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 2. Nueva tabla: proyectos
--
--    Valeria lee esta tabla para saber qué proyectos existen.
--    Solo se siembran los NOMBRES (verificados). Los demás campos
--    quedan NULL a propósito: el agente tiene prohibido inventar
--    precios, áreas o ubicaciones, así que mientras estén vacíos
--    va a derivar al asesor en lugar de improvisar un dato.
--
--    Completá lo que quieras que Valeria sepa decir.
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proyectos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  ubicacion TEXT,
  tipo TEXT,                    -- ej: 'Lotes', 'Casas', 'Lotes con servicios'
  descripcion TEXT,
  precio_desde TEXT,            -- texto libre: 'S/ 25,000' o 'Desde S/ 350/m²'
  area_desde TEXT,              -- ej: 'Desde 120 m²'
  caracteristicas TEXT,         -- viñetas separadas por salto de línea
  financiamiento TEXT,          -- ej: 'Inicial 20% + 36 cuotas sin intereses'
  activo BOOLEAN DEFAULT TRUE,  -- false = no lo ofrece Valeria
  orden INTEGER DEFAULT 100,    -- para ordenar en el panel y en la landing
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'actualizar_proyecto_timestamp')
  THEN
    CREATE TRIGGER actualizar_proyecto_timestamp
      BEFORE UPDATE ON proyectos
      FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();
  END IF;
END $$;

-- Sembrar los proyectos de Ceinys (ON CONFLICT: no duplica si ya existen)
INSERT INTO proyectos (nombre, orden) VALUES
  ('Altos de Sacta',   10),
  ('Valle Sacta',      20),
  ('Arenas del Valle', 30),
  ('Sol de Carhuaz',   40),
  ('Club Carhuaz',     50),
  ('La Palma Paracas', 60),
  ('Monte Alegre',     70),
  ('Los Sauces',       80),
  ('Casa Sauces',      90)
ON CONFLICT (nombre) DO NOTHING;


-- ────────────────────────────────────────────────────────────────
-- 3. configuracion_agencia — columnas faltantes
--
--    El código ya usaba estos 4 campos pero nunca estuvieron en el
--    schema versionado (se agregaron a mano en Supabase). Los dejamos
--    declarados para que una instalación nueva no rompa.
-- ────────────────────────────────────────────────────────────────

ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS casos_exito TEXT;
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS redes_sociales TEXT;
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS preguntas_frecuentes TEXT;
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS reglas_agente TEXT;
ALTER TABLE configuracion_agencia ADD COLUMN IF NOT EXISTS webhook_url TEXT;


-- ────────────────────────────────────────────────────────────────
-- 4. Datos de Ceinys
--
--    ⚠️ Los campos que NO tengo verificados quedan en NULL a propósito
--       (teléfono, email, dirección, horarios). Valeria está programada
--       para derivar al asesor cuando falte un dato, en lugar de inventarlo.
--
--       Completalos desde el panel: /dashboard → Configuración
--       o descomentá y editá el bloque UPDATE de abajo.
-- ────────────────────────────────────────────────────────────────

UPDATE configuracion_agencia SET
  nombre_agencia = 'Ceinys',
  slogan         = 'Constructora e Inmobiliaria',
  sobre_agencia  = 'Somos Ceinys, constructora e inmobiliaria peruana. Desarrollamos y '
                || 'comercializamos proyectos de lotes y viviendas en distintas zonas del '
                || 'país, acompañando al cliente desde la primera visita hasta la entrega '
                || 'de su propiedad con respaldo legal y financiamiento directo.',
  servicios      = '["Venta de lotes","Venta de viviendas","Asesoría de inversión inmobiliaria","Financiamiento directo","Acompañamiento legal y notarial","Visitas guiadas a proyectos"]',
  telefono       = NULL,
  email          = NULL,
  direccion      = NULL,
  horarios       = NULL,
  casos_exito    = NULL,
  redes_sociales = NULL,
  actualizado_en = NOW()
WHERE id = (SELECT id FROM configuracion_agencia ORDER BY id LIMIT 1);

-- Si la tabla estuviera vacía (instalación nueva), insertar la fila base
INSERT INTO configuracion_agencia (nombre_agencia, slogan, sobre_agencia, servicios)
SELECT
  'Ceinys',
  'Constructora e Inmobiliaria',
  'Somos Ceinys, constructora e inmobiliaria peruana.',
  '["Venta de lotes","Venta de viviendas","Asesoría de inversión inmobiliaria"]'
WHERE NOT EXISTS (SELECT 1 FROM configuracion_agencia);

-- Reglas por defecto del agente (solo si están vacías, para no pisar tus ajustes)
UPDATE configuracion_agencia SET reglas_agente =
  '- Solo hablar de Ceinys y sus proyectos inmobiliarios. Si preguntan otro tema, redirigir con amabilidad.' || chr(10) ||
  '- NUNCA inventar precios, metrajes, ubicaciones ni condiciones de financiamiento. Si el dato no está cargado en el proyecto, ofrecer que un asesor lo confirme.' || chr(10) ||
  '- El objetivo de cada conversación es agendar una visita al proyecto.' || chr(10) ||
  '- Nunca prometer separación, descuento ni reserva de lote: eso lo confirma un asesor.' || chr(10) ||
  '- No hablar negativamente de otras inmobiliarias.'
WHERE reglas_agente IS NULL OR trim(reglas_agente) = '';


-- ────────────────────────────────────────────────────────────────
-- 5. RLS (el backend entra con service key)
-- ────────────────────────────────────────────────────────────────

-- RLS activo y sin politicas: el backend usa service_role, que lo ignora.
ALTER TABLE mensajes_whatsapp       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_agencia   ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────────
-- 6. Verificación — debería devolver 9 proyectos y la config de Ceinys
-- ────────────────────────────────────────────────────────────────

SELECT 'proyectos' AS tabla, count(*)::text AS total FROM proyectos
UNION ALL
SELECT 'visitas',   count(*)::text FROM visitas
UNION ALL
SELECT 'config',    nombre_agencia FROM configuracion_agencia ORDER BY 1;
