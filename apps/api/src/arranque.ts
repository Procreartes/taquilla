import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cargarDotenv, leerConfig, type Config } from './config';
import { conectarPglite, conectarPostgres, migrar, type Db } from './db';
import type { Contexto } from './contexto';

export async function abrirDb(config: Config): Promise<Db> {
  if (config.DATABASE_URL) return conectarPostgres(config.DATABASE_URL);
  const dir = join(config.CARPETA_DATOS_LOCALES, 'pg');
  mkdirSync(dir, { recursive: true });
  return conectarPglite(dir);
}

export async function crearContexto(config?: Config): Promise<Contexto> {
  if (!config) {
    cargarDotenv();
    config = leerConfig();
  }
  const db = await abrirDb(config);
  await migrar(db);
  let redis = null;
  if (config.REDIS_URL) {
    const { Redis } = await import('ioredis');
    redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return { config, db, redis };
}

export async function cerrarContexto(ctx: Contexto) {
  await ctx.redis?.quit().catch(() => {});
  await ctx.db.close();
}
