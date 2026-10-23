-- Fase 8 · Integraciones: webhooks salientes (n8n) y aviso de 90 % de aforo.

create table webhooks (
  id              uuid primary key default gen_random_uuid(),
  organizador_id  uuid not null references organizadores (id) on delete cascade,
  nombre          text not null,
  url             text not null,
  secreto_cifrado text not null,
  eventos         text[] not null default array['venta', 'agotado', 'devolucion', 'aforo_90'],
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);
create index webhooks_org on webhooks (organizador_id);

create table entregas_webhook (
  id           bigint generated always as identity primary key,
  webhook_id   uuid not null references webhooks (id) on delete cascade,
  evento       text not null,
  cuerpo       jsonb not null,
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'entregado', 'fallido')),
  intentos     integer not null default 0,
  respuesta    text,
  creado_en    timestamptz not null default now(),
  entregado_en timestamptz
);
create index entregas_webhook_wh on entregas_webhook (webhook_id, creado_en desc);

alter table funciones add column aviso_90_enviado boolean not null default false;
