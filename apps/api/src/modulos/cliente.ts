/**
 * Cuenta del cliente sin contraseña: se pide un enlace por correo y con él se ven todas las
 * entradas compradas con ese correo. La sesión del cliente es una cookie firmada (30 días).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto';
import { descifrar, hmac, igualSeguro } from '../infra/cripto';
import { ErrorHttp } from '../errores';

const COOKIE = 'taq_cliente';

function firmar(ctx: Contexto, tipo: 'enlace' | 'sesion', email: string, minutos: number) {
  const hasta = Date.now() + minutos * 60_000;
  const cuerpo = Buffer.from(JSON.stringify({ t: tipo, e: email, h: hasta })).toString('base64url');
  return `${cuerpo}.${hmac(ctx.config.SECRETO_SESION + ':cliente', cuerpo).toString('base64url')}`;
}

function leer(ctx: Contexto, tipo: 'enlace' | 'sesion', valor: string | undefined): string | null {
  if (!valor || valor.length > 1000) return null;
  const [cuerpo, firma] = valor.split('.');
  if (!cuerpo || !firma || !igualSeguro(firma, hmac(ctx.config.SECRETO_SESION + ':cliente', cuerpo).toString('base64url'))) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    return d.t === tipo && d.h > Date.now() ? String(d.e) : null;
  } catch {
    return null;
  }
}

export async function rutasCliente(app: FastifyInstance, ctx: Contexto) {
  const limite = { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } };

  // Siempre responde lo mismo, exista o no el correo (no revela quién ha comprado)
  app.post('/api/cliente/acceso', limite, async (req) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).parse(req.body);
    const hay = await ctx.db.one(`select 1 from pedidos where lower(comprador_email) = $1 and estado in ('pagado', 'devuelto_parcial') limit 1`, [email]);
    if (hay) {
      const enlace = `${ctx.config.URL_PUBLICA}/cuenta?acceso=${firmar(ctx, 'enlace', email, 30)}`;
      await ctx.correos.enviar({
        para: email,
        asunto: 'Tu enlace para ver tus entradas',
        html: `<p>Pulsa aquí para ver tus entradas (el enlace caduca en 30 minutos):</p><p><a href="${enlace}">Ver mis entradas</a></p><p style="color:#4f596c;font-size:12px">Si no lo has pedido tú, ignora este correo.</p>`,
        texto: `Para ver tus entradas abre este enlace (caduca en 30 minutos):\n${enlace}\n\nSi no lo has pedido tú, ignora este correo.`,
      });
    }
    return { ok: true };
  });

  app.post('/api/cliente/entrar', async (req, reply) => {
    const { acceso } = z.object({ acceso: z.string().max(1000) }).parse(req.body);
    const email = leer(ctx, 'enlace', acceso);
    if (!email) throw new ErrorHttp(401, 'El enlace ha caducado o no es válido. Pide uno nuevo.', 'enlace');
    reply.setCookie(COOKIE, firmar(ctx, 'sesion', email, 60 * 24 * 30), {
      path: '/', httpOnly: true, sameSite: 'lax', secure: ctx.config.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true, email };
  });

  app.post('/api/cliente/salir', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/cliente/pedidos', async (req, reply) => {
    const email = leer(ctx, 'sesion', req.cookies[COOKIE]);
    if (!email) return reply.status(401).send({ error: 'sin_sesion', mensaje: 'Pide tu enlace de acceso' });
    const filas = await ctx.db.query(
      `select p.codigo, p.estado, p.total_cent, p.token_cifrado, f.titulo, f.fecha, to_char(f.hora, 'HH24:MI') as hora, f.es_prueba,
              r.nombre as recinto_nombre, (select count(*)::int from entradas e where e.pedido_id = p.id and e.estado in ('valida', 'usada')) as entradas
         from pedidos p join funciones f on f.id = p.funcion_id join recintos r on r.id = f.recinto_id
        where lower(p.comprador_email) = $1 and p.estado in ('pagado', 'devuelto', 'devuelto_parcial', 'conflicto')
        order by f.fecha desc`,
      [email],
    );
    return { email, pedidos: filas.map(({ token_cifrado, ...p }) => ({ ...p, enlace: `/pedido/${descifrar(ctx.config.SECRETO_DATOS, token_cifrado)}` })) };
  });
}
