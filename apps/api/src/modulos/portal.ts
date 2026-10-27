/**
 * Entrada desde el portal de Grupo Livon (portal.grupolivon.com).
 * El portal ya identificó a la persona con Microsoft 365 y nos manda un pase firmado (JWT HS256, 2 minutos, un solo uso).
 * La Taquilla solo deja entrar a quien ya tenga usuario activo aquí: los permisos de cada organizador se siguen dando en «Equipo».
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto';
import { crearSesion } from '../auth';
import { ErrorHttp } from '../errores';
import { auditar } from '../auditoria';

export type DatosPase = { email: string; nombre: string; mfa: boolean; destino: string | null; jti: string };

const DESTINO = /^\/(panel|puerta)(\/[A-Za-z0-9/_-]*)?$/;

/** Comprueba firma, emisor, destinatario y tiempos. Devuelve null si algo no cuadra. */
export function verificarPase(token: string, secreto: string, ahora = Date.now()): DatosPase | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [h, p, f] = partes;
  let cab: any, d: any;
  try {
    cab = JSON.parse(Buffer.from(h, 'base64url').toString());
    d = JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch {
    return null;
  }
  if (cab?.alg !== 'HS256') return null;
  const esperada = createHmac('sha256', secreto).update(`${h}.${p}`).digest();
  const recibida = Buffer.from(f, 'base64url');
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  const seg = Math.floor(ahora / 1000);
  const aud = Array.isArray(d.aud) ? d.aud : [d.aud];
  if (d.iss !== 'portal-livon' || !aud.includes('taquilla')) return null;
  if (typeof d.exp !== 'number' || d.exp < seg - 5) return null;
  if (typeof d.iat !== 'number' || d.iat > seg + 30 || seg - d.iat > 180) return null;
  if (typeof d.jti !== 'string' || d.jti.length < 16 || d.jti.length > 100) return null;
  const email = String(d.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return {
    email,
    nombre: String(d.name ?? '').slice(0, 200),
    mfa: d.mfa === true,
    destino: typeof d.destino === 'string' && DESTINO.test(d.destino) ? d.destino : null,
    jti: d.jti,
  };
}

export async function rutasPortal(app: FastifyInstance, ctx: Contexto) {
  const LIMITE = { config: { rateLimit: { max: ctx.config.LIMITE_ENTRAR_POR_MINUTO, timeWindow: '1 minute' } } };

  app.get('/api/auth/portal/info', async () => ({ activo: Boolean(ctx.config.PORTAL_SSO_SECRET), url: ctx.config.PORTAL_URL }));

  app.post('/api/auth/portal', LIMITE, async (req, reply) => {
    const secreto = ctx.config.PORTAL_SSO_SECRET;
    if (!secreto) throw new ErrorHttp(503, 'La entrada desde el portal no está configurada todavía', 'portal_no_configurado');
    const { pase } = z.object({ pase: z.string().min(20).max(4000) }).parse(req.body);
    const d = verificarPase(pase, secreto);
    if (!d) {
      await auditar(ctx.db, { accion: 'auth.portal_pase_invalido', ip: req.ip });
      throw new ErrorHttp(401, 'El pase del portal no es válido o ha caducado. Vuelve a pulsar «Taquilla» en el portal.', 'pase_invalido');
    }
    // Un solo uso (y limpieza de los antiguos)
    await ctx.db.query(`delete from pases_portal where usado_en < now() - interval '1 day'`);
    const nuevo = await ctx.db.one('insert into pases_portal (jti, email) values ($1, $2) on conflict do nothing returning jti', [d.jti, d.email]);
    if (!nuevo) throw new ErrorHttp(401, 'Este pase ya se usó. Vuelve a pulsar «Taquilla» en el portal.', 'pase_usado');

    const u = await ctx.db.one<{ id: string; totp_activo: boolean }>('select id, totp_activo from usuarios where email = $1 and activo', [d.email]);
    if (!u) {
      await auditar(ctx.db, { accion: 'auth.portal_sin_alta', datos: { email: d.email }, ip: req.ip });
      throw new ErrorHttp(403, `Tu cuenta (${d.email}) aún no tiene acceso a la Taquilla. Pide a administración que te añada en Panel → Equipo.`, 'sin_alta');
    }
    // Si entró en el portal con Microsoft 365, su verificación en dos pasos vale también aquí.
    await crearSesion(ctx, req, reply, u.id, d.mfa || !u.totp_activo);
    await auditar(ctx.db, { usuarioId: u.id, accion: 'auth.entrar_portal', datos: { mfa: d.mfa }, ip: req.ip });
    const necesita2fa = !d.mfa && (u.totp_activo || ctx.config.EXIGIR_2FA);
    return { ok: true, destino: d.destino ?? '/panel', necesita2fa, configurar2fa: necesita2fa && !u.totp_activo };
  });
}
