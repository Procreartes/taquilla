/** Registro de los trabajos en segundo plano. */
import type { Contexto } from '../contexto';
import { correoCancelacion, correoConfirmacion, correoConflicto } from './plantillas';
import { devolverEntradas } from './dinero';
import { encolarWebhooks, entregarWebhook } from './webhooks';
import { ejecutarDevolucionesPendientes, enlacePedido, resumenPedido } from './venta';

export type Adjuntador = (ctx: Contexto, pedido: any) => Promise<{ nombre: string; tipo: string; contenido: Buffer }[]>;
const adjuntadores: Adjuntador[] = [];
/** Permite a otros módulos (p. ej. el PDF de entradas) añadir adjuntos al correo de confirmación. */
export const registrarAdjuntador = (a: Adjuntador) => adjuntadores.push(a);

const manejadoresExtra: [string, (ctx: Contexto, datos: any) => Promise<void>][] = [];
export const registrarTrabajo = (nombre: string, fn: (ctx: Contexto, datos: any) => Promise<void>) => manejadoresExtra.push([nombre, fn]);

export function registrarTrabajos(ctx: Contexto) {
  ctx.colas.registrar('correo.confirmacion', async ({ pedidoId }) => {
    const p = await resumenPedido(ctx.db, pedidoId);
    if (!p.comprador_email || p.estado !== 'pagado') return;
    const org = await ctx.db.one<{ organizador_id: string }>('select organizador_id from pedidos where id = $1', [pedidoId]);
    const c = correoConfirmacion(p, await enlacePedido(ctx, pedidoId));
    const adjuntos = (await Promise.all(adjuntadores.map((a) => a(ctx, p)))).flat();
    await ctx.correos.enviar({ organizadorId: org!.organizador_id, para: p.comprador_email, ...c, adjuntos });
  });
  ctx.colas.registrar('correo.conflicto', async ({ pedidoId }) => {
    const p = await resumenPedido(ctx.db, pedidoId);
    if (!p.comprador_email) return;
    const org = await ctx.db.one<{ organizador_id: string }>('select organizador_id from pedidos where id = $1', [pedidoId]);
    await ctx.correos.enviar({ organizadorId: org!.organizador_id, para: p.comprador_email, ...correoConflicto(p) });
  });
  ctx.colas.registrar('correo.reasignacion', async ({ pedidoId }) => {
    const p = await resumenPedido(ctx.db, pedidoId);
    if (!p.comprador_email) return;
    const org = await ctx.db.one<{ organizador_id: string }>('select organizador_id from pedidos where id = $1', [pedidoId]);
    const c = correoConfirmacion(p, await enlacePedido(ctx, pedidoId));
    await ctx.correos.enviar({
      organizadorId: org!.organizador_id, para: p.comprador_email, asunto: `Cambio de butaca · ${p.titulo}`,
      html: c.html.replace('¡Tus entradas están listas!', 'Hemos cambiado tu butaca'),
      texto: 'Hemos tenido que cambiar tu butaca por un cambio en el plano de la sala. Estas son tus entradas actualizadas.\n\n' + c.texto,
    });
  });
  // Cancelación de una función: devolución completa (con gastos de gestión) de cada pedido
  ctx.colas.registrar('funcion.devolver_pedido', async ({ organizadorId, usuarioId, pedidoId, motivo }) => {
    const p = await ctx.db.one<{ estado: string; canal: string }>('select estado, canal from pedidos where id = $1', [pedidoId]);
    if (p && ['pagado', 'devuelto_parcial'].includes(p.estado)) {
      const vivas = await ctx.db.one<{ n: number }>(`select count(*)::int as n from entradas where pedido_id = $1 and estado = 'valida'`, [pedidoId]);
      if (vivas!.n) await ctx.db.tx((t) => devolverEntradas(t, { organizadorId, usuarioId, pedidoId, incluirGastos: true, motivo }));
      if (p.canal !== 'invitacion') {
        const r = await resumenPedido(ctx.db, pedidoId);
        if (r.comprador_email) await ctx.correos.enviar({ organizadorId, para: r.comprador_email, ...correoCancelacion(r, motivo) });
      }
    }
    await ejecutarDevolucionesPendientes(ctx, pedidoId);
  });
  ctx.colas.registrar('pago.devolver_pendientes', ({ pedidoId }) => ejecutarDevolucionesPendientes(ctx, pedidoId));
  ctx.colas.registrar('webhook.saliente', (d) => encolarWebhooks(ctx, d));
  ctx.colas.registrar('webhook.entregar', ({ entregaId }) => entregarWebhook(ctx, entregaId));
  for (const [n, fn] of manejadoresExtra) ctx.colas.registrar(n, (d) => fn(ctx, d));
}
