import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { leerConfig, type Config } from '../src/config';
import { conectarPglite, conectarPostgres, migrar } from '../src/db';
import { construirApp } from '../src/app';
import type { Contexto } from '../src/contexto';
import { sembrar } from '../src/semilla';
import { MemoriaAlmacen, RedisAlmacen } from '../src/infra/almacen';
import { ColasEnProceso } from '../src/infra/colas';
import { crearCorreos } from '../src/infra/correo';
import { crearPasarelaSimulada } from '../src/infra/pagos';

export const CLAVE_TEST = 'clave-de-los-tests-123';

/**
 * Contexto de pruebas. Por defecto PGlite en memoria; si TEST_DATABASE_URL está definida
 * (en CI), usa un PostgreSQL real con un esquema limpio.
 */
export async function contextoPrueba(extra: Partial<Record<string, string>> = {}): Promise<Contexto> {
  const config: Config = leerConfig({ NODE_ENV: 'test', MODO_DEMO: 'true', CLAVE_USUARIOS_PRUEBA: CLAVE_TEST, LIMITE_ENTRAR_POR_MINUTO: '10000', LIMITE_COMPRA_POR_MINUTO: '100000', LIMITE_GLOBAL_POR_MINUTO: '100000', ...extra } as any);
  let db;
  if (process.env.TEST_DATABASE_URL) {
    db = await conectarPostgres(process.env.TEST_DATABASE_URL);
    await db.exec('drop schema if exists public cascade; create schema public;');
  } else {
    db = await conectarPglite();
  }
  await migrar(db);
  await sembrar(db, config);
  let redis = null, almacen;
  if (process.env.TEST_REDIS_URL) {
    const { Redis } = await import('ioredis');
    redis = new Redis(process.env.TEST_REDIS_URL);
    almacen = new RedisAlmacen(redis, 'test' + Math.random().toString(36).slice(2, 8));
  } else almacen = new MemoriaAlmacen();
  return {
    config, db, redis: null, almacen,
    colas: new ColasEnProceso((msg, e) => { if (process.env.TEST_LOG) console.error(msg, e); }),
    correos: await crearCorreos(db, { remitente: 'Taquilla <test@taquilla.test>', guardarAdjuntos: true }),
    pasarela: crearPasarelaSimulada('secreto-pasarela-tests', 'http://localhost:3000'),
    redisTest: redis,
  } as Contexto;
}

export class Cliente {
  cookie = '';
  constructor(public app: FastifyInstance) {}

  async pedir(metodo: string, url: string, cuerpo?: unknown): Promise<LightMyRequestResponse & { datos: any }> {
    const r = await this.app.inject({
      method: metodo as any,
      url,
      payload: cuerpo === undefined ? undefined : (cuerpo as any),
      headers: this.cookie ? { cookie: this.cookie } : {},
    });
    const sc = r.headers['set-cookie'];
    if (sc) {
      const t = (Array.isArray(sc) ? sc : [sc]).find((c) => c.startsWith('taq_sesion='));
      if (t) this.cookie = t.split(';')[0];
    }
    let datos: any = null;
    try {
      datos = r.json();
    } catch {
      datos = r.body;
    }
    return Object.assign(r, { datos });
  }
  get = (u: string) => this.pedir('GET', u);
  post = (u: string, c?: unknown) => this.pedir('POST', u, c ?? {});
  patch = (u: string, c?: unknown) => this.pedir('PATCH', u, c ?? {});
  del = (u: string) => this.pedir('DELETE', u);

  async entrar(email: string) {
    const r = await this.post('/api/auth/entrar', { email, clave: CLAVE_TEST });
    if (r.statusCode !== 200) throw new Error(`No se pudo entrar como ${email}: ${r.body}`);
    return this;
  }
}

export async function montar(extra?: Partial<Record<string, string>>) {
  const ctx = await contextoPrueba(extra);
  const app = await construirApp(ctx);
  return { ctx, app, cliente: () => new Cliente(app), cerrar: async () => { await ctx.colas.vaciar(); await app.close(); await (ctx as any).redisTest?.quit(); await ctx.db.close(); } };
}
