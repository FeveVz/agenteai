-- ================================================================
-- Datos de PAMELA BARRIOS — asesora inmobiliaria independiente (Ica)
--
-- Correr DESPUÉS de sql/esquema.sql, y SOLO en la base de Pamela.
-- Es idempotente: se puede correr varias veces.
--
-- Fuente: "INFORMACION DE PROYECTOS.docx" que envió Pamela, más sus
-- correcciones del 08/09/2026:
--   · Torres de Parcona: 109 m² y 9 lotes (el documento repetía por error
--     los datos de Viñedos de Parcona).
--   · Horario: lunes a domingo de 09:00 a 17:00.
--   · Las promociones dejan de tener fecha: "hasta agotar stock".
--   · Condominio Miraflores se retira del catálogo.
--
-- OJO: Pamela NO es dueña de los proyectos, los intermedia. Cada uno
-- pertenece a una constructora distinta, con SUS PROPIAS cuentas
-- bancarias. Por eso `desarrolladora` no es decorativo: de ahí sale a
-- qué cuenta se le dice al cliente que deposite.
-- ================================================================


-- ── Las empresas dueñas de los proyectos ─────────────────────────
-- pago_imagen_url queda vacío a propósito: hay que subir las gráficas
-- oficiales de cuentas y pegar acá su URL pública. Mientras esté vacío,
-- el agente NO da datos de pago y deriva al asesor, que es lo correcto.
INSERT INTO desarrolladoras (nombre, razon_social, notas) VALUES
  ('Mi Casa',   'Inmobiliaria y Constructora Mi Casa S.A.C.', 'Chacarilla, Pecano Real y Trébol Club.'),
  ('CrediCasa', 'Inmobiliaria CrediCasa S.A.C.',              'Viñedos de Parcona y Torres de Parcona.')
ON CONFLICT (nombre) DO UPDATE SET
  razon_social = EXCLUDED.razon_social,
  notas        = EXCLUDED.notas;


-- ── Catálogo ─────────────────────────────────────────────────────
INSERT INTO proyectos (nombre, orden, desarrolladora, activo) VALUES
  ('Condominio Hacienda Chacarilla',      10, 'Mi Casa',   TRUE),
  ('Condominio Campestre Pecano Real',    20, 'Mi Casa',   TRUE),
  ('Condominio Campestre Trébol Club',    30, 'Mi Casa',   TRUE),
  ('Condominio Viñedos de Parcona',       40, 'CrediCasa', TRUE),
  ('Urbanización Torres de Parcona',      50, 'CrediCasa', TRUE)
ON CONFLICT (nombre) DO UPDATE SET
  desarrolladora = EXCLUDED.desarrolladora,
  orden          = EXCLUDED.orden,
  activo         = EXCLUDED.activo;


-- ── 1. Hacienda Chacarilla ───────────────────────────────────────
UPDATE proyectos SET
  ubicacion        = 'Av. Camino Real, Sector Fundición, a unos metros de Bodega Tacama — distrito de La Tinguiña, Ica',
  tipo             = 'Condominio campestre — lotes y casas',
  estado_comercial = 'Pre-venta — entrega diciembre 2026',
  area_desde       = '144 m² (hasta 152 m²)',
  precio_desde     = 'Desde S/80,000 en pre-venta. Al contado S/70,000. Precio de lista S/85,000.',
  financiamiento   = 'Inicial 20% (S/16,000) y 72 cuotas de S/889.' || chr(10) ||
                     'Al contado desde S/59,900 — hasta agotar stock, reservando en la visita.' || chr(10) ||
                     'Casa modelo 153 m² de terreno / 83 m² construidos: 2 habitaciones, 2 baños, sala, comedor y cocina con muebles altos y bajos. S/229,000, con Bono Mi Vivienda de S/20,900. Con carta de aprobación, entrega en 6 meses.',
  entrega_titulo   = 'Título de propiedad YA disponible. Partida registral, independización y habilitación urbana inscritas. Partida registral N° 11018279.',
  descripcion      = 'Condominio rodeado de naturaleza, pensado para casa de verano, campo o inversión. Está en plena ruta del pisco y del vino, a 18 minutos de Ica y 2 minutos de la plaza de San Juan Bautista.',
  caracteristicas  = 'Club house de casi 5,000 m²' || chr(10) ||
                     'Piscina' || chr(10) ||
                     'Zona de parrillas' || chr(10) ||
                     'Salón de eventos' || chr(10) ||
                     'Juegos para niños' || chr(10) ||
                     'Agua, luz y desagüe instalados' || chr(10) ||
                     '141 lotes en 8 manzanas — 50% aún disponible' || chr(10) ||
                     'A 10 minutos de la Panamericana km 297',
  actualizado_en   = NOW()
