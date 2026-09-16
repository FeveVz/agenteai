-- ================================================================
-- ESQUEMA BASE — sirve para CUALQUIER clienta
--
-- Esto es solo estructura: tablas, índices, triggers y RLS. No siembra
-- ni un dato de ningún negocio en particular. Correrlo entero en un
-- proyecto Supabase nuevo deja la base lista para que la clienta cargue
-- todo desde el panel (Configuración y Proyectos).
--
--   Supabase → SQL Editor → pegar → Run.
--
-- Es idempotente: se puede correr varias veces sin romper nada.
--
-- Los datos de cada clienta viven en sql/clientes/<clienta>/. Nunca
-- corras el de una en la base de otra.
--
-- Antes esto estaba en supabase-schema.sql, que además sembraba los
-- nueve proyectos de Ceinys y su configuración. Era el único archivo
-- que el README mandaba correr, así que toda base nueva nacía hablando
-- de Ceinys y ofreciendo Sol de Carhuaz.
-- ================================================================


-- ── Conversaciones ───────────────────────────────────────────────
-- Historial de WhatsApp. La memoria del agente son los últimos mensajes
-- de este número.
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


-- ── Visitas agendadas ────────────────────────────────────────────
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


-- ── Catálogo ─────────────────────────────────────────────────────
-- El agente SOLO menciona lo que esté acá con activo = true.
--
-- Nota sobre `nombre UNIQUE`: alcanza mientras la clienta sea dueña de
-- sus proyectos. Para una asesora que intermedia entre varias
-- constructoras, dos de ellas pueden tener un "Los Álamos" y esta
-- restricción impide cargar el segundo. Se resuelve junto con la
-- columna de desarrolladora, no antes: sin ella, dos filas con el mismo
-- nombre son indistinguibles para el agente y para la clienta.
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
  desarrolladora TEXT,          -- empresa duena del proyecto; referencia desarrolladoras.nombre
  mapa_url TEXT,                -- enlace de Google Maps (http/https)
  imagenes TEXT,                -- una URL pública por línea, descripción tras " | "
  activo BOOLEAN DEFAULT TRUE,
  orden INTEGER DEFAULT 100,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);


