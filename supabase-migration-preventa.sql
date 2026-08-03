-- ================================================================
-- Estado comercial y entrega de titulo por proyecto
--
-- Motivo: no todos los proyectos tienen titulo de propiedad hoy. La
-- mayoria esta en PRE-VENTA y el titulo se entrega mas adelante. Decir
-- lo contrario es una promesa legal falsa en una compra de terreno.
--
-- Con estos dos campos Valeria dice la verdad de cada proyecto y puede
-- presentar la pre-venta como lo que es: la etapa de mejor precio.
--
-- Idempotente: se puede correr varias veces.
-- ================================================================

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS estado_comercial TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS entrega_titulo TEXT;

COMMENT ON COLUMN proyectos.estado_comercial IS
  'Pre-venta / En obra / Entregado. Define como Valeria explica el titulo.';
COMMENT ON COLUMN proyectos.entrega_titulo IS
  'Cuando se entrega el titulo y la posesion fisica. Texto libre.';


-- ── Datos con respaldo documental ────────────────────────────────
-- Solo se completa lo que figura en los brochures o en el cotizador.
-- Lo que no consta queda NULL: Valeria deriva al asesor.

-- Cotizador junio, 4ta etapa: "TITULO DICIEMBRE 2026", "ENTREGA FISICA 2029"
UPDATE proyectos SET
  estado_comercial = 'Pre-venta',
  entrega_titulo   = 'Título de propiedad proyectado para diciembre de 2026 y entrega física en 2029, según la etapa. El proyecto ya cuenta con partida registral y planeamiento integral aprobado por la Municipalidad de Ica.'
WHERE nombre = 'Sol de Carhuaz';

-- Brochure: "en fase de planificacion y diseno urbano", "precios de lanzamiento"
UPDATE proyectos SET
  estado_comercial = 'Pre-venta — etapa inicial',
  entrega_titulo   = 'El proyecto está en fase de planificación y diseño urbano. Se adquiere antes del inicio de obras y de la habilitación urbana, que es lo que permite acceder a los precios de lanzamiento.'
WHERE nombre = 'Arenas del Valle';

-- Brochure: "etapas entregadas al 100% de forma fisica y legal"
UPDATE proyectos SET
  estado_comercial = 'Etapas anteriores entregadas — etapa actual en venta',
  entrega_titulo   = 'Las etapas anteriores del proyecto ya fueron entregadas al 100% de forma física y legal. Consultá con un asesor la fecha de la etapa que te interese.'
WHERE nombre IN ('Valle Sacta', 'Los Sauces');

-- Brochure: continuacion de Valle Sacta, inscrito en Registros Publicos
UPDATE proyectos SET
  estado_comercial = 'Pre-venta',
  entrega_titulo   = 'Proyecto inscrito en Registros Públicos. Es la continuación de Valle Sacta, que ya tiene etapas entregadas. Consultá con un asesor la fecha de tu etapa.'
WHERE nombre = 'Altos de Sacta';


-- ── Corregir el FAQ del titulo y agregar la regla del agente ─────
-- El FAQ anterior afirmaba que todos los lotes tienen titulo. Falso:
-- la mayoria esta en pre-venta.

UPDATE configuracion_agencia SET
  preguntas_frecuentes = replace(
    preguntas_frecuentes,
    'P: ¿Los lotes tienen título de propiedad?' || chr(10) ||
    'R: Sí. Nuestros proyectos están inscritos en Registros Públicos y se entrega título de propiedad.',
    'P: ¿Los lotes tienen título de propiedad?' || chr(10) ||
    'R: Todos nuestros proyectos se entregan con título de propiedad. La mayoría está hoy en pre-venta, '
    || 'así que el título se entrega en la fecha proyectada de cada etapa — un asesor te confirma la de tu '
    || 'proyecto. Desde el primer día comprás con respaldo: partida registral, empresa inscrita y contrato firmado.' || chr(10) || chr(10) ||
    'P: ¿Qué ventaja tiene comprar en pre-venta?' || chr(10) ||
    'R: Es la etapa de precio más bajo de todo el proyecto y la de mayor potencial de revalorización. '
    || 'Además podés elegir entre los mejores lotes, que son los primeros en venderse.'
  ),
  reglas_agente = COALESCE(reglas_agente, '') || chr(10) ||
    '- No todos los proyectos tienen el título entregado: la mayoría está en PRE-VENTA. Nunca afirmes que un proyecto ya tiene título salvo que su campo entrega_titulo lo diga. Si no hay dato, un asesor confirma la fecha.' || chr(10) ||
    '- Presentá la pre-venta como ventaja: mejor precio del proyecto, mayor revalorización y posibilidad de elegir los mejores lotes. Nunca como una limitación, pero tampoco la escondas.',
  actualizado_en = NOW()
WHERE id = (SELECT id FROM configuracion_agencia ORDER BY id LIMIT 1);


-- ── Verificacion ─────────────────────────────────────────────────
SELECT nombre,
       COALESCE(estado_comercial, '— (lo completa un asesor)') AS estado,
       CASE WHEN entrega_titulo IS NULL THEN 'falta' ELSE 'ok' END AS titulo
FROM proyectos ORDER BY orden;
