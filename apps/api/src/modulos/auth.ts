import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import otplib from 'otplib';
import { PERMISOS, puede, NOMBRE_ROL } from '@taquilla/dominio';
import type { Contexto } from '../contexto';
import { COOKIE_SESION, crearSesion, sesionCompleta } from '../auth';
import { cifrar, comprobarClave, descifrar, sha256 } from '../infra/cripto';
import { ErrorHttp, prohibido } from '../errores';
import { auditar } from '../auditoria';

const { authenticator } = otplib;
authenticator.options = { window: 1 };

export async function rutasAuth(app: FastifyInstance, ctx: Contexto) {
  const LIMITE_ENTRAR = { config: { rateLimit: { max: ctx.config.LIMITE_ENTRAR_POR_MINUTO, timeWindow: '1 minute' } } };
  app.post('/api/auth/entrar', LIMITE_ENTRAR, async (req, reply) => {
    const { email, clave } = z.object({ email: z.string().email().max(200), clave: z.string().min(1).max(200) }).parse(req.body);
    const u = await ctx.db.one(`select id, hash_clave, totp_activo from usuarios where email = $1 and activo`, [email.toLowerCase()]);
    const ok = await comprobarClave(clave, u?.hash_clave);
    if (!u || !ok) {
      await auditar(ctx.db, { accion: 'auth.fallo', datos: { email: email.toLowerCase() }, ip: req.ip });
      throw new ErrorHttp(401, 'Correo o contraseña incorrectos', 'credenciales');
    }
    await crearSesion(ctx, req, reply, u.id, !u.totp_activo);
    await auditar(ctx.db, { usuarioId: u.id, accion: 'auth.entrar', ip: req.ip });
    return { ok: true, necesita2fa: u.totp_activo || ctx.config.EXIGIR_2FA, configurar2fa: ctx.config.EXIGIR_2FA && !u.totp_activo };
  });

  // Solo en modo demostración: entrar con un usuario de prueba sin contraseña.
  app.post('/api/auth/demo', async (req, reply) => {
    if (!ctx.config.modoDemo) throw prohibido('Solo disponible en el modo demostración local');
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const u = await ctx.db.one(`select id from usuarios where email = $1 and es_prueba and activo`, [email.toLowerCase()]);
    if (!u) throw new ErrorHttp(404, 'Usuario de prueba no encontrado', 'no_encontrado');
    await crearSesion(ctx, req, reply, u.id, true);
    return { ok: true };
  });

  app.get('/api/auth/usuarios-prueba', async () => {
    if (!ctx.config.modoDemo) return [];
    return ctx.db.query(
      `select u.email, u.nombre, coalesce(string_agg(o.nombre || ' · ' || m.rol, ', '), '') as accesos, u.superadmin
         from usuarios u
         left join membresias m on m.usuario_id = u.id
         left join organizadores o on o.id = m.organizador_id
        where u.es_prueba and u.activo
        group by u.id order by u.superadmin desc, u.email`,
    );
  });

  app.post('/api/auth/salir', async (req, reply) => {
    const t = req.cookies[COOKIE_SESION];
    if (t) await ctx.db.query('delete from sesiones where id = $1', [sha256(t)]);
    reply.clearCookie(COOKIE_SESION, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/yo', async (req) => {
    const s = req.sesion;
    if (!s) return { sesion: false };
    const completa = !((s.usuario.totpActivo || ctx.config.EXIGIR_2FA) && !s.segundoFactor);
    const organizadores = s.usuario.superadmin
      ? await ctx.db.query(`select o.id, o.nombre, o.slug, coalesce(m.rol, 'admin') as rol, o.es_prueba
                              from organizadores o left join membresias m on m.organizador_id = o.id and m.usuario_id = $1
                             where o.activo order by o.nombre`, [s.usuario.id])
      : await ctx.db.query(`select o.id, o.nombre, o.slug, m.rol, o.es_prueba from membresias m
                              join organizadores o on o.id = m.organizador_id and o.activo
                             where m.usuario_id = $1 order by o.nombre`, [s.usuario.id]);
    return {
      sesion: true,
      completa,
      usuario: s.usuario,
      organizadorId: s.organizadorId,
      rol: s.rol,
      rolNombre: s.rol ? NOMBRE_ROL[s.rol] : null,
      permisos: completa ? PERMISOS.filter((p) => puede(s.rol, p)) : [],
      organizadores,
      modoDemo: ctx.config.modoDemo,
    };
  });

  app.post('/api/auth/organizador', async (req) => {
    const s = sesionCompleta(ctx, req);
    const { organizadorId } = z.object({ organizadorId: z.string().uuid() }).parse(req.body);
    const ok = s.usuario.superadmin
      ? await ctx.db.one('select 1 from organizadores where id = $1 and activo', [organizadorId])
      : await ctx.db.one('select 1 from membresias where usuario_id = $1 and organizador_id = $2', [s.usuario.id, organizadorId]);
    if (!ok) throw new ErrorHttp(404, 'Organizador no encontrado', 'no_encontrado');
    await ctx.db.query('update sesiones set organizador_id = $1 where id = $2', [organizadorId, s.id]);
    return { ok: true };
  });

  // ---- Verificación en dos pasos (TOTP) ----
  app.post('/api/auth/2fa', LIMITE_ENTRAR, async (req) => {
    const s = req.sesion;
    if (!s) throw new ErrorHttp(401, 'Tienes que entrar con tu usuario', 'sin_sesion');
    const { codigo } = z.object({ codigo: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const u = await ctx.db.one('select totp_secreto, totp_activo from usuarios where id = $1', [s.usuario.id]);
    if (!u?.totp_activo || !u.totp_secreto) throw new ErrorHttp(400, 'No tienes activada la verificación en dos pasos', 'sin_2fa');
    if (!authenticator.check(codigo, descifrar(ctx.config.SECRETO_DATOS, u.totp_secreto))) {
      await auditar(ctx.db, { usuarioId: s.usuario.id, accion: 'auth.2fa_fallo', ip: req.ip });
      throw new ErrorHttp(401, 'Código incorrecto', 'codigo');
    }
    await ctx.db.query('update sesiones set segundo_factor = true where id = $1', [s.id]);
    return { ok: true };
  });

  app.post('/api/auth/2fa/preparar', async (req) => {
    const s = req.sesion;
    if (!s) throw new ErrorHttp(401, 'Tienes que entrar con tu usuario', 'sin_sesion');
    if (s.usuario.totpActivo) throw new ErrorHttp(400, 'Ya está activada', 'ya_activa');
    const secreto = authenticator.generateSecret();
    await ctx.db.query('update usuarios set totp_secreto = $1 where id = $2', [cifrar(ctx.config.SECRETO_DATOS, secreto), s.usuario.id]);
    return { secreto, otpauth: authenticator.keyuri(s.usuario.email, 'Taquilla', secreto) };
  });

  app.post('/api/auth/2fa/activar', LIMITE_ENTRAR, async (req) => {
    const s = req.sesion;
    if (!s) throw new ErrorHttp(401, 'Tienes que entrar con tu usuario', 'sin_sesion');
    const { codigo } = z.object({ codigo: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const u = await ctx.db.one('select totp_secreto from usuarios where id = $1', [s.usuario.id]);
    if (!u?.totp_secreto || !authenticator.check(codigo, descifrar(ctx.config.SECRETO_DATOS, u.totp_secreto))) {
      throw new ErrorHttp(401, 'Código incorrecto', 'codigo');
    }
    await ctx.db.query('update usuarios set totp_activo = true where id = $1', [s.usuario.id]);
    await ctx.db.query('update sesiones set segundo_factor = true where id = $1', [s.id]);
    await auditar(ctx.db, { usuarioId: s.usuario.id, accion: 'auth.2fa_activada', ip: req.ip });
    return { ok: true };
  });
}

export { authenticator };
