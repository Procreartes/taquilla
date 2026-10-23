/**
 * Eventos (festivales, giras, eventos sueltos), funciones, precios por zona,
 * socios de coproducción e importador de la programación.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { motivosNoVendible, type RecetaPlano } from '@taquilla/dominio';
import type { Contexto } from '../contexto';
import type { Consultor } from '../db';
import { exigir } from '../auth';
import { auditar } from '../auditoria';
import { conflicto, invalido, noEncontrado } from '../errores';
import { congelarVersion } from './planos';

const uuid = z.string().uuid();
const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HORA = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

const DatosEvento = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  nombre: z.string().min(2).max(200),
  tipo: z.enum(['festival', 'gira', 'evento']).default('festival'),
  descripcion: z.string().max(5000).nullable().optional(),
  imagen_url: z.string().url().max(500).nullable().optional(),
  publicado: z.boolean().optional(),
});

const DatosFuncion = z.object({
  codigo: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  recinto_id: uuid,
  titulo: z.string().min(1).max(200),
  artistas: z.array(z.string().max(120)).max(30).default([]),
  es_gala: z.boolean().default(false),
  edad_minima: z.number().int().min(0).max(21).nullable().optional(),
  nota: z.string().max(1000).nullable().optional(),
  fecha: FECHA,
  hora: HORA.nullable().optional(),
  modo_venta: z.enum(['numerada', 'general', 'libre']),
  version_plano_id: uuid.nullable().optional(),
  aforo: z.number().int().min(1).max(200_000).nullable().optional(),
  venta_externa_url: z.string().url().max(500).nullable().optional(),
  verificar: z.boolean().optional(),
  publicada: z.boolean().optional(),
});

/** Zonas a las que hay que poner precio en una función. */
export async function zonasDeFuncion(c: Consultor, f: { modo_venta: string; version_plano_id: string | null }) {
  if (f.modo_venta === 'libre') return [];
  if (f.modo_venta === 'general') return [{ codigo: 'general', nombre: 'Entrada general', color: '#5a6478' }];
  const v = await c.one<{ receta: RecetaPlano }>('select receta from versiones_plano where id = $1', [f.version_plano_id]);
  return v?.receta.zonas.map(({ codigo, nombre, color }) => ({ codigo, nombre, color })) ?? [];
}

export async function detalleFuncion(c: Consultor, organizadorId: string, id: string): Promise<Record<string, any>> {
  const f = await c.one<any>(
    `select f.*, to_char(f.hora, 'HH24:MI') as hora, r.nombre as recinto_nombre, r.municipio, r.isla, r.zona as recinto_zona,
            e.nombre as evento_nombre, e.slug as evento_slug,
            v.estado as plano_estado, v.numero as plano_version, v.comprobacion->'ok' as plano_cuadra, v.comprobacion->'vend' as plano_plazas,
            p.nombre as plano_nombre
       from funciones f
       join recintos r on r.id = f.recinto_id
       join eventos e on e.id = f.evento_id
       left join versiones_plano v on v.id = f.version_plano_id
       left join planos p on p.id = v.plano_id
      where f.id = $1 and f.organizador_id = $2`,
    [id, organizadorId],
  );
  if (!f) throw noEncontrado('Función');
  const zonas = await zonasDeFuncion(c, f);
  const precios = Object.fromEntries((await c.query('select zona_codigo, precio_cent from precios_funcion where funcion_id = $1', [id])).map((p) => [p.zona_codigo, p.precio_cent]));
  const motivos = motivosNoVendible({
    modo: f.modo_venta, zonas: zonas.map((z) => z.codigo), precios, aforo: f.aforo, ventaExterna: f.venta_externa_url, planoCuadra: f.plano_cuadra ?? undefined,
  });
  return { ...f, zonas: zonas.map((z) => ({ ...z, precio_cent: precios[z.codigo] ?? null })), motivos_no_vendible: motivos };
}

