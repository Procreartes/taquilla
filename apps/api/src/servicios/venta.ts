/**
 * Venta: reserva temporal → pago → emisión de entradas.
 *
 * Capas contra la sobreventa:
 *  1. Reserva atómica en el almacén (Redis): todas las butacas pedidas o ninguna.
 *  2. Pedido en PostgreSQL con caducidad; el pago solo se acepta por aviso firmado de la pasarela.
 *  3. Emisión en una transacción: índice único (función, butaca) para entradas vivas y
 *     actualización condicional del aforo general. Si falla, el pedido queda en «conflicto»
 *     y se devuelve el dinero automáticamente.
 */
import { randomUUID } from 'node:crypto';
import { mejorSitio, type Asiento, type ButacaExportada } from '@taquilla/dominio';
import type { Contexto } from '../contexto';
import type { Consultor } from '../db';
import { cifrar, codigoLegible, descifrar, sha256, tokenAleatorio } from '../infra/cripto';
import type { EventoPago } from '../infra/pagos';
import { conflicto, ErrorHttp, invalido, noEncontrado } from '../errores';

export const MINUTOS_PAGO = 31; // Stripe Checkout exige al menos 30 minutos de vida a la sesión

export interface PeticionReserva {
  funcionId: string;
  butacas?: string[];
  cantidad?: number;
  mejorSitio?: { cantidad: number; zona?: string; pmr?: number };
}

/** Función a la venta con todo lo necesario para vender. Lanza si no se puede comprar. */
export async function funcionVendible(c: Consultor, funcionId: string) {
  const f = await c.one<any>(
    `select f.*, o.gastos_gestion_cent, o.max_entradas_pedido, o.impuesto_nombre, o.impuesto_tipo, o.stripe_cuenta_id, o.nombre as organizador_nombre,
            v.butacas as plano_butacas, v.receta->'zonas' as plano_zonas, (v.comprobacion->>'vend')::int as plano_plazas
       from funciones f
       join organizadores o on o.id = f.organizador_id and o.activo
       left join versiones_plano v on v.id = f.version_plano_id
      where f.id = $1 and f.publicada`,
    [funcionId],
  );
  if (!f) throw noEncontrado('Función');
  if (f.estado === 'agotada') throw conflicto('Entradas agotadas', 'agotada');
  if (f.estado !== 'a_la_venta' || f.modo_venta === 'libre' || f.venta_externa_url) throw conflicto('Esta función no está a la venta', 'no_a_la_venta');
  const precios = Object.fromEntries((await c.query('select zona_codigo, precio_cent from precios_funcion where funcion_id = $1', [funcionId])).map((p) => [p.zona_codigo, p.precio_cent as number]));
  return { ...f, precios } as typeof f & { precios: Record<string, number> };
}

/** Butacas no disponibles: vendidas (base de datos) y reservadas (almacén). */
export async function ocupacion(ctx: Contexto, funcionId: string) {
  const vendidas = (await ctx.db.query<{ butaca_codigo: string }>(
    `select butaca_codigo from entradas where funcion_id = $1 and butaca_codigo is not null and estado in ('valida', 'usada')`, [funcionId],
  )).map((r) => r.butaca_codigo);
  const reservadas = await ctx.almacen.butacasReservadas(funcionId);
  return { vendidas, reservadas };
}

const comoAsiento = (b: ButacaExportada): Asiento => ({ ...b, bloque: b.seccion, quitada: false });

