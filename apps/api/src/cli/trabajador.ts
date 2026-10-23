/**
 * Proceso de trabajos en segundo plano (BullMQ): correos, PDF de entradas,
 * devoluciones, liquidaciones y webhooks salientes. También barre las reservas caducadas.
 */
import { crearContexto, cerrarContexto } from '../arranque';
import { construirApp } from '../app';
import { caducarPedidosVencidos } from '../servicios/venta';

const ctx = await crearContexto();
if (!ctx.redis) {
  console.log('Sin REDIS_URL: los trabajos se ejecutan dentro de la propia API (modo demostración).');
  process.exit(0);
}
// construirApp registra los manejadores de trabajos (no abre ningún puerto)
const app = await construirApp(ctx);
await ctx.colas.procesar();
const barrido = setInterval(() => caducarPedidosVencidos(ctx).catch((e) => console.error(e)), 30_000);
console.log('Trabajador en marcha.');
for (const s of ['SIGINT', 'SIGTERM'] as const) {
  process.on(s, async () => {
    clearInterval(barrido);
    await app.close();
    await cerrarContexto(ctx);
    process.exit(0);
  });
}
