/**
 * Meta (Facebook/Instagram) · API de Conversiones.
 *
 * Al confirmarse un pago se manda a Meta el evento «Purchase» del píxel del organizador, desde el servidor.
 * Lleva el mismo `event_id` que el que dispara el píxel en el navegador (`compra-<código del pedido>`),
 * así Meta los junta y no cuenta la venta dos veces; si el navegador lo bloquea, llega igual por aquí.
 *
 * Solo se envía si el comprador aceptó las cookies de medición. El correo va cifrado con SHA-256
 * (como exige Meta) y la IP, el navegador y las cookies _fbp/_fbc se borran del pedido al terminar.
 */
import type { Contexto } from '../contexto';
import { descifrar, sha256 } from '../infra/cripto';

export const idEventoCompra = (codigoPedido: string) => `compra-${codigoPedido}`;

const hash = (v: string) => sha256(v.trim().toLowerCase());

type Resultado = 'enviado' | 'rechazado' | 'sin_configurar' | 'sin_consentimiento' | 'prueba' | 'ya_enviado' | 'no_pagado';

export async function enviarCompraMeta(ctx: Contexto, pedidoId: string): Promise<Resultado> {
  const p = await ctx.db.one<any>(
    `select p.id, p.codigo, p.estado, p.total_cent, p.comprador_email, p.pagado_en, p.consentimientos, p.meta_atribucion, p.meta_enviado_en,
            f.titulo, f.es_prueba, e.slug as evento_slug, o.meta_pixel_id, o.meta_capi_token_cifrado, o.meta_codigo_prueba,
            (select count(*)::int from lineas_pedido l where l.pedido_id = p.id) as entradas
       from pedidos p join funciones f on f.id = p.funcion_id join eventos e on e.id = f.evento_id join organizadores o on o.id = p.organizador_id
      where p.id = $1`,
    [pedidoId],
  );
  if (!p) return 'no_pagado';
  if (p.meta_enviado_en) return 'ya_enviado';
  const cerrar = async (respuesta: string, enviado = false) => {
    await ctx.db.query(
      `update pedidos set meta_atribucion = null, meta_respuesta = $2, meta_enviado_en = case when $3 then now() else meta_enviado_en end where id = $1`,
      [pedidoId, respuesta.slice(0, 500), enviado],
    );
  };
  if (p.estado !== 'pagado') return 'no_pagado';
  if (!p.meta_pixel_id || !p.meta_capi_token_cifrado) {
    await cerrar('sin configurar');
    return 'sin_configurar';
  }
  if (!p.consentimientos?.medicion || !p.meta_atribucion) {
    await cerrar('sin consentimiento de cookies de medición');
    return 'sin_consentimiento';
  }
  // Las funciones de prueba solo se mandan con el código de prueba (salen en «Probar eventos», no en las estadísticas).
  if (p.es_prueba && !p.meta_codigo_prueba) {
    await cerrar('función de prueba sin código de prueba de Meta');
    return 'prueba';
  }

  const a = p.meta_atribucion as { fbp?: string; fbc?: string; ip?: string; ua?: string };
  const cuerpo = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(new Date(p.pagado_en ?? Date.now()).getTime() / 1000),
        event_id: idEventoCompra(p.codigo),
        action_source: 'website',
        event_source_url: `${ctx.config.URL_PUBLICA}/e/${p.evento_slug}`,
        user_data: {
          ...(p.comprador_email ? { em: [hash(p.comprador_email)] } : {}),
          ...(a.fbp ? { fbp: a.fbp } : {}),
          ...(a.fbc ? { fbc: a.fbc } : {}),
          ...(a.ip ? { client_ip_address: a.ip } : {}),
          ...(a.ua ? { client_user_agent: a.ua } : {}),
        },
        custom_data: {
          currency: 'EUR',
          value: p.total_cent / 100,
          num_items: p.entradas,
          content_type: 'product',
          content_ids: [p.evento_slug],
          content_name: p.titulo,
          order_id: p.codigo,
        },
      },
    ],
    ...(p.meta_codigo_prueba ? { test_event_code: p.meta_codigo_prueba } : {}),
  };

  const token = descifrar(ctx.config.SECRETO_DATOS, p.meta_capi_token_cifrado);
  const r = await fetch(`${ctx.config.META_API_URL}/${p.meta_pixel_id}/events`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  });
  const texto = (await r.text().catch(() => '')).slice(0, 400);
  if (r.ok) {
    await cerrar(`${r.status} ${texto}`, true);
    return 'enviado';
  }
  // 4xx: el token o el píxel están mal; no tiene sentido reintentar. Se apunta y se borran los datos.
  if (r.status >= 400 && r.status < 500 && r.status !== 429) {
    await cerrar(`${r.status} ${texto}`);
    return 'rechazado';
  }
  // 5xx o límite: la cola reintenta (los datos se mantienen hasta entonces).
  await ctx.db.query('update pedidos set meta_respuesta = $2 where id = $1', [pedidoId, `${r.status} ${texto}`]);
  throw new Error(`Meta no ha aceptado la compra: ${r.status}`);
}
