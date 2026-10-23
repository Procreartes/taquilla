/**
 * Configuración por variables de entorno (ver .env.example).
 * Sin DATABASE_URL / REDIS_URL se arranca en modo demostración (PGlite + memoria).
 */
import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..', '..');

/** Carga .env de la raíz si existe (sin dependencias). No pisa variables ya definidas. */
export function cargarDotenv(ruta = join(RAIZ, '.env')) {
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || m[2] === '' || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const vacioAUndefined = (v: unknown) => (v === '' ? undefined : v);
const opcional = z.preprocess(vacioAUndefined, z.string().optional());
const SECRETO_DEMO = 'solo-para-desarrollo-local-no-usar-en-produccion';

const Esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('127.0.0.1'),
  TRUST_PROXY: opcional,
  URL_PUBLICA: z.string().default('http://localhost:3000'),
  DATABASE_URL: opcional,
  REDIS_URL: opcional,
  CARPETA_DATOS_LOCALES: z.string().default(join(RAIZ, '.datos-locales')),
  SECRETO_SESION: z.preprocess(vacioAUndefined, z.string().min(32).default(SECRETO_DEMO)),
  SECRETO_QR: z.preprocess(vacioAUndefined, z.string().min(32).default(SECRETO_DEMO + '-qr')),
  SECRETO_DATOS: z.preprocess(vacioAUndefined, z.string().min(32).default(SECRETO_DEMO + '-datos')),
  SECRETO_PUERTA: z.preprocess(vacioAUndefined, z.string().min(32).default(SECRETO_DEMO + '-puerta')),
  SECRETO_COLA: z.preprocess(vacioAUndefined, z.string().min(32).default(SECRETO_DEMO + '-cola')),
  EXIGIR_2FA: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).default(false),
  MODO_DEMO: z.preprocess((v) => (v === undefined ? undefined : v === 'true' || v === '1'), z.boolean().optional()),
  CLAVE_USUARIOS_PRUEBA: opcional,
  // Stripe (solo modo prueba)
  STRIPE_SECRET_KEY: opcional,
  STRIPE_WEBHOOK_SECRET: opcional,
  STRIPE_CONNECT_WEBHOOK_SECRET: opcional,
  // Correo
  SMTP_URL: opcional,
  CORREO_REMITENTE: z.string().default('Taquilla <no-responder@taquilla.test>'),
  // Turnstile (Cloudflare)
  TURNSTILE_SECRET: opcional,
  TURNSTILE_SITE_KEY: opcional,
  // Microsoft Entra ID (Microsoft 365) para el equipo interno
  ENTRA_TENANT_ID: opcional,
  ENTRA_CLIENT_ID: opcional,
  ENTRA_CLIENT_SECRET: opcional,
  // Venta
  LIMITE_ENTRAR_POR_MINUTO: z.coerce.number().default(10),
  LIMITE_COMPRA_POR_MINUTO: z.coerce.number().default(30),
  LIMITE_GLOBAL_POR_MINUTO: z.coerce.number().default(600),
  RESERVA_MINUTOS: z.coerce.number().default(10),
  COLA_VIRTUAL_ACTIVA: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).default(false),
  COLA_PASES_POR_MINUTO: z.coerce.number().default(300),
});

export type Config = z.infer<typeof Esquema> & { modoDemo: boolean; raiz: string };

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const c = Esquema.parse(env);
  const modoDemo = c.MODO_DEMO ?? (!c.DATABASE_URL && c.NODE_ENV !== 'production');
  if (c.NODE_ENV === 'production') {
    for (const k of ['SECRETO_SESION', 'SECRETO_QR', 'SECRETO_DATOS', 'SECRETO_PUERTA', 'SECRETO_COLA'] as const) {
      if (c[k].startsWith(SECRETO_DEMO)) throw new Error(`Falta ${k}: en producción hay que definir un secreto propio`);
    }
    if (!c.DATABASE_URL) throw new Error('Falta DATABASE_URL en producción');
    if (modoDemo) throw new Error('MODO_DEMO no se puede activar en producción');
  }
  if (c.STRIPE_SECRET_KEY && !c.STRIPE_SECRET_KEY.startsWith('sk_test_') && !c.STRIPE_SECRET_KEY.startsWith('rk_test_')) {
    throw new Error('Solo se admiten claves de Stripe en modo prueba (sk_test_…). Esta plataforma aún no cobra de verdad.');
  }
  return { ...c, modoDemo, raiz: RAIZ };
}