-- ── Configuración del negocio ────────────────────────────────────
-- De acá sale TODO lo que el agente dice sobre la empresa. El código no
-- guarda ningún dato de negocio: si un campo está vacío, el agente no lo
-- improvisa, deriva a un asesor.
--
-- `nombre_agencia` sin DEFAULT a propósito. Antes tenía DEFAULT 'Ceinys',
-- así que una base mal cargada decía "Ceinys" en silencio en vez de
-- avisar que faltaba configurarla.
CREATE TABLE IF NOT EXISTS configuracion_agencia (
  id BIGSERIAL PRIMARY KEY,
  nombre_agencia TEXT,
  nombre_agente TEXT,           -- como se presenta el agente. Si esta vacio usa 'Valeria'
  tipo_negocio TEXT,            -- ej: 'constructora e inmobiliaria' o 'asesora inmobiliaria independiente'.
                                --     Estaba clavado como constructora, y afirmarlo de una asesora que
                                --     solo intermedia la hace responsable de obras ajenas.
  slogan TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  horarios TEXT,                -- texto libre para el FAQ; el calendario usa las columnas de abajo
  -- Horario de atencion. Lo usa el calendario publico Y el agente, asi que
  -- no puede estar clavado en el codigo: cada clienta atiende distinto.
  hora_apertura INTEGER DEFAULT 9,
  hora_cierre INTEGER DEFAULT 17,
  minutos_por_slot INTEGER DEFAULT 30,
  dias_atencion TEXT DEFAULT '0,1,2,3,4,5,6',  -- convencion de Date.getDay(): 0=domingo
  servicios TEXT,
  sobre_agencia TEXT,
  casos_exito TEXT,
  redes_sociales TEXT,
  preguntas_frecuentes TEXT,
  reglas_agente TEXT,
  estilo_respuesta TEXT,        -- como se VE la respuesta en WhatsApp (emojis, negritas,
                                --     saltos de linea). El codigo trae una base expresiva;
                                --     lo que se cargue aca manda por encima de ella.
  email_alertas TEXT,           -- destinatarios del aviso al agendarse una visita
  webhook_url TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Una fila vacía para que el panel tenga qué editar. El backend lee
-- siempre la primera fila (ORDER BY id LIMIT 1).
INSERT INTO configuracion_agencia (nombre_agencia)
SELECT NULL
WHERE NOT EXISTS (SELECT 1 FROM configuracion_agencia);


-- ── Desarrolladoras ──────────────────────────────────────────────
-- Las empresas dueñas de los proyectos.
--
-- Para una constructora que vende lo suyo, esta tabla tiene una sola fila
-- y casi no se nota. Para una asesora que intermedia entre varias, es la
-- pieza central: cada proyecto pertenece a una empresa distinta, con sus
-- PROPIAS cuentas bancarias.
--
-- Por eso los datos de pago viven acá y no en `proyectos`: si estuvieran
-- por proyecto, dos proyectos de la misma empresa podrían terminar con
-- cuentas distintas sin que nadie lo note, y una inicial de S/15,000 se
-- iría a la empresa equivocada. Acá se cargan una vez por empresa y todos
-- sus proyectos heredan las mismas.
CREATE TABLE IF NOT EXISTS desarrolladoras (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,   -- como la conoce el cliente. Ej: "Mi Casa"
  razon_social TEXT,             -- la de los contratos. Ej: "Inmobiliaria y Constructora Mi Casa S.A.C."
  pago_imagen_url TEXT,          -- gráfica oficial de cuentas (http/https). El agente manda ESTO, nunca números escritos.
  notas TEXT,                    -- para el equipo, no se le manda al cliente
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);


-- ── Enlaces cortos de agenda ─────────────────────────────────────
-- El agente manda .../visita/k7m2xqp en vez del token firmado entero,
-- que era larguísimo y con pinta de spam (y en WhatsApp eso baja los
-- clics). El código sale de un alfabeto sin caracteres ambiguos, por si
-- alguien lo dicta por teléfono.
--
-- Estaba solo en una migración aparte que el README ni mencionaba: sin
-- esta tabla el agente no puede mandar el calendario, y el health check
-- ni se enteraba.
CREATE TABLE IF NOT EXISTS enlaces_agenda (
  codigo TEXT PRIMARY KEY,
  numero_telefono TEXT NOT NULL,
  proyecto TEXT,
  expira_en TIMESTAMPTZ NOT NULL,
  usos INTEGER DEFAULT 0,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enlaces_expira ON enlaces_agenda (expira_en);

COMMENT ON TABLE enlaces_agenda IS
  'Enlaces cortos que el agente manda por WhatsApp para agendar visitas. El codigo reemplaza al token firmado en la URL.';


-- ── Trigger compartido de actualizado_en ─────────────────────────
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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'actualizar_desarrolladora_timestamp') THEN
    CREATE TRIGGER actualizar_desarrolladora_timestamp
      BEFORE UPDATE ON desarrolladoras FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();
  END IF;
END $$;


-- ── Row Level Security ───────────────────────────────────────────
-- RLS activo y SIN políticas: así ni anon ni authenticated pueden tocar
-- estas tablas. El backend entra con la service_role key, que ignora
-- RLS, por lo que sigue funcionando igual. Es la postura segura para
-- tablas que guardan conversaciones y teléfonos de clientes.
ALTER TABLE mensajes_whatsapp     ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_agencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE enlaces_agenda        ENABLE ROW LEVEL SECURITY;
ALTER TABLE desarrolladoras       ENABLE ROW LEVEL SECURITY;


-- ── Verificación ─────────────────────────────────────────────────
-- Las seis tablas tienen que aparecer acá. Si falta alguna, el
-- despliegue va a fallar de formas raras en vez de avisar.
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('mensajes_whatsapp', 'visitas', 'proyectos', 'configuracion_agencia', 'enlaces_agenda', 'desarrolladoras')
ORDER BY tablename;
