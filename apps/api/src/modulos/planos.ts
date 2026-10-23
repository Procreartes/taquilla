/**
 * Recintos, planos y versiones de plano (formato plano-taquilla/1).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  FORMATO_PLANO, butacasExportadas, comprobar, diferenciasImportacion, exportarPlano, generar, planoNuevo,
  type DocumentoPlano, type RecetaPlano,
} from '@taquilla/dominio';
import type { Contexto } from '../contexto';
import type { Consultor } from '../db';
import { exigir } from '../auth';
import { auditar } from '../auditoria';
import { conflicto, invalido, noEncontrado } from '../errores';

const num = z.union([z.number(), z.string().max(20)]);
const texto = (max = 200) => z.string().max(max);
const COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const EsquemaReceta = z.object({
  id: texto(60).default('p'),
  nombre: texto(120),
  recinto: texto(200).optional(),
  fuente: texto(500).optional(),
  notas: texto(2000).optional(),
  aforo: z.object({ butacas: z.coerce.number().int().min(0).max(200_000), pmr: z.coerce.number().int().min(0).max(5_000) }).optional(),
  zonas: z.array(z.object({ codigo: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), nombre: texto(80), color: COLOR, precio: z.coerce.number().min(0).max(100_000).optional() })).min(1).max(30),
  bloques: z.array(z.object({
    id: texto(40),
    nombre: texto(80),
    codigo: texto(30),
    desde: num,
    hasta: num,
    prefijo: texto(10),
    butacas: num,
    numeracion: z.enum(['derecha', 'izquierda', 'pares_impares']),
    imparesA: z.enum(['derecha', 'izquierda']).optional(),
    pasilloCentral: num.optional(),
    pasillos: texto(200).optional(),
    tramos: z.array(z.object({ desde: num, hasta: num, zona: texto(40) })).max(200).optional(),
    excepciones: z.array(z.object({ fila: num, butacas: num })).max(500).optional(),
    quitar: z.array(z.object({ fila: num, butacas: texto(500) })).max(500).optional(),
    pmr: z.array(z.object({ fila: num, sustituye: texto(200), cantidad: num })).max(100).optional(),
  })).min(1).max(40),
  ajustes: z.record(texto(60), z.object({
    zona: texto(40).optional(),
    tipo: z.enum(['normal', 'silla_ruedas', 'acompanante', 'visibilidad_reducida']).optional(),
    bloqueado: z.boolean().optional(),
    quitada: z.boolean().optional(),
  })).optional(),
});

const EsquemaDocumento = z.object({
  formato: z.literal(FORMATO_PLANO),
  plano: EsquemaReceta,
  butacas: z.array(z.any()).max(100_000).optional(),
  comprobacion: z.any().optional(),
});

export const DatosRecinto = z.object({
  codigo: z.string().regex(/^[a-z0-9-]{2,60}$/),
  nombre: z.string().min(2).max(200),
  zona: z.string().max(120).nullable().optional(),
  municipio: z.string().max(120).nullable().optional(),
  isla: z.string().max(60).nullable().optional(),
  direccion: z.string().max(300).nullable().optional(),
  verificar: z.boolean().optional(),
});

const LIMITE_BUTACAS = 60_000;

/** Calcula butacas y comprobación a partir de la receta. */
export function calcularVersion(receta: RecetaPlano) {
  const g = generar(receta);
  if (g.asientos.length > LIMITE_BUTACAS) throw invalido(`El plano tiene demasiadas butacas (máximo ${LIMITE_BUTACAS})`);
  return { butacas: butacasExportadas(g), comprobacion: comprobar(receta, g) };
}

export async function crearVersion(t: Consultor, organizadorId: string, planoId: string, receta: RecetaPlano, usuarioId: string | null) {
  const { butacas, comprobacion } = calcularVersion(receta);
  const sig = await t.one<{ n: number }>('select coalesce(max(numero), 0) + 1 as n from versiones_plano where plano_id = $1', [planoId]);
  return t.one(
    `insert into versiones_plano (organizador_id, plano_id, numero, receta, butacas, comprobacion, creado_por)
     values ($1, $2, $3, $4, $5, $6, $7) returning id, numero, estado, comprobacion`,
    [organizadorId, planoId, sig!.n, JSON.stringify(receta), JSON.stringify(butacas), JSON.stringify(comprobacion), usuarioId],
  );
}

