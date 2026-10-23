-- Fase 5 · Puerta: registro de todas las lecturas (en línea y sincronizadas desde dispositivos sin conexión).

create table accesos (
  id              bigint generated always as identity primary key,
  organizador_id  uuid not null references organizadores (id),
  funcion_id      uuid not null references funciones (id),
  entrada_id      uuid references entradas (id),
  codigo          text,
  dispositivo     text not null,
  usuario_id      uuid references usuarios (id),
  resultado       text not null check (resultado in ('valida', 'usada', 'caducado', 'otra_funcion', 'anulada', 'desconocida', 'manipulada', 'doble_sin_conexion')),
  modo            text not null default 'en_linea' check (modo in ('en_linea', 'sin_conexion')),
  leido_en        timestamptz not null,
  recibido_en     timestamptz not null default now()
);
create index accesos_funcion on accesos (funcion_id, leido_en desc);
create index accesos_entrada on accesos (entrada_id);
-- Una misma lectura sin conexión no se registra dos veces si el dispositivo reintenta la sincronización
create unique index accesos_sin_conexion_unico on accesos (dispositivo, codigo, leido_en) where modo = 'sin_conexion';
