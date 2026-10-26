-- Los datos que los compradores pidieron durante un mes y el catálogo no podía
-- contestar. Cada columna sale de una pregunta real, contada sobre los 925
-- mensajes de mensajes_whatsapp.
--
-- Hasta ahora la respuesta de Pamela a estos huecos era escribir una corrección
-- a mano en el panel, y esa tabla tiene tope: con 6 cargadas, la séptima empieza
-- a desalojar a las anteriores en silencio. Una corrección es un parche para lo
-- que el agente dijo mal una vez; un dato del negocio va en el catálogo, donde
-- el agente lo lee junto al precio y no puede contradecirlo.

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS lotes_disponibles text;
COMMENT ON COLUMN proyectos.lotes_disponibles IS
  'Cuántos lotes quedan y de qué tipo, como se lo dirías a un comprador. "Que lotes estan libres" fue la pregunta que más veces terminó en "no tengo ese dato". Si queda vacío el agente dice que no lo tiene, que es lo correcto; lo que no puede hacer es inventarlo.';

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS reserva text;
COMMENT ON COLUMN proyectos.reserva IS
  'Cuánto se paga para reservar un lote de ESTE proyecto, y la aclaración de que no es la cuota inicial. El 1% de la reserva se parchó dos veces en prosa del FAQ y el agente siguió ofreciéndolo como inicial: de las 8 respuestas del mes que mencionan el 1%, 5 son posteriores al parche. Puesto acá llega en el mismo objeto que el financiamiento y la distinción deja de depender de que el modelo recuerde una advertencia.';

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS bonos text;
COMMENT ON COLUMN proyectos.bonos IS
  'Programas del Estado que aplican a este proyecto y los que no. El bono Mi Vivienda y Techo Propio solo existían en la tabla correcciones: el agente inventaba sobre el bono y abandonaba al que preguntaba por Techo Propio con un "te deseo mucho éxito".';

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS punto_encuentro text;
COMMENT ON COLUMN proyectos.punto_encuentro IS
  'Dónde se juntan para la visita y cómo llegar. La única visita que se agendó en el mes preguntó dónde verse y la derivaron a un asesor.';

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS promocion text;
COMMENT ON COLUMN proyectos.promocion IS
  'La oferta vigente con su condición y su vencimiento. Hoy el precio promocional vive escondido dentro del texto de financiamiento y choca con precio_desde: Chacarilla dice "Al contado S/70,000" en un campo y "Al contado desde S/59,900" en el otro, y el agente dicta el que agarra. Separado y con la condición al lado, deja de ser una contradicción y pasa a ser un motivo para visitar.';
