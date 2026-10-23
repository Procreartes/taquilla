-- Fase 2 · Recintos → planos → versiones.
-- Una versión se edita en borrador; al ponerla a la venta queda congelada (inmutable)
-- y las entradas apuntan a un código de butaca estable (p. ej. PLATEA-F17-4).

create table recintos (
  id              uuid primary key default gen_random_uuid(),
  organizador_id  uuid not null references organizadores (id) on delete cascade,
  codigo          text not null check (codigo ~ '^[a-z0-9-]{2,60}$'),
  nombre          text not null,
  zona            text,
  municipio       text,
  isla            text,
  direccion       text,
  verificar       boolean not null default false,
  creado_en       timestamptz not null default now(),
  unique (organizador_id, codigo)
);

create table planos (
  id              uuid primary key default gen_random_uuid(),
  organizador_id  uuid not null references organizadores (id) on delete cascade,
  recinto_id      uuid not null references recintos (id) on delete cascade,
  nombre          text not null,
  creado_en       timestamptz not null default now()
);
create index planos_recinto on planos (recinto_id);

create table versiones_plano (
  id              uuid primary key default gen_random_uuid(),
  organizador_id  uuid not null references organizadores (id) on delete cascade,
  plano_id        uuid not null references planos (id) on delete cascade,
  numero          integer not null,
  estado          text not null default 'borrador' check (estado in ('borrador', 'congelada')),
  receta          jsonb not null,
  butacas         jsonb not null default '[]'::jsonb,
  comprobacion    jsonb not null default '{}'::jsonb,
  creado_por      uuid references usuarios (id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  congelada_en    timestamptz,
  unique (plano_id, numero)
);

-- Una versión congelada no se puede modificar ni borrar.
create function proteger_version_congelada() returns trigger language plpgsql as $$
begin
  if old.estado = 'congelada' then
    raise exception 'La versión % del plano está congelada y no se puede modificar', old.numero;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger versiones_plano_congeladas
  before update or delete on versiones_plano
  for each row execute function proteger_version_congelada();
