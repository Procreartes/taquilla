/**
 * Trabajos en segundo plano (correos, PDF, devoluciones masivas, webhooks salientes…).
 *  - Con Redis: BullMQ, con reintentos; los procesa el servicio «trabajador».
 *  - Sin Redis (modo demostración y tests): se ejecutan en el propio proceso, con reintentos.
 */
import type { Redis } from 'ioredis';

export type Manejador = (datos: any) => Promise<void>;

export interface Colas {
  encolar(nombre: string, datos: unknown, opciones?: { retrasoMs?: number; id?: string }): Promise<void>;
  registrar(nombre: string, fn: Manejador): void;
  /** Arranca el procesado (en BullMQ, los workers). */
  procesar(): Promise<void>;
  /** Espera a que terminen los trabajos en curso (tests). */
  vaciar(): Promise<void>;
  cerrar(): Promise<void>;
}

const REINTENTOS = 5;

export class ColasEnProceso implements Colas {
  private manejadores = new Map<string, Manejador>();
  private pendientes = new Set<Promise<void>>();
  constructor(private registro: (msg: string, e?: unknown) => void = (m, e) => console.error(m, e)) {}
  registrar(nombre: string, fn: Manejador) {
    this.manejadores.set(nombre, fn);
  }
  async encolar(nombre: string, datos: unknown, o: { retrasoMs?: number } = {}) {
    const fn = this.manejadores.get(nombre);
    if (!fn) throw new Error(`No hay manejador para el trabajo «${nombre}»`);
    const p = (async () => {
      if (o.retrasoMs) await new Promise((r) => setTimeout(r, o.retrasoMs));
      for (let intento = 1; ; intento++) {
        try {
          await fn(datos);
          return;
        } catch (e) {
          if (intento >= REINTENTOS) return this.registro(`Trabajo «${nombre}» fallido tras ${intento} intentos`, e);
          await new Promise((r) => setTimeout(r, Math.min(100 * 2 ** intento, 5000)));
        }
      }
    })();
    this.pendientes.add(p);
    p.finally(() => this.pendientes.delete(p));
  }
  async procesar() {}
  async vaciar() {
    while (this.pendientes.size) await Promise.allSettled([...this.pendientes]);
  }
  async cerrar() {
    await this.vaciar();
  }
}

export class ColasBullMQ implements Colas {
  private manejadores = new Map<string, Manejador>();
  private cola: any;
  private worker: any;
  constructor(private redisUrl: string, private nombreCola = 'taquilla') {}
  private async conexion() {
    const { Redis } = await import('ioredis');
    return new Redis(this.redisUrl, { maxRetriesPerRequest: null }) as Redis;
  }
  registrar(nombre: string, fn: Manejador) {
    this.manejadores.set(nombre, fn);
  }
  async encolar(nombre: string, datos: unknown, o: { retrasoMs?: number; id?: string } = {}) {
    if (!this.cola) {
      const { Queue } = await import('bullmq');
      this.cola = new Queue(this.nombreCola, { connection: await this.conexion() });
    }
    await this.cola.add(nombre, datos, {
      attempts: REINTENTOS, backoff: { type: 'exponential', delay: 2000 }, delay: o.retrasoMs, jobId: o.id,
      removeOnComplete: 1000, removeOnFail: 5000,
    });
  }
  async procesar() {
    const { Worker } = await import('bullmq');
    this.worker = new Worker(this.nombreCola, async (job: any) => {
      const fn = this.manejadores.get(job.name);
      if (!fn) throw new Error(`No hay manejador para el trabajo «${job.name}»`);
      await fn(job.data);
    }, { connection: await this.conexion(), concurrency: 8 });
  }
  async vaciar() {}
  async cerrar() {
    await this.worker?.close();
    await this.cola?.close();
  }
}
