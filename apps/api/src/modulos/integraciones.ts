/** Configuración de webhooks salientes (n8n) por organizador. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto';
import { exigir } from '../auth';
import { auditar } from '../auditoria';
import { invalido, noEncontrado } from '../errores';
import { cifrar, tokenAleatorio } from '../infra/cripto';
import { EVENTOS_WEBHOOK, urlPermitida } from '../servicios/webhooks';

const uuid = z.string().uuid();

export async function rutasIntegraciones(app: FastifyInstance, ctx: Contexto) {
  app.get('/api/organizador/webhooks', async (req) => {
    const c = exigir(ctx, req, 'organizador.editar');
    return ctx.db.query(
      `select w.id, w.nombre, w.url, w.eventos, w.activo, w.creado_en,
              (select json_agg(x) from (select e.id, e.evento, e.estado, e.intentos, e.respuesta, e.creado_en from entregas_webhook e where e.webhook_id = w.id order by e.creado_en desc limit 10) x) as entregas
         from webhooks w where w.organizador_id = $1 order by w.creado_en`,
      [c.organizadorId],
    );
  });

  app.post('/api/organizador/webhooks', async (req) => {
    const c = exigir(ctx, req, 'organizador.editar');
    const d = z.object({ nombre: z.string().min(2).max(100), url: z.string().url().max(500), eventos: z.array(z.enum(EVENTOS_WEBHOOK)).min(1) }).parse(req.body);
    const error = await urlPermitida(d.url, ctx.config.NODE_ENV === 'production');
    if (error) throw invalido(error);
    const secreto = 'whsec_' + tokenAleatorio(24);
    const r = await ctx.db.one(
      `insert into webhooks (organizador_id, nombre, url, secreto_cifrado, eventos) values ($1, $2, $3, $4, $5) returning id, nombre, url, eventos`,
      [c.organizadorId, d.nombre, d.url, cifrar(ctx.config.SECRETO_DATOS, secreto), d.eventos],
    );
    await auditar(ctx.db, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'webhook.alta', entidad: 'webhook', entidadId: r!.id, datos: { url: d.url, eventos: d.eventos }, ip: req.ip });
    // El secreto solo se muestra una vez
    return { ...r, secreto };
  });

  app.delete('/api/organizador/webhooks/:id', async (req) => {
    const c = exigir(ctx, req, 'organizador.editar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const r = await ctx.db.one('delete from webhooks where id = $1 and organizador_id = $2 returning url', [id, c.organizadorId]);
    if (!r) throw noEncontrado('Webhook');
    await auditar(ctx.db, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'webhook.baja', entidad: 'webhook', entidadId: id, datos: { url: r.url }, ip: req.ip });
    return { ok: true };
  });

  app.post('/api/organizador/webhooks/:id/probar', async (req) => {
    const c = exigir(ctx, req, 'organizador.editar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const w = await ctx.db.one('select id from webhooks where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!w) throw noEncontrado('Webhook');
    const e = await ctx.db.one<{ id: number }>(
      `insert into entregas_webhook (webhook_id, evento, cuerpo) values ($1, 'prueba', $2) returning id`,
      [id, JSON.stringify({ evento: 'prueba', enviado_en: new Date().toISOString(), prueba: true, mensaje: 'Aviso de prueba de Taquilla' })],
    );
    await ctx.colas.encolar('webhook.entregar', { entregaId: e!.id });
    return { ok: true, entregaId: e!.id };
  });
}
