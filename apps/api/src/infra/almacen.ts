/**
 * Reservas temporales de butacas y de plazas de aforo general.
 *
 * Dos implementaciones con el mismo comportamiento:
 *  - RedisAlmacen: scripts Lua atómicos (todas las butacas o ninguna). Es el de producción.
 *  - MemoriaAlmacen: para el modo demostración y los tests (un solo proceso).
 *
 * La reserva es la primera capa contra la sobreventa; la última es la base de datos
 * (índice único de butaca por función y actualización condicional del aforo).
 */
import type { Redis } from 'ioredis';

export type ResultadoReserva = { ok: true } | { ok: false; ocupadas: string[] };

export interface AlmacenReservas {
  reservarButacas(funcionId: string, codigos: string[], reservaId: string, ttlMs: number): Promise<ResultadoReserva>;
  /** Alarga la reserva si sigue siendo de reservaId. Devuelve false si ya no lo es. */
  renovarButacas(funcionId: string, codigos: string[], reservaId: string, ttlMs: number): Promise<boolean>;
  liberarButacas(funcionId: string, codigos: string[], reservaId: string): Promise<void>;
  butacasReservadas(funcionId: string): Promise<string[]>;

  /** Reserva n plazas si (reservadas + n) <= disponibles (= aforo − vendidas). */
  reservarCantidad(funcionId: string, n: number, reservaId: string, ttlMs: number, disponibles: number): Promise<boolean>;
  renovarCantidad(funcionId: string, reservaId: string, ttlMs: number): Promise<boolean>;
  liberarCantidad(funcionId: string, reservaId: string): Promise<void>;
  cantidadReservada(funcionId: string): Promise<number>;

  cerrar(): Promise<void>;
}

// ------------------------------------------------------------------------------------------------

export class MemoriaAlmacen implements AlmacenReservas {
  private butacas = new Map<string, { reserva: string; hasta: number }>();
  private cantidades = new Map<string, Map<string, { n: number; hasta: number }>>();
  private clave = (f: string, c: string) => `${f}|${c}`;

  async reservarButacas(f: string, codigos: string[], reserva: string, ttl: number): Promise<ResultadoReserva> {
    const ahora = Date.now();
    const ocupadas = codigos.filter((c) => {
      const r = this.butacas.get(this.clave(f, c));
      return r && r.hasta > ahora && r.reserva !== reserva;
    });
    if (ocupadas.length) return { ok: false, ocupadas };
    for (const c of codigos) this.butacas.set(this.clave(f, c), { reserva, hasta: ahora + ttl });
    return { ok: true };
  }
  async renovarButacas(f: string, codigos: string[], reserva: string, ttl: number) {
    const ahora = Date.now();
    if (!codigos.every((c) => { const r = this.butacas.get(this.clave(f, c)); return r && r.hasta > ahora && r.reserva === reserva; })) return false;
    for (const c of codigos) this.butacas.set(this.clave(f, c), { reserva, hasta: ahora + ttl });
    return true;
  }
  async liberarButacas(f: string, codigos: string[], reserva: string) {
    for (const c of codigos) {
      const k = this.clave(f, c);
      if (this.butacas.get(k)?.reserva === reserva) this.butacas.delete(k);
    }
  }
  async butacasReservadas(f: string) {
    const ahora = Date.now(), pref = f + '|', r: string[] = [];
    for (const [k, v] of this.butacas) {
      if (!k.startsWith(pref)) continue;
      if (v.hasta <= ahora) this.butacas.delete(k);
      else r.push(k.slice(pref.length));
    }
    return r;
  }
  private limpiar(f: string) {
    const m = this.cantidades.get(f) ?? new Map();
    this.cantidades.set(f, m);
    const ahora = Date.now();
    for (const [k, v] of m) if (v.hasta <= ahora) m.delete(k);
    return m;
  }
  async reservarCantidad(f: string, n: number, reserva: string, ttl: number, disponibles: number) {
    const m = this.limpiar(f);
    const otras = [...m].filter(([k]) => k !== reserva).reduce((s, [, v]) => s + v.n, 0);
    if (otras + n > disponibles) return false;
    m.set(reserva, { n, hasta: Date.now() + ttl });
    return true;
  }
  async renovarCantidad(f: string, reserva: string, ttl: number) {
    const v = this.limpiar(f).get(reserva);
    if (!v) return false;
    v.hasta = Date.now() + ttl;
    return true;
  }
  async liberarCantidad(f: string, reserva: string) {
    this.limpiar(f).delete(reserva);
  }
  async cantidadReservada(f: string) {
    return [...this.limpiar(f).values()].reduce((s, v) => s + v.n, 0);
  }
  async cerrar() {}
}

// ------------------------------------------------------------------------------------------------
// Redis. Todas las claves de una función comparten la etiqueta {funcion} (mismo nodo en Redis Cluster).

