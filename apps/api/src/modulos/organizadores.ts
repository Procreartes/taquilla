import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROLES } from '@taquilla/dominio';
import type { Contexto } from '../contexto';
import { exigir, exigirSuperadmin, sesionCompleta } from '../auth';
import { auditar } from '../auditoria';
import { ErrorHttp, conflicto, noEncontrado } from '../errores';

const COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const TEXTOS_LEGALES = z.record(z.string().max(10), z.record(z.string().max(40), z.string().max(50_000)));

export const DatosOrganizador = z.object({
  nombre: z.string().min(2).max(160),
  razon_social: z.string().max(200).nullable().optional(),
  cif: z.string().regex(/^[A-Z0-9]{8,10}$/i, 'CIF/NIF no válido').nullable().optional(),
  direccion_fiscal: z.string().max(300).nullable().optional(),
  email_contacto: z.string().email().max(200).nullable().optional(),
  telefono: z.string().max(30).nullable().optional(),
  logo_url: z.string().url().max(500).nullable().optional(),
  color_primario: COLOR.optional(),
  color_secundario: COLOR.optional(),
  impuesto_nombre: z.enum(['IGIC', 'IVA']).optional(),
  impuesto_tipo: z.number().min(0).max(99).optional(),
  impuesto_pendiente: z.boolean().optional(),
  gastos_gestion_cent: z.number().int().min(0).max(10_000).optional(),
  max_entradas_pedido: z.number().int().min(1).max(50).optional(),
  textos_legales: TEXTOS_LEGALES.optional(),
});

const CAMPOS_PUBLICOS = `id, slug, nombre, razon_social, cif, direccion_fiscal, email_contacto, telefono, logo_url,
  color_primario, color_secundario, stripe_cuenta_id, stripe_estado, impuesto_nombre, impuesto_tipo,
  impuesto_pendiente, gastos_gestion_cent, max_entradas_pedido, textos_legales, es_prueba, creado_en`;

