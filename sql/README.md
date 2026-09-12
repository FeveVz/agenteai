# SQL

Un repositorio, un despliegue por clienta, **una base de Supabase por clienta**.
Es lo que mantiene separados sus proyectos, sus visitas y sus conversaciones.

```
sql/
├── esquema.sql              ← reusable. Es el ÚNICO que se corre en una base NUEVA.
├── migraciones/             ← para bases que YA existen. Ver abajo.
└── clientes/
    ├── ceinys/
    │   ├── datos.sql        ← precios, ubicaciones y FAQ de Ceinys
    │   └── historico/       ← ya aplicado, no volver a correr
    └── pamela-barrios/
        └── datos.sql        ← los 5 proyectos de Pamela y su FAQ
```

## Actualizar una base que ya existe

`esquema.sql` usa `CREATE TABLE IF NOT EXISTS`, que **no agrega columnas a una
tabla que ya existe**: la salta entera y no avisa. Por eso las bases que ya
están andando se actualizan con los archivos de `migraciones/`, en orden.

> ⚠️ Correrlas **antes** de desplegar el código que las necesita. Si el código
> consulta una columna que no existe, PostgREST devuelve error y la página de
> agenda deja de funcionar.

## Levantar la base de una clienta nueva

La forma corta, una vez creado el proyecto en Supabase:

```bash
export SUPABASE_ACCESS_TOKEN=...          # supabase.com/dashboard/account/tokens
node scripts/alta-cliente.mjs <ref-del-proyecto> pamela-barrios
```

Corre el esquema y los datos, y verifica. Se niega a escribir si la base ya
tiene datos de otra clienta, y tambien si no puede averiguar que hay: correr
el SQL de una clienta sobre la base de otra no tiene vuelta atras.

El `<ref-del-proyecto>` es lo que aparece en la URL del panel de Supabase,
en `/dashboard/project/ESTO`.

### A mano, si prefieres

1. Crear el proyecto en Supabase.
2. **SQL Editor → pegar `sql/esquema.sql` → Run.** Eso es todo el SQL que hace falta.
   Al final imprime las seis tablas que tienen que existir; si falta alguna, no seguir.
3. Cargar los datos **desde el panel**, en `/dashboard` → Configuración y → Proyectos.
   Para eso existe: no hace falta escribir SQL para dar de alta una clienta.

No hay paso 4. Si algo parece requerir correr otro `.sql`, es un bug del esquema.

## Lo que NO hay que hacer

**Nunca corras nada de `clientes/ceinys/` en la base de otra clienta.** Ahí viven los
precios de Ceinys, sus lotes en Ica, su FAQ y su argumentario de pre-venta. Cargarlos
en otra base hace que su agente ofrezca proyectos que no vende.

La carpeta `historico/` son migraciones de un solo uso, ya aplicadas a la base de
Ceinys. Se conservan por trazabilidad. Varias mezclan estructura con datos de Ceinys,
así que tampoco sirven como referencia de esquema — para eso está `esquema.sql`.

Ahí adentro está también el viejo `schema.sql`, que era el archivo que el README
mandaba correr en toda instalación limpia. Además de las tablas sembraba los nueve
proyectos de Ceinys y su configuración, así que cualquier base nueva nacía ofreciendo
Sol de Carhuaz. Esa es exactamente la trampa que esta carpeta viene a evitar.
