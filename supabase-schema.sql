-- ================================================================
-- SCHEMA para Suggestion — Agencia de Marketing Digital
-- Pegar en Supabase SQL Editor y ejecutar
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

-- Tabla: reuniones (equivalente a turnos, adaptado para agencia)
CREATE TABLE IF NOT EXISTS reuniones (
  id BIGSERIAL PRIMARY KEY,
  numero_telefono TEXT NOT NULL,
  nombre_cliente TEXT,
  empresa TEXT,
  fecha_reunion TEXT,
  tipo_servicio TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
  notas TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para actualizar actualizado_en
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER actualizar_reunion_timestamp
BEFORE UPDATE ON reuniones
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- Tabla: configuracion_agencia
CREATE TABLE IF NOT EXISTS configuracion_agencia (
  id BIGSERIAL PRIMARY KEY,
  nombre_agencia TEXT DEFAULT 'Suggestion',
  slogan TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  horarios TEXT,
  servicios TEXT,
  sobre_agencia TEXT,
  webhook_url TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Configuración por defecto con datos reales de Suggestion
INSERT INTO configuracion_agencia (nombre_agencia, slogan, direccion, telefono, email, horarios, servicios, sobre_agencia)
VALUES (
  'Suggestion',
  'Consigue lo posible haciendo lo imposible',
  'Residencial Jardin C4, Urb San Jose, Perú',
  '+51 937770159',
  'suggesion.mk@gmail.com',
  'Lunes a Viernes: 9:00 - 18:00 hs' || chr(10) || 'Sábados: 9:00 - 13:00 hs',
  '["Marketing Digital","Redes Sociales","Publicidad Digital (Meta Ads & Google Ads)","SEO y Posicionamiento","Branding e Identidad Visual","Desarrollo Web","Consultoría Estratégica","CRM y Automatización","Producción Audiovisual","Investigación de Mercado"]',
  'Somos Suggestion, una agencia de marketing digital que transforma tu presencia en resultados. Con más de 10 años de experiencia, 150+ clientes satisfechos y 500+ proyectos completados, ayudamos a empresas a crecer con estrategias integrales de marketing digital. Clientes como Mazda, Renault, Repsol y Subaru confían en nosotros.'
);

-- Deshabilitar RLS (acceso desde backend con service key)
ALTER TABLE mensajes_whatsapp DISABLE ROW LEVEL SECURITY;
ALTER TABLE reuniones DISABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_agencia DISABLE ROW LEVEL SECURITY;
