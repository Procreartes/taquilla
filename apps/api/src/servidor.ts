import { construirApp } from './app';
import { crearContexto, cerrarContexto } from './arranque';
import { caducarPedidosVencidos } from './servicios/venta';

const ctx = await crearContexto();
if ((process.env.SEMBRAR === 'true' || ctx.config.modoDemo) && ctx.config.NODE_ENV !== 'production') {
  const { sembrar } = await import('./semilla');
  await sembrar(ctx.db, ctx.config);
}
const app = await construirApp(ctx, { registro: true });
// Sin Redis, los trabajos se procesan en la propia API; con Redis los procesa el servicio «trabajador».
if (!ctx.redis || process.env.TRABAJADOR_EN_API === 'true') await ctx.colas.procesar();
const barrido = setInterval(() => caducarPedidosVencidos(ctx).catch((e) => app.log.error(e)), 30_000);
await app.listen({ port: ctx.config.PORT, host: ctx.config.HOST });
console.log(
  ctx.config.modoDemo
    ? `\n  Taquilla API en modo demostración (base de datos local en ${ctx.config.CARPETA_DATOS_LOCALES})\n`
    : '\n  Taquilla API en marcha\n',
);

for (const s of ['SIGINT', 'SIGTERM'] as const) {
  process.on(s, async () => {
    clearInterval(barrido);
    await app.close();
    await cerrarContexto(ctx);
    process.exit(0);
  });
}
