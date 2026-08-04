-- ================================================================
-- Pasar a espanol peruano el contenido guardado en la base
--
-- El FAQ y las reglas del agente se escribieron con voseo argentino
-- ("podes", "elegis", "compras con respaldo"). Ceinys vende en Ica y
-- sus clientes son peruanos: el voseo suena extranjero y resta
-- credibilidad en una venta inmobiliaria.
--
-- Idempotente: si el texto ya esta corregido, replace() no hace nada.
-- ================================================================

UPDATE configuracion_agencia SET
  preguntas_frecuentes = replace(replace(replace(replace(
    preguntas_frecuentes,
    'Desde el primer día comprás con respaldo',
    'Desde el primer día compras con respaldo'),
    'Además podés elegir entre los mejores lotes',
    'Además puedes elegir entre los mejores lotes'),
    'R: Cotizás y elegís tu ubicación, pagás la inicial o separación, enviás foto del DNI o recibo de servicio, y solicitás tu convenio de separación.',
    'R: Cotizas y eliges tu ubicación, pagas la inicial o separación, envías foto del DNI o recibo de servicio, y solicitas tu convenio de separación.'),
    'Te paso un enlace y elegís el día y la hora que te queden cómodos',
    'Te paso un enlace y eliges el día y la hora que te queden cómodos'),

  reglas_agente = replace(replace(
    reglas_agente,
    'Presentá la pre-venta como ventaja',
    'Presenta la pre-venta como ventaja'),
    'tampoco la escondas',
    'tampoco la escondas'),

  actualizado_en = NOW()
WHERE id = (SELECT id FROM configuracion_agencia ORDER BY id LIMIT 1);


-- ── Verificacion: no deberia quedar voseo ────────────────────────
SELECT
  CASE WHEN preguntas_frecuentes ~* '(podés|tenés|querés|cotizás|elegís|pagás|enviás|solicitás|comprás)'
       THEN '⚠ queda voseo en el FAQ' ELSE '✓ FAQ en peruano' END AS faq,
  CASE WHEN COALESCE(reglas_agente,'') ~* '(podés|tenés|querés|presentá|agendá|elegí)'
       THEN '⚠ queda voseo en las reglas' ELSE '✓ reglas en peruano' END AS reglas
FROM configuracion_agencia ORDER BY id LIMIT 1;
