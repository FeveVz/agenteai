-- ================================================================
-- DATOS REALES DE CEINYS
--
-- Extraidos de los brochures oficiales (PDF) y del archivo
-- "COTIZADORES JUNIO.xlsx". Pegar en Supabase → SQL Editor → Run.
-- Se puede volver a correr sin problema: son UPDATE, no INSERT.
--
-- CRITERIOS APLICADOS:
--   · Moneda: soles (S/), salvo Los Sauces que en su brochure figura
--     explicitamente en dolares.
--   · precio_desde usa el PRECIO REAL de lista mas bajo, no el precio
--     con descuento. Asi Valeria nunca cotiza por debajo de lo que el
--     cliente va a encontrar en la visita.
--   · Los metrajes salen del cotizador (junio), que es mas reciente y
--     detallado que los brochures.
--   · Los proyectos sin datos verificados (Club Carhuaz, Monte Alegre,
--     Casa Sauces) se dejan incompletos a proposito: Valeria deriva al
--     asesor en lugar de inventar.
-- ================================================================


-- ── Sol de Carhuaz ───────────────────────────────────────────────
UPDATE proyectos SET
  ubicacion       = 'Carretera a Carhuaz KM 10, Ica — a 20 minutos del centro de Ica',
  tipo            = 'Lotes con habilitación urbana',
  descripcion     = 'Megaproyecto de 5 etapas, el de mayor trayectoria de Ceinys: más de 10,000 lotes vendidos y más de 5,000 familias. Zona de alta revalorización, cerca de Huacachina, Cachiche y los hospitales de Ica.',
  precio_desde    = 'Desde S/ 24,750',
  area_desde      = 'Desde 92 m² (hasta 176 m²)',
  financiamiento  = 'Financiamiento directo sin evaluación crediticia, 0% de interés. Inicial desde S/ 1,000 y cuotas desde S/ 263. Solo se necesita DNI y recibo de servicios.',
  caracteristicas = '5 etapas' || chr(10) ||
                    '2 pórticos de ingreso' || chr(10) ||
                    'Servicios de luz, agua y desagüe' || chr(10) ||
                    'Pozo propio y reservorio' || chr(10) ||
                    '100,000 m² de áreas verdes' || chr(10) ||
                    'Parques ornamentados y juegos recreativos' || chr(10) ||
                    'Título de propiedad' || chr(10) ||
                    'Planeamiento integral aprobado por la Municipalidad de Ica' || chr(10) ||
                    'Proyecto inscrito en Registros Públicos',
  actualizado_en  = NOW()
WHERE nombre = 'Sol de Carhuaz';


-- ── Arenas del Valle ─────────────────────────────────────────────
UPDATE proyectos SET
  ubicacion       = 'Al costado del proyecto Sol de Carhuaz, Ica — cerca del desvío a Guadalupe y la nueva autopista',
  tipo            = 'Lotes con habilitación urbana',
  descripcion     = 'Proyecto en etapa inicial, en fase de planificación y diseño urbano, lo que permite acceder a precios de lanzamiento y alto potencial de revalorización. Cuenta con uno de los clubes privados más grandes de Ica.',
  precio_desde    = 'Desde S/ 22,480',
  area_desde      = 'Desde 148 m² (hasta 436 m²)',
  financiamiento  = 'Inicial desde S/ 2,000 y hasta 80 cuotas desde S/ 206. Precio fraccionado y precio al contado con descuento.',
  caracteristicas = 'Club privado de gran escala' || chr(10) ||
                    'Laguna central' || chr(10) ||
                    'Canchas deportivas y zona deportiva' || chr(10) ||
                    'Espacio para eventos y zonas sociales' || chr(10) ||
                    'Parque infantil y zonas recreativas' || chr(10) ||
                    'Gimnasios y zonas de sombra' || chr(10) ||
                    'Parques y áreas verdes' || chr(10) ||
                    'Servicios básicos de luz y agua' || chr(10) ||
                    'Habilitación urbana' || chr(10) ||
                    'Membresía al Club House incluida',
  actualizado_en  = NOW()
WHERE nombre = 'Arenas del Valle';


