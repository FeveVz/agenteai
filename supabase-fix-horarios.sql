-- ================================================================
-- Correccion del horario de visitas
--
-- El dato venia de los brochures ("lunes a domingo, 10:00 y 16:00"),
-- pero el horario real es de 09:00 a 17:00, todos los dias.
-- ================================================================

UPDATE configuracion_agencia SET
  horarios = 'Visitas guiadas de lunes a domingo, de 09:00 a 17:00. Son gratuitas y se reservan con anticipación.',
  preguntas_frecuentes = replace(
    preguntas_frecuentes,
    'R: Sí, las visitas guiadas son gratuitas, de lunes a domingo a las 10:00 y a las 16:00. Se reservan con anticipación.',
    'R: Sí, las visitas guiadas son gratuitas y son de lunes a domingo, de 09:00 a 17:00. Te paso un enlace y elegís el día y la hora que te queden cómodos.'
  ),
  actualizado_en = NOW()
WHERE id = (SELECT id FROM configuracion_agencia ORDER BY id LIMIT 1);

SELECT horarios FROM configuracion_agencia ORDER BY id LIMIT 1;
