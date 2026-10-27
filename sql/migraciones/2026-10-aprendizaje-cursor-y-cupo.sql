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
