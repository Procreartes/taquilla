/**
 * App de puerta: funciones del día, paquete para validar sin conexión, validación en línea,
 * sincronización de lecturas y aforo dentro en tiempo real.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto';
import { exigir } from '../auth';
import { noEncontrado } from '../errores';
import { paquetePuerta, sincronizarLecturas, validarEnLinea } from '../servicios/entradas';

const uuid = z.string().uuid();
const DISPOSITIVO = z.string().regex(/^[A-Za-z0-9_-]{4,60}$/);

export async function rutasPuerta(app: FastifyInstance, ctx: Contexto) {
  const sinLimite = { config: { rateLimit: { max: 2000, timeWindow: '1 minute' } } };

  app.get('/api/puerta/funciones', async (req) => {
    const c = exigir(ctx, req, 'puerta.validar');
    return ctx.db.query(
      `select f.id, f.titulo, f.fecha, to_char(f.hora, 'HH24:MI') as hora, f.estado, f.es_prueba, r.nombre as recinto_nombre, r.municipio,
              (select count(*)::int from entradas e where e.funcion_id = f.id and e.estado in ('valida', 'usada')) as vendidas,
              (select count(*)::int from entradas e where e.funcion_id = f.id and e.estado = 'usada') as dentro
         from funciones f join recintos r on r.id = f.recinto_id
        where f.organizador_id = $1 and f.modo_venta <> 'libre' and f.fecha >= current_date - 1 and f.estado <> 'borrador'
        order by f.fecha, f.hora nulls last`,
      [c.organizadorId],
    );
  });

  app.get('/api/puerta/funciones/:id/paquete', async (req, reply) => {
    const c = exigir(ctx, req, 'puerta.validar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const p = await paquetePuerta(ctx, c.organizadorId, id);
    if (!p) throw noEncontrado('Función');
    reply.header('cache-control', 'no-store');
    return p;
  });

  app.post('/api/puerta/validar', sinLimite, async (req) => {
    const c = exigir(ctx, req, 'puerta.validar');
    const d = z.object({ funcionId: uuid, qr: z.string().max(300), dispositivo: DISPOSITIVO }).parse(req.body);
    const f = await ctx.db.one('select 1 from funciones where id = $1 and organizador_id = $2', [d.funcionId, c.organizadorId]);
    if (!f) throw noEncontrado('Función');
    return validarEnLinea(ctx, c.organizadorId, d.funcionId, d.qr, d.dispositivo, c.usuarioId);
  });

  app.post('/api/puerta/sincronizar', sinLimite, async (req) => {
    const c = exigir(ctx, req, 'puerta.validar');
    const d = z.object({
      funcionId: uuid,
      dispositivo: DISPOSITIVO,
      lecturas: z.array(z.object({ codigo: z.string().regex(/^TKT-[A-Z0-9]{8}$/), resultado: z.string().max(30), leidoEn: z.string().datetime() })).max(20_000),
    }).parse(req.body);
    const f = await ctx.db.one('select 1 from funciones where id = $1 and organizador_id = $2', [d.funcionId, c.organizadorId]);
    if (!f) throw noEncontrado('Función');
    return ctx.db.tx((t) => sincronizarLecturas(t, c.organizadorId, d.funcionId, d.dispositivo, c.usuarioId, d.lecturas));
  });

  app.get('/api/puerta/funciones/:id/estado', async (req, reply) => {
    const c = exigir(ctx, req, 'puerta.validar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    reply.header('cache-control', 'no-store');
    const r = await ctx.db.one(
      `select (select count(*)::int from entradas e where e.funcion_id = f.id and e.estado in ('valida', 'usada')) as vendidas,
              (select count(*)::int from entradas e where e.funcion_id = f.id and e.estado = 'usada') as dentro,
              (select max(usada_en) from entradas e where e.funcion_id = f.id) as ultima
         from funciones f where f.id = $1 and f.organizador_id = $2`,
      [id, c.organizadorId],
    );
    if (!r) throw noEncontrado('Función');
    const usadas = await ctx.db.query(`select codigo, usada_en from entradas where funcion_id = $1 and estado = 'usada'`, [id]);
    return { ...r, usadas };
  });
}
