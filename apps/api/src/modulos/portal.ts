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

/** Firma HS256, emisor «portal-livon», destinatario y caducidad. Devuelve los datos o null. */
export function verificarJwt(token: string, secreto: string, audiencia: string, ahora = Date.now(), vidaMaxSeg = 180): Record<string, any> | null {
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
  if (d.iss !== 'portal-livon' || !aud.includes(audiencia)) return null;
  if (typeof d.exp !== 'number' || d.exp < seg - 5) return null;
  if (typeof d.iat !== 'number' || d.iat > seg + 30 || seg - d.iat > vidaMaxSeg) return null;
  return d;
}

/** Comprueba firma, emisor, destinatario y tiempos. Devuelve null si algo no cuadra. */
export function verificarPase(token: string, secreto: string, ahora = Date.now()): DatosPase | null {
  const d = verificarJwt(token, secreto, 'taquilla', ahora);
  if (!d) return null;
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

  /**
   * Para la contabilidad (Livon Gestión, a través del portal): lo cobrado por cada función, con devoluciones,
   * base imponible, impuesto y comisiones de la pasarela. Solo funciones reales (sin pruebas) con algún pago.
   * Autenticación: JWT HS256 firmado por el portal con la misma clave (destinatario «taquilla-contabilidad»).
   */
  app.get('/api/integracion/contabilidad', async (req) => {
    const secreto = ctx.config.PORTAL_SSO_SECRET;
    if (!secreto) throw new ErrorHttp(503, 'Integración no configurada', 'no_configurado');
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!token || !verificarJwt(token, secreto, 'taquilla-contabilidad')) throw new ErrorHttp(401, 'Credencial no válida', 'credencial');
    const { desde } = z.object({ desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
    return ctx.db.query(
      `with p as (
         select p.funcion_id, p.id, p.total_cent, p.importe_entradas_cent, p.gastos_cent, coalesce(p.comision_pasarela_cent, 0) as comision, p.impuesto_tipo, p.pagado_en,
                coalesce((select sum(d.importe_cent) from devoluciones d where d.pedido_id = p.id and d.estado = 'hecha'), 0) as devuelto
           from pedidos p
          where p.canal <> 'invitacion' and p.pagado_en is not null and p.estado in ('pagado', 'devuelto', 'devuelto_parcial')
       )
       select f.id as funcion_id, f.codigo, f.titulo, to_char(f.fecha, 'YYYY-MM-DD') as fecha, e.nombre as evento, e.codigo_proyecto,
              o.nombre as organizador, o.razon_social, o.cif, o.impuesto_nombre,
              count(p.id)::int as pedidos,
              (select count(*)::int from entradas x where x.funcion_id = f.id and x.tipo_entrada = 'venta' and x.estado in ('valida', 'usada')) as entradas,
              sum(p.total_cent)::int as cobrado_cent, sum(p.devuelto)::int as devuelto_cent,
              sum(p.total_cent - p.devuelto)::int as neto_cent,
              round(sum((p.total_cent - p.devuelto) / (1 + p.impuesto_tipo / 100.0)))::int as base_cent,
              sum(p.gastos_cent)::int as gastos_cent, sum(p.comision)::int as comisiones_cent,
              to_char(max(p.pagado_en) at time zone 'Atlantic/Canary', 'YYYY-MM-DD') as ultimo_pago
         from p join funciones f on f.id = p.funcion_id join eventos e on e.id = f.evento_id join organizadores o on o.id = f.organizador_id
        where not f.es_prueba and not o.es_prueba ${desde ? 'and f.fecha >= $1' : ''}
        group by f.id, e.id, o.id order by f.fecha, f.codigo`,
      desde ? [desde] : [],
    );
  });
}
