-- Meta (Facebook/Instagram): píxel en el navegador y API de Conversiones desde el servidor, por organizador.
-- Todo depende del consentimiento de cookies del comprador (LSSI art. 22.2 + RGPD).
alter table organizadores
  add column meta_pixel_id         text check (meta_pixel_id ~ '^[0-9]{6,20}$'),
  add column meta_capi_token_cifrado text,                 -- token de la API de Conversiones (cifrado con SECRETO_DATOS)
  add column meta_codigo_prueba    text check (meta_codigo_prueba ~ '^[A-Za-z0-9_-]{2,40}$'); -- «test_event_code» del Administrador de eventos

-- Datos para atribuir la compra (cookies _fbp/_fbc, IP y navegador). Solo se guardan si hay consentimiento
-- y se borran en cuanto se envía (o se descarta) el evento de compra a Meta.
alter table pedidos
  add column meta_atribucion jsonb,
  add column meta_enviado_en timestamptz,
  add column meta_respuesta  text;
