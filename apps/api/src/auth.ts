/**
 * Sesiones del equipo interno, contexto de organizador y permisos por rol.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { puede, type Permiso, type Rol } from '@taquilla/dominio';
import type { Contexto } from './contexto';
import { sha256, tokenAleatorio } from './infra/cripto';
import { ErrorHttp, prohibido } from './errores';

export const COOKIE_SESION = 'taq_sesion';
const DURACION_SESION_H = 12;

export interface Sesion {
  id: string;
  usuario: { id: string; email: string; nombre: string; superadmin: boolean; totpActivo: boolean; esPrueba: boolean };
  organizadorId: string | null;
  rol: Rol | null;
  segundoFactor: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    sesion: Sesion | null;
  }
}

export async function crearSesion(ctx: Contexto, req: FastifyRequest, reply: FastifyReply, usuarioId: string, segundoFactor: boolean) {
  const token = tokenAleatorio();
  const org = await ctx.db.one<{ organizador_id: string }>(
    `select organizador_id from membresias where usuario_id = $1 order by creado_en limit 1`,
    [usuarioId],
  );
  await ctx.db.query(
    `insert into sesiones (id, usuario_id, organizador_id, segundo_factor, ip, agente, caduca_en)
     values ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7))`,
    [sha256(token), usuarioId, org?.organizador_id ?? null, segundoFactor, req.ip, String(req.headers['user-agent'] ?? '').slice(0, 300), DURACION_SESION_H],
  );
  await ctx.db.query('update usuarios set ultimo_acceso = now() where id = $1', [usuarioId]);
  reply.setCookie(COOKIE_SESION, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.NODE_ENV === 'production',
    maxAge: DURACION_SESION_H * 3600,
  });
}

export async function cargarSesion(ctx: Contexto, token: string | undefined): Promise<Sesion | null> {
  if (!token || token.length > 200) return null;
  const f = await ctx.db.one(
    `select s.id, s.organizador_id, s.segundo_factor,
            u.id as usuario_id, u.email, u.nombre, u.superadmin, u.totp_activo, u.es_prueba,
            m.rol
       from sesiones s
       join usuarios u on u.id = s.usuario_id and u.activo
       left join membresias m on m.usuario_id = u.id and m.organizador_id = s.organizador_id
      where s.id = $1 and s.caduca_en > now()`,
    [sha256(token)],
  );
  if (!f) return null;
  return {
    id: f.id,
    usuario: { id: f.usuario_id, email: f.email, nombre: f.nombre, superadmin: f.superadmin, totpActivo: f.totp_activo, esPrueba: f.es_prueba },
    organizadorId: f.organizador_id,
    // un superadmin sin membresía actúa como administración del organizador elegido
    rol: (f.rol as Rol) ?? (f.superadmin && f.organizador_id ? 'admin' : null),
    segundoFactor: f.segundo_factor,
  };
}

/** Exige sesión completa (con 2FA si el usuario lo tiene o la plataforma lo exige). */
export function sesionCompleta(ctx: Contexto, req: FastifyRequest): Sesion {
  const s = req.sesion;
  if (!s) throw new ErrorHttp(401, 'Tienes que entrar con tu usuario', 'sin_sesion');
  if ((s.usuario.totpActivo || ctx.config.EXIGIR_2FA) && !s.segundoFactor) {
    throw new ErrorHttp(401, 'Falta el código de verificación en dos pasos', 'falta_2fa');
  }
  return s;
}

export interface ContextoOrg {
  sesion: Sesion;
  organizadorId: string;
  usuarioId: string;
  rol: Rol;
}

/** Comprueba sesión, organizador activo y permiso. Devuelve el contexto de trabajo. */
export function exigir(ctx: Contexto, req: FastifyRequest, permiso: Permiso): ContextoOrg {
  const s = sesionCompleta(ctx, req);
  if (!s.organizadorId || !s.rol) throw new ErrorHttp(400, 'Elige primero un organizador', 'sin_organizador');
  if (!puede(s.rol, permiso)) throw prohibido();
  return { sesion: s, organizadorId: s.organizadorId, usuarioId: s.usuario.id, rol: s.rol };
}

export function exigirSuperadmin(ctx: Contexto, req: FastifyRequest): Sesion {
  const s = sesionCompleta(ctx, req);
  if (!s.usuario.superadmin) throw prohibido();
  return s;
}
