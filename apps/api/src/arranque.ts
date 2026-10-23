import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cargarDotenv, leerConfig, type Config } from './config';
import { conectarPglite, conectarPostgres, migrar, type Db } from './db';
import type { Contexto } from './contexto';
import { MemoriaAlmacen, RedisAlmacen } from './infra/almacen';
import { ColasBullMQ, ColasEnProceso } from './infra/colas';
import { crearCorreos } from './infra/correo';
import { crearPasarelaSimulada, crearPasarelaStripe, type PasarelaPago } from './infra/pagos';

export async function abrirDb(config: Config): Promise<Db> {
  if (config.DATABASE_URL) return conectarPostgres(config.DATABASE_URL);
  const dir = join(config.CARPETA_DATOS_LOCALES, 'pg');
  mkdirSync(dir, { recursive: true });
  return conectarPglite(dir);
}

export async function crearPasarela(config: Config): Promise<PasarelaPago> {
  if (config.STRIPE_SECRET_KEY) {
    const secretos = [config.STRIPE_WEBHOOK_SECRET, config.STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => !!s);
    return crearPasarelaStripe(config.STRIPE_SECRET_KEY, secretos);
  }
  return crearPasarelaSimulada(config.SECRETO_SESION + ':pasarela-simulada', config.URL_PUBLICA);
}

/** Monta el contexto completo. Sin DATABASE_URL/REDIS_URL usa PGlite y almacenes en memoria. */
export async function crearContexto(config?: Config, opciones: { db?: Db } = {}): Promise<Contexto> {
  if (!config) {
    cargarDotenv();
    config = leerConfig();
  }
  const db = opciones.db ?? (await abrirDb(config));
  await migrar(db);
  let redis = null;
  if (config.REDIS_URL) {
    const { Redis } = await import('ioredis');
    redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return {
    config,
    db,
    redis,
    almacen: redis ? new RedisAlmacen(redis) : new MemoriaAlmacen(),
    colas: config.REDIS_URL ? new ColasBullMQ(config.REDIS_URL) : new ColasEnProceso(),
    correos: await crearCorreos(db, { smtpUrl: config.SMTP_URL, remitente: config.CORREO_REMITENTE, guardarAdjuntos: config.NODE_ENV !== 'production' }),
    pasarela: await crearPasarela(config),
  };
}

export async function cerrarContexto(ctx: Contexto) {
  await ctx.colas.cerrar().catch(() => {});
  await ctx.almacen.cerrar().catch(() => {});
  await ctx.redis?.quit().catch(() => {});
  await ctx.db.close();
}
