-- Gastos de gestión como porcentaje del precio de cada entrada (p. ej. 8 %).
-- Si está definido, sustituye al importe fijo por entrada; una entrada gratuita no paga gastos.
alter table organizadores
  add column gastos_gestion_pct numeric(5, 2) check (gastos_gestion_pct is null or (gastos_gestion_pct >= 0 and gastos_gestion_pct <= 50));