-- ── Altos de Sacta ───────────────────────────────────────────────
UPDATE proyectos SET
  ubicacion       = 'KM 325 de la Panamericana Sur, distrito de Santiago, Ica',
  tipo            = 'Lotes para casa de campo',
  descripcion     = 'Continuación del proyecto Valle Sacta, con etapas ya entregadas al 100% de forma física y legal. Proyecto de casas de campo con club privado propio, pensado para quienes buscan naturaleza y sol todo el año.',
  precio_desde    = 'Desde S/ 34,406',
  area_desde      = 'Desde 170 m² (hasta 1,489 m²)',
  financiamiento  = 'Inicial desde S/ 2,000 y cuotas desde S/ 318.',
  caracteristicas = 'Club privado sin costo de membresía para propietarios' || chr(10) ||
                    'Club house con piscina, gimnasio/spa, restaurante, wine bar y salón de eventos' || chr(10) ||
                    'Zona deportiva y cancha de tenis' || chr(10) ||
                    'Laguna artificial' || chr(10) ||
                    'Amplias áreas verdes y cerco vivo' || chr(10) ||
                    'Parques, juegos recreativos y ciclovía' || chr(10) ||
                    'Gimnasio al aire libre y zona comercial' || chr(10) ||
                    'Biodigestor' || chr(10) ||
                    'La empresa instala el punto de agua y luz en cada lote' || chr(10) ||
                    'Mantenimiento de áreas comunes a cargo de la empresa' || chr(10) ||
                    'Proyecto inscrito en Registros Públicos',
  actualizado_en  = NOW()
WHERE nombre = 'Altos de Sacta';


-- ── La Palma Paracas ─────────────────────────────────────────────
UPDATE proyectos SET
  tipo            = 'Lotes',
  precio_desde    = 'Desde S/ 31,750',
  area_desde      = 'Desde 115 m² (hasta 319 m²)',
  financiamiento  = 'Inicial desde S/ 2,000 y cuotas desde S/ 379. Primera y segunda etapa disponibles.',
  actualizado_en  = NOW()
WHERE nombre = 'La Palma Paracas';


-- ── Valle Sacta ──────────────────────────────────────────────────
UPDATE proyectos SET
  ubicacion       = 'Ica — a 20 minutos aprox. de la ciudad, cerca de Los Aquijes, Pachacútec y Pueblo Nuevo',
  tipo            = 'Lotes para casa de campo',
  descripcion     = 'Proyecto exclusivo de casas de campo con club house, capilla, viñedos y caballerizas. Desarrollado en tres etapas, con lotes de gran metraje.',
  area_desde      = 'Desde 500 m² (hasta 1,600 m²)',
  caracteristicas = 'Club house con wine bar, gimnasio/spa, restaurante, salón de eventos y piscina' || chr(10) ||
                    'Zona deportiva y shopping center' || chr(10) ||
                    'Laguna y bosque' || chr(10) ||
                    'Capilla y viñedos' || chr(10) ||
                    'Caballerizas' || chr(10) ||
                    'Imponente pórtico de ingreso' || chr(10) ||
                    'Cerco vivo' || chr(10) ||
                    'Restaurante de espectáculos' || chr(10) ||
                    'Partida registral en la Oficina Registral de Ica',
  actualizado_en  = NOW()
WHERE nombre = 'Valle Sacta';


-- ── Los Sauces (en dolares, segun su brochure) ───────────────────
UPDATE proyectos SET
  ubicacion       = 'KM 293 de la Panamericana Sur, distrito de Guadalupe, Ica',
  tipo            = 'Condominio — lotes',
  descripcion     = 'Condominio Los Sauces 5, continuación de un proyecto con 4 etapas ya entregadas al 100% de forma física y legal. Ubicado en zona turística, cerca de la viña Tacama y la bodega El Catador.',
  precio_desde    = 'US$ 27,000 (precio final, lote de 200 m²)',
  area_desde      = 'Desde 200 m²',
  financiamiento  = 'Inicial desde US$ 2,667 y cuotas desde US$ 405.',
  caracteristicas = 'Cerco perimétrico' || chr(10) ||
                    'Pórtico de ingreso' || chr(10) ||
                    'Seguridad 24 horas' || chr(10) ||
                    'Área de esparcimiento con piscina' || chr(10) ||
                    'Zona de parrilla' || chr(10) ||
                    'Instalaciones eléctricas subterráneas' || chr(10) ||
                    'Agua y desagüe' || chr(10) ||
                    'Entrega del área de esparcimiento: setiembre 2026' || chr(10) ||
                    'Mantenimiento de áreas comunes a cargo de la empresa' || chr(10) ||
                    'Proyecto inscrito en Registros Públicos',
  actualizado_en  = NOW()
WHERE nombre = 'Los Sauces';


-- ── Monte Alegre (sin precios verificados) ───────────────────────
UPDATE proyectos SET
  ubicacion       = 'Carretera a Carhuaz KM 10, Ica — a 20 minutos del centro de Ica',
  tipo            = 'Lotes con habilitación urbana',
  descripcion     = 'Proyecto en la zona de mayor revalorización de Ica, con habilitación urbana y amplia zona comercial.',
  caracteristicas = 'Pórtico de ingreso' || chr(10) ||
                    'Servicios básicos: luz, agua y desagüe' || chr(10) ||
                    'Más de 43,000 m² de zona comercial' || chr(10) ||
                    'Áreas verdes y zona deportiva' || chr(10) ||
                    'Más de 2,700 m² en parques con juegos para niños' || chr(10) ||
                    'Títulos de propiedad' || chr(10) ||
                    'Habilitación urbana' || chr(10) ||
                    'Crédito directo',
  actualizado_en  = NOW()