export async function ponerALaVenta(c: Consultor, organizadorId: string, id: string) {
  const f = await detalleFuncion(c, organizadorId, id);
  if (['cancelada', 'finalizada'].includes(f.estado)) throw conflicto('Esta función está cancelada o terminada');
  if (f.motivos_no_vendible.length) throw conflicto(`No se puede poner a la venta: ${f.motivos_no_vendible.join('; ')}`, 'no_vendible', { motivos: f.motivos_no_vendible });
  if (f.modo_venta === 'numerada') await congelarVersion(c, organizadorId, f.version_plano_id);
  await c.query(`update funciones set estado = 'a_la_venta' where id = $1`, [id]);
}

// ------------------------------------------------------------------------------------------------
// Importador de la programación (formato de datos/programacion-asombra-2026.json)
// ------------------------------------------------------------------------------------------------

const Programacion = z.object({
  _meta: z.object({ edicion: z.string(), fuente: z.string().optional(), notas: z.array(z.string()).optional() }).passthrough(),
  islas: z.array(z.object({ id: z.string(), nombre: z.string(), estado: z.string().optional(), etiqueta: z.string().optional(), colores: z.record(z.string()) })),
  recintos: z.array(z.object({ id: z.string(), nombre: z.string(), zona: z.string().optional(), municipio: z.string().nullable().optional(), isla: z.string(), verificar: z.boolean().optional() })),
  artistas: z.array(z.object({ id: z.string(), nombre: z.string(), procedencia: z.string().optional() })),
  espectaculos: z.array(z.object({
    id: z.string(), titulo: z.string().nullable(), artistas: z.array(z.string()), tipo: z.string().optional(), edadMinima: z.number().optional(),
    nota: z.string().optional(), programa: z.array(z.object({ titulo: z.string(), artista: z.string() })).optional(),
  })),
  funciones: z.array(z.object({
    id: z.string(), espectaculo: z.string(), fecha: FECHA, hora: HORA.nullable(), recinto: z.string(), precio: z.number().nullable(),
    ticketUrl: z.string().url().nullable(), precioDesde: z.boolean().optional(), verificar: z.boolean().optional(),
  })),
});

export interface OpcionesImportacion {
  slug: string;
  nombre: string;
  socios?: { nombre: string; porcentaje: number }[];
}

