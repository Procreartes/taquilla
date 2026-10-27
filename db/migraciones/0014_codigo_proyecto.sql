-- Código del proyecto en la contabilidad (Livon Gestión / ClickUp), para enviar allí los ingresos de taquilla.
alter table eventos add column codigo_proyecto text check (codigo_proyecto ~ '^[A-Za-z0-9._-]{1,40}$');
