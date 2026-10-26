/**
 * API pública (sin sesión): cartelera, ficha de función, disponibilidad, reserva y pago.
 * Nunca devuelve datos personales de otros compradores.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto';
import { noEncontrado, ErrorHttp } from '../errores';
import { verificarTurnstile } from '../infra/turnstile';
import { cancelarReserva, crearReserva, ocupacion, pedidoPorToken, prepararPago, resumenPedido } from '../servicios/venta';
import { zonasDeFuncion } from './eventos';
import { facturaHtml } from '../servicios/factura';
import { llavesEntradas, pdfEntradas } from '../servicios/entradas';
import { DOCUMENTOS_LEGALES, plantillaLegal } from '../servicios/legal';

const uuid = z.string().uuid();

const CAMPOS_FUNCION_PUBLICA = `f.id, f.codigo, f.titulo, f.artistas, f.programa, f.es_gala, f.edad_minima, f.nota, f.fecha, to_char(f.hora, 'HH24:MI') as hora,
  f.modo_venta, f.estado, f.venta_externa_url, f.verificar, f.es_prueba, f.aforo, f.cola_virtual,
  r.nombre as recinto_nombre, r.zona as recinto_zona, r.municipio, r.isla`;

export async function rutasPublico(app: FastifyInstance, ctx: Contexto) {
  const limiteCompra = { config: { rateLimit: { max: ctx.config.LIMITE_COMPRA_POR_MINUTO, timeWindow: '1 minute' } } };

  app.get('/api/publico/legal/:doc', async (req) => {
    const { doc } = z.object({ doc: z.enum(DOCUMENTOS_LEGALES) }).parse(req.params);
    const { org, idioma } = z.object({ org: z.string().max(60).optional(), idioma: z.enum(['es', 'en', 'de']).default('es') }).parse(req.query);
    const o = org ? await ctx.db.one<any>('select nombre, razon_social, cif, direccion_fiscal, email_contacto, textos_legales from organizadores where slug = $1 and activo', [org]) : null;
    const propio = o?.textos_legales?.[idioma]?.[doc] ?? o?.textos_legales?.es?.[doc];
    return { borrador: !propio, texto: propio ?? plantillaLegal(doc, o ?? undefined) };
  });

  app.get('/api/publico/eventos', async () =>
    ctx.db.query(
      `select e.slug, e.nombre, e.tipo, e.imagen_url, e.es_prueba, min(f.fecha) as desde, max(f.fecha) as hasta, count(f.id)::int as funciones
         from eventos e join funciones f on f.evento_id = e.id and f.publicada
        where e.publicado group by e.id order by min(f.fecha)`,
    ),
  );

  app.get('/api/publico/eventos/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const e = await ctx.db.one(
      `select e.id, e.slug, e.nombre, e.tipo, e.descripcion, e.imagen_url, e.datos->'islas' as islas, e.es_prueba,
              o.nombre as organizador_nombre, o.color_primario, o.logo_url, o.gastos_gestion_cent, o.gastos_gestion_pct
         from eventos e join organizadores o on o.id = e.organizador_id and o.activo where e.slug = $1 and e.publicado`,
      [slug],
    );
    if (!e) throw noEncontrado('Evento');
    const funciones = await ctx.db.query(
      `select ${CAMPOS_FUNCION_PUBLICA},
              (select min(precio_cent) from precios_funcion pf where pf.funcion_id = f.id) as precio_desde,
              (select count(*)::int from precios_funcion pf where pf.funcion_id = f.id) as zonas_con_precio
         from funciones f join recintos r on r.id = f.recinto_id
        where f.evento_id = $1 and f.publicada order by f.fecha, f.hora nulls last`,
      [e.id],
    );
    const { id: _id, ...publico } = e;
    return { ...publico, funciones };
  });

  app.get('/api/publico/funciones/:id', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const f = await ctx.db.one<any>(
      `select ${CAMPOS_FUNCION_PUBLICA}, f.version_plano_id, f.vendidas_general, e.slug as evento_slug, e.nombre as evento_nombre, e.datos->'islas' as islas,
              o.nombre as organizador_nombre, o.gastos_gestion_cent, o.gastos_gestion_pct, o.max_entradas_pedido, o.impuesto_nombre, o.impuesto_tipo, o.textos_legales,
              v.receta as plano
         from funciones f join recintos r on r.id = f.recinto_id join eventos e on e.id = f.evento_id and e.publicado
         join organizadores o on o.id = f.organizador_id left join versiones_plano v on v.id = f.version_plano_id
        where f.id = $1 and f.publicada`,
      [id],
    );
    if (!f) throw noEncontrado('Función');
    const zonas = await zonasDeFuncion(ctx.db, f);
    const precios = Object.fromEntries((await ctx.db.query('select zona_codigo, precio_cent from precios_funcion where funcion_id = $1', [id])).map((p) => [p.zona_codigo, p.precio_cent]));
    const vendible = f.estado === 'a_la_venta' && f.modo_venta !== 'libre' && !f.venta_externa_url && zonas.every((z) => precios[z.codigo] !== undefined);
    const { version_plano_id: _v, vendidas_general, ...resto } = f;
    return {
      ...resto,
      vendible,
      quedan: f.modo_venta === 'general' && f.aforo ? Math.max(0, f.aforo - vendidas_general - (await ctx.almacen.cantidadReservada(id))) : null,
      zonas: zonas.map((z) => ({ ...z, precio_cent: precios[z.codigo] ?? null })),
      turnstile: ctx.config.TURNSTILE_SITE_KEY ?? null,
      cola: !!f.cola_virtual,
      reservaMinutos: ctx.config.RESERVA_MINUTOS,
    };
  });

  app.get('/api/publico/funciones/:id/disponibilidad', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const f = await ctx.db.one('select modo_venta from funciones where id = $1 and publicada', [id]);
    if (!f) throw noEncontrado('Función');
    reply.header('cache-control', 'no-store');
    if (f.modo_venta !== 'numerada') return { vendidas: [], reservadas: [], protocolo: [] };
    const o = await ocupacion(ctx, id);
    const protocolo = (await ctx.db.one(`select to_regclass('public.bloqueos_protocolo') is not null as hay`))?.hay
      ? (await ctx.db.query('select butaca_codigo from bloqueos_protocolo where funcion_id = $1 and activo', [id])).map((r) => r.butaca_codigo)
      : [];
    return { ...o, protocolo };
  });

  app.post('/api/publico/reservas', limiteCompra, async (req) => {
    const d = z.object({
      funcionId: uuid,
      butacas: z.array(z.string().max(60)).max(50).optional(),
      cantidad: z.number().int().min(1).max(50).optional(),
      mejorSitio: z.object({ cantidad: z.number().int().min(1).max(50), zona: z.string().max(40).optional(), pmr: z.number().int().min(0).max(10).optional() }).optional(),
      turnstile: z.string().max(4096).optional(),
      pase: z.string().max(500).optional(),
    }).parse(req.body);
    if (!(await verificarTurnstile(ctx.config.TURNSTILE_SECRET, d.turnstile, req.ip))) throw new ErrorHttp(403, 'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo.', 'turnstile');
    await comprobarPaseCola(ctx, d.funcionId, d.pase);
    return crearReserva(ctx, d);
  });

  // ---- Cola virtual ----
  app.post('/api/publico/cola/:funcionId/entrar', limiteCompra, async (req) => {
    const { funcionId } = z.object({ funcionId: uuid }).parse(req.params);
    const { turnstile } = z.object({ turnstile: z.string().max(4096).optional() }).parse(req.body ?? {});
    if (!(await verificarTurnstile(ctx.config.TURNSTILE_SECRET, turnstile, req.ip))) throw new ErrorHttp(403, 'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo.', 'turnstile');
    return ctx.colaVirtual!.entrar(funcionId);
  });

  app.get('/api/publico/cola/:funcionId/estado', { config: { rateLimit: { max: Math.max(600, ctx.config.LIMITE_COMPRA_POR_MINUTO), timeWindow: '1 minute' } } }, async (req, reply) => {
    const { funcionId } = z.object({ funcionId: uuid }).parse(req.params);
    const { turno } = z.object({ turno: z.string().max(100) }).parse(req.query);
    reply.header('cache-control', 'no-store');
    return ctx.colaVirtual!.estado(funcionId, turno);
  });

  app.delete('/api/publico/reservas/:token', async (req) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(req.params);
    await cancelarReserva(ctx, token);
    return { ok: true };
  });

  app.get('/api/publico/pedidos/:token', async (req, reply) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(req.params);
    reply.header('cache-control', 'no-store');
    const r = await resumenPedido(ctx.db, await pedidoPorToken(ctx.db, token));
    const { id: _id, pago_url: _u, ...publico } = r;
    return publico;
  });

  app.get('/api/publico/pedidos/:token/factura', async (req, reply) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(req.params);
    const p = await resumenPedido(ctx.db, await pedidoPorToken(ctx.db, token));
    if (!p.numero_factura) throw noEncontrado('Factura');
    reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
    return reply.type('text/html; charset=utf-8').send(facturaHtml(p));
  });

  // Llaves de rotación del QR (solo de las entradas de este pedido)
  app.get('/api/publico/pedidos/:token/llaves', async (req, reply) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(req.params);
    const id = await pedidoPorToken(ctx.db, token);
    reply.header('cache-control', 'no-store');
    const entradas = await ctx.db.query<{ codigo: string; funcion_id: string }>(`select codigo, funcion_id from entradas where pedido_id = $1 and estado = 'valida'`, [id]);
    return llavesEntradas(ctx, entradas);
  });

  app.get('/api/publico/pedidos/:token/pdf', async (req, reply) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(req.params);
    const p = await resumenPedido(ctx.db, await pedidoPorToken(ctx.db, token));
    if (!p.entradas.length) throw noEncontrado('Entradas');
    reply.header('content-disposition', `attachment; filename="entradas-${p.codigo}.pdf"`).header('cache-control', 'no-store');
    return reply.type('application/pdf').send(await pdfEntradas(ctx, p));
  });

  app.post('/api/publico/pedidos/:token/pagar', limiteCompra, async (req) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(req.params);
    const d = z.object({
      nombre: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(200),
      telefono: z.string().trim().max(30).nullable().optional(),
      codigoPostal: z.string().trim().max(12).nullable().optional(),
      pais: z.string().trim().max(60).nullable().optional(),
      municipio: z.string().trim().max(120).nullable().optional(),
      isla: z.string().trim().max(60).nullable().optional(),
      idioma: z.enum(['es', 'en', 'de']).default('es'),
      consentimientos: z.object({
        condiciones: z.boolean(), privacidad: z.boolean(), comunicacionesOrganizador: z.boolean().optional(), comunicacionesPlataforma: z.boolean().optional(),
      }),
    }).parse(req.body);
    return prepararPago(ctx, token, d);
  });
}

/** Cola virtual: si está activa para la función, hace falta un pase válido. */
async function comprobarPaseCola(ctx: Contexto, funcionId: string, pase: string | undefined) {
  const cola = ctx.colaVirtual;
  if (!cola || !(await cola.exigePase(funcionId))) return;
  if (!cola.validarPase(funcionId, pase)) throw new ErrorHttp(403, 'Tu turno en la cola ha caducado. Vuelve a entrar en la cola.', 'sin_pase');
}

