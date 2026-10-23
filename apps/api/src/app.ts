import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { Contexto } from './contexto';
import { COOKIE_SESION, cargarSesion } from './auth';
import { ErrorHttp } from './errores';
import { rutasAuth } from './modulos/auth';
import { rutasOrganizadores } from './modulos/organizadores';
import { rutasEntra } from './modulos/entra';
import { rutasPlanos } from './modulos/planos';
import { rutasEventos } from './modulos/eventos';
import { rutasPublico } from './modulos/publico';
import { rutasPagos } from './modulos/pagos';
import { rutasPuerta } from './modulos/puerta';
import { rutasCliente } from './modulos/cliente';
import { registrarAdjuntador } from './servicios/trabajos';
import { pdfEntradas } from './servicios/entradas';
import { registrarTrabajos } from './servicios/trabajos';

export type Modulo = (app: FastifyInstance, ctx: Contexto) => Promise<void>;
const MODULOS: Modulo[] = [rutasAuth, rutasEntra, rutasOrganizadores, rutasPlanos, rutasEventos, rutasPublico, rutasPagos, rutasPuerta, rutasCliente];

// El correo de confirmación lleva las entradas en PDF
let pdfRegistrado = false;
function registrarPdf() {
  if (pdfRegistrado) return;
  pdfRegistrado = true;
  registrarAdjuntador(async (ctx, p) => [{ nombre: `entradas-${p.codigo}.pdf`, tipo: 'application/pdf', contenido: await pdfEntradas(ctx, p) }]);
}

export async function construirApp(ctx: Contexto, opciones: { registro?: boolean } = {}) {
  const app = Fastify({
    logger: opciones.registro ? { level: process.env.LOG_NIVEL ?? (ctx.config.NODE_ENV === 'production' ? 'info' : 'warn'), redact: ['req.headers.cookie', 'req.headers.authorization'] } : false,
    // detrás de Cloudflare/Traefik: TRUST_PROXY=true o la lista de redes del proxy
    trustProxy: ctx.config.TRUST_PROXY === 'true' ? true : (ctx.config.TRUST_PROXY ?? false),
    bodyLimit: 2 * 1024 * 1024,
  }) as unknown as FastifyInstance;

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: ctx.config.LIMITE_GLOBAL_POR_MINUTO,
    timeWindow: '1 minute',
    ...(ctx.redis ? { redis: ctx.redis, nameSpace: 'taq-limite:' } : {}),
    errorResponseBuilder: (_req, c) => ({ statusCode: 429, error: 'demasiadas_peticiones', mensaje: `Demasiadas peticiones. Espera ${Math.ceil(c.ttl / 1000)} s y vuelve a intentarlo.` }),
  });

  app.decorateRequest('sesion', null);
  app.addHook('onRequest', async (req) => {
    // Protección CSRF: las peticiones que cambian algo y llegan desde otro origen se rechazan.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.url.startsWith('/api/pagos/webhook') && !req.url.startsWith('/api/publico/')) {
      const origen = req.headers.origin;
      if (origen && !origenPermitido(ctx, origen)) throw new ErrorHttp(403, 'Origen no permitido', 'origen');
    }
    req.sesion = await cargarSesion(ctx, req.cookies[COOKIE_SESION]);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'invalido', mensaje: 'Hay datos que no son válidos', detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })) });
    }
    if (err instanceof ErrorHttp) {
      return reply.status(err.status).send({ error: err.codigo ?? 'error', mensaje: err.message, ...err.extra });
    }
    const status = (err as any).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.status(status).send({
      error: (err as any).error ?? (status >= 500 ? 'interno' : 'error'),
      mensaje: status >= 500 ? 'Ha ocurrido un error. Ya lo estamos mirando.' : ((err as any).mensaje ?? (err as Error).message),
    });
  });

  app.get('/api/salud', async () => ({ ok: true, modoDemo: ctx.config.modoDemo, db: ctx.db.tipo }));

  for (const m of MODULOS) await m(app, ctx);
  registrarPdf();
  registrarTrabajos(ctx);
  return app;
}

function origenPermitido(ctx: Contexto, origen: string) {
  try {
    const o = new URL(origen);
    const p = new URL(ctx.config.URL_PUBLICA);
    if (o.origin === p.origin) return true;
    return ctx.config.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(o.hostname);
  } catch {
    return false;
  }
}
