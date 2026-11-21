-- ══════════════════════════════════════════════════════════════════
-- TODAS LAS MIGRACIONES PENDIENTES, EN UN SOLO PEGADO
--
-- Generado el 2026-11-21. Pégalo entero en el editor SQL de Supabase
-- (proyecto de Pamela) y dale Run. Es idempotente: si alguna columna ya
-- existe, la salta sin error, asi que se puede correr dos veces sin
-- romper nada.
--
-- Sin esto el agente funciona igual —cada escritura reintenta sin la
-- columna— pero quedan dormidas estas cinco cosas:
--   1. el audio de las notas de voz no se guarda
--   2. no se sabe quien abre el enlace de la agenda
--   3. la ficha del comprador no guarda presupuesto ni plazo
--   4. el catalogo no tiene reserva, bonos, stock ni punto de encuentro
--   5. el analisis no puede avanzar por tandas
-- ══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 2026-10-agenda-y-visitas.sql
-- ───────────────────────────────────────────────────────────────
-- ================================================================
-- MIGRACIÓN — página pública de agenda y manejo de visitas
--
-- NO es obligatoria para desplegar: el código tolera que estas columnas
-- todavía no existan. Pero sin ella se siguen perdiendo las dos cosas
-- que hoy no se pueden medir ni cargar.
--
-- Una base nueva NO necesita esto: sql/esquema.sql ya las incluye.
-- El motivo de que haga falta un archivo aparte es que
-- `CREATE TABLE IF NOT EXISTS` no agrega columnas a una tabla que ya
-- existe: la salta entera y no avisa.
--
-- Es idempotente: se puede correr varias veces sin romper nada.
--
--   Supabase → SQL Editor → pegar → Run.
-- ================================================================


-- ── 1. El embudo del enlace: enviado → abierto → reservado ───────
--
-- `usos` existe desde el principio y ningún código la escribía: los 16
-- enlaces emitidos están los 16 en cero. Así no se puede distinguir
-- "mandé 11 enlaces y nadie los abrió" (problema del mensaje) de "los
-- abrieron y el formulario los expulsó" (problema de la página), que son
-- dos arreglos opuestos.
--
-- `abierto_en` guarda el PRIMER clic, que es la señal de seguimiento más
-- fuerte que existe: enlace abierto y sin reservar es el lead que hay
-- que llamar el mismo día.
ALTER TABLE enlaces_agenda ADD COLUMN IF NOT EXISTS abierto_en   TIMESTAMPTZ;
ALTER TABLE enlaces_agenda ADD COLUMN IF NOT EXISTS reservado_en TIMESTAMPTZ;

COMMENT ON COLUMN enlaces_agenda.abierto_en IS
  'Primera vez que se cargó /visita/<codigo>. NULL = nunca lo abrió.';
COMMENT ON COLUMN enlaces_agenda.reservado_en IS
  'Momento en que ese enlace produjo una visita. NULL = lo abrió y no reservó.';


-- ── 2. Incremento atómico de usos ────────────────────────────────
--
-- Dos pestañas abiertas a la vez con un read-modify-write desde Node
-- pierden una apertura. Acá el `usos + 1` lo hace Postgres.
--
-- El código llama a esta función y, si no existe (migración sin correr),
-- cae a un UPDATE simple: por eso la página no se rompe sin esto.
CREATE OR REPLACE FUNCTION incrementar_uso_enlace(p_codigo TEXT)
RETURNS VOID AS $$
  UPDATE enlaces_agenda
     SET usos = COALESCE(usos, 0) + 1,
         abierto_en = COALESCE(abierto_en, NOW())
   WHERE codigo = p_codigo;
$$ LANGUAGE sql;


-- ── 3. Teléfono de contacto de la visita ─────────────────────────
--
-- 10 de 131 contactos llegan de Twilio como identidad de WhatsApp sin
-- número ('PE.2104140390227158'), y el enlace vivo de hoy es justo uno
-- de ésos. La página le mostraba "Te contactamos al ••••7158", que son
-- los últimos cuatro dígitos de un id interno, y si reservaba Pamela se
-- quedaba con una visita confirmada sin a quién llamar.
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS telefono_contacto TEXT;

COMMENT ON COLUMN visitas.telefono_contacto IS
  'Celular que dejó el comprador en el formulario. Se pide solo cuando numero_telefono no es un número alcanzable.';


-- ── 4. Índice para el tope de reservas por número ────────────────
--
-- El tope vivía en un Map de memoria y en Vercel cada instancia arranca
-- con el suyo vacío, así que no era un tope real. Ahora se cuenta en la
-- base: `where numero_telefono = ? and creado_en > now() - 1 hour`.
CREATE INDEX IF NOT EXISTS idx_visitas_numero_creado ON visitas (numero_telefono, creado_en);

