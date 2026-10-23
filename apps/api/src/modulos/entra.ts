/**
 * Acceso del equipo interno con Microsoft 365 (Entra ID), flujo OpenID Connect con PKCE.
 * Se activa solo si están ENTRA_TENANT_ID, ENTRA_CLIENT_ID y ENTRA_CLIENT_SECRET.
 * No crea usuarios: la persona tiene que estar dada de alta antes en el equipo de algún organizador.
 */
import type { FastifyInstance } from 'fastify';
import { createHash, createPublicKey, verify as verificarFirma } from 'node:crypto';
import { z } from 'zod';
import type { Contexto } from '../contexto';
import { crearSesion } from '../auth';
import { tokenAleatorio } from '../infra/cripto';
import { auditar } from '../auditoria';

const COOKIE = 'taq_entra';

export function entraConfigurado(ctx: Contexto) {
  const c = ctx.config;
  return !!(c.ENTRA_TENANT_ID && c.ENTRA_CLIENT_ID && c.ENTRA_CLIENT_SECRET);
}

export async function rutasEntra(app: FastifyInstance, ctx: Contexto) {
  const c = ctx.config;
  const base = () => `https://login.microsoftonline.com/${c.ENTRA_TENANT_ID}`;
  const vuelta = () => `${c.URL_PUBLICA}/api/auth/entra/vuelta`;

  app.get('/api/auth/opciones', async () => ({ entra: entraConfigurado(ctx), demo: ctx.config.modoDemo }));

  app.get('/api/auth/entra/inicio', async (_req, reply) => {
    if (!entraConfigurado(ctx)) return reply.redirect('/entrar?error=entra_no_configurado');
    const state = tokenAleatorio(16), nonce = tokenAleatorio(16), verificador = tokenAleatorio(32);
    const reto = createHash('sha256').update(verificador).digest('base64url');
    reply.setCookie(COOKIE, [state, nonce, verificador].join('.'), {
      path: '/api/auth/entra', httpOnly: true, sameSite: 'lax', secure: c.NODE_ENV === 'production', maxAge: 600,
    });
    const u = new URL(`${base()}/oauth2/v2.0/authorize`);
    u.search = new URLSearchParams({
      client_id: c.ENTRA_CLIENT_ID!, response_type: 'code', redirect_uri: vuelta(), response_mode: 'query',
      scope: 'openid profile email', state, nonce, code_challenge: reto, code_challenge_method: 'S256',
    }).toString();
    return reply.redirect(u.toString());
  });

  app.get('/api/auth/entra/vuelta', async (req, reply) => {
    if (!entraConfigurado(ctx)) return reply.redirect('/entrar?error=entra_no_configurado');
    const q = z.object({ code: z.string().max(4000), state: z.string().max(200) }).safeParse(req.query);
    const [state, nonce, verificador] = String(req.cookies[COOKIE] ?? '').split('.');
    reply.clearCookie(COOKIE, { path: '/api/auth/entra' });
    if (!q.success || !state || q.data.state !== state) return reply.redirect('/entrar?error=entra_estado');

    const r = await fetch(`${base()}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.ENTRA_CLIENT_ID!, client_secret: c.ENTRA_CLIENT_SECRET!, grant_type: 'authorization_code',
        code: q.data.code, redirect_uri: vuelta(), code_verifier: verificador,
      }),
    });
    if (!r.ok) return reply.redirect('/entrar?error=entra_token');
    const { id_token } = (await r.json()) as { id_token?: string };
    const datos = id_token ? await verificarIdToken(id_token, base(), c.ENTRA_CLIENT_ID!, c.ENTRA_TENANT_ID!, nonce) : null;
    if (!datos) return reply.redirect('/entrar?error=entra_token');

    const email = String(datos.email ?? datos.preferred_username ?? '').toLowerCase();
    const u = await ctx.db.one<{ id: string }>(
      `select id from usuarios where activo and (entra_oid = $1 or (entra_oid is null and email = $2))`,
      [datos.oid, email],
    );
    if (!u) {
      await auditar(ctx.db, { accion: 'auth.entra_sin_alta', datos: { email }, ip: req.ip });
      return reply.redirect('/entrar?error=entra_sin_alta');
    }
    await ctx.db.query('update usuarios set entra_oid = $1 where id = $2', [datos.oid, u.id]);
    // Microsoft 365 ya aplica su propia verificación en varios pasos.
    await crearSesion(ctx, req, reply, u.id, true);
    await auditar(ctx.db, { usuarioId: u.id, accion: 'auth.entrar_entra', ip: req.ip });
    return reply.redirect('/panel');
  });
}

let jwksCache: { claves: any[]; hasta: number } | null = null;

async function verificarIdToken(token: string, base: string, aud: string, tid: string, nonce: string) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const cab = JSON.parse(Buffer.from(h, 'base64url').toString());
  const datos = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (cab.alg !== 'RS256') return null;
  if (!jwksCache || jwksCache.hasta < Date.now()) {
    const r = await fetch(`${base}/discovery/v2.0/keys`);
    jwksCache = { claves: ((await r.json()) as any).keys ?? [], hasta: Date.now() + 3600_000 };
  }
  const jwk = jwksCache.claves.find((k) => k.kid === cab.kid);
  if (!jwk) return null;
  const ok = verificarFirma('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  const ahora = Math.floor(Date.now() / 1000);
  if (!ok || datos.aud !== aud || datos.tid !== tid || datos.nonce !== nonce || datos.exp < ahora || !String(datos.iss).includes(tid)) return null;
  return datos as { oid: string; email?: string; preferred_username?: string };
}
