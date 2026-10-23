import { construirApp } from './app';
import { crearContexto, cerrarContexto } from './arranque';

const ctx = await crearContexto();
if (process.env.SEMBRAR === 'true' && ctx.config.NODE_ENV !== 'production') {
  const { sembrar } = await import('./semilla');
  await sembrar(ctx.db, ctx.config);
}
const app = await construirApp(ctx, { registro: true });
await app.listen({ port: ctx.config.PORT, host: ctx.config.HOST });
console.log(
  ctx.config.modoDemo
    ? `\n  Taquilla API en modo demostración (base de datos local en ${ctx.config.CARPETA_DATOS_LOCALES})\n`
    : '\n  Taquilla API en marcha\n',
);

for (const s of ['SIGINT', 'SIGTERM'] as const) {
  process.on(s, async () => {
    await app.close();
    await cerrarContexto(ctx);
    process.exit(0);
  });
}
