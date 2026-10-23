/**
 * Devoluciones, cancelación de funciones, invitaciones y protocolo.
 */
import type { Contexto } from '../contexto';
import type { Consultor } from '../db';
import { auditar } from '../auditoria';
import { conflicto, invalido, noEncontrado } from '../errores';
import { codigoUnico } from './venta';
import { cifrar, sha256, tokenAleatorio } from '../infra/cripto';
import { randomUUID } from 'node:crypto';

/** Devuelve entradas de un pedido (todas o algunas). Libera las plazas al momento. */
export async function devolverEntradas(
  t: Consultor,
  o: { organizadorId: string; usuarioId: string | null; pedidoId: string; entradas?: string[]; incluirGastos: boolean; motivo: string; ip?: string },
) {
  const p = await t.one<any>(`select * from pedidos where id = $1 and organizador_id = $2 for update`, [o.pedidoId, o.organizadorId]);
  if (!p) throw noEncontrado('Pedido');
  if (!['pagado', 'devuelto_parcial'].includes(p.estado)) throw conflicto('Este pedido no tiene entradas que devolver');
  const vivas = await t.query<any>(`select id, precio_cent, gastos_cent, butaca_codigo, tipo_entrada from entradas where pedido_id = $1 and estado = 'valida'`, [p.id]);
  const elegidas = o.entradas?.length ? vivas.filter((e) => o.entradas!.includes(e.id)) : vivas;
  if (!elegidas.length) throw invalido('No hay entradas válidas (sin usar) que devolver en ese pedido');
  if (o.entradas?.length && elegidas.length !== o.entradas.length) throw invalido('Alguna entrada no es de este pedido o ya está usada o devuelta');
  const importe = elegidas.reduce((s, e) => s + e.precio_cent + (o.incluirGastos ? e.gastos_cent : 0), 0);
  const gastos = o.incluirGastos ? elegidas.reduce((s, e) => s + e.gastos_cent, 0) : 0;
  await t.query(`update entradas set estado = 'devuelta' where id = any($1::uuid[])`, [elegidas.map((e) => e.id)]);
  const f = await t.one<any>('select modo_venta, estado from funciones where id = $1 for update', [p.funcion_id]);
  if (f.modo_venta === 'general') await t.query('update funciones set vendidas_general = greatest(vendidas_general - $2, 0) where id = $1', [p.funcion_id, elegidas.length]);
  if (f.estado === 'agotada') await t.query(`update funciones set estado = 'a_la_venta' where id = $1`, [p.funcion_id]);
  if (importe > 0) {
    for (const e of elegidas) {
      await t.query(
        `insert into devoluciones (organizador_id, pedido_id, entrada_id, importe_cent, gastos_devueltos_cent, motivo, usuario_id) values ($1, $2, $3, $4, $5, $6, $7)`,
        [o.organizadorId, p.id, e.id, e.precio_cent + (o.incluirGastos ? e.gastos_cent : 0), o.incluirGastos ? e.gastos_cent : 0, o.motivo, o.usuarioId],
      );
    }
  }
  const quedan = vivas.length - elegidas.length + (await t.one<{ n: number }>(`select count(*)::int as n from entradas where pedido_id = $1 and estado = 'usada'`, [p.id]))!.n;
  if (importe === 0) await t.query(`update pedidos set estado = $2 where id = $1`, [p.id, quedan ? 'devuelto_parcial' : 'devuelto']);
  await auditar(t, { organizadorId: o.organizadorId, usuarioId: o.usuarioId, accion: 'pedido.devolver', entidad: 'pedido', entidadId: p.id, datos: { entradas: elegidas.length, importe, gastos, motivo: o.motivo }, ip: o.ip });
  return { pedidoId: p.id, entradas: elegidas.length, importe };
}

/** Cancela una función: deja de vender y programa la devolución de todos sus pedidos (con gastos). */
export async function cancelarFuncion(ctx: Contexto, o: { organizadorId: string; usuarioId: string; funcionId: string; motivo: string; ip?: string }) {
  const pedidos = await ctx.db.tx(async (t) => {
    const f = await t.one<any>('select estado from funciones where id = $1 and organizador_id = $2 for update', [o.funcionId, o.organizadorId]);
    if (!f) throw noEncontrado('Función');
    if (f.estado === 'cancelada') throw conflicto('La función ya está cancelada');
    await t.query(`update funciones set estado = 'cancelada', cancelada_en = now(), motivo_cancelacion = $2 where id = $1`, [o.funcionId, o.motivo]);
    await t.query(`update bloqueos_protocolo set activo = false where funcion_id = $1`, [o.funcionId]);
    await auditar(t, { organizadorId: o.organizadorId, usuarioId: o.usuarioId, accion: 'funcion.cancelar', entidad: 'funcion', entidadId: o.funcionId, datos: { motivo: o.motivo }, ip: o.ip });
    return t.query<{ id: string }>(`select id from pedidos where funcion_id = $1 and estado in ('pagado', 'devuelto_parcial')`, [o.funcionId]);
  });
  // Se cancelan también las reservas en curso
  const enCurso = await ctx.db.query<{ id: string }>(`select id from pedidos where funcion_id = $1 and estado in ('reserva', 'pago')`, [o.funcionId]);
  const { caducarPedido } = await import('./venta');
  for (const p of enCurso) await caducarPedido(ctx, p.id, 'cancelado');
  for (const p of pedidos) await ctx.colas.encolar('funcion.devolver_pedido', { organizadorId: o.organizadorId, usuarioId: o.usuarioId, pedidoId: p.id, motivo: `Cancelación de la función: ${o.motivo}` });
  return { pedidos: pedidos.length };
}

// ------------------------------------------------------------------------------------------------
// Invitaciones, acreditaciones y protocolo

