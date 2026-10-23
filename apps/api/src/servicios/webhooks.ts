/**
 * Webhooks salientes para n8n (u otra herramienta): venta, agotado, devolución y 90 % de aforo.
 * Cada envío va firmado: cabecera `X-Taquilla-Firma: t=<segundos>,v1=<HMAC-SHA256(secreto, t + "." + cuerpo)>`.
 * No incluye datos personales del comprador salvo el correo si el organizador lo activa (no por defecto).
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Contexto } from '../contexto';
import { descifrar, hmac } from '../infra/cripto';

export const EVENTOS_WEBHOOK = ['venta', 'agotado', 'devolucion', 'aforo_90'] as const;
export type EventoWebhook = (typeof EVENTOS_WEBHOOK)[number];

const PRIVADA = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i];

/** En producción: solo https y nunca direcciones privadas (evita SSRF hacia la red interna). */
export async function urlPermitida(url: string, produccion: boolean): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'La dirección no es válida';
  }
  if (!['https:', 'http:'].includes(u.protocol)) return 'Solo direcciones http(s)';
  if (!produccion) return null;
  if (u.protocol !== 'https:') return 'En producción los webhooks tienen que ser https';
  const ips = isIP(u.hostname) ? [u.hostname] : (await lookup(u.hostname, { all: true }).catch(() => [])).map((x) => x.address);
  if (!ips.length) return 'No se encuentra ese dominio';
  if (ips.some((ip) => PRIVADA.some((r) => r.test(ip)))) return 'No se permiten direcciones de redes privadas';
  return null;
}

export function firmar(secreto: string, cuerpo: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${hmac(secreto, `${t}.${cuerpo}`).toString('hex')}`;
}

async function datosEvento(ctx: Contexto, d: { tipo: EventoWebhook; pedidoId?: string; funcionId?: string; importe?: number }) {
  const funcionId = d.funcionId ?? (await ctx.db.one<{ funcion_id: string }>('select funcion_id from pedidos where id = $1', [d.pedidoId]))?.funcion_id;
  if (!funcionId) return null;
  const f = await ctx.db.one<any>(
    `select f.id, f.organizador_id, f.codigo, f.titulo, f.fecha, to_char(f.hora, 'HH24:MI') as hora, f.estado, f.es_prueba, r.nombre as recinto, e.slug as evento,
            coalesce((v.comprobacion->>'vend')::int, f.aforo) as plazas,
            (select count(*)::int from entradas en where en.funcion_id = f.id and en.estado in ('valida', 'usada')) as ocupadas
       from funciones f join recintos r on r.id = f.recinto_id join eventos e on e.id = f.evento_id left join versiones_plano v on v.id = f.version_plano_id
      where f.id = $1`,
    [funcionId],
  );
  if (!f) return null;
  const pedido = d.pedidoId
    ? await ctx.db.one<any>(`select codigo, canal, total_cent, gastos_cent, (select count(*)::int from entradas e where e.pedido_id = p.id) as entradas from pedidos p where id = $1`, [d.pedidoId])
    : null;
  const { organizador_id, ...funcion } = f;
  return {
    organizadorId: organizador_id as string,
    cuerpo: {
      evento: d.tipo,
      enviado_en: new Date().toISOString(),
      prueba: f.es_prueba,
      funcion: { ...funcion, ocupacion: f.plazas ? Math.round((f.ocupadas / f.plazas) * 1000) / 10 : null },
      ...(pedido ? { pedido } : {}),
      ...(d.importe !== undefined ? { importe_devuelto_cent: d.importe } : {}),
    },
  };
}

/** Prepara las entregas a cada webhook suscrito y comprueba el 90 % de aforo tras una venta. */
export async function encolarWebhooks(ctx: Contexto, d: { tipo: EventoWebhook; pedidoId?: string; funcionId?: string; importe?: number }) {
  const ev = await datosEvento(ctx, d);
  if (!ev) return;
  const hooks = await ctx.db.query<{ id: string }>(`select id from webhooks where organizador_id = $1 and activo and $2 = any(eventos)`, [ev.organizadorId, d.tipo]);
  for (const h of hooks) {
    const e = await ctx.db.one<{ id: number }>(`insert into entregas_webhook (webhook_id, evento, cuerpo) values ($1, $2, $3) returning id`, [h.id, d.tipo, JSON.stringify(ev.cuerpo)]);
    await ctx.colas.encolar('webhook.entregar', { entregaId: e!.id });
  }
  if (d.tipo === 'venta') {
    const f = ev.cuerpo.funcion;
    if (f.ocupacion !== null && f.ocupacion >= 90) {
      const primera = await ctx.db.one(`update funciones set aviso_90_enviado = true where id = $1 and not aviso_90_enviado returning id`, [f.id]);
      if (primera) await encolarWebhooks(ctx, { tipo: 'aforo_90', funcionId: f.id });
    }
  }
}

/** Entrega con reintentos (los hace la cola). */
export async function entregarWebhook(ctx: Contexto, entregaId: number) {
  const e = await ctx.db.one<any>(
    `select e.id, e.cuerpo, e.estado, w.url, w.secreto_cifrado from entregas_webhook e join webhooks w on w.id = e.webhook_id where e.id = $1`, [entregaId],
  );
  if (!e || e.estado === 'entregado') return;
  const cuerpo = JSON.stringify(e.cuerpo);
  const error = await urlPermitida(e.url, ctx.config.NODE_ENV === 'production');
  let ok = false, respuesta = error ?? '';
  if (!error) {
    try {
      const r = await fetch(e.url, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
        headers: { 'content-type': 'application/json', 'user-agent': 'Taquilla-Webhooks/1', 'x-taquilla-evento': e.cuerpo.evento, 'x-taquilla-firma': firmar(descifrar(ctx.config.SECRETO_DATOS, e.secreto_cifrado), cuerpo) },
        body: cuerpo,
      });
      ok = r.status >= 200 && r.status < 300;
      respuesta = `${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`;
    } catch (err) {
      respuesta = (err as Error).message.slice(0, 300);
    }
  }
  await ctx.db.query(
    `update entregas_webhook set intentos = intentos + 1, respuesta = $2, estado = $3, entregado_en = case when $3 = 'entregado' then now() else entregado_en end where id = $1`,
    [entregaId, respuesta, ok ? 'entregado' : 'fallido'],
  );
  if (!ok && !error) throw new Error(`Webhook no entregado: ${respuesta}`);
}
