import type { Redis } from 'ioredis';
import type { Config } from './config';
import type { Db } from './db';
import type { AlmacenReservas } from './infra/almacen';
import type { Colas } from './infra/colas';
import type { Correos } from './infra/correo';
import type { PasarelaPago } from './infra/pagos';

/**
 * Dependencias compartidas por toda la API. Cada pieza tiene un adaptador real
 * (PostgreSQL, Redis, Stripe, SMTP) y otro local para el modo demostración y los tests.
 */
export interface Contexto {
  config: Config;
  db: Db;
  /** null en modo demostración (se usan los almacenes en memoria). */
  redis: Redis | null;
  almacen: AlmacenReservas;
  colas: Colas;
  correos: Correos;
  pasarela: PasarelaPago;
}
