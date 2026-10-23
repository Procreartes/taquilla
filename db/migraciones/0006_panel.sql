-- Fase 6 · Panel y dinero: invitaciones, protocolo, acreditaciones, cancelación y borderó SGAE.

-- Tipo de entrada: venta normal, invitación (0 €) o acreditación (prensa, staff, artistas…)
alter table entradas add column tipo_entrada text not null default 'venta' check (tipo_entrada in ('venta', 'invitacion', 'acreditacion'));
alter table entradas add column notas text;

-- Butacas bloqueadas por protocolo, con el nombre de para quién son
create table bloqueos_protocolo (
  id              uuid primary key default gen_random_uuid(),
  organizador_id  uuid not null references organizadores (id),
  funcion_id      uuid not null references funciones (id) on delete cascade,
  butaca_codigo   text not null,
  nombre          text not null,
  nota            text,
  activo          boolean not null default true,
  creado_por      uuid references usuarios (id),
  creado_en       timestamptz not null default now()
);
create unique index bloqueos_protocolo_activo on bloqueos_protocolo (funcion_id, butaca_codigo) where activo;

alter table funciones add column cancelada_en timestamptz;
alter table funciones add column motivo_cancelacion text;

-- Derechos de autor (SGAE): porcentaje sobre la base imponible de taquilla, pendiente de confirmar por contrato
alter table organizadores add column sgae_porcentaje numeric(5, 2) not null default 10 check (sgae_porcentaje >= 0 and sgae_porcentaje <= 100);
alter table organizadores add column sgae_pendiente boolean not null default true;