WHERE nombre = 'Condominio Hacienda Chacarilla';


-- ── 2. Pecano Real ───────────────────────────────────────────────
UPDATE proyectos SET
  ubicacion        = 'Av. Jorge Chávez, Sector El Limón, ingresando al distrito de San Juan Bautista, Ica',
  tipo             = 'Condominio campestre — lotes y casas',
  estado_comercial = 'Pre-venta — entrega diciembre 2026. Queda solo el 10% de los lotes.',
  area_desde       = '105 m² (hasta 151 m²)',
  precio_desde     = 'Desde S/75,000 en pre-venta. Al contado S/65,000.',
  financiamiento   = 'Inicial 20% (S/15,000) y 72 cuotas de S/833.' || chr(10) ||
                     'Al contado desde S/60,000 — hasta agotar stock, reservando en la visita.' || chr(10) ||
                     'Casas: Modelo 01 de 105 m² / 52 m² construidos (2 habitaciones, 1 baño, sala, comedor, cocina) S/140,000. Modelo 02 de 105 m² / 57 m² construidos S/155,000.' || chr(10) ||
                     'Para las casas: inicial S/15,000 + ahorro de S/1,000 mensuales por 12 meses + Bono de S/22,800 (previa calificación) + saldo con Banbif o Caja Ica.',
  entrega_titulo   = 'Partida registral inscrita. Independización y títulos EN PROCESO, previstos para diciembre de 2026. Partida registral N° 40025047.',
  descripcion      = 'Condominio levantado sobre un sembrío de pecanos, acogedor y rodeado de naturaleza. A 13 minutos de Ica y 7 del hospital Socorro. Ideal para primera vivienda o inversión.',
  caracteristicas  = 'Club house de 2,200 m²' || chr(10) ||
                     'Piscina' || chr(10) ||
                     'Zona de parrillas' || chr(10) ||
                     'Áreas verdes' || chr(10) ||
                     'Salón de eventos' || chr(10) ||
                     'Agua, luz y desagüe instalados' || chr(10) ||
                     '213 lotes en 6 manzanas' || chr(10) ||
                     'A 13 minutos de la plaza de armas de Ica',
  actualizado_en   = NOW()
WHERE nombre = 'Condominio Campestre Pecano Real';


-- ── 3. Trébol Club ───────────────────────────────────────────────
UPDATE proyectos SET
  ubicacion        = 'Camino Real s/n, al costado del Hotel Hacienda Macacona — distrito de Subtanjalla, Ica',
  tipo             = 'Condominio campestre — lotes',
  estado_comercial = 'Entrega inmediata. Queda solo el 2% de los lotes.',
  area_desde       = '97 m² (hasta 105 m²)',
  precio_desde     = 'Desde S/75,000. Al contado S/65,000.',
  financiamiento   = 'Inicial 50% (S/37,500) y 36 cuotas de S/1,562.50.' || chr(10) ||
                     'Un lote al contado a S/60,000 — hasta agotar stock, reservando en la visita.',
  entrega_titulo   = 'Partida registral y habilitación urbana inscritas. Independización y títulos EN PROCESO, previstos para diciembre de 2026.',
  descripcion      = 'En la zona de condominios más exclusiva de Ica, junto a la nueva Angostura. A 7 minutos de la Panamericana y 20 de la plaza de armas.',
  caracteristicas  = 'Zona de condominios exclusivos' || chr(10) ||
                     'Agua, luz y desagüe instalados' || chr(10) ||
                     '152 lotes en 10 manzanas' || chr(10) ||
                     'A 7 minutos de la Panamericana',
  actualizado_en   = NOW()
WHERE nombre = 'Condominio Campestre Trébol Club';


-- ── 4. Viñedos de Parcona ────────────────────────────────────────
UPDATE proyectos SET
  ubicacion        = 'Av. Industrial s/n, ingresando por la Urb. Torres de Parcona (1era cuadra de Av. 28 de Julio) — Parcona, Ica',
  tipo             = 'Condominio — lotes',
  estado_comercial = 'Pre-venta — entrega diciembre 2027. Disponibilidad amplia (90%).',
  area_desde       = '105 m² (hasta 199 m²)',
  precio_desde     = 'Desde S/65,000 en pre-venta. Al contado S/60,000. Precio de lista S/67,000.',
  financiamiento   = 'Inicial 30% (S/19,500): S/13,000 a la firma y 8 cuotas de S/812.50.' || chr(10) ||
                     'El 70% restante con crédito directo (TEA 15%), de 12 a 60 cuotas de hasta S/1,060.' || chr(10) ||
                     'Llevando 5 lotes al contado, S/58,000 cada uno — hasta agotar stock, reservando en la visita.',
  entrega_titulo   = 'Partida registral y habilitación urbana inscritas. Independización y títulos EN PROCESO, previstos para diciembre de 2026.',
  descripcion      = 'Condominio pensado para primera vivienda: cerca de colegios, hospitales y la municipalidad. A 10 minutos de Ica y 3 de la Curva.',
  caracteristicas  = 'Cerca de colegios, hospitales y municipalidad' || chr(10) ||
                     'Agua, luz y desagüe instalados' || chr(10) ||
                     '237 lotes en 10 manzanas' || chr(10) ||
                     'A 3 minutos de la Curva y 10 de la plaza de armas',
  actualizado_en   = NOW()