/** Pone a la venta (congela) una versión. Falla si la comprobación no cuadra. */
export async function congelarVersion(t: Consultor, organizadorId: string, versionId: string) {
  const v = await t.one('select estado, comprobacion from versiones_plano where id = $1 and organizador_id = $2', [versionId, organizadorId]);
  if (!v) throw noEncontrado('Versión de plano');
  if (v.estado === 'congelada') return;
  if (!v.comprobacion?.ok) throw conflicto('El plano no cuadra con el aforo oficial: corrige los errores de la comprobación antes de ponerlo a la venta', 'plano_no_cuadra', { errores: v.comprobacion?.err ?? [] });
  await t.query(`update versiones_plano set estado = 'congelada', congelada_en = now() where id = $1`, [versionId]);
}

export async function rutasPlanos(app: FastifyInstance, ctx: Contexto) {
  // ---- Recintos ----
  app.get('/api/recintos', async (req) => {
    const c = exigir(ctx, req, 'recintos.ver');
    return ctx.db.query(
      `select r.*, (select count(*)::int from planos p where p.recinto_id = r.id) as planos
         from recintos r where r.organizador_id = $1 order by r.isla nulls last, r.nombre`,
      [c.organizadorId],
    );
  });

  app.post('/api/recintos', async (req) => {
    const c = exigir(ctx, req, 'recintos.editar');
    const d = DatosRecinto.parse(req.body);
    const ya = await ctx.db.one('select 1 from recintos where organizador_id = $1 and codigo = $2', [c.organizadorId, d.codigo]);
    if (ya) throw conflicto('Ya hay un recinto con ese código');
    return ctx.db.one(
      `insert into recintos (organizador_id, codigo, nombre, zona, municipio, isla, direccion, verificar)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [c.organizadorId, d.codigo, d.nombre, d.zona ?? null, d.municipio ?? null, d.isla ?? null, d.direccion ?? null, d.verificar ?? false],
    );
  });

  app.get('/api/recintos/:id', async (req) => {
    const c = exigir(ctx, req, 'recintos.ver');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await ctx.db.one('select * from recintos where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!r) throw noEncontrado('Recinto');
    const planos = await ctx.db.query(
      `select p.id, p.nombre, p.creado_en,
              (select json_agg(json_build_object('id', v.id, 'numero', v.numero, 'estado', v.estado,
                       'butacas', v.comprobacion->'but', 'pmr', v.comprobacion->'pmr', 'ok', v.comprobacion->'ok',
                       'actualizado_en', v.actualizado_en) order by v.numero desc)
                 from versiones_plano v where v.plano_id = p.id) as versiones
         from planos p where p.recinto_id = $1 and p.organizador_id = $2 order by p.creado_en`,
      [id, c.organizadorId],
    );
    return { ...r, planos };
  });

  app.patch('/api/recintos/:id', async (req) => {
    const c = exigir(ctx, req, 'recintos.editar');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const d = DatosRecinto.partial().parse(req.body);
    const campos = Object.keys(d) as (keyof typeof d)[];
    if (!campos.length) throw invalido('Nada que cambiar');
    const r = await ctx.db.one(
      `update recintos set ${campos.map((k, i) => `${k} = $${i + 3}`).join(', ')} where id = $1 and organizador_id = $2 returning *`,
      [id, c.organizadorId, ...campos.map((k) => d[k] ?? null)],
    );
    if (!r) throw noEncontrado('Recinto');
    return r;
  });

  // ---- Planos ----
  app.post('/api/recintos/:id/planos', async (req) => {
    const c = exigir(ctx, req, 'recintos.editar');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const d = z.object({ nombre: z.string().min(1).max(120), receta: EsquemaReceta.optional() }).parse(req.body);
    const r = await ctx.db.one('select nombre from recintos where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!r) throw noEncontrado('Recinto');
    return ctx.db.tx(async (t) => {
      const p = await t.one<{ id: string }>('insert into planos (organizador_id, recinto_id, nombre) values ($1, $2, $3) returning id', [c.organizadorId, id, d.nombre]);
      const receta = (d.receta as RecetaPlano) ?? planoNuevo(d.nombre, r.nombre);
      const v = await crearVersion(t, c.organizadorId, p!.id, receta, c.usuarioId);
      return { planoId: p!.id, version: v };
    });
  });

  app.post('/api/recintos/:id/importar', async (req) => {
    const c = exigir(ctx, req, 'recintos.editar');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { documento, nombre } = z.object({ documento: z.unknown(), nombre: z.string().max(120).optional() }).parse(req.body);
    const doc = EsquemaDocumento.safeParse(documento);
    if (!doc.success) throw invalido('El fichero no tiene el formato plano-taquilla/1', { detalles: doc.error.issues.slice(0, 5).map((i) => ({ campo: i.path.join('.'), mensaje: i.message })) });
    const r = await ctx.db.one('select 1 from recintos where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!r) throw noEncontrado('Recinto');
    const diferencias = diferenciasImportacion(doc.data as DocumentoPlano);
    return ctx.db.tx(async (t) => {
      const p = await t.one<{ id: string }>('insert into planos (organizador_id, recinto_id, nombre) values ($1, $2, $3) returning id', [c.organizadorId, id, nombre ?? doc.data.plano.nombre]);
      const v = await crearVersion(t, c.organizadorId, p!.id, doc.data.plano as RecetaPlano, c.usuarioId);
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'plano.importar', entidad: 'plano', entidadId: p!.id, datos: { diferencias: diferencias.length }, ip: req.ip });
      return { planoId: p!.id, version: v, diferencias };
    });
  });

  app.post('/api/planos/:id/versiones', async (req) => {
    const c = exigir(ctx, req, 'recintos.editar');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const ult = await ctx.db.one('select receta from versiones_plano where plano_id = $1 and organizador_id = $2 order by numero desc limit 1', [id, c.organizadorId]);
    if (!ult) throw noEncontrado('Plano');
    return ctx.db.tx((t) => crearVersion(t, c.organizadorId, id, ult.receta, c.usuarioId));
  });

  // ---- Versiones ----
  app.get('/api/versiones/:id', async (req) => {
    const c = exigir(ctx, req, 'recintos.ver');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const v = await ctx.db.one(
      `select v.id, v.numero, v.estado, v.receta, v.comprobacion, v.congelada_en, v.actualizado_en,
              p.id as plano_id, p.nombre as plano_nombre, r.id as recinto_id, r.nombre as recinto_nombre
         from versiones_plano v join planos p on p.id = v.plano_id join recintos r on r.id = p.recinto_id
        where v.id = $1 and v.organizador_id = $2`,
      [id, c.organizadorId],
    );
    if (!v) throw noEncontrado('Versión de plano');
    return v;
  });

  app.put('/api/versiones/:id', async (req) => {
    const c = exigir(ctx, req, 'recintos.editar');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const receta = EsquemaReceta.parse((req.body as any)?.receta) as RecetaPlano;
    const v = await ctx.db.one('select estado from versiones_plano where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!v) throw noEncontrado('Versión de plano');
    if (v.estado === 'congelada') throw conflicto('Esta versión ya está a la venta y no se puede cambiar. Crea una versión nueva.', 'congelada');
    const { butacas, comprobacion } = calcularVersion(receta);
    await ctx.db.query(
      'update versiones_plano set receta = $2, butacas = $3, comprobacion = $4, actualizado_en = now() where id = $1',
      [id, JSON.stringify(receta), JSON.stringify(butacas), JSON.stringify(comprobacion)],
    );
    return { comprobacion };
  });

  app.post('/api/versiones/:id/congelar', async (req) => {
    const c = exigir(ctx, req, 'recintos.editar');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await ctx.db.tx(async (t) => {
      await congelarVersion(t, c.organizadorId, id);
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'plano.congelar', entidad: 'version_plano', entidadId: id, ip: req.ip });
    });
    return { ok: true };
  });

  app.delete('/api/versiones/:id', async (req) => {
    const c = exigir(ctx, req, 'recintos.editar');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const v = await ctx.db.one('select estado from versiones_plano where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!v) throw noEncontrado('Versión de plano');
    if (v.estado === 'congelada') throw conflicto('Una versión congelada no se puede borrar', 'congelada');
    await ctx.db.query('delete from versiones_plano where id = $1', [id]);
    return { ok: true };
  });

  app.get('/api/versiones/:id/exportar', async (req, reply) => {
    const c = exigir(ctx, req, 'recintos.ver');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const v = await ctx.db.one('select receta, numero from versiones_plano where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!v) throw noEncontrado('Versión de plano');
    reply.header('content-disposition', `attachment; filename="plano-${String(v.receta.id).replace(/[^a-z0-9-]/gi, '')}-v${v.numero}.json"`);
    return exportarPlano(v.receta);
  });
}
