-- Imágenes subidas desde el panel (carteles e imágenes para listados), servidas por la propia web.
create table imagenes (
  id              uuid primary key default gen_random_uuid(),
  organizador_id  uuid not null references organizadores (id) on delete cascade,
  tipo            text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp')),
  ancho           integer,
  alto            integer,
  bytes           bytea not null,
  tamano          integer not null check (tamano > 0 and tamano <= 5242880),
  creado_por      uuid references usuarios (id),
  creado_en       timestamptz not null default now()
);
create index imagenes_org on imagenes (organizador_id);

-- Segunda imagen: cuadrada o apaisada, para tarjetas y listados (el cartel vertical va en la ficha).
alter table eventos add column imagen_tarjeta_url text;
alter table funciones add column imagen_tarjeta_url text;
