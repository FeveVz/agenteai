-- ================================================================
-- SCHEMA para Ceinys — Constructora e Inmobiliaria
--
-- Este archivo es para una instalación LIMPIA (proyecto Supabase nuevo).
-- Si ya tenés la base andando con el esquema anterior (Suggestion),
-- NO uses este archivo: corré `supabase-migration-ceinys.sql`.
--
-- Pegar en Supabase → SQL Editor → Run.
-- ================================================================

-- Tabla: mensajes_whatsapp
CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
  id BIGSERIAL PRIMARY KEY,
  numero_telefono TEXT NOT NULL,
  contenido_mensaje TEXT NOT NULL,
  remitente TEXT NOT NULL CHECK(remitente IN ('usuario', 'asistente')),
  tipo_mensaje TEXT NOT NULL DEFAULT 'texto',
  respuesta_ia TEXT,
  procesado INTEGER DEFAULT 0,
  recibido_en TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: visitas — visitas agendadas a los proyectos
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

-- Tabla: proyectos — catálogo que conoce Valeria
CREATE TABLE IF NOT EXISTS proyectos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  ubicacion TEXT,
  tipo TEXT,
  descripcion TEXT,
  precio_desde TEXT,
  area_desde TEXT,
  caracteristicas TEXT,
  financiamiento TEXT,
  estado_comercial TEXT,        -- Pre-venta / En obra / Entregado
  entrega_titulo TEXT,          -- cuándo se entrega el título y la posesión
  mapa_url TEXT,                -- enlace de Google Maps (http/https)
  imagenes TEXT,                -- una URL pública por línea, descripción tras " | "
  activo BOOLEAN DEFAULT TRUE,
  orden INTEGER DEFAULT 100,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: configuracion_agencia — datos de la empresa
CREATE TABLE IF NOT EXISTS configuracion_agencia (
  id BIGSERIAL PRIMARY KEY,
  nombre_agencia TEXT DEFAULT 'Ceinys',
  slogan TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  horarios TEXT,
  servicios TEXT,
  sobre_agencia TEXT,
  casos_exito TEXT,
  redes_sociales TEXT,
  preguntas_frecuentes TEXT,
  reglas_agente TEXT,
  email_alertas TEXT,           -- destinatarios del aviso al agendarse una visita
  webhook_url TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger compartido de actualizado_en
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'actualizar_visita_timestamp') THEN
    CREATE TRIGGER actualizar_visita_timestamp
      BEFORE UPDATE ON visitas FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'actualizar_proyecto_timestamp') THEN
    CREATE TRIGGER actualizar_proyecto_timestamp
      BEFORE UPDATE ON proyectos FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();
  END IF;
END $$;

-- Proyectos de Ceinys (solo nombres verificados — el resto se completa
-- desde el panel; Valeria no inventa datos que no estén cargados)
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

-- Configuración base
INSERT INTO configuracion_agencia (nombre_agencia, slogan, sobre_agencia, servicios, reglas_agente)
SELECT
  'Ceinys',
  'Constructora e Inmobiliaria',
  'Somos Ceinys, constructora e inmobiliaria peruana. Desarrollamos y comercializamos '
  || 'proyectos de lotes y viviendas en distintas zonas del país, acompañando al cliente '
  || 'desde la primera visita hasta la entrega de su propiedad.',
  '["Venta de lotes","Venta de viviendas","Asesoría de inversión inmobiliaria","Financiamiento directo","Acompañamiento legal y notarial","Visitas guiadas a proyectos"]',
  '- Solo hablar de Ceinys y sus proyectos inmobiliarios.' || chr(10) ||
  '- NUNCA inventar precios, metrajes, ubicaciones ni financiamiento. Si el dato no está cargado, derivar a un asesor.' || chr(10) ||
  '- El objetivo de cada conversación es agendar una visita al proyecto.'
WHERE NOT EXISTS (SELECT 1 FROM configuracion_agencia);

-- RLS activo y SIN políticas: así ni anon ni authenticated pueden tocar
-- estas tablas. El backend entra con la service_role key, que ignora RLS,
-- por lo que sigue funcionando igual. Es la postura segura para tablas que
-- guardan conversaciones y teléfonos de clientes.
ALTER TABLE mensajes_whatsapp     ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_agencia ENABLE ROW LEVEL SECURITY;
