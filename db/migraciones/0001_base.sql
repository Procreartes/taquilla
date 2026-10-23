-- Fase 1 · Base: organizadores, usuarios, roles, sesiones y auditoría.
-- Todas las tablas de negocio llevan organizador_id: los datos de un organizador
-- nunca se mezclan con los de otro.

create table organizadores (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  nombre              text not null,
  razon_social        text,
  cif                 text,
  direccion_fiscal    text,
  email_contacto      text,
  telefono            text,
  logo_url            text,
  color_primario      text not null default '#2340b5' check (color_primario ~ '^#[0-9a-fA-F]{6}$'),
  color_secundario    text not null default '#131a28' check (color_secundario ~ '^#[0-9a-fA-F]{6}$'),
  -- Stripe Connect: cuenta conectada (acct_...) del organizador
  stripe_cuenta_id    text,
  stripe_estado       text not null default 'sin_conectar'
                        check (stripe_estado in ('sin_conectar', 'pendiente', 'activa', 'restringida')),
  -- Impuesto: IGIC en Canarias, IVA en Península. El tipo lo confirma la asesoría.
  impuesto_nombre     text not null default 'IGIC' check (impuesto_nombre in ('IGIC', 'IVA')),
  impuesto_tipo       numeric(5, 2) not null default 7 check (impuesto_tipo >= 0 and impuesto_tipo < 100),
  impuesto_pendiente  boolean not null default true,
  -- Gastos de gestión por entrada (céntimos) y máximo de entradas por compra
  gastos_gestion_cent integer not null default 100 check (gastos_gestion_cent >= 0),
  max_entradas_pedido integer not null default 8 check (max_entradas_pedido between 1 and 50),
  -- Textos legales propios (aviso legal, privacidad, condiciones de compra), por idioma
  textos_legales      jsonb not null default '{}'::jsonb,
  es_prueba           boolean not null default false,
  activo              boolean not null default true,
  creado_en           timestamptz not null default now()
);

create table usuarios (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email)),
  nombre         text not null,
  hash_clave     text,                 -- scrypt; null si solo entra con Microsoft 365
  totp_secreto   text,                 -- 2FA (cifrado con SECRETO_DATOS)
  totp_activo    boolean not null default false,
  superadmin     boolean not null default false,
  entra_oid      text unique,          -- id de usuario de Microsoft Entra ID
  es_prueba      boolean not null default false,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  ultimo_acceso  timestamptz
);

create table membresias (
  usuario_id      uuid not null references usuarios (id) on delete cascade,
  organizador_id  uuid not null references organizadores (id) on delete cascade,
  rol             text not null check (rol in ('admin', 'produccion', 'taquilla', 'puerta', 'contabilidad', 'lectura')),
  creado_en       timestamptz not null default now(),
  primary key (usuario_id, organizador_id)
);
create index membresias_org on membresias (organizador_id);

-- Sesiones del equipo. Se guarda la huella SHA-256 del token, nunca el token.
create table sesiones (
  id               text primary key,
  usuario_id       uuid not null references usuarios (id) on delete cascade,
  organizador_id   uuid references organizadores (id) on delete set null,
  segundo_factor   boolean not null default false,
  ip               text,
  agente           text,
  creado_en        timestamptz not null default now(),
  caduca_en        timestamptz not null
);
create index sesiones_usuario on sesiones (usuario_id);

-- Registro de auditoría: precios, devoluciones, invitaciones, anulaciones, permisos…
create table auditoria (
  id              bigint generated always as identity primary key,
  organizador_id  uuid references organizadores (id) on delete set null,
  usuario_id      uuid references usuarios (id) on delete set null,
  accion          text not null,
  entidad         text,
  entidad_id      text,
  datos           jsonb not null default '{}'::jsonb,
  ip              text,
  creado_en       timestamptz not null default now()
);
create index auditoria_org_fecha on auditoria (organizador_id, creado_en desc);