export async function rutasOrganizadores(app: FastifyInstance, ctx: Contexto) {
  app.get('/api/organizador', async (req) => {
    const c = exigir(ctx, req, 'eventos.ver');
    return ctx.db.one(`select ${CAMPOS_PUBLICOS} from organizadores where id = $1`, [c.organizadorId]);
  });

  app.patch('/api/organizador', async (req) => {
    const c = exigir(ctx, req, 'organizador.editar');
    const datos = DatosOrganizador.partial().parse(req.body);
    const campos = Object.keys(datos) as (keyof typeof datos)[];
    if (!campos.length) return ctx.db.one(`select ${CAMPOS_PUBLICOS} from organizadores where id = $1`, [c.organizadorId]);
    const sets = campos.map((k, i) => `${k} = $${i + 2}`);
    const valores = campos.map((k) => (k === 'textos_legales' ? JSON.stringify(datos[k]) : datos[k]));
    return ctx.db.tx(async (t) => {
      const antes = await t.one(`select ${campos.join(', ')} from organizadores where id = $1`, [c.organizadorId]);
      const r = await t.one(`update organizadores set ${sets.join(', ')} where id = $1 returning ${CAMPOS_PUBLICOS}`, [c.organizadorId, ...valores]);
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'organizador.editar', entidad: 'organizador', entidadId: c.organizadorId, datos: { antes, despues: datos }, ip: req.ip });
      return r;
    });
  });

  // ---- Equipo ----
  app.get('/api/organizador/equipo', async (req) => {
    const c = exigir(ctx, req, 'equipo.gestionar');
    return ctx.db.query(
      `select u.id, u.email, u.nombre, u.totp_activo, u.ultimo_acceso, m.rol
         from membresias m join usuarios u on u.id = m.usuario_id
        where m.organizador_id = $1 order by u.nombre`,
      [c.organizadorId],
    );
  });

  app.post('/api/organizador/equipo', async (req) => {
    const c = exigir(ctx, req, 'equipo.gestionar');
    const d = z.object({ email: z.string().email().max(200), nombre: z.string().min(2).max(120), rol: z.enum(ROLES) }).parse(req.body);
    return ctx.db.tx(async (t) => {
      const email = d.email.toLowerCase();
      let u = await t.one<{ id: string }>('select id from usuarios where email = $1', [email]);
      // El usuario nuevo entra con Microsoft 365 o define su contraseña desde la invitación.
      if (!u) u = await t.one<{ id: string }>('insert into usuarios (email, nombre) values ($1, $2) returning id', [email, d.nombre]);
      const ya = await t.one('select 1 from membresias where usuario_id = $1 and organizador_id = $2', [u!.id, c.organizadorId]);
      if (ya) throw conflicto('Esa persona ya está en el equipo');
      await t.query('insert into membresias (usuario_id, organizador_id, rol) values ($1, $2, $3)', [u!.id, c.organizadorId, d.rol]);
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'equipo.alta', entidad: 'usuario', entidadId: u!.id, datos: { email, rol: d.rol }, ip: req.ip });
      return { id: u!.id, email, nombre: d.nombre, rol: d.rol };
    });
  });

  app.patch('/api/organizador/equipo/:usuarioId', async (req) => {
    const c = exigir(ctx, req, 'equipo.gestionar');
    const { usuarioId } = z.object({ usuarioId: z.string().uuid() }).parse(req.params);
    const { rol } = z.object({ rol: z.enum(ROLES) }).parse(req.body);
    return ctx.db.tx(async (t) => {
      const r = await t.one('update membresias set rol = $3 where usuario_id = $1 and organizador_id = $2 returning rol', [usuarioId, c.organizadorId, rol]);
      if (!r) throw noEncontrado('Miembro del equipo');
      await comprobarQuedaAdmin(t, c.organizadorId);
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'equipo.rol', entidad: 'usuario', entidadId: usuarioId, datos: { rol }, ip: req.ip });
      return { ok: true };
    });
  });

  app.delete('/api/organizador/equipo/:usuarioId', async (req) => {
    const c = exigir(ctx, req, 'equipo.gestionar');
    const { usuarioId } = z.object({ usuarioId: z.string().uuid() }).parse(req.params);
    return ctx.db.tx(async (t) => {
      const r = await t.one('delete from membresias where usuario_id = $1 and organizador_id = $2 returning rol', [usuarioId, c.organizadorId]);
      if (!r) throw noEncontrado('Miembro del equipo');
      await comprobarQuedaAdmin(t, c.organizadorId);
      await t.query('update sesiones set organizador_id = null where usuario_id = $1 and organizador_id = $2', [usuarioId, c.organizadorId]);
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'equipo.baja', entidad: 'usuario', entidadId: usuarioId, ip: req.ip });
      return { ok: true };
    });
  });

  app.get('/api/organizador/auditoria', async (req) => {
    const c = exigir(ctx, req, 'auditoria.ver');
    const { limite } = z.object({ limite: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    return ctx.db.query(
      `select a.id, a.accion, a.entidad, a.entidad_id, a.datos, a.ip, a.creado_en, u.nombre as usuario
         from auditoria a left join usuarios u on u.id = a.usuario_id
        where a.organizador_id = $1 order by a.creado_en desc, a.id desc limit $2`,
      [c.organizadorId, limite],
    );
  });

  // ---- Correos capturados (en local no se envía nada real) ----
  app.get('/api/organizador/correos', async (req) => {
    const c = exigir(ctx, req, 'correos.ver');
    return ctx.db.query(
      `select id, para, asunto, estado, error, creado_en, jsonb_path_query_array(adjuntos, '$[*].nombre') as adjuntos
         from correos_salientes where organizador_id = $1 order by creado_en desc limit 200`,
      [c.organizadorId],
    );
  });

  app.get('/api/organizador/correos/:id', async (req) => {
    const c = exigir(ctx, req, 'correos.ver');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await ctx.db.one('select id, para, asunto, html, texto, adjuntos, estado, creado_en from correos_salientes where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!r) throw noEncontrado('Correo');
    return { ...r, adjuntos: (r.adjuntos as any[]).map((a, i) => ({ nombre: a.nombre, tipo: a.tipo, bytes: a.bytes, descargable: !!a.base64, indice: i })) };
  });

  app.get('/api/organizador/correos/:id/adjunto/:i', async (req, reply) => {
    const c = exigir(ctx, req, 'correos.ver');
    const { id, i } = z.object({ id: z.string().uuid(), i: z.coerce.number().int().min(0).max(50) }).parse(req.params);
    const r = await ctx.db.one('select adjuntos from correos_salientes where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    const a = (r?.adjuntos as any[] | undefined)?.[i];
    if (!a?.base64) throw noEncontrado('Adjunto');
    reply.header('content-disposition', `attachment; filename="${String(a.nombre).replace(/[^\w.-]/g, '_')}"`);
    return reply.type(a.tipo === 'application/pdf' ? 'application/pdf' : 'application/octet-stream').send(Buffer.from(a.base64, 'base64'));
  });

  // ---- Plataforma (superadmin): alta de organizadores ----
  app.get('/api/plataforma/organizadores', async (req) => {
    exigirSuperadmin(ctx, req);
    return ctx.db.query(`select ${CAMPOS_PUBLICOS} from organizadores order by nombre`);
  });

  app.post('/api/plataforma/organizadores', async (req) => {
    const s = exigirSuperadmin(ctx, req);
    const d = DatosOrganizador.extend({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/) }).parse(req.body);
    const existe = await ctx.db.one('select 1 from organizadores where slug = $1', [d.slug]);
    if (existe) throw conflicto('Ya existe un organizador con ese identificador');
    const campos = Object.keys(d) as (keyof typeof d)[];
    const valores = campos.map((k) => (k === 'textos_legales' ? JSON.stringify(d[k]) : d[k]));
    return ctx.db.tx(async (t) => {
      const r = await t.one(
        `insert into organizadores (${campos.join(', ')}) values (${campos.map((_, i) => `$${i + 1}`).join(', ')}) returning ${CAMPOS_PUBLICOS}`,
        valores,
      );
      await auditar(t, { organizadorId: r!.id, usuarioId: s.usuario.id, accion: 'organizador.alta', entidad: 'organizador', entidadId: r!.id, ip: req.ip });
      return r;
    });
  });

  app.get('/api/organizador/mio', async (req) => {
    const s = sesionCompleta(ctx, req);
    if (!s.organizadorId) throw new ErrorHttp(400, 'Elige primero un organizador', 'sin_organizador');
    return ctx.db.one('select id, nombre, slug, color_primario, logo_url from organizadores where id = $1', [s.organizadorId]);
  });
}

async function comprobarQuedaAdmin(t: { one: Contexto['db']['one'] }, organizadorId: string) {
  const r = await t.one<{ n: number }>(`select count(*)::int as n from membresias where organizador_id = $1 and rol = 'admin'`, [organizadorId]);
  if (!r || r.n < 1) throw conflicto('El organizador tiene que tener al menos una persona con rol de administración');
}
