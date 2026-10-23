/**
 * Capa mínima de base de datos: el mismo SQL funciona con PostgreSQL real (pg)
 * y con PGlite (PostgreSQL en WebAssembly, para el modo demostración y los tests).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Consultor {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Primera fila o null. */
  one<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Varias sentencias sin parámetros (migraciones). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Consultor {
  tx<T>(fn: (c: Consultor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly tipo: 'postgres' | 'pglite';
}

// int8, numeric → number; date → texto 'AAAA-MM-DD' (sin zonas horarias)
const OID_INT8 = 20;
const OID_NUMERIC = 1700;
const OID_DATE = 1082;

function consultor(
  q: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>,
  ex: (sql: string) => Promise<unknown> = (sql) => q(sql),
): Consultor {
  return {
    async exec(sql) {
      await ex(sql);
    },
    async query(sql, params) {
      return (await q(sql, params)).rows;
    },
    async one(sql, params) {
      return (await q(sql, params)).rows[0] ?? null;
    },
  };
}

export async function conectarPostgres(url: string): Promise<Db> {
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(OID_INT8, (v: string) => Number(v));
  pg.types.setTypeParser(OID_NUMERIC, (v: string) => Number(v));
  pg.types.setTypeParser(OID_DATE, (v: string) => v);
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 20) });
  const base = consultor((s, p) => pool.query(s, p as any[]));
  return {
    ...base,
    tipo: 'postgres',
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await fn(consultor((s, p) => client.query(s, p as any[])));
        await client.query('COMMIT');
        return r;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/** dir = carpeta donde guardar los datos; sin dir, base de datos en memoria (tests). */
export async function conectarPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(dir);
  await db.waitReady;
  // En esta versión de PGlite los conversores solo se aplican si se pasan en cada consulta
  const parsers = {
    [OID_INT8]: (v: string) => Number(v),
    [OID_NUMERIC]: (v: string) => Number(v),
    [OID_DATE]: (v: string) => v,
  };
  const base = consultor((s, p) => db.query(s, p as any[], { parsers }), (s) => db.exec(s));
  return {
    ...base,
    tipo: 'pglite',
    tx: (fn) => db.transaction((t) => fn(consultor((s, p) => t.query(s, p as any[], { parsers }), (s) => t.exec(s)))),
    async close() {
      await db.close();
    },
  };
}

export const CARPETA_MIGRACIONES = join(import.meta.dirname, '..', '..', '..', '..', 'db', 'migraciones');

/** Aplica, en orden y una sola vez, los ficheros NNNN_*.sql de db/migraciones. */
export async function migrar(db: Db, carpeta = CARPETA_MIGRACIONES): Promise<string[]> {
  await db.exec(`create table if not exists schema_migraciones (
    nombre text primary key, aplicada_en timestamptz not null default now())`);
  const hechas = new Set((await db.query<{ nombre: string }>('select nombre from schema_migraciones')).map((r) => r.nombre));
  const ficheros = readdirSync(carpeta).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const aplicadas: string[] = [];
  for (const f of ficheros) {
    if (hechas.has(f)) continue;
    const sql = readFileSync(join(carpeta, f), 'utf8');
    await db.tx(async (c) => {
      // pg y PGlite aceptan varias sentencias en una consulta sin parámetros
      await c.exec(sql);
      await c.query('insert into schema_migraciones (nombre) values ($1)', [f]);
    });
    aplicadas.push(f);
  }
  return aplicadas;
}
