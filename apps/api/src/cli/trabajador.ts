/**
 * Proceso de trabajos en segundo plano (BullMQ): correos, PDF de entradas,
 * devoluciones masivas, liquidaciones y webhooks salientes.
 */
import { crearContexto } from '../arranque';

const ctx = await crearContexto();
if (!ctx.redis) {
  console.log('Sin REDIS_URL: los trabajos se ejecutan dentro de la propia API (modo demostración).');
  process.exit(0);
}
console.log('Trabajador en marcha.');