WHERE nombre = 'Condominio Viñedos de Parcona';


-- ── 5. Torres de Parcona ─────────────────────────────────────────
-- Datos corregidos por Pamela: el documento original repetía por error
-- los de Viñedos de Parcona (237 lotes, 105-199 m²).
UPDATE proyectos SET
  ubicacion        = '1era cuadra de Av. 28 de Julio — Parcona, Ica',
  tipo             = 'Urbanización — lotes',
  estado_comercial = 'Entrega inmediata. Solo 9 lotes.',
  area_desde       = '109 m²',
  precio_desde     = 'Desde S/67,000. Al contado S/60,000.',
  financiamiento   = 'Inicial 50% (S/33,500) y 24 cuotas de S/1,396.',
  entrega_titulo   = 'Partida registral y habilitación urbana inscritas. Independización y títulos EN PROCESO, previstos para diciembre de 2026.',
  descripcion      = 'Urbanización pequeña de solo 9 lotes, para primera vivienda. Cerca de colegios, hospitales y la municipalidad, a 10 minutos de Ica y 3 de la Curva.',
  caracteristicas  = 'Solo 9 lotes' || chr(10) ||
                     'Cerca de colegios, hospitales y municipalidad' || chr(10) ||
                     'Agua, luz y desagüe instalados' || chr(10) ||
                     'A 3 minutos de la Curva y 10 de la plaza de armas',
  actualizado_en   = NOW()
WHERE nombre = 'Urbanización Torres de Parcona';


