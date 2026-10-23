/**
 * Cola virtual para salidas a la venta fuertes (estilo «sala de espera»).
 *
 * - Cada persona que llega recibe un número correlativo (Redis INCR o memoria).
 * - Los admitidos avanzan con el tiempo a un ritmo fijo: admitidos = (ahora − apertura) × ritmo.
 *   Es una fórmula sin estado, así que varias instancias de la API dan siempre la misma respuesta.
 * - Al llegar su turno, la persona recibe un PASE firmado (15 minutos) que exige la reserva.
 */
import type { Redis } from 'ioredis';
import type { Contexto } from '../contexto';
import { hmac, igualSeguro } from '../infra/cripto';

const VIDA_PASE_MS = 15 * 60_000;

export interface ContadorCola {
  siguiente(funcionId: string): Promise<number>;
}

export class ContadorMemoria implements ContadorCola {
  private n = new Map<string, number>();
  async siguiente(f: string) {
    const v = (this.n.get(f) ?? 0) + 1;
    this.n.set(f, v);
    return v;
  }
}

export class ContadorRedis implements ContadorCola {
  constructor(private r: Redis) {}
  async siguiente(f: string) {
    const k = `taq:{${f}}:cola`;
    const v = await this.r.incr(k);
    if (v === 1) await this.r.expire(k, 3 * 24 * 3600);
    return v;
  }
}

export class ColaVirtual {
  constructor(private ctx: Contexto, private contador: ContadorCola) {}

  private async config(funcionId: string) {
    return this.ctx.db.one<{ cola_virtual: boolean; cola_apertura: string | null; cola_ritmo: number | null }>(
      `select cola_virtual, cola_apertura, cola_ritmo from funciones where id = $1`, [funcionId],
    );
  }

  async exigePase(funcionId: string) {
    return !!(await this.config(funcionId))?.cola_virtual;
  }

  private ritmo(c: { cola_ritmo: number | null }) {
    return Math.max(1, c.cola_ritmo ?? this.ctx.config.COLA_PASES_POR_MINUTO);
  }

  /** Cuántas personas han sido admitidas ya (fórmula por tiempo). */
  private admitidos(c: { cola_apertura: string | null; cola_ritmo: number | null }, ahora = Date.now()) {
    if (!c.cola_apertura) return 0;
    const t = ahora - new Date(c.cola_apertura).getTime();
    return t < 0 ? 0 : Math.floor((t / 60_000) * this.ritmo(c));
  }

  firmarTurno(funcionId: string, numero: number) {
    const cuerpo = `${funcionId}.${numero}`;
    return `${numero}.${hmac(this.ctx.config.SECRETO_COLA + ':turno', cuerpo).toString('base64url').slice(0, 22)}`;
  }

  leerTurno(funcionId: string, turno: string | undefined): number | null {
    const [n, firma] = String(turno ?? '').split('.');
    if (!/^\d{1,9}$/.test(n) || !firma) return null;
    const esperado = this.firmarTurno(funcionId, Number(n)).split('.')[1];
    return igualSeguro(firma, esperado) ? Number(n) : null;
  }

  firmarPase(funcionId: string, numero: number, hasta = Date.now() + VIDA_PASE_MS) {
    const cuerpo = `${funcionId}.${numero}.${hasta}`;
    return `${numero}.${hasta}.${hmac(this.ctx.config.SECRETO_COLA + ':pase', cuerpo).toString('base64url').slice(0, 22)}`;
  }

  validarPase(funcionId: string, pase: string | undefined) {
    const [n, hasta, firma] = String(pase ?? '').split('.');
    if (!n || !hasta || !firma || Number(hasta) < Date.now()) return false;
    const esperado = this.firmarPase(funcionId, Number(n), Number(hasta)).split('.')[2];
    return igualSeguro(firma, esperado);
  }

  async entrar(funcionId: string) {
    const c = await this.config(funcionId);
    if (!c?.cola_virtual) return { activa: false as const };
    const numero = await this.contador.siguiente(funcionId);
    const turno = this.firmarTurno(funcionId, numero);
    return { ...(await this.estado(funcionId, turno)), turno };
  }

  async estado(funcionId: string, turno: string) {
    const c = await this.config(funcionId);
    if (!c?.cola_virtual) return { activa: false as const, pase: null, delante: 0, esperaSegundos: 0 };
    const numero = this.leerTurno(funcionId, turno);
    if (!numero) return { activa: true as const, invalido: true, pase: null, delante: 0, esperaSegundos: 0 };
    const admitidos = this.admitidos(c);
    const delante = Math.max(0, numero - admitidos);
    const abierta = !!c.cola_apertura && new Date(c.cola_apertura).getTime() <= Date.now();
    return {
      activa: true as const,
      abierta,
      apertura: c.cola_apertura,
      delante,
      esperaSegundos: abierta ? Math.ceil((delante / this.ritmo(c)) * 60) : Math.max(0, Math.ceil((new Date(c.cola_apertura ?? Date.now()).getTime() - Date.now()) / 1000)),
      pase: abierta && delante === 0 ? this.firmarPase(funcionId, numero) : null,
    };
  }
}
