-- MIGRACIÓN — para bases que YA EXISTEN
--
-- Lo que el sistema aprende de las conversaciones.
--
-- El modelo no aprende: cada mensaje arranca de cero y sus pesos no cambian
-- con el uso. Lo único que persiste es lo que le metemos en el prompt. Estas
-- tres tablas son eso: el lugar donde se acumula lo aprendido para poder
-- devolvérselo en la siguiente conversación.
--
-- Es idempotente: se puede correr las veces que haga falta.

-- ── Correcciones ───────────────────────────────────────────────────
-- Cuando la clienta ve una respuesta mala y escribe la que correspondía.
-- Las activas viajan en el prompt como ejemplos: es la vía más directa
-- para corregir el estilo sin tocar código ni desplegar.
CREATE TABLE IF NOT EXISTS correcciones (
  id BIGSERIAL PRIMARY KEY,
  numero_telefono TEXT,
  dijo TEXT NOT NULL,           -- lo que el agente respondió
  debio_decir TEXT NOT NULL,    -- lo que tenía que haber respondido
  nota TEXT,                    -- por qué estuvo mal, opcional
  activa BOOLEAN DEFAULT TRUE,  -- se desactiva sin perder el historial
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_correcciones_activas
  ON correcciones (activa, creado_en DESC);

-- ── Compradores ────────────────────────────────────────────────────
-- Lo que sabemos de cada persona, más allá del chat en curso. El agente ve
-- los últimos 20 mensajes de ese número, así que dentro de una conversación
-- ya tiene contexto; esto es para cuando alguien vuelve dos semanas después
-- y no hay que preguntarle de nuevo lo que ya contó.
CREATE TABLE IF NOT EXISTS compradores (
  numero_telefono TEXT PRIMARY KEY,
  nombre TEXT,
  resumen TEXT,                 -- qué busca, presupuesto, qué proyectos vio
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ── Análisis ───────────────────────────────────────────────────────
-- El informe de huecos. Se guarda en vez de recalcularse porque cada corrida
-- cuesta una llamada al modelo, y el panel se abre muchas más veces de las
-- que hace falta volver a analizar.
CREATE TABLE IF NOT EXISTS analisis (
  id BIGSERIAL PRIMARY KEY,
  generado_en TIMESTAMPTZ DEFAULT NOW(),
  mensajes_analizados INTEGER,
  hasta_mensaje BIGINT,         -- último id incluido, para no repetir trabajo
  resultado JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analisis_reciente
  ON analisis (generado_en DESC);

ALTER TABLE correcciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE compradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE analisis ENABLE ROW LEVEL SECURITY;
