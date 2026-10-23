import type { Redis } from 'ioredis';
import type { Config } from './config';
import type { Db } from './db';

/**
 * Dependencias compartidas por toda la API. Cada pieza tiene un adaptador real
 * (PostgreSQL, Redis, Stripe, SMTP) y otro local para el modo demostración y los tests.
 * Las fases siguientes van añadiendo piezas aquí.
 */
export interface Contexto {
  config: Config;
  db: Db;
  /** null en modo demostración (se usan los almacenes en memoria). */
  redis: Redis | null;
}