-- ── Configuración del negocio y del agente ───────────────────────
UPDATE configuracion_agencia SET
  nombre_agencia   = 'Pamela Barrios',
  tipo_negocio     = 'asesora inmobiliaria en Ica',

  hora_apertura    = 9,
  hora_cierre      = 17,
  minutos_por_slot = 30,
  dias_atencion    = '0,1,2,3,4,5,6',
  horarios         = 'Visitas de lunes a domingo, de 09:00 a 17:00. Ofrecemos movilidad desde puntos céntricos.',

  sobre_agencia    = 'Soy Pamela Barrios, asesora inmobiliaria en Ica. Acompaño a mis clientes en la compra de lotes y '
                  || 'viviendas en condominios de constructoras con las que trabajo, desde la primera visita hasta la firma.',

  servicios        = '["Venta de lotes en condominio","Venta de viviendas","Asesoría de inversión inmobiliaria","Visitas guiadas con movilidad","Acompañamiento en el proceso de compra"]',

  preguntas_frecuentes =
    'P: ¿Puedo visitar el proyecto?' || chr(10) ||
    'R: Sí. Agendamos tu visita y ofrecemos movilidad desde puntos céntricos. Atendemos de lunes a domingo, de 09:00 a 17:00.' || chr(10) || chr(10) ||

    'P: ¿Cuánto tengo que pagar para separar?' || chr(10) ||
    'R: Normalmente el 1% del valor del lote. Cuéntame tu presupuesto y vemos juntos cómo conseguirte el mejor precio.' || chr(10) || chr(10) ||

    'P: ¿Hay descuento por pago al contado?' || chr(10) ||
    'R: Sí, en todos los proyectos. Los descuentos parten desde S/5,000 por pago al contado.' || chr(10) || chr(10) ||

    'P: ¿Qué pasa si me atraso en una cuota?' || chr(10) ||
    'R: Lo más importante es que nos avises. Comunícate y vemos las facilidades que necesites, sean unos días o un plazo distinto.' || chr(10) || chr(10) ||

    'P: ¿Hay gastos adicionales además del precio del lote?' || chr(10) ||
    'R: Sí. Al terminar de pagar tu lote viene la titulación: alrededor de S/1,000 en gastos notariales más el impuesto de alcabala. Te ayudo a calcularlo según el valor de tu lote.' || chr(10) || chr(10) ||

    'P: ¿Qué documento firmo al comprar?' || chr(10) ||
    'R: Si compras con crédito directo, empezamos con un contrato de compraventa. Si pagas el monto total, firmamos directamente la minuta y la elevamos a registros públicos: en 30 días hábiles queda a tu nombre.' || chr(10) || chr(10) ||

    'P: ¿Cuándo recibo mi título?' || chr(10) ||
    'R: 30 días después de firmar en la notaría, y esto aplica solo a los proyectos que ya cuentan con título. Consúltame por el proyecto que te interesa.' || chr(10) || chr(10) ||

    'P: ¿Los servicios ya están instalados?' || chr(10) ||
    'R: Sí, todos los proyectos se entregan con los servicios básicos conectados a la red pública.' || chr(10) || chr(10) ||

    'P: ¿Habrá áreas verdes y amenidades?' || chr(10) ||
    'R: Todos los condominios tienen club house con piscina, zona de parrillas, áreas verdes, salón de eventos y juegos para niños, además de un pórtico de ingreso solo para propietarios.' || chr(10) || chr(10) ||

    'P: ¿Habrá seguridad?' || chr(10) ||
    'R: Sí, todos los condominios manejan cámaras y vigilancia.' || chr(10) || chr(10) ||

    'P: ¿Se puede construir de inmediato?' || chr(10) ||
    'R: En los proyectos que ya tienen título, puedes construir desde la firma del contrato.' || chr(10) || chr(10) ||

    'P: ¿Qué tipo de vivienda puedo construir? ¿Hay restricciones?' || chr(10) ||
    'R: Construyes a tu gusto, hasta 2 pisos y medio, y puedes usar el 100% de tu lote. No manejamos parámetros de construcción.' || chr(10) || chr(10) ||

    'P: ¿Cómo separo mi lote?' || chr(10) ||
    'R: Desde el 1% del valor del lote. Ahora en pre-venta hay condiciones mejores: pregúntame.' || chr(10) || chr(10) ||

    'P: ¿Qué documentos necesito para comprar?' || chr(10) ||
    'R: Solo tu DNI, un recibo de luz o agua, y el voucher de pago.' || chr(10) || chr(10) ||

    'P: ¿Puedo comprar siendo extranjero?' || chr(10) ||
    'R: Sí. En vez del DNI consignas tu carné de extranjería.' || chr(10) || chr(10) ||

    'P: ¿Puedo comprar a nombre de otra persona, o con mi pareja?' || chr(10) ||
    'R: Con tu pareja, un familiar o una amistad, sí, sin problema. A nombre de un tercero es posible pero no te lo recomiendo.',

  reglas_agente =
    '- Hablar SOLO de los proyectos cargados en el catálogo. Si preguntan por otro tema, redirigir con amabilidad.' || chr(10) ||
    '- NUNCA inventar precios, metrajes, ubicaciones ni condiciones de financiamiento. Si el dato no está cargado, derivar a la asesora.' || chr(10) ||
    '- NUNCA escribir números de cuenta bancaria en el chat. Para datos de pago, usar siempre la herramienta enviar_datos_pago, que envía la gráfica oficial.' || chr(10) ||
    '- Cada proyecto pertenece a una constructora distinta. Nunca mezclar datos ni cuentas entre proyectos.' || chr(10) ||
    '- Pamela es ASESORA inmobiliaria: acompaña la compra, no construye las obras. Nunca prometer garantías de obra ni plazos de construcción como propios.' || chr(10) ||
    '- Presentar la pre-venta como ventaja: mejor precio y mejor elección de lote. Pero si un proyecto todavía no tiene título, decirlo con claridad y no afirmar lo contrario.' || chr(10) ||
    '- El objetivo de cada conversación es agendar una visita al proyecto.' || chr(10) ||
    '- Nunca prometer separación, descuento ni reserva de lote sin confirmación de la asesora.' || chr(10) ||
    '- No hablar negativamente de otras inmobiliarias.',

  actualizado_en = NOW()
WHERE id = (SELECT id FROM configuracion_agencia ORDER BY id LIMIT 1);


-- ── Verificación ─────────────────────────────────────────────────
SELECT p.orden, p.nombre, p.desarrolladora, p.estado_comercial,
       CASE WHEN d.pago_imagen_url IS NULL OR d.pago_imagen_url = ''
            THEN '⚠ falta la gráfica de cuentas'
            ELSE '✓' END AS datos_pago
FROM proyectos p
LEFT JOIN desarrolladoras d ON d.nombre = p.desarrolladora
WHERE p.activo
ORDER BY p.orden;
