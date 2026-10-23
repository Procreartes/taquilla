import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (clave: string, sal: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Huella de contraseña: scrypt$N$r$p$sal$hash (base64url). */
export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const h = await scryptAsync(clave.normalize('NFKC'), sal, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString('base64url')}$${h.toString('base64url')}`;
}

export async function comprobarClave(clave: string, huella: string | null | undefined): Promise<boolean> {
  if (!huella) return false;
  const [alg, N, r, p, sal, h] = huella.split('$');
  if (alg !== 'scrypt' || !sal || !h) return false;
  const esperado = Buffer.from(h, 'base64url');
  const calc = await scryptAsync(clave.normalize('NFKC'), Buffer.from(sal, 'base64url'), esperado.length, {
    N: +N, r: +r, p: +p, maxmem: PARAMS.maxmem,
  });
  return calc.length === esperado.length && timingSafeEqual(calc, esperado);
}

export const tokenAleatorio = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmac = (secreto: string | Buffer, datos: string) => createHmac('sha256', secreto).update(datos).digest();

export function igualSeguro(a: string, b: string): boolean {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

/** Cifrado simétrico AES-256-GCM para datos sensibles en reposo (p. ej. secreto TOTP). */
export function cifrar(secreto: string, texto: string): string {
  const k = createHash('sha256').update(secreto).digest();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}

export function descifrar(secreto: string, sobre: string): string {
  const [v, iv, tag, enc] = sobre.split('.');
  if (v !== 'v1') throw new Error('Formato de cifrado desconocido');
  const k = createHash('sha256').update(secreto).digest();
  const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}

/** Alfabeto sin caracteres confundibles (0/O, 1/I/L) para códigos que se leen en voz alta. */
const B32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function codigoLegible(n = 8): string {
  const b = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += B32[b[i] % B32.length];
  return s;
}