export async function crearReserva(ctx: Contexto, p: PeticionReserva) {
  const f = await funcionVendible(ctx.db, p.funcionId);
  const ttl = ctx.config.RESERVA_MINUTOS * 60_000;
  const pedidoId = randomUUID();
  const token = tokenAleatorio(24);
  type Linea = { zona_codigo: string; zona_nombre: string; butaca_codigo: string | null; descripcion: string; tipo_butaca: string; precio_cent: number; gastos_cent: number };
  let lineas: Linea[] = [];

  if (f.modo_venta === 'numerada') {
    const butacas = new Map<string, ButacaExportada>((f.plano_butacas as ButacaExportada[]).map((b) => [b.codigo, b]));
    const zonas = new Map<string, { nombre: string }>((f.plano_zonas as any[]).map((z) => [z.codigo, z]));
    let codigos = [...new Set(p.butacas ?? [])];
    if (p.mejorSitio) {
      const { vendidas, reservadas } = await ocupacion(ctx, f.id);
      const ocupadas = new Set([...vendidas, ...reservadas, ...(await butacasProtocolo(ctx.db, f.id))]);
      const elegidas = mejorSitio([...butacas.values()].map(comoAsiento), (c) => !ocupadas.has(c), p.mejorSitio);
      if (!elegidas) throw conflicto('No quedan tantas butacas juntas en esa zona', 'sin_sitio');
      codigos = elegidas;
    }
    if (!codigos.length) throw invalido('Elige al menos una butaca');
    if (codigos.length > f.max_entradas_pedido) throw invalido(`Como máximo ${f.max_entradas_pedido} entradas por compra`);
    for (const c of codigos) {
      const b = butacas.get(c);
      if (!b) throw invalido(`La butaca ${c} no existe`);
      if (b.bloqueado) throw conflicto(`La butaca ${b.fila} · ${b.numero} no está a la venta`, 'ocupadas', { ocupadas: [c] });
      if (f.precios[b.zona] === undefined) throw conflicto('Esa zona no tiene precio todavía', 'sin_precio');
    }
    const vendidas = await ctx.db.query<{ butaca_codigo: string }>(
      `select butaca_codigo from entradas where funcion_id = $1 and butaca_codigo = any($2::text[]) and estado in ('valida', 'usada')`, [f.id, codigos],
    );
    const protocolo = (await butacasProtocolo(ctx.db, f.id)).filter((c) => codigos.includes(c));
    const ya = [...vendidas.map((v) => v.butaca_codigo), ...protocolo];
    if (ya.length) throw conflicto('Alguna butaca acaba de venderse', 'ocupadas', { ocupadas: ya });
    const r = await ctx.almacen.reservarButacas(f.id, codigos, pedidoId, ttl);
    if (!r.ok) throw conflicto('Alguien acaba de elegir alguna de esas butacas', 'ocupadas', { ocupadas: r.ocupadas });
    lineas = codigos.map((c) => {
      const b = butacas.get(c)!;
      const tipo = b.tipo === 'silla_ruedas' ? 'Espacio PMR' : 'Butaca';
      return {
        zona_codigo: b.zona, zona_nombre: zonas.get(b.zona)?.nombre ?? b.zona, butaca_codigo: c,
        descripcion: `${b.fila} · ${tipo} ${b.numero.replace('PMR ', '')}`, tipo_butaca: b.tipo, precio_cent: f.precios[b.zona], gastos_cent: f.gastos_gestion_cent,
      };
    });
  } else {
    const n = Math.floor(p.cantidad ?? p.mejorSitio?.cantidad ?? 0);
    if (n < 1) throw invalido('Indica cuántas entradas quieres');
    if (n > f.max_entradas_pedido) throw invalido(`Como máximo ${f.max_entradas_pedido} entradas por compra`);
    if (f.precios.general === undefined) throw conflicto('Esta función no tiene precio todavía', 'sin_precio');
    const disponibles = f.aforo - f.vendidas_general;
    const ok = await ctx.almacen.reservarCantidad(f.id, n, pedidoId, ttl, disponibles);
    if (!ok) throw conflicto(disponibles > 0 ? 'No quedan tantas entradas disponibles ahora mismo' : 'Entradas agotadas', 'sin_sitio');
    lineas = Array.from({ length: n }, () => ({
      zona_codigo: 'general', zona_nombre: 'Entrada general', butaca_codigo: null, descripcion: 'Entrada general',
      tipo_butaca: 'normal', precio_cent: f.precios.general, gastos_cent: f.gastos_gestion_cent,
    }));
  }

  const importe = lineas.reduce((s, l) => s + l.precio_cent, 0), gastos = lineas.reduce((s, l) => s + l.gastos_cent, 0);
  try {
    await ctx.db.tx(async (t) => {
      const codigo = await codigoUnico(t, 'pedidos', 'PED-', 6);
      await t.query(
        `insert into pedidos (id, organizador_id, funcion_id, codigo, token_hash, token_cifrado, estado, expira_en, importe_entradas_cent, gastos_cent, total_cent, impuesto_nombre, impuesto_tipo)
         values ($1, $2, $3, $4, $5, $6, 'reserva', now() + make_interval(secs => $7), $8, $9, $10, $11, $12)`,
        [pedidoId, f.organizador_id, f.id, codigo, sha256(token), cifrar(ctx.config.SECRETO_DATOS, token), ttl / 1000, importe, gastos, importe + gastos, f.impuesto_nombre, f.impuesto_tipo],
      );
      for (const l of lineas) {
        await t.query(
          `insert into lineas_pedido (pedido_id, zona_codigo, zona_nombre, butaca_codigo, descripcion, tipo_butaca, precio_cent, gastos_cent) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [pedidoId, l.zona_codigo, l.zona_nombre, l.butaca_codigo, l.descripcion, l.tipo_butaca, l.precio_cent, l.gastos_cent],
        );
      }
    });
  } catch (e) {
    await liberarReserva(ctx, f.id, pedidoId, lineas.map((l) => l.butaca_codigo));
    throw e;
  }
  return { token, ...(await resumenPedido(ctx.db, pedidoId)) };
}

async function butacasProtocolo(c: Consultor, funcionId: string): Promise<string[]> {
  const hay = await c.one(`select to_regclass('public.bloqueos_protocolo') is not null as hay`);
  if (!hay?.hay) return [];
  return (await c.query<{ butaca_codigo: string }>(`select butaca_codigo from bloqueos_protocolo where funcion_id = $1 and activo`, [funcionId])).map((r) => r.butaca_codigo);
}

export async function codigoUnico(c: Consultor, tabla: 'pedidos' | 'entradas', prefijo: string, n: number) {
  for (let i = 0; i < 10; i++) {
    const codigo = prefijo + codigoLegible(n);
    if (!(await c.one(`select 1 from ${tabla} where codigo = $1`, [codigo]))) return codigo;
  }
  throw new Error('No se pudo generar un código único');
}

async function liberarReserva(ctx: Contexto, funcionId: string, pedidoId: string, butacas: (string | null)[]) {
  const codigos = butacas.filter((b): b is string => !!b);
  if (codigos.length) await ctx.almacen.liberarButacas(funcionId, codigos, pedidoId);
  else await ctx.almacen.liberarCantidad(funcionId, pedidoId);
}

export async function pedidoPorToken(c: Consultor, token: string) {
  if (!token || token.length > 100) throw noEncontrado('Pedido');
  const p = await c.one<{ id: string }>('select id from pedidos where token_hash = $1', [sha256(token)]);
  if (!p) throw noEncontrado('Pedido');
  return p.id;
}

/** Datos del pedido para el cliente (sin datos internos). */
export async function resumenPedido(c: Consultor, pedidoId: string) {
  const p = await c.one<any>(
    `select p.id, p.codigo, p.estado, p.expira_en, p.importe_entradas_cent, p.gastos_cent, p.total_cent, p.impuesto_nombre, p.impuesto_tipo,
            p.comprador_nombre, p.comprador_email, p.numero_factura, p.pagado_en, p.idioma, p.pasarela, p.pago_url,
            f.id as funcion_id, f.titulo, f.fecha, to_char(f.hora, 'HH24:MI') as hora, f.es_prueba, f.modo_venta,
            r.nombre as recinto_nombre, r.municipio, r.isla, e.nombre as evento_nombre, e.slug as evento_slug,
            o.nombre as organizador_nombre, o.razon_social as organizador_razon_social, o.cif as organizador_cif, o.direccion_fiscal as organizador_direccion
       from pedidos p join funciones f on f.id = p.funcion_id join recintos r on r.id = f.recinto_id
       join eventos e on e.id = f.evento_id join organizadores o on o.id = p.organizador_id
      where p.id = $1`,
    [pedidoId],
  );
  if (!p) throw noEncontrado('Pedido');
  const lineas = await c.query('select id, zona_codigo, zona_nombre, butaca_codigo, descripcion, tipo_butaca, precio_cent, gastos_cent from lineas_pedido where pedido_id = $1 order by descripcion', [pedidoId]);
  const entradas = p.estado === 'pagado' || p.estado.startsWith('devuelto')
    ? await c.query('select id, codigo, butaca_codigo, zona_codigo, descripcion, tipo_butaca, precio_cent, estado, usada_en from entradas where pedido_id = $1 order by descripcion', [pedidoId])
    : [];
  return { ...p, lineas, entradas };
}

export interface DatosComprador {
  nombre: string;
  email: string;
  telefono?: string | null;
  codigoPostal?: string | null;
  pais?: string | null;
  municipio?: string | null;
  isla?: string | null;
  idioma: string;
  consentimientos: { condiciones: boolean; privacidad: boolean; comunicacionesOrganizador?: boolean; comunicacionesPlataforma?: boolean };
}

/** Guarda los datos del comprador, alarga la reserva y abre la sesión de pago. */
export async function prepararPago(ctx: Contexto, token: string, d: DatosComprador) {
  if (!d.consentimientos.condiciones || !d.consentimientos.privacidad) throw invalido('Para comprar tienes que aceptar las condiciones de compra y la política de privacidad');
  const pedidoId = await pedidoPorToken(ctx.db, token);
  const p = await ctx.db.one<any>(
    `select p.*, o.stripe_cuenta_id, f.titulo from pedidos p join organizadores o on o.id = p.organizador_id join funciones f on f.id = p.funcion_id where p.id = $1`, [pedidoId],
  );
  if (p.estado === 'pago' && p.pago_url && new Date(p.expira_en) > new Date()) return { url: p.pago_url as string };
  if (p.estado !== 'reserva') throw conflicto('Este pedido ya no se puede pagar', 'pedido_cerrado', { estado: p.estado });
  if (new Date(p.expira_en) <= new Date()) {
    await caducarPedido(ctx, pedidoId);
    throw conflicto('Se acabó el tiempo de la reserva. Vuelve a elegir tus entradas.', 'reserva_caducada');
  }
  const lineas = await ctx.db.query('select butaca_codigo, descripcion, zona_nombre, precio_cent, gastos_cent from lineas_pedido where pedido_id = $1', [pedidoId]);
  const butacas = lineas.map((l) => l.butaca_codigo).filter(Boolean) as string[];
  const ttl = MINUTOS_PAGO * 60_000;
  const sigue = butacas.length
    ? await ctx.almacen.renovarButacas(p.funcion_id, butacas, pedidoId, ttl)
    : await ctx.almacen.renovarCantidad(p.funcion_id, pedidoId, ttl);
  if (!sigue) {
    await caducarPedido(ctx, pedidoId);
    throw conflicto('Se acabó el tiempo de la reserva. Vuelve a elegir tus entradas.', 'reserva_caducada');
  }
  const caducaEn = new Date(Date.now() + ttl - 30_000);
  const gastos = lineas.reduce((s, l) => s + l.gastos_cent, 0);
  const urlBase = ctx.config.URL_PUBLICA;
  const sesion = await ctx.pasarela.crearSesion({
    pedidoId, codigoPedido: p.codigo, totalCent: p.total_cent, comisionPlataformaCent: gastos, cuentaConectada: p.stripe_cuenta_id,
    email: d.email, idioma: d.idioma, caducaEn,
    lineas: [
      ...agrupar(lineas.map((l) => ({ descripcion: `${p.titulo} · ${l.zona_nombre}`, precio: l.precio_cent }))),
      ...(gastos ? [{ descripcion: 'Gastos de gestión', cantidad: lineas.length, importeUnitarioCent: lineas[0].gastos_cent }] : []),
    ],
    urlOk: `${urlBase}/pedido/${token}?pago=ok`,
    urlCancelar: `${urlBase}/pedido/${token}?pago=cancelado`,
  });
  await ctx.db.query(
    `update pedidos set estado = 'pago', expira_en = $2, comprador_nombre = $3, comprador_email = $4, comprador_telefono = $5, codigo_postal = $6,
            pais = $7, municipio = $8, isla = $9, idioma = $10, consentimientos = $11, pasarela = $12, pago_sesion_id = $13, pago_url = $14,
            cuenta_conectada = $15, actualizado_en = now()
      where id = $1`,
    [pedidoId, new Date(Date.now() + ttl), d.nombre, d.email.toLowerCase(), d.telefono ?? null, d.codigoPostal ?? null, d.pais ?? null, d.municipio ?? null,
      d.isla ?? null, d.idioma, JSON.stringify({ ...d.consentimientos, fecha: new Date().toISOString() }), ctx.pasarela.nombre, sesion.id, sesion.url, p.stripe_cuenta_id],
  );
  return { url: sesion.url };
}

function agrupar(xs: { descripcion: string; precio: number }[]) {
  const m = new Map<string, { descripcion: string; cantidad: number; importeUnitarioCent: number }>();
  for (const x of xs) {
    const k = x.descripcion + '|' + x.precio;
    const v = m.get(k) ?? { descripcion: x.descripcion, cantidad: 0, importeUnitarioCent: x.precio };
    v.cantidad++;
    m.set(k, v);
  }
  return [...m.values()];
}

/** El cliente abandona: se libera la reserva al momento. */
export async function cancelarReserva(ctx: Contexto, token: string) {
  const pedidoId = await pedidoPorToken(ctx.db, token);
  await caducarPedido(ctx, pedidoId, 'cancelado');
}

/** Marca el pedido como caducado/cancelado (si aún no está pagado) y libera sus plazas. */
export async function caducarPedido(ctx: Contexto, pedidoId: string, estado: 'caducado' | 'cancelado' = 'caducado') {
  const p = await ctx.db.one<any>(
    `update pedidos set estado = $2, actualizado_en = now() where id = $1 and estado in ('reserva', 'pago')
     returning funcion_id, pago_sesion_id, cuenta_conectada`,
    [pedidoId, estado],
  );
  if (!p) return;
  const butacas = (await ctx.db.query('select butaca_codigo from lineas_pedido where pedido_id = $1', [pedidoId])).map((l) => l.butaca_codigo);
  await liberarReserva(ctx, p.funcion_id, pedidoId, butacas);
  if (p.pago_sesion_id) await ctx.pasarela.caducarSesion(p.pago_sesion_id, p.cuenta_conectada).catch(() => {});
}

/** Barre los pedidos cuya reserva ha caducado. */
export async function caducarPedidosVencidos(ctx: Contexto) {
  const vencidos = await ctx.db.query<{ id: string }>(`select id from pedidos where estado in ('reserva', 'pago') and expira_en < now() limit 500`);
  for (const v of vencidos) await caducarPedido(ctx, v.id);
  return vencidos.length;
}

// ------------------------------------------------------------------------------------------------
// Avisos de la pasarela

export async function procesarEventoPago(ctx: Contexto, proveedor: string, ev: EventoPago) {
  const resultado = await ctx.db.tx(async (t) => {
    const nuevo = await t.one(
      `insert into eventos_pago (proveedor, evento_id, tipo, pedido_id, datos) values ($1, $2, $3, $4, $5)
       on conflict do nothing returning evento_id`,
      [proveedor, ev.id, ev.tipo, 'pedidoId' in ev ? ev.pedidoId : null, JSON.stringify(ev)],
    );
    if (!nuevo) return { duplicado: true as const };
    if (ev.tipo === 'pago_completado') return { emision: await emitir(t, ev) };
    if (ev.tipo === 'cuenta_actualizada') {
      await t.query(`update organizadores set stripe_estado = $2 where stripe_cuenta_id = $1`, [ev.cuentaId, ev.activa ? 'activa' : 'pendiente']);
    }
    return { ok: true as const };
  });
  if ('emision' in resultado && resultado.emision) await despuesDeEmitir(ctx, resultado.emision);
  if (ev.tipo === 'sesion_caducada') {
    const p = await ctx.db.one('select id from pedidos where id = $1 and pago_sesion_id = $2', [ev.pedidoId, ev.sesionId]);
    if (p) await caducarPedido(ctx, p.id);
  }
  return resultado;
}

type ResultadoEmision = { pedidoId: string; resultado: 'emitido' | 'ya_emitido' | 'conflicto'; funcionId: string; agotada?: boolean; motivo?: string };

/** Emite las entradas de un pedido pagado, dentro de la transacción del aviso de pago. */
async function emitir(t: Consultor, ev: Extract<EventoPago, { tipo: 'pago_completado' }>): Promise<ResultadoEmision> {
  const p = await t.one<any>(`select * from pedidos where id = $1 for update`, [ev.pedidoId]);
  if (!p) throw new ErrorHttp(404, `Aviso de pago para un pedido desconocido (${ev.pedidoId})`, 'pedido_desconocido');
  if (p.pago_sesion_id && p.pago_sesion_id !== ev.sesionId) throw new ErrorHttp(409, 'El aviso no corresponde a la sesión de pago del pedido', 'sesion_distinta');
  if (['pagado', 'devuelto', 'devuelto_parcial'].includes(p.estado)) return { pedidoId: p.id, resultado: 'ya_emitido', funcionId: p.funcion_id };
  await t.query(`update pedidos set pago_id = $2, comision_pasarela_cent = $3, actualizado_en = now() where id = $1`, [p.id, ev.pagoId, ev.comisionPasarelaCent ?? null]);
  const conflictoPedido = async (motivo: string): Promise<ResultadoEmision> => {
    await t.query(`update pedidos set estado = 'conflicto', notas = $2 where id = $1`, [p.id, motivo]);
    await t.query(
      `insert into devoluciones (organizador_id, pedido_id, importe_cent, gastos_devueltos_cent, motivo) values ($1, $2, $3, $4, $5)`,
      [p.organizador_id, p.id, ev.importeCent, p.gastos_cent, motivo],
    );
    return { pedidoId: p.id, resultado: 'conflicto', funcionId: p.funcion_id, motivo };
  };
  if (ev.importeCent !== p.total_cent) return conflictoPedido(`El importe cobrado (${ev.importeCent}) no coincide con el del pedido (${p.total_cent})`);

  const f = await t.one<any>(`select modo_venta, aforo, (select (comprobacion->>'vend')::int from versiones_plano where id = funciones.version_plano_id) as plazas from funciones where id = $1`, [p.funcion_id]);
  const lineas = await t.query('select * from lineas_pedido where pedido_id = $1', [p.id]);
  let agotada = false;
  if (f.modo_venta === 'numerada') {
    let emitidas = 0;
    for (const l of lineas) {
      const codigo = await codigoUnico(t, 'entradas', 'TKT-', 8);
      const r = await t.one(
        `insert into entradas (organizador_id, pedido_id, linea_id, funcion_id, codigo, butaca_codigo, zona_codigo, descripcion, tipo_butaca, precio_cent, gastos_cent, titular_nombre)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (funcion_id, butaca_codigo) where butaca_codigo is not null and estado in ('valida', 'usada') do nothing
         returning id`,
        [p.organizador_id, p.id, l.id, p.funcion_id, codigo, l.butaca_codigo, l.zona_codigo, l.descripcion, l.tipo_butaca, l.precio_cent, l.gastos_cent, p.comprador_nombre],
      );
      if (r) emitidas++;
    }
    if (emitidas < lineas.length) {
      await t.query('delete from entradas where pedido_id = $1', [p.id]);
      return conflictoPedido('Alguna butaca se vendió a otra persona mientras se pagaba (la reserva había caducado)');
    }
    const vivas = await t.one<{ n: number }>(`select count(*)::int as n from entradas where funcion_id = $1 and estado in ('valida', 'usada')`, [p.funcion_id]);
    agotada = !!f.plazas && vivas!.n >= f.plazas;
  } else {
    const r = await t.one<{ vendidas_general: number }>(
      `update funciones set vendidas_general = vendidas_general + $2 where id = $1 and vendidas_general + $2 <= aforo returning vendidas_general`,
      [p.funcion_id, lineas.length],
    );
    if (!r) return conflictoPedido('No quedaban plazas cuando se completó el pago (la reserva había caducado)');
    for (const l of lineas) {
      const codigo = await codigoUnico(t, 'entradas', 'TKT-', 8);
      await t.query(
        `insert into entradas (organizador_id, pedido_id, linea_id, funcion_id, codigo, zona_codigo, descripcion, tipo_butaca, precio_cent, gastos_cent, titular_nombre)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [p.organizador_id, p.id, l.id, p.funcion_id, codigo, l.zona_codigo, l.descripcion, l.tipo_butaca, l.precio_cent, l.gastos_cent, p.comprador_nombre],
      );
    }
    agotada = r.vendidas_general >= f.aforo;
  }
  // Factura simplificada con numeración correlativa por organizador y año
  const anio = new Date().getFullYear();
  const serie = await t.one<{ ultimo: number }>(
    `insert into series_factura (organizador_id, serie, ultimo) values ($1, $2, 1)
     on conflict (organizador_id, serie) do update set ultimo = series_factura.ultimo + 1 returning ultimo`,
    [p.organizador_id, String(anio)],
  );
  const org = await t.one<{ slug: string }>('select slug from organizadores where id = $1', [p.organizador_id]);
  const numero = `${org!.slug.slice(0, 6).toUpperCase()}-${anio}-${String(serie!.ultimo).padStart(6, '0')}`;
  await t.query(
    `update pedidos set estado = 'pagado', pagado_en = now(), numero_factura = $2, facturado_en = now(), expira_en = null, actualizado_en = now() where id = $1`,
    [p.id, numero],
  );
  if (agotada) await t.query(`update funciones set estado = 'agotada' where id = $1 and estado = 'a_la_venta'`, [p.funcion_id]);
  return { pedidoId: p.id, resultado: 'emitido', funcionId: p.funcion_id, agotada };
}

async function despuesDeEmitir(ctx: Contexto, e: ResultadoEmision) {
  if (e.resultado === 'ya_emitido') return;
  const butacas = (await ctx.db.query('select butaca_codigo from lineas_pedido where pedido_id = $1', [e.pedidoId])).map((l) => l.butaca_codigo);
  await liberarReserva(ctx, e.funcionId, e.pedidoId, butacas);
  if (e.resultado === 'emitido') {
    await ctx.colas.encolar('correo.confirmacion', { pedidoId: e.pedidoId });
    await ctx.colas.encolar('webhook.saliente', { tipo: 'venta', pedidoId: e.pedidoId }).catch(() => {});
    if (e.agotada) await ctx.colas.encolar('webhook.saliente', { tipo: 'agotado', funcionId: e.funcionId }).catch(() => {});
  } else {
    await ctx.colas.encolar('pago.devolver_pendientes', { pedidoId: e.pedidoId });
    await ctx.colas.encolar('correo.conflicto', { pedidoId: e.pedidoId });
  }
}

/** Ejecuta en la pasarela las devoluciones pendientes de un pedido. */
export async function ejecutarDevolucionesPendientes(ctx: Contexto, pedidoId: string) {
  const pendientes = await ctx.db.query(
    `select d.id, d.importe_cent, d.motivo, p.pago_id, p.cuenta_conectada from devoluciones d join pedidos p on p.id = d.pedido_id
      where d.pedido_id = $1 and d.estado = 'pendiente'`,
    [pedidoId],
  );
  for (const d of pendientes) {
    try {
      if (!d.pago_id) throw new Error('El pedido no tiene identificador de pago');
      const r = await ctx.pasarela.devolver({ pagoId: d.pago_id, importeCent: d.importe_cent, cuentaConectada: d.cuenta_conectada, motivo: d.motivo, claveIdempotencia: `devolucion-${d.id}` });
      await ctx.db.query(`update devoluciones set estado = 'hecha', pasarela_id = $2, hecha_en = now() where id = $1`, [d.id, r.id]);
    } catch (e) {
      await ctx.db.query(`update devoluciones set estado = 'fallida', error = $2 where id = $1`, [d.id, (e as Error).message.slice(0, 500)]);
      throw e;
    }
  }
  const p = await ctx.db.one<any>(
    `select p.estado, p.total_cent, coalesce(sum(d.importe_cent) filter (where d.estado = 'hecha'), 0)::int as devuelto
       from pedidos p left join devoluciones d on d.pedido_id = p.id where p.id = $1 group by p.id`,
    [pedidoId],
  );
  if (p && p.devuelto > 0) {
    const estado = p.devuelto >= p.total_cent ? 'devuelto' : 'devuelto_parcial';
    if (p.estado !== 'conflicto' || estado === 'devuelto') await ctx.db.query(`update pedidos set estado = $2, actualizado_en = now() where id = $1`, [pedidoId, estado]);
  }
}

/** Enlace privado del pedido (para correos). */
export async function enlacePedido(ctx: Contexto, pedidoId: string) {
  const r = await ctx.db.one<{ token_cifrado: string }>('select token_cifrado from pedidos where id = $1', [pedidoId]);
  return `${ctx.config.URL_PUBLICA}/pedido/${descifrar(ctx.config.SECRETO_DATOS, r!.token_cifrado)}`;
}
