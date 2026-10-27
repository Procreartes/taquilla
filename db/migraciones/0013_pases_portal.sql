-- Pases de entrada desde el portal de Grupo Livon: cada pase se puede usar una sola vez.
create table pases_portal (
  jti       text primary key,
  email     text not null,
  usado_en  timestamptz not null default now()
);
create index pases_portal_usado on pases_portal (usado_en);
