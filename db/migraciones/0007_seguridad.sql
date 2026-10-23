-- Fase 7 · Seguridad y carga: cola virtual por función e invitaciones del equipo.

alter table funciones add column cola_virtual boolean not null default false;
alter table funciones add column cola_apertura timestamptz;
alter table funciones add column cola_ritmo integer check (cola_ritmo is null or cola_ritmo between 1 and 100000);

-- Enlaces de un solo uso para que una persona nueva del equipo defina su contraseña
create table invitaciones_equipo (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references usuarios (id) on delete cascade,
  token_hash  text not null unique,
  usado_en    timestamptz,
  caduca_en   timestamptz not null,
  creado_en   timestamptz not null default now()
);