export interface Invitacion {
  nombre: string;
  email?: string | null;
  tipo: 'invitacion' | 'acreditacion';
  butacas?: string[];
  cantidad?: number;
  nota?: string | null;
  enviar?: boolean;
}

/** Emite entradas de 0 € (invitaciones o acreditaciones) como un pedido del canal «invitación». */
export async function emitirInvitacion(ctx: Contexto, o: { organizadorId: string; usuarioId: string; funcionId: string; ip?: string } & Invitacion) {
  const token = tokenAleatorio(24);
  const pedidoId = randomUUID();
  const r = await ctx.db.tx(async (t) => {
    const f = await t.one<any>(
      `select f.*, v.butacas as plano_butacas, v.receta->'zonas' as zonas, o.slug from funciones f join organizadores o on o.id = f.organizador_id
         left join versiones_plano v on v.id = f.version_plano_id where f.id = $1 and f.organizador_id = $2 for update of f`,
      [o.funcionId, o.organizadorId],
    );
    if (!f) throw noEncontrado('Función');
    if (['cancelada', 'finalizada'].includes(f.estado) || f.modo_venta === 'libre') throw conflicto('En esta función no se pueden emitir invitaciones');
    type L = { zona: string; butaca: string | null; desc: string; tipo: string };
    let lineas: L[];
    if (f.modo_venta === 'numerada') {
      const butacas = new Map<string, any>((f.plano_butacas as any[]).map((b) => [b.codigo, b]));
      const cods = [...new Set(o.butacas ?? [])];
      if (!cods.length) throw invalido('Elige las butacas de la invitación');
      for (const c of cods) if (!butacas.has(c)) throw invalido(`La butaca ${c} no existe`);
      const reservadas = new Set(await ctx.almacen.butacasReservadas(f.id));
      const ocupadas = cods.filter((c) => reservadas.has(c));
      if (ocupadas.length) throw conflicto('Alguna butaca está reservada ahora mismo por un comprador', 'ocupadas', { ocupadas });
      lineas = cods.map((c) => {
        const b = butacas.get(c);
        return { zona: b.zona, butaca: c, desc: `${b.fila} · ${b.tipo === 'silla_ruedas' ? 'Espacio PMR' : 'Butaca'} ${String(b.numero).replace('PMR ', '')}`, tipo: b.tipo };
      });
      // la butaca de protocolo reservada para esa persona se convierte en su invitación
      await t.query(`update bloqueos_protocolo set activo = false where funcion_id = $1 and butaca_codigo = any($2::text[]) and activo`, [f.id, cods]);
    } else {
      const n = Math.floor(o.cantidad ?? 1);
      if (n < 1 || n > 50) throw invalido('Entre 1 y 50 invitaciones');
      const r = await t.one(`update funciones set vendidas_general = vendidas_general + $2 where id = $1 and (aforo is null or vendidas_general + $2 <= aforo) returning id`, [f.id, n]);
      if (!r) throw conflicto('No quedan plazas para tantas invitaciones');
      lineas = Array.from({ length: n }, () => ({ zona: 'general', butaca: null, desc: o.tipo === 'acreditacion' ? 'Acreditación' : 'Invitación', tipo: 'normal' }));
    }
    const codigo = await codigoUnico(t, 'pedidos', 'INV-', 6);
    await t.query(
      `insert into pedidos (id, organizador_id, funcion_id, codigo, token_hash, token_cifrado, estado, canal, comprador_nombre, comprador_email, consentimientos, pagado_en, notas)
       values ($1, $2, $3, $4, $5, $6, 'pagado', 'invitacion', $7, $8, '{}', now(), $9)`,
      [pedidoId, o.organizadorId, f.id, codigo, sha256(token), cifrar(ctx.config.SECRETO_DATOS, token), o.nombre, o.email?.toLowerCase() ?? null, o.nota ?? null],
    );
    for (const l of lineas) {
      const lin = await t.one<{ id: string }>(
        `insert into lineas_pedido (pedido_id, zona_codigo, zona_nombre, butaca_codigo, descripcion, tipo_butaca, precio_cent, gastos_cent) values ($1, $2, $2, $3, $4, $5, 0, 0) returning id`,
        [pedidoId, l.zona, l.butaca, l.desc, l.tipo],
      );
      const cod = await codigoUnico(t, 'entradas', 'TKT-', 8);
      const ok = await t.one(
        `insert into entradas (organizador_id, pedido_id, linea_id, funcion_id, codigo, butaca_codigo, zona_codigo, descripcion, tipo_butaca, precio_cent, gastos_cent, titular_nombre, tipo_entrada, notas)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, $10, $11, $12)
         on conflict (funcion_id, butaca_codigo) where butaca_codigo is not null and estado in ('valida', 'usada') do nothing returning id`,
        [o.organizadorId, pedidoId, lin!.id, f.id, cod, l.butaca, l.zona, l.desc, l.tipo, o.nombre, o.tipo, o.nota ?? null],
      );
      if (!ok) throw conflicto(`La butaca ${l.butaca} ya está vendida`, 'ocupadas', { ocupadas: [l.butaca] });
    }
    await auditar(t, { organizadorId: o.organizadorId, usuarioId: o.usuarioId, accion: `invitacion.emitir`, entidad: 'pedido', entidadId: pedidoId, datos: { nombre: o.nombre, tipo: o.tipo, entradas: lineas.length }, ip: o.ip });
    return { pedidoId, codigo, entradas: lineas.length };
  });
  if (o.enviar && o.email) await ctx.colas.encolar('correo.confirmacion', { pedidoId });
  return { ...r, enlace: `${ctx.config.URL_PUBLICA}/pedido/${token}` };
}
