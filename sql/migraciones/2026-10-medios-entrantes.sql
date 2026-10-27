-- MIGRACIÓN — para bases que YA EXISTEN
--
-- Medios entrantes: notas de voz, fotos y ubicación compartida.
--
-- Hasta el 26 de octubre de 2026 el webhook exigía el campo Body y cortaba con
-- 400 antes de guardar nada, así que una nota de voz, una foto sola, una
-- ubicación o un sticker recibían silencio absoluto y no dejaban ni una fila en
-- la base. De las 925 filas de mensajes_whatsapp, 882 eran 'texto' y 43
-- 'texto_e_imagen' (del asistente): ni una de un medio entrante. Por eso nadie
-- podía saber si se perdieron 2 leads o 40, y el 1:1 de "302 mensajes de
-- compradores → 302 respuestas" era un artefacto de que lo perdido nunca
-- entraba al numerador.
--
-- Es idempotente: se puede correr las veces que haga falta.
--
-- El código funciona con o sin esta migración: si las columnas no existen, el
-- insert se reintenta sin ellas y el mensaje se guarda igual. Lo que se pierde
-- sin correrla es poder escuchar el audio original desde el panel y calcular
-- distancias a los proyectos.

-- ── Medios en el historial de WhatsApp ─────────────────────────────
-- `medio_url` guarda la URL del medio en api.twilio.com (o `geo:<lat>,<lon>`
-- cuando el comprador compartió su ubicación). Hace falta para que Pamela
-- pueda escuchar el audio original y verificar la transcripción: con los
-- nombres de los proyectos la transcripción se equivoca ("Barcona" por
-- "Parcona"), y sin el audio no hay manera de darse cuenta ni de corregirlo
-- desde la pestaña de Correcciones, que es el mecanismo con el que este
-- sistema aprende.
--
-- OJO al servirla en el panel: esa URL exige Basic auth con la cuenta de
-- Twilio, así que no se puede poner directa en un <audio src>. Hay que
-- proxearla desde el servidor y validar que la URL pedida sea de
-- api.twilio.com antes de buscarla.
ALTER TABLE mensajes_whatsapp
  ADD COLUMN IF NOT EXISTS medio_url TEXT,
  ADD COLUMN IF NOT EXISTS medio_mime TEXT,
  ADD COLUMN IF NOT EXISTS imagenes_enviadas INTEGER;

-- `imagenes_enviadas` es la cantidad que Twilio ACEPTÓ, no la que se pidió.
-- Antes el conteo se pegaba dentro del texto ("[+2 imagen(es) enviada(s)]")
-- con la cantidad pedida, así que el panel mostraba fotos entregadas aunque
-- Twilio las hubiera rechazado, la cifra "38 respuestas llevaron fotos" salía
-- de ese marcador optimista, y encima el modelo recibía como propia una línea
-- de telemetría que nunca escribió (de ahí los "Ya te envié..." repetidos al
-- contacto ...1867).
--
-- Queda NULL cuando la respuesta se contestó por TwiML: ahí Twilio trae las
-- imágenes por su cuenta después de cerrar la respuesta y el servidor no se
-- entera del resultado. Solo el envío por REST sabe cuántas entraron.

-- Índice para poder medir por fin cuántos medios entran. La pregunta que hoy
-- no se puede contestar es "¿cuántas notas de voz llegaron este mes?".
CREATE INDEX IF NOT EXISTS idx_mensajes_tipo
  ON mensajes_whatsapp (tipo_mensaje, recibido_en DESC);

-- ── Coordenadas de los proyectos ───────────────────────────────────
-- "¿Qué tan lejos queda de acá?" es la pregunta de compra más común en Ica,
-- donde todo se mide en minutos a la Plaza de San Juan Bautista. Cuando el
-- comprador comparte su pin, el webhook calcula la distancia a cada proyecto
-- en código y la pega al texto del turno; sin estas dos columnas cargadas,
-- cualquier respuesta sobre distancias sería invento del modelo, así que
-- mientras estén vacías el texto dice explícitamente que la distancia no está
-- calculada.
--
-- Son 5 proyectos: Pamela pega las coordenadas una vez por proyecto desde
-- Google Maps (clic derecho sobre el punto → copiar las dos cifras).
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;
