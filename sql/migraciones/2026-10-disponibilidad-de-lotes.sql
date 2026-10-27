-- ================================================================
-- MIGRACIÓN — disponibilidad de lotes por proyecto
--
-- NO es obligatoria para desplegar: el panel y la API funcionan igual
-- si esta columna todavía no existe. server/routes/proyectos.js detecta
-- el error de columna ausente (42703 / PGRST204), reintenta el guardado
-- sin este campo y avisa en el panel que falta correr la migración.
--
-- Por qué hace falta: "qué lotes están libres" es la pregunta que más
-- veces terminó en "no tengo ese dato" en las conversaciones del último
-- mes, y el catálogo no tiene dónde cargarla. El único lugar posible era
-- Características o Descripción, que son texto suelto donde el modelo ya
-- mezcla datos: así, el hueco reaparece en cada análisis porque es
-- incargable. Este proyecto ya comprobó tres veces que el dato en el
-- catálogo le gana a la regla en el prompt.
--
-- Es idempotente: se puede correr varias veces sin romper nada.
--
--   Supabase -> SQL Editor -> pegar -> Run.
-- ================================================================


-- Una línea por lote o etapa. Ejemplo de lo que va acá:
--   Etapa 2 - lote 14 - 120 m2 - frente al parque
--   Etapa 3 - lotes 8, 9 y 10 - 109 m2
--
-- Se deja en NULL a propósito en vez de rellenarla con algo inventado:
-- mientras esté vacía, el panel muestra el hueco y el agente no puede
-- afirmar qué lotes quedan.
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS disponibilidad TEXT;


-- ── Verificación ─────────────────────────────────────────────────
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'proyectos'
  AND column_name = 'disponibilidad';
