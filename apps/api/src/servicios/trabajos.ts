/** Registro de los trabajos en segundo plano. */
import type { Contexto } from '../contexto';
import { correoConfirmacion, correoConflicto } from './plantillas';
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
  ctx.colas.registrar('pago.devolver_pendientes', ({ pedidoId }) => ejecutarDevolucionesPendientes(ctx, pedidoId));
  ctx.colas.registrar('webhook.saliente', async () => {
    /* se completa en la fase 8 (webhooks para n8n) */
  });
  for (const [n, fn] of manejadoresExtra) ctx.colas.registrar(n, (d) => fn(ctx, d));
}