-- ───────────────────────────────────────────────────────────────
-- 2026-10-aprendizaje-cursor-y-cupo.sql
-- ───────────────────────────────────────────────────────────────
-- Aprendizaje: el cursor del analisis, la ficha del comprador y el cupo de
-- las correcciones.
--
-- Por que existe cada cosa, con lo que se midio:
--
-- · analisis.desde_mensaje — la tabla ya guardaba hasta_mensaje pero nadie lo
--   leia: las 9 corridas que hay releyeron los 400 mensajes mas viejos y las
--   tres ultimas se detienen exacto en hasta_mensaje=400, con 925 mensajes en
--   la base. Guardar tambien el piso permite decirle a Pamela en el panel
--   "lei del mensaje 401 al 925" en vez de "lee todas las conversaciones".
--
-- · compradores.* — los 47 resumenes que hay no sirven para retomar un lead:
--   cero nombres, 10 son literalmente la misma frase ("Interesado en Torres
--   de Parcona, pregunta por precios y financiamiento") y el promedio es de
--   67 caracteres. Mientras tanto el comprador ...5219 dijo "Quisiera dar el
--   25% y comprar 4 terrenos juntos y el resto darlo en 36 meses" y ...4782
--   dijo "estuvo alli la semana pasada y a mi esposa le gusto la ubicacion",
--   y ninguno de los dos datos quedo en ningun campo. Un resumen en prosa
--   libre sale siempre generico; un campo vacio se nota y se pregunta.
--
-- · correcciones.resuelta_en_catalogo / fijada — MAX_CORRECCIONES es 6 y hay
--   exactamente 6 correcciones activas: la septima que cargue Pamela desaloja
--   a otra en silencio. La resuelta libera su cupo; la fijada rescata a la
--   que sigue fallando aunque sea vieja (las correcciones 3 y 4, que el 1% es
--   la reserva y no la inicial, son del 25 de septiembre y 7 de las 8
--   respuestas que repiten el error son posteriores al parche).
--
-- El codigo funciona con o sin esta migracion: si las columnas no estan, el
-- analisis guarda lo que puede y el panel avisa. No hace falta correrla con
-- prisa, pero hasta que no se corra las fichas siguen siendo el resumen solo.

ALTER TABLE analisis
  ADD COLUMN IF NOT EXISTS desde_mensaje BIGINT;   -- primer id EXCLUIDO: se leyo desde desde_mensaje+1

ALTER TABLE compradores
  ADD COLUMN IF NOT EXISTS uso TEXT DEFAULT 'sin_dato',
  ADD COLUMN IF NOT EXISTS forma_pago TEXT DEFAULT 'sin_dato',
  ADD COLUMN IF NOT EXISTS presupuesto TEXT,            -- textual, como lo dijo el comprador
  ADD COLUMN IF NOT EXISTS plazo TEXT,                  -- para cuando quiere comprar, en sus palabras
  ADD COLUMN IF NOT EXISTS objecion TEXT,               -- lo que lo freno, en sus palabras
  ADD COLUMN IF NOT EXISTS dato_para_retomar TEXT,      -- frase propia citada para abrir el seguimiento
  ADD COLUMN IF NOT EXISTS telefono_alternativo TEXT,   -- otro numero que escribio en el chat
  ADD COLUMN IF NOT EXISTS ya_visito BOOLEAN DEFAULT FALSE;

-- Los CHECK van aparte y con NOT VALID para que las 47 filas que ya existen
-- (todas con el default 'sin_dato') no bloqueen la migracion.
ALTER TABLE compradores
  DROP CONSTRAINT IF EXISTS compradores_uso_check,
  ADD CONSTRAINT compradores_uso_check
    CHECK (uso IN ('vivienda', 'inversion', 'casa_de_verano', 'comercial', 'sin_dato')) NOT VALID;

ALTER TABLE compradores
  DROP CONSTRAINT IF EXISTS compradores_forma_pago_check,
  ADD CONSTRAINT compradores_forma_pago_check
    CHECK (forma_pago IN ('contado', 'cuotas', 'credito_bancario', 'sin_dato')) NOT VALID;

ALTER TABLE correcciones
  ADD COLUMN IF NOT EXISTS resuelta_en_catalogo BOOLEAN DEFAULT FALSE,  -- el dato ya quedo cargado: libera cupo
  ADD COLUMN IF NOT EXISTS fijada BOOLEAN DEFAULT FALSE;                -- sigue fallando: no se cae nunca

-- ───────────────────────────────────────────────────────────────
-- 2026-10-datos-que-el-agente-no-tenia.sql
-- ───────────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────────
-- 2026-10-disponibilidad-de-lotes.sql
-- ───────────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────────
-- 2026-10-medios-entrantes.sql
-- ───────────────────────────────────────────────────────────────
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