WHERE nombre = 'Monte Alegre';


-- ── Datos de la empresa ──────────────────────────────────────────
UPDATE configuracion_agencia SET
  nombre_agencia = 'Ceinys',
  slogan         = 'Constructora e Inmobiliaria',
  horarios       = 'Visitas guiadas de lunes a domingo, 10:00 y 16:00 hs. Son gratuitas y hay que reservarlas.',
  redes_sociales = 'Web: www.ceinys.pe',
  sobre_agencia  = 'Somos Ceinys, constructora e inmobiliaria con más de 9 años de experiencia en Ica, Perú. '
                || 'Desarrollamos proyectos de lotes para vivienda, casa de campo e inversión, con habilitación '
                || 'urbana, título de propiedad y financiamiento directo. Más de 5,000 familias ya cuentan con su lote con nosotros.',
  casos_exito    = 'Más de 10,000 lotes vendidos y más de 5,000 familias con su lote propio' || chr(10) ||
                   'Más de 9 años de experiencia en el mercado inmobiliario de Ica' || chr(10) ||
                   'Proyectos inscritos en Registros Públicos, con partida registral' || chr(10) ||
                   'Etapas entregadas al 100% de forma física y legal en Valle Sacta y Los Sauces' || chr(10) ||
                   'Planeamiento integral aprobado por la Municipalidad de Ica en Sol de Carhuaz',
  preguntas_frecuentes =
    'P: ¿Los lotes tienen título de propiedad?' || chr(10) ||
    'R: Todos nuestros proyectos se entregan con título de propiedad. La mayoría está hoy en pre-venta, '
    || 'así que el título se entrega en la fecha proyectada de cada etapa — un asesor te confirma la de tu '
    || 'proyecto. Desde el primer día comprás con respaldo: partida registral, empresa inscrita y contrato firmado.' || chr(10) || chr(10) ||
    'P: ¿Qué ventaja tiene comprar en pre-venta?' || chr(10) ||
    'R: Es la etapa de precio más bajo de todo el proyecto y la de mayor potencial de revalorización. '
    || 'Además podés elegir entre los mejores lotes, que son los primeros en venderse.' || chr(10) || chr(10) ||
    'P: ¿Puedo pagar en cuotas? ¿Piden evaluación crediticia?' || chr(10) ||
    'R: Tenemos financiamiento directo, sin evaluación crediticia y con 0% de interés. No se necesita banco.' || chr(10) || chr(10) ||
    'P: ¿Qué requisitos piden para comprar?' || chr(10) ||
    'R: Solo DNI, un recibo de servicios, un correo electrónico y el voucher del depósito de la inicial.' || chr(10) || chr(10) ||
    'P: ¿Cómo es el proceso de compra?' || chr(10) ||
    'R: Cotizás y elegís tu ubicación, pagás la inicial o separación, enviás foto del DNI o recibo de servicio, y solicitás tu convenio de separación. Después se firma el contrato y se envía la boleta electrónica por email.' || chr(10) || chr(10) ||
    'P: ¿Puedo visitar el proyecto antes de comprar?' || chr(10) ||
    'R: Sí, las visitas guiadas son gratuitas, de lunes a domingo a las 10:00 y a las 16:00. Se reservan con anticipación.' || chr(10) || chr(10) ||
    'P: ¿Los lotes tienen agua y luz?' || chr(10) ||
    'R: La empresa instala el punto de agua y luz en cada lote. Después cada cliente solicita la instalación de su medidor y paga según su consumo.' || chr(10) || chr(10) ||
    'P: ¿Quién mantiene las áreas comunes?' || chr(10) ||
    'R: El mantenimiento está a cargo de la empresa e incluye limpieza de vías, conservación de áreas verdes, eliminación de basura y alumbrado público.',
  actualizado_en = NOW()
WHERE id = (SELECT id FROM configuracion_agencia ORDER BY id LIMIT 1);


-- ── Verificacion ─────────────────────────────────────────────────
SELECT nombre,
       COALESCE(precio_desde, '—')                     AS precio,
       COALESCE(area_desde, '—')                       AS area,
       CASE WHEN ubicacion IS NULL THEN 'falta' ELSE 'ok' END AS ubicacion,
       CASE WHEN caracteristicas IS NULL THEN 'falta' ELSE 'ok' END AS caracteristicas
FROM proyectos
ORDER BY orden;
