/**
 * Avisos (webhooks) de la pasarela de pago, pasarela simulada y alta en Stripe Connect.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto';
import { exigir } from '../auth';
import { auditar } from '../auditoria';
import { ErrorHttp, conflicto, noEncontrado } from '../errores';
import type { PasarelaSimulada } from '../infra/pagos';
import { caducarPedido, procesarEventoPago } from '../servicios/venta';

export async function rutasPagos(app: FastifyInstance, ctx: Contexto) {
  // El aviso se verifica sobre el cuerpo exacto recibido: aquí el JSON llega sin interpretar.
  await app.register(async (sub) => {
    sub.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, cuerpo, hecho) => hecho(null, cuerpo));
    sub.post('/api/pagos/webhook/:proveedor', { config: { rateLimit: false } }, async (req, reply) => {
      const { proveedor } = z.object({ proveedor: z.enum(['stripe', 'simulada']) }).parse(req.params);
      if (proveedor !== ctx.pasarela.nombre) throw new ErrorHttp(404, 'Pasarela no activa', 'no_encontrado');
      let ev;
      try {
        ev = await ctx.pasarela.leerWebhook(req.body as Buffer, req.headers);
      } catch {
        return reply.status(400).send({ error: 'firma', mensaje: 'Firma no válida' });
      }
      const r = await procesarEventoPago(ctx, proveedor, ev);
      return { recibido: true, ...('duplicado' in r ? { duplicado: true } : {}) };
    });
  });

  // ---- Pasarela simulada (solo sin claves de Stripe y nunca en producción) ----
  const simulada = ctx.pasarela.nombre === 'simulada' && ctx.config.NODE_ENV !== 'production' ? (ctx.pasarela as PasarelaSimulada) : null;

  const pedidoDeSesion = async (sesion: string) => {
    if (!simulada) throw new ErrorHttp(404, 'La pasarela simulada no está activa', 'no_encontrado');
    const p = await ctx.db.one<any>(
      `select p.id, p.codigo, p.estado, p.total_cent, p.comprador_email, p.expira_en, f.titulo, f.es_prueba, o.nombre as organizador
         from pedidos p join funciones f on f.id = p.funcion_id join organizadores o on o.id = p.organizador_id where p.pago_sesion_id = $1`,
      [sesion],
    );
    if (!p) throw noEncontrado('Sesión de pago');
    return p;
  };

  app.get('/api/pagos/simulado/:sesion', async (req) => {
    const { sesion } = z.object({ sesion: z.string().max(80) }).parse(req.params);
    const { id: _id, ...p } = await pedidoDeSesion(sesion);
    return p;
  });

  app.post('/api/pagos/simulado/:sesion/pagar', async (req) => {
    const { sesion } = z.object({ sesion: z.string().max(80) }).parse(req.params);
    const { tarjeta } = z.object({ tarjeta: z.string().max(30) }).parse(req.body);
    const p = await pedidoDeSesion(sesion);
    if (p.estado !== 'pago') throw conflicto('Esta sesión de pago ya no está abierta', 'sesion_cerrada');
    const numero = tarjeta.replace(/\s/g, '');
    if (numero === '4000000000000002') throw new ErrorHttp(402, 'Tarjeta rechazada (tarjeta de prueba de rechazo)', 'tarjeta_rechazada');
    if (numero !== '4242424242424242') throw new ErrorHttp(402, 'En la pasarela simulada usa la tarjeta de prueba 4242 4242 4242 4242', 'tarjeta_rechazada');
    // Mismo camino que un aviso real: se firma y se verifica
    const { cuerpo, firma } = simulada!.avisoFirmado('pago_completado', sesion, p.id, p.total_cent);
    const r = await app.inject({ method: 'POST', url: '/api/pagos/webhook/simulada', payload: cuerpo, headers: { 'content-type': 'application/json', 'x-firma-simulada': firma } });
    if (r.statusCode !== 200) throw new ErrorHttp(502, 'La pasarela simulada no pudo confirmar el pago', 'pasarela');
    return { ok: true };
  });

  app.post('/api/pagos/simulado/:sesion/cancelar', async (req) => {
    const { sesion } = z.object({ sesion: z.string().max(80) }).parse(req.params);
    const p = await pedidoDeSesion(sesion);
    await caducarPedido(ctx, p.id, 'cancelado');
    return { ok: true };
  });

  // ---- Alta del organizador en Stripe Connect ----
  app.post('/api/organizador/stripe/conectar', async (req) => {
    const c = exigir(ctx, req, 'organizador.editar');
    if (!ctx.pasarela.enlaceAlta) throw new ErrorHttp(400, 'Esta pasarela no necesita alta', 'sin_alta');
    const o = await ctx.db.one<any>('select stripe_cuenta_id, email_contacto from organizadores where id = $1', [c.organizadorId]);
    const r = await ctx.pasarela.enlaceAlta({ cuentaId: o.stripe_cuenta_id, email: o.email_contacto, urlVuelta: `${ctx.config.URL_PUBLICA}/panel/organizador` });
    const estado = ctx.pasarela.nombre === 'simulada' ? 'activa' : 'pendiente';
    await ctx.db.query(`update organizadores set stripe_cuenta_id = $2, stripe_estado = case when stripe_estado = 'activa' then 'activa' else $3 end where id = $1`, [c.organizadorId, r.cuentaId, estado]);
    await auditar(ctx.db, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'organizador.stripe_conectar', datos: { cuenta: r.cuentaId }, ip: req.ip });
    return r;
  });
}
