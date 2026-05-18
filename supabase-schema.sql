-- ================================================================
-- SCHEMA para Clínica Dental — pegar en Supabase SQL Editor
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

-- Tabla: turnos (fecha_turno como TEXT para evitar problemas de timezone)
CREATE TABLE IF NOT EXISTS turnos (
  id BIGSERIAL PRIMARY KEY,
  numero_telefono TEXT NOT NULL,
  nombre_paciente TEXT,
  fecha_turno TEXT,
  tipo_turno TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'confirmado', 'cancelado', 'completado')),
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

CREATE TRIGGER actualizar_turno_timestamp
BEFORE UPDATE ON turnos
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- Tabla: configuracion_clinica
CREATE TABLE IF NOT EXISTS configuracion_clinica (
  id BIGSERIAL PRIMARY KEY,
  nombre_clinica TEXT DEFAULT 'Clínica Dental Sonrisa',
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  horarios TEXT,
  servicios TEXT,
  sobre_clinica TEXT,
  webhook_url TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Configuración por defecto
INSERT INTO configuracion_clinica (nombre_clinica, direccion, telefono, email, horarios, servicios, sobre_clinica)
VALUES (
  'Clínica Dental Sonrisa',
  'Av. Corrientes 1234, Piso 2, Buenos Aires',
  '+54 11 4567-8900',
  'turnos@clinicasonrisa.com.ar',
  'Lunes a Viernes: 9:00 - 18:00 hs' || chr(10) || 'Sábados: 9:00 - 13:00 hs' || chr(10) || 'Domingos: Cerrado',
  '["Limpieza dental","Ortodoncia","Implantes dentales","Blanqueamiento","Extracción","Endodoncia","Prótesis dental","Urgencias dentales"]',
  'Somos una clínica dental de vanguardia con más de 15 años de experiencia. Nuestro equipo de profesionales altamente capacitados se dedica a brindar la mejor atención odontológica con tecnología de última generación. Tu sonrisa es nuestra prioridad.'
);

-- Deshabilitar RLS (el acceso es desde el backend con service key)
ALTER TABLE mensajes_whatsapp DISABLE ROW LEVEL SECURITY;
ALTER TABLE turnos DISABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_clinica DISABLE ROW LEVEL SECURITY;
