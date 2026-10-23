-- Fase 3 · Eventos (festival o evento suelto) → funciones, precios por zona y socios de coproducción.

create table eventos (
  id              uuid primary key default gen_random_uuid(),
  organizador_id  uuid not null references organizadores (id) on delete cascade,
  slug            text not null check (slug ~ '^[a-z0-9-]{2,80}$'),
  nombre          text not null,
  tipo            text not null default 'festival' check (tipo in ('festival', 'gira', 'evento')),
  descripcion     text,
  imagen_url      text,
  -- islas con sus colores (cartelera por isla), fuente de los datos, notas…
  datos           jsonb not null default '{}'::jsonb,
  publicado       boolean not null default false,
  es_prueba       boolean not null default false,
  creado_en       timestamptz not null default now(),
  unique (slug)
);
create index eventos_org on eventos (organizador_id);

create table funciones (
  id                uuid primary key default gen_random_uuid(),
  organizador_id    uuid not null references organizadores (id) on delete cascade,
  evento_id         uuid not null references eventos (id) on delete cascade,
  recinto_id        uuid not null references recintos (id),
  codigo            text not null,
  titulo            text not null,
  artistas          jsonb not null default '[]'::jsonb,
  programa          jsonb,
  es_gala           boolean not null default false,
  edad_minima       integer,
  nota              text,
  fecha             date not null,
  hora              time,
  -- numerada (con plano) · general (por cantidad) · libre (gratis, no vende)
  modo_venta        text not null check (modo_venta in ('numerada', 'general', 'libre')),
  version_plano_id  uuid references versiones_plano (id),
  aforo             integer check (aforo is null or aforo > 0),
  vendidas_general  integer not null default 0 check (vendidas_general >= 0),
  estado            text not null default 'borrador'
                      check (estado in ('borrador', 'a_la_venta', 'pausada', 'agotada', 'cancelada', 'finalizada')),
  -- Si la venta oficial está en otra plataforma (p. ej. Entradas Canarias), aquí solo se enlaza
  venta_externa_url text,
  verificar         boolean not null default false,
  es_prueba         boolean not null default false,
  publicada         boolean not null default true,
  creado_en         timestamptz not null default now(),
  unique (evento_id, codigo),
  check (modo_venta <> 'numerada' or version_plano_id is not null),
  check (modo_venta <> 'general' or estado = 'borrador' or aforo is not null),
  check (vendidas_general <= coalesce(aforo, 2147483647))
);
create index funciones_evento on funciones (evento_id, fecha, hora);
create index funciones_org on funciones (organizador_id);

-- Precio por función y zona (en céntimos, impuestos incluidos). Zona 'general' para aforo general.
create table precios_funcion (
  funcion_id   uuid not null references funciones (id) on delete cascade,
  zona_codigo  text not null,
  precio_cent  integer not null check (precio_cent >= 0 and precio_cent <= 10000000),
  primary key (funcion_id, zona_codigo)
);

-- Reparto de coproducción (porcentajes que deben sumar 100).
create table socios_evento (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references eventos (id) on delete cascade,
  nombre          text not null,
  cif             text,
  porcentaje      numeric(5, 2) not null check (porcentaje > 0 and porcentaje <= 100),
  orden           integer not null default 0
);
create index socios_evento_ev on socios_evento (evento_id);
