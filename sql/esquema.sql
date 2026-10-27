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
  -- 'texto' | 'audio_entrante' | 'imagen_entrante' | 'sticker_entrante' |
  -- 'ubicacion_entrante' | 'otro_medio_entrante' | 'puente' |
  -- 'texto_e_imagen' | 'texto_imagen_fallida'. Sin CHECK a propósito: el
  -- webhook tiene que poder guardar un tipo nuevo sin una migración, porque
  -- la alternativa es perder el mensaje del comprador.
  tipo_mensaje TEXT NOT NULL DEFAULT 'texto',
  medio_url TEXT,               -- URL del medio en api.twilio.com, o geo:<lat>,<lon>
  medio_mime TEXT,              -- audio/ogg, image/jpeg, image/webp (sticker)
  imagenes_enviadas INTEGER,    -- cuántas aceptó Twilio; NULL si se contestó por TwiML
  respuesta_ia TEXT,
  procesado INTEGER DEFAULT 0,
  recibido_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_tipo
  ON mensajes_whatsapp (tipo_mensaje, recibido_en DESC);


-- ── Visitas agendadas ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visitas (
  id BIGSERIAL PRIMARY KEY,
  numero_telefono TEXT NOT NULL,
  nombre_cliente TEXT,
  fecha_visita TEXT,
  proyecto_interes TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
  notas TEXT,
  -- Celular que deja el comprador en la pagina. Se pide solo cuando
  -- numero_telefono no es un numero alcanzable: 10 de 131 contactos llegan
  -- de Twilio como identidad de WhatsApp ('PE.2104140390227158') y sin este
  -- campo la visita quedaba confirmada sin a quien llamar.
  telefono_contacto TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- El tope de reservas por numero se cuenta en la base y no en memoria: en
-- Vercel cada instancia arranca con su propio Map y el tope no existia.
CREATE INDEX IF NOT EXISTS idx_visitas_numero_creado ON visitas (numero_telefono, creado_en);


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
  disponibilidad TEXT,          -- qué lotes quedan libres, uno por línea (etapa, número, área)
  desarrolladora TEXT,          -- empresa duena del proyecto; referencia desarrolladoras.nombre
  mapa_url TEXT,                -- enlace de Google Maps (http/https)
  latitud DOUBLE PRECISION,     -- para calcular la distancia cuando el comprador
  longitud DOUBLE PRECISION,    -- comparte su ubicación; vacías = distancia no calculada
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
  -- El embudo del enlace: enviado -> abierto -> reservado. Sin estas tres
  -- columnas escritas no se puede distinguir "nadie lo abrio" (problema del
  -- mensaje) de "lo abrio y el formulario lo expulso" (problema de la pagina),
  -- que son dos arreglos opuestos. Medido: 16 enlaces emitidos, 1 visita.
  usos INTEGER DEFAULT 0,
  abierto_en TIMESTAMPTZ,
  reservado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enlaces_expira ON enlaces_agenda (expira_en);
-- crearEnlaceAgenda reusa el enlace vivo del mismo numero en vez de acunar
-- otro: en la base quedaron dos pares de enlaces para el mismo comprador,
-- uno de ellos con 11 segundos de diferencia.
CREATE INDEX IF NOT EXISTS idx_enlaces_numero ON enlaces_agenda (numero_telefono, expira_en);

-- Incremento atomico de usos. El codigo la llama y, si no existe todavia,
-- cae a un UPDATE simple: por eso la pagina no se rompe sin esta funcion.
CREATE OR REPLACE FUNCTION incrementar_uso_enlace(p_codigo TEXT)
RETURNS VOID AS $$
  UPDATE enlaces_agenda
     SET usos = COALESCE(usos, 0) + 1,
         abierto_en = COALESCE(abierto_en, NOW())
   WHERE codigo = p_codigo;
$$ LANGUAGE sql;

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
-- ── Aprendizaje ──────────────────────────────────────────────────
-- El modelo no aprende solo: cada mensaje arranca de cero y sus pesos no
-- cambian con el uso. Lo unico que persiste entre conversaciones es lo que
-- nosotros le pongamos en el prompt. Estas tres tablas son ese lugar.

-- Cuando la clienta ve una respuesta mala y escribe la que correspondia.
-- Las activas viajan en el prompt como ejemplos.
CREATE TABLE IF NOT EXISTS correcciones (
  id BIGSERIAL PRIMARY KEY,
  numero_telefono TEXT,
  dijo TEXT NOT NULL,           -- lo que el agente respondio
  debio_decir TEXT NOT NULL,    -- lo que tenia que haber respondido
  nota TEXT,                    -- por que estuvo mal, opcional
  activa BOOLEAN DEFAULT TRUE,  -- se desactiva sin perder el historial
  -- Solo 6 correcciones viajan en el prompt (son ejemplos, no un manual) y
  -- hay exactamente 6 cargadas: la septima desalojaba a otra en silencio.
  resuelta_en_catalogo BOOLEAN DEFAULT FALSE, -- el dato ya quedo en el catalogo: libera cupo
  fijada BOOLEAN DEFAULT FALSE,               -- sigue fallando: no se cae nunca
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_correcciones_activas
  ON correcciones (activa, creado_en DESC);

-- Lo que sabemos de cada persona mas alla del chat en curso. Dentro de una
-- conversacion el agente ya ve los ultimos 20 mensajes; esto es para cuando
-- alguien vuelve semanas despues.
-- El resumen en prosa libre sale siempre generico: de los 47 que hay, 10 son
-- la misma frase y ninguno trae un nombre. Los campos de abajo son los que
-- sirven para retomar a un lead frio, y vacios se notan.
CREATE TABLE IF NOT EXISTS compradores (
  numero_telefono TEXT PRIMARY KEY,
  nombre TEXT,
  resumen TEXT,                 -- que busca, presupuesto, que proyectos vio
  uso TEXT DEFAULT 'sin_dato'
    CHECK (uso IN ('vivienda', 'inversion', 'casa_de_verano', 'comercial', 'sin_dato')),
  forma_pago TEXT DEFAULT 'sin_dato'
    CHECK (forma_pago IN ('contado', 'cuotas', 'credito_bancario', 'sin_dato')),
  presupuesto TEXT,             -- textual, como lo dijo el comprador
  plazo TEXT,                   -- para cuando quiere comprar, en sus palabras
  objecion TEXT,                -- lo que lo freno, en sus palabras
  dato_para_retomar TEXT,       -- frase propia citada para abrir el seguimiento
  telefono_alternativo TEXT,    -- otro numero que escribio en el chat
  ya_visito BOOLEAN DEFAULT FALSE,
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- El informe de huecos. Se guarda en vez de recalcularse: cada corrida
-- cuesta una llamada al modelo y el panel se abre mucho mas seguido.
CREATE TABLE IF NOT EXISTS analisis (
  id BIGSERIAL PRIMARY KEY,
  generado_en TIMESTAMPTZ DEFAULT NOW(),
  mensajes_analizados INTEGER,
  desde_mensaje BIGINT,         -- primer id EXCLUIDO: se leyo desde desde_mensaje+1
  hasta_mensaje BIGINT,         -- ultimo id incluido; de aca arranca la corrida siguiente
  resultado JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analisis_reciente
  ON analisis (generado_en DESC);


ALTER TABLE mensajes_whatsapp     ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_agencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE enlaces_agenda        ENABLE ROW LEVEL SECURITY;
ALTER TABLE desarrolladoras       ENABLE ROW LEVEL SECURITY;
ALTER TABLE correcciones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE compradores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE analisis             ENABLE ROW LEVEL SECURITY;


-- ── Verificación ─────────────────────────────────────────────────
-- Las nueve tablas tienen que aparecer acá. Si falta alguna, el
-- despliegue va a fallar de formas raras en vez de avisar.
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('mensajes_whatsapp', 'visitas', 'proyectos', 'configuracion_agencia',
                    'enlaces_agenda', 'desarrolladoras', 'correcciones', 'compradores', 'analisis')
ORDER BY tablename;