const LUA_RESERVAR = `
local reserva, ttl, ahora = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3])
local zset = KEYS[1]
local ocupadas = {}
for i = 2, #KEYS do
  local v = redis.call('GET', KEYS[i])
  if v and v ~= reserva then table.insert(ocupadas, i - 1) end
end
if #ocupadas > 0 then return ocupadas end
for i = 2, #KEYS do
  redis.call('SET', KEYS[i], reserva, 'PX', ttl)
  redis.call('ZADD', zset, ahora + ttl, ARGV[3 + i - 1])
end
redis.call('PEXPIRE', zset, ttl * 4)
return {}
`;

const LUA_RENOVAR = `
local reserva, ttl, ahora = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3])
for i = 2, #KEYS do
  if redis.call('GET', KEYS[i]) ~= reserva then return 0 end
end
for i = 2, #KEYS do
  redis.call('PEXPIRE', KEYS[i], ttl)
  redis.call('ZADD', KEYS[1], ahora + ttl, ARGV[3 + i - 1])
end
redis.call('PEXPIRE', KEYS[1], ttl * 4)
return 1
`;

const LUA_LIBERAR = `
for i = 2, #KEYS do
  if redis.call('GET', KEYS[i]) == ARGV[1] then
    redis.call('DEL', KEYS[i])
    redis.call('ZREM', KEYS[1], ARGV[1 + i - 1])
  end
end
return 1
`;

// KEYS: zset (reserva -> caducidad), hash (reserva -> n)
const LUA_CANTIDAD = `
local reserva, n, ttl, ahora, disponibles = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
local caducadas = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ahora)
for _, r in ipairs(caducadas) do redis.call('HDEL', KEYS[2], r) end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ahora)
local total = 0
local vals = redis.call('HGETALL', KEYS[2])
for i = 1, #vals, 2 do
  if vals[i] ~= reserva then total = total + tonumber(vals[i + 1]) end
end
if total + n > disponibles then return 0 end
redis.call('HSET', KEYS[2], reserva, n)
redis.call('ZADD', KEYS[1], ahora + ttl, reserva)
redis.call('PEXPIRE', KEYS[1], ttl * 4)
redis.call('PEXPIRE', KEYS[2], ttl * 4)
return 1
`;

const LUA_CANTIDAD_TOTAL = `
local ahora = tonumber(ARGV[1])
local caducadas = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ahora)
for _, r in ipairs(caducadas) do redis.call('HDEL', KEYS[2], r) end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ahora)
local total = 0
local vals = redis.call('HVALS', KEYS[2])
for _, v in ipairs(vals) do total = total + tonumber(v) end
return total
`;

export class RedisAlmacen implements AlmacenReservas {
  constructor(private r: Redis, private prefijo = 'taq') {}
  private kb = (f: string, c: string) => `${this.prefijo}:{${f}}:b:${c}`;
  private kz = (f: string) => `${this.prefijo}:{${f}}:bz`;
  private kgz = (f: string) => `${this.prefijo}:{${f}}:gz`;
  private kgq = (f: string) => `${this.prefijo}:{${f}}:gq`;

  async reservarButacas(f: string, codigos: string[], reserva: string, ttl: number): Promise<ResultadoReserva> {
    const res = (await this.r.eval(LUA_RESERVAR, codigos.length + 1, this.kz(f), ...codigos.map((c) => this.kb(f, c)), reserva, ttl, Date.now(), ...codigos)) as number[];
    return res.length ? { ok: false, ocupadas: res.map((i) => codigos[i - 1]) } : { ok: true };
  }
  async renovarButacas(f: string, codigos: string[], reserva: string, ttl: number) {
    return (await this.r.eval(LUA_RENOVAR, codigos.length + 1, this.kz(f), ...codigos.map((c) => this.kb(f, c)), reserva, ttl, Date.now(), ...codigos)) === 1;
  }
  async liberarButacas(f: string, codigos: string[], reserva: string) {
    if (!codigos.length) return;
    await this.r.eval(LUA_LIBERAR, codigos.length + 1, this.kz(f), ...codigos.map((c) => this.kb(f, c)), reserva, ...codigos);
  }
  async butacasReservadas(f: string) {
    await this.r.zremrangebyscore(this.kz(f), '-inf', Date.now());
    return this.r.zrange(this.kz(f), 0, -1);
  }
  async reservarCantidad(f: string, n: number, reserva: string, ttl: number, disponibles: number) {
    return (await this.r.eval(LUA_CANTIDAD, 2, this.kgz(f), this.kgq(f), reserva, n, ttl, Date.now(), disponibles)) === 1;
  }
  async renovarCantidad(f: string, reserva: string, ttl: number) {
    const n = await this.r.hget(this.kgq(f), reserva);
    if (!n) return false;
    await this.r.zadd(this.kgz(f), Date.now() + ttl, reserva);
    return true;
  }
  async liberarCantidad(f: string, reserva: string) {
    await this.r.multi().hdel(this.kgq(f), reserva).zrem(this.kgz(f), reserva).exec();
  }
  async cantidadReservada(f: string) {
    return Number(await this.r.eval(LUA_CANTIDAD_TOTAL, 2, this.kgz(f), this.kgq(f), Date.now()));
  }
  async cerrar() {}
}
