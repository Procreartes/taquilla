-- Fase 4 · Compra: pedidos, líneas, entradas, avisos de pago, facturas simplificadas y correos.

create table pedidos (
  id                     uuid primary key default gen_random_uuid(),
  organizador_id         uuid not null references organizadores (id),
  funcion_id             uuid not null references funciones (id),
  codigo                 text not null unique,           -- PED-XXXXXX (se lee por teléfono)
  token_hash             text not null unique,           -- huella del enlace secreto del cliente
  token_cifrado          text not null,                  -- para poder reenviar el enlace por correo
  estado                 text not null default 'reserva'
                           check (estado in ('reserva', 'pago', 'pagado', 'caducado', 'cancelado', 'conflicto', 'devuelto', 'devuelto_parcial')),
  canal                  text not null default 'web' check (canal in ('web', 'taquilla', 'invitacion')),
  expira_en              timestamptz,
  -- comprador
  comprador_nombre       text,
  comprador_email        text,
  comprador_telefono     text,
  codigo_postal          text,
  pais                   text,
  municipio              text,
  isla                   text,
  consentimientos        jsonb not null default '{}'::jsonb,
  idioma                 text not null default 'es',
  -- importes (céntimos, impuestos incluidos)
  importe_entradas_cent  integer not null default 0,
  gastos_cent            integer not null default 0,
  total_cent             integer not null default 0,
  impuesto_nombre        text not null default 'IGIC',
  impuesto_tipo          numeric(5, 2) not null default 7,
  -- pago
  pasarela               text,
  pago_sesion_id         text unique,
  pago_url               text,
  pago_id                text,
  cuenta_conectada       text,
  comision_pasarela_cent integer,
  pagado_en              timestamptz,
  -- factura simplificada
  numero_factura         text unique,
  facturado_en           timestamptz,
  notas                  text,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);
create index pedidos_funcion on pedidos (funcion_id, estado);
create index pedidos_org on pedidos (organizador_id, creado_en desc);
create index pedidos_email on pedidos (lower(comprador_email));
create index pedidos_caducan on pedidos (expira_en) where estado in ('reserva', 'pago');

create table lineas_pedido (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references pedidos (id) on delete cascade,
  zona_codigo   text not null,
  zona_nombre   text not null,
  butaca_codigo text,
  descripcion   text not null,
  tipo_butaca   text not null default 'normal',
  precio_cent   integer not null check (precio_cent >= 0),
  gastos_cent   integer not null check (gastos_cent >= 0)
);
create index lineas_pedido_ped on lineas_pedido (pedido_id);

create table entradas (
  id             uuid primary key default gen_random_uuid(),
  organizador_id uuid not null references organizadores (id),
  pedido_id      uuid not null references pedidos (id),
  linea_id       uuid references lineas_pedido (id),
  funcion_id     uuid not null references funciones (id),
  codigo         text not null unique,                     -- TKT-XXXXXXXX
  butaca_codigo  text,
  zona_codigo    text not null,
  descripcion    text not null,
  tipo_butaca    text not null default 'normal',
  precio_cent    integer not null,
  gastos_cent    integer not null,
  estado         text not null default 'valida' check (estado in ('valida', 'usada', 'anulada', 'devuelta')),
  usada_en       timestamptz,
  titular_nombre text,
  creado_en      timestamptz not null default now()
);
create index entradas_funcion on entradas (funcion_id, estado);
create index entradas_pedido on entradas (pedido_id);
-- La última barrera contra la sobreventa: una butaca solo puede tener una entrada viva por función.
create unique index entradas_butaca_viva on entradas (funcion_id, butaca_codigo)
  where butaca_codigo is not null and estado in ('valida', 'usada');

-- Avisos de la pasarela ya procesados (idempotencia: el mismo aviso nunca se procesa dos veces).
create table eventos_pago (
  proveedor    text not null,
  evento_id    text not null,
  tipo         text not null,
  pedido_id    uuid,
  datos        jsonb not null default '{}'::jsonb,
  recibido_en  timestamptz not null default now(),
  primary key (proveedor, evento_id)
);

-- Numeración correlativa de facturas simplificadas por organizador y serie (año).
create table series_factura (
  organizador_id uuid not null references organizadores (id),
  serie          text not null,
  ultimo         integer not null default 0,
  primary key (organizador_id, serie)
);

create table correos_salientes (
  id             uuid primary key default gen_random_uuid(),
  organizador_id uuid references organizadores (id),
  para           text not null,
  asunto         text not null,
  html           text not null,
  texto          text not null,
  adjuntos       jsonb not null default '[]'::jsonb,
  estado         text not null,
  error          text,
  creado_en      timestamptz not null default now()
);
create index correos_org on correos_salientes (organizador_id, creado_en desc);

-- Devoluciones (individuales, por pedido o masivas al cancelar una función).
create table devoluciones (
  id                     uuid primary key default gen_random_uuid(),
  organizador_id         uuid not null references organizadores (id),
  pedido_id              uuid not null references pedidos (id),
  entrada_id             uuid references entradas (id),
  importe_cent           integer not null check (importe_cent >= 0),
  gastos_devueltos_cent  integer not null default 0,
  motivo                 text not null,
  estado                 text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'fallida')),
  pasarela_id            text,
  error                  text,
  usuario_id             uuid references usuarios (id),
  creado_en              timestamptz not null default now(),
  hecha_en               timestamptz
);
create index devoluciones_pedido on devoluciones (pedido_id);
create index devoluciones_org on devoluciones (organizador_id, creado_en desc);