export async function importarProgramacion(t: Consultor, organizadorId: string, datos: unknown, o: OpcionesImportacion) {
  const p = Programacion.parse(datos);
  const evento = await t.one<{ id: string; organizador_id: string }>(
    `insert into eventos (organizador_id, slug, nombre, tipo, datos, publicado)
     values ($1, $2, $3, 'festival', $4, true)
     on conflict (slug) do update set nombre = excluded.nombre, datos = excluded.datos
     returning id, organizador_id`,
    [organizadorId, o.slug, o.nombre, JSON.stringify({ edicion: p._meta.edicion, fuente: p._meta.fuente, notas: p._meta.notas ?? [], islas: p.islas })],
  );
  if (evento!.organizador_id !== organizadorId) throw conflicto('Ese evento pertenece a otro organizador');
  const recintos: Record<string, string> = {};
  for (const r of p.recintos) {
    const fila = await t.one<{ id: string }>(
      `insert into recintos (organizador_id, codigo, nombre, zona, municipio, isla, verificar) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (organizador_id, codigo) do update set zona = coalesce(recintos.zona, excluded.zona),
         municipio = coalesce(recintos.municipio, excluded.municipio), isla = coalesce(recintos.isla, excluded.isla), verificar = excluded.verificar
       returning id`,
      [organizadorId, r.id, r.nombre, r.zona ?? null, r.municipio ?? null, r.isla, r.verificar ?? false],
    );
    recintos[r.id] = fila!.id;
  }
  const artistas = new Map(p.artistas.map((a) => [a.id, a.nombre]));
  const espectaculos = new Map(p.espectaculos.map((e) => [e.id, e]));
  const resumen = { funciones: 0, numeradas: 0, generales: 0, libres: 0, sinPrecio: 0, externas: 0 };
  for (const f of p.funciones) {
    const e = espectaculos.get(f.espectaculo);
    if (!e) throw invalido(`La función ${f.id} apunta a un espectáculo que no existe (${f.espectaculo})`);
    const recintoId = recintos[f.recinto];
    if (!recintoId) throw invalido(`La función ${f.id} apunta a un recinto que no existe (${f.recinto})`);
    const titulo = e.titulo ?? e.programa?.map((x) => x.titulo).join(' + ') ?? 'Por confirmar';
    // plano: la versión más reciente que cuadra de cualquier plano del recinto
    const plano = await t.one<{ id: string }>(
      `select v.id from versiones_plano v join planos pl on pl.id = v.plano_id
        where pl.recinto_id = $1 and (v.comprobacion->>'ok')::boolean order by v.estado = 'congelada' desc, v.numero desc limit 1`,
      [recintoId],
    );
    const modo = f.precio === 0 ? 'libre' : plano ? 'numerada' : 'general';
    const notas = [e.nota, f.precioDesde && f.precio ? `Precio desde ${f.precio} €` : null].filter(Boolean).join(' · ') || null;
    const fila = await t.one<{ id: string; estado: string }>(
      `insert into funciones (organizador_id, evento_id, recinto_id, codigo, titulo, artistas, programa, es_gala, edad_minima, nota,
                              fecha, hora, modo_venta, version_plano_id, venta_externa_url, verificar)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       on conflict (evento_id, codigo) do update set titulo = excluded.titulo, artistas = excluded.artistas, programa = excluded.programa,
         es_gala = excluded.es_gala, edad_minima = excluded.edad_minima, nota = excluded.nota, fecha = excluded.fecha, hora = excluded.hora,
         venta_externa_url = excluded.venta_externa_url, verificar = excluded.verificar
       returning id, estado`,
      [
        organizadorId, evento!.id, recintoId, f.id, titulo, JSON.stringify(e.artistas.map((a) => artistas.get(a) ?? a)),
        e.programa ? JSON.stringify(e.programa.map((x) => ({ titulo: x.titulo, artista: artistas.get(x.artista) ?? x.artista }))) : null,
        e.tipo === 'gala', e.edadMinima ?? null, notas, f.fecha, f.hora, modo, modo === 'numerada' ? plano!.id : null, f.ticketUrl, f.verificar ?? false,
      ],
    );
    // Precio oficial solo si existe; si no, se queda «por confirmar» y la función no se puede vender.
    if (f.precio !== null && modo !== 'libre' && fila!.estado === 'borrador') {
      const zonas = await zonasDeFuncion(t, { modo_venta: modo, version_plano_id: modo === 'numerada' ? plano!.id : null });
      for (const z of zonas) {
        await t.query(
          `insert into precios_funcion (funcion_id, zona_codigo, precio_cent) values ($1, $2, $3) on conflict do nothing`,
          [fila!.id, z.codigo, Math.round(f.precio * 100)],
        );
      }
    }
    resumen.funciones++;
    resumen[modo === 'numerada' ? 'numeradas' : modo === 'general' ? 'generales' : 'libres']++;
    if (f.precio === null) resumen.sinPrecio++;
    if (f.ticketUrl) resumen.externas++;
  }
  if (o.socios?.length) {
    const ya = await t.one<{ n: number }>('select count(*)::int as n from socios_evento where evento_id = $1', [evento!.id]);
    if (!ya!.n) for (const [i, s] of o.socios.entries()) {
      await t.query('insert into socios_evento (evento_id, nombre, porcentaje, orden) values ($1, $2, $3, $4)', [evento!.id, s.nombre, s.porcentaje, i]);
    }
  }
  return { eventoId: evento!.id, ...resumen };
}

// ------------------------------------------------------------------------------------------------

