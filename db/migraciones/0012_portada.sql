-- Portada: categoría para los filtros y evento destacado con su imagen panorámica.
alter table eventos add column categoria text check (categoria in ('musica', 'festival', 'espectaculo', 'otros'));
alter table eventos add column destacado boolean not null default false;
alter table eventos add column imagen_destacada_url text;