export async function rutasEventos(app: FastifyInstance, ctx: Contexto) {
  app.get('/api/eventos', async (req) => {
    const c = exigir(ctx, req, 'eventos.ver');
    return ctx.db.query(
      `select e.id, e.slug, e.nombre, e.tipo, e.publicado, e.es_prueba,
              count(f.id)::int as funciones, min(f.fecha) as desde, max(f.fecha) as hasta,
              count(f.id) filter (where f.estado = 'a_la_venta')::int as a_la_venta
         from eventos e left join funciones f on f.evento_id = e.id
        where e.organizador_id = $1 group by e.id order by min(f.fecha) nulls last, e.nombre`,
      [c.organizadorId],
    );
  });

  app.post('/api/eventos', async (req) => {
    const c = exigir(ctx, req, 'eventos.editar');
    const d = DatosEvento.parse(req.body);
    if (await ctx.db.one('select 1 from eventos where slug = $1', [d.slug])) throw conflicto('Ya existe un evento con esa dirección');
    return ctx.db.one(
      `insert into eventos (organizador_id, slug, nombre, tipo, descripcion, imagen_url, publicado) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [c.organizadorId, d.slug, d.nombre, d.tipo, d.descripcion ?? null, d.imagen_url ?? null, d.publicado ?? false],
    );
  });

  app.get('/api/eventos/:id', async (req) => {
    const c = exigir(ctx, req, 'eventos.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const e = await ctx.db.one('select * from eventos where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!e) throw noEncontrado('Evento');
    const funciones = await ctx.db.query(
      `select f.id, f.codigo, f.titulo, f.fecha, to_char(f.hora, 'HH24:MI') as hora, f.modo_venta, f.estado, f.aforo, f.verificar,
              f.venta_externa_url, f.es_prueba, r.nombre as recinto_nombre, r.isla, r.municipio,
              (select json_object_agg(zona_codigo, precio_cent) from precios_funcion pf where pf.funcion_id = f.id) as precios
         from funciones f join recintos r on r.id = f.recinto_id
        where f.evento_id = $1 order by f.fecha, f.hora nulls last, f.codigo`,
      [id],
    );
    const socios = await ctx.db.query('select id, nombre, cif, porcentaje from socios_evento where evento_id = $1 order by orden, nombre', [id]);
    return { ...e, funciones, socios };
  });

  app.patch('/api/eventos/:id', async (req) => {
    const c = exigir(ctx, req, 'eventos.editar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const d = DatosEvento.omit({ slug: true }).partial().parse(req.body);
    const campos = Object.keys(d) as (keyof typeof d)[];
    if (!campos.length) throw invalido('Nada que cambiar');
    const r = await ctx.db.one(
      `update eventos set ${campos.map((k, i) => `${k} = $${i + 3}`).join(', ')} where id = $1 and organizador_id = $2 returning *`,
      [id, c.organizadorId, ...campos.map((k) => d[k] ?? null)],
    );
    if (!r) throw noEncontrado('Evento');
    return r;
  });

  app.put('/api/eventos/:id/socios', async (req) => {
    const c = exigir(ctx, req, 'eventos.editar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { socios } = z.object({
      socios: z.array(z.object({ nombre: z.string().min(1).max(200), cif: z.string().max(20).nullable().optional(), porcentaje: z.number().positive().max(100) })).max(20),
    }).parse(req.body);
    const suma = socios.reduce((s, x) => s + x.porcentaje, 0);
    if (socios.length && Math.abs(suma - 100) > 0.001) throw invalido(`Los porcentajes suman ${suma} % y deben sumar 100 %`);
    return ctx.db.tx(async (t) => {
      const e = await t.one('select 1 from eventos where id = $1 and organizador_id = $2', [id, c.organizadorId]);
      if (!e) throw noEncontrado('Evento');
      await t.query('delete from socios_evento where evento_id = $1', [id]);
      for (const [i, s] of socios.entries()) {
        await t.query('insert into socios_evento (evento_id, nombre, cif, porcentaje, orden) values ($1, $2, $3, $4, $5)', [id, s.nombre, s.cif ?? null, s.porcentaje, i]);
      }
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'evento.socios', entidad: 'evento', entidadId: id, datos: { socios }, ip: req.ip });
      return { ok: true };
    });
  });

  app.post('/api/eventos/importar-programacion', { bodyLimit: 5 * 1024 * 1024 }, async (req) => {
    const c = exigir(ctx, req, 'eventos.editar');
    const d = z.object({
      slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
      nombre: z.string().min(2).max(200),
      programacion: z.unknown(),
      socios: z.array(z.object({ nombre: z.string(), porcentaje: z.number() })).optional(),
    }).parse(req.body);
    return ctx.db.tx(async (t) => {
      const r = await importarProgramacion(t, c.organizadorId, d.programacion, d);
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'evento.importar', entidad: 'evento', entidadId: r.eventoId, datos: r, ip: req.ip });
      return r;
    });
  });

  // ---- Funciones ----
  app.post('/api/eventos/:id/funciones', async (req) => {
    const c = exigir(ctx, req, 'eventos.editar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const d = DatosFuncion.parse(req.body);
    const e = await ctx.db.one('select 1 from eventos where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!e) throw noEncontrado('Evento');
    await validarRecintoYPlano(ctx.db, c.organizadorId, d.recinto_id, d.modo_venta, d.version_plano_id ?? null);
    if (await ctx.db.one('select 1 from funciones where evento_id = $1 and codigo = $2', [id, d.codigo])) throw conflicto('Ya hay una función con ese código en el evento');
    return ctx.db.one(
      `insert into funciones (organizador_id, evento_id, recinto_id, codigo, titulo, artistas, es_gala, edad_minima, nota, fecha, hora,
                              modo_venta, version_plano_id, aforo, venta_externa_url, verificar, publicada)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) returning id`,
      [c.organizadorId, id, d.recinto_id, d.codigo, d.titulo, JSON.stringify(d.artistas), d.es_gala, d.edad_minima ?? null, d.nota ?? null,
        d.fecha, d.hora ?? null, d.modo_venta, d.modo_venta === 'numerada' ? d.version_plano_id : null, d.aforo ?? null,
        d.venta_externa_url ?? null, d.verificar ?? false, d.publicada ?? true],
    );
  });

  app.get('/api/funciones/:id', async (req) => {
    const c = exigir(ctx, req, 'eventos.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    return detalleFuncion(ctx.db, c.organizadorId, id);
  });

  app.patch('/api/funciones/:id', async (req) => {
    const c = exigir(ctx, req, 'eventos.editar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const d = DatosFuncion.omit({ codigo: true }).partial().parse(req.body);
    return ctx.db.tx(async (t) => {
      const f = await t.one('select * from funciones where id = $1 and organizador_id = $2 for update', [id, c.organizadorId]);
      if (!f) throw noEncontrado('Función');
      const vendidas = await entradasVivas(t, id);
      if (vendidas && (d.modo_venta && d.modo_venta !== f.modo_venta || d.recinto_id && d.recinto_id !== f.recinto_id)) {
        throw conflicto('Esta función ya tiene entradas vendidas: no se puede cambiar el recinto ni el modo de venta');
      }
      if (d.version_plano_id !== undefined && d.version_plano_id !== f.version_plano_id && vendidas) {
        throw conflicto('Para cambiar el plano de una función con ventas usa «Cambiar plano» (traslada o reasigna las butacas vendidas)', 'usar_cambio_plano');
      }
      const modo = d.modo_venta ?? f.modo_venta, recinto = d.recinto_id ?? f.recinto_id;
      const version = modo === 'numerada' ? (d.version_plano_id !== undefined ? d.version_plano_id : f.version_plano_id) : null;
      await validarRecintoYPlano(t, c.organizadorId, recinto, modo, version);
      if (d.aforo !== undefined && d.aforo !== null && d.aforo < f.vendidas_general) throw conflicto(`Ya hay ${f.vendidas_general} entradas vendidas: el aforo no puede ser menor`);
      const valores: Record<string, unknown> = { ...d, version_plano_id: version };
      if (d.artistas) valores.artistas = JSON.stringify(d.artistas);
      const campos = Object.keys(valores);
      await t.query(`update funciones set ${campos.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [id, ...campos.map((k) => valores[k] ?? null)]);
      if (modo !== f.modo_venta || version !== f.version_plano_id) {
        // cambian las zonas: se borran los precios que ya no corresponden
        const zonas = (await zonasDeFuncion(t, { modo_venta: modo, version_plano_id: version })).map((z) => z.codigo);
        await t.query('delete from precios_funcion where funcion_id = $1 and not (zona_codigo = any($2::text[]))', [id, zonas]);
      }
      return detalleFuncion(t, c.organizadorId, id);
    });
  });

  app.put('/api/funciones/:id/precios', async (req) => {
    const c = exigir(ctx, req, 'precios.editar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { precios } = z.object({ precios: z.record(z.string().max(40), z.number().int().min(0).max(10_000_000).nullable()) }).parse(req.body);
    return ctx.db.tx(async (t) => {
      const f = await t.one<any>('select modo_venta, version_plano_id from funciones where id = $1 and organizador_id = $2 for update', [id, c.organizadorId]);
      if (!f) throw noEncontrado('Función');
      const validas = new Set((await zonasDeFuncion(t, f)).map((z) => z.codigo));
      const antes = Object.fromEntries((await t.query('select zona_codigo, precio_cent from precios_funcion where funcion_id = $1', [id])).map((p) => [p.zona_codigo, p.precio_cent]));
      for (const [zona, cent] of Object.entries(precios)) {
        if (!validas.has(zona)) throw invalido(`La zona «${zona}» no existe en esta función`);
        if (cent === null) await t.query('delete from precios_funcion where funcion_id = $1 and zona_codigo = $2', [id, zona]);
        else await t.query(
          `insert into precios_funcion (funcion_id, zona_codigo, precio_cent) values ($1, $2, $3)
           on conflict (funcion_id, zona_codigo) do update set precio_cent = excluded.precio_cent`, [id, zona, cent]);
      }
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'funcion.precios', entidad: 'funcion', entidadId: id, datos: { antes, despues: precios }, ip: req.ip });
      return detalleFuncion(t, c.organizadorId, id);
    });
  });

  app.post('/api/funciones/:id/poner-a-la-venta', async (req) => {
    const c = exigir(ctx, req, 'eventos.editar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    return ctx.db.tx(async (t) => {
      await ponerALaVenta(t, c.organizadorId, id);
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'funcion.a_la_venta', entidad: 'funcion', entidadId: id, ip: req.ip });
      return detalleFuncion(t, c.organizadorId, id);
    });
  });

  app.post('/api/funciones/:id/pausar', async (req) => {
    const c = exigir(ctx, req, 'eventos.editar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    return ctx.db.tx(async (t) => {
      const r = await t.one(`update funciones set estado = 'pausada' where id = $1 and organizador_id = $2 and estado in ('a_la_venta', 'agotada') returning id`, [id, c.organizadorId]);
      if (!r) throw conflicto('Solo se puede pausar una función que está a la venta');
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'funcion.pausar', entidad: 'funcion', entidadId: id, ip: req.ip });
      return detalleFuncion(t, c.organizadorId, id);
    });
  });
}

async function validarRecintoYPlano(c: Consultor, organizadorId: string, recintoId: string, modo: string, versionId: string | null) {
  const r = await c.one('select 1 from recintos where id = $1 and organizador_id = $2', [recintoId, organizadorId]);
  if (!r) throw invalido('Ese recinto no existe');
  if (modo === 'numerada') {
    if (!versionId) throw invalido('Una función numerada necesita un plano');
    const v = await c.one('select 1 from versiones_plano v join planos p on p.id = v.plano_id where v.id = $1 and p.recinto_id = $2 and v.organizador_id = $3', [versionId, recintoId, organizadorId]);
    if (!v) throw invalido('Ese plano no es de este recinto');
  }
}

/** Entradas vendidas y no anuladas de una función (0 hasta que exista la venta). */
export async function entradasVivas(c: Consultor, funcionId: string): Promise<number> {
  const existe = await c.one(`select to_regclass('public.entradas') is not null as hay`);
  if (!existe?.hay) return 0;
  const r = await c.one<{ n: number }>(`select count(*)::int as n from entradas where funcion_id = $1 and estado in ('valida', 'usada')`, [funcionId]);
  return r?.n ?? 0;
}
