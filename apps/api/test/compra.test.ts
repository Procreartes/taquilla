import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montar, type Cliente } from './ayuda';
import { crearReserva, procesarEventoPago, prepararPago } from '../src/servicios/venta';
import type { PasarelaSimulada } from '../src/infra/pagos';

let m: Awaited<ReturnType<typeof montar>>;
let F: Record<string, string> = {};
beforeAll(async () => {
  m = await montar();
  F = Object.fromEntries((await m.ctx.db.query('select codigo, id from funciones')).map((f) => [f.codigo, f.id]));
});
afterAll(async () => m.cerrar());

const DATOS = {
  nombre: 'Persona de Prueba', email: 'comprador@ejemplo.test', codigoPostal: '35600', pais: 'España', municipio: 'Puerto del Rosario', isla: 'Fuerteventura',
  idioma: 'es', consentimientos: { condiciones: true, privacidad: true, comunicacionesOrganizador: false },
};

async function comprar(c: Cliente, cuerpo: object) {
  const r = await c.post('/api/publico/reservas', cuerpo);
  if (r.statusCode !== 200) throw new Error(`Reserva fallida: ${r.body}`);
  const pago = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, DATOS);
  const sesion = String(pago.datos.url).split('?')[0].split('/').pop()!;
  const ok = await c.post(`/api/pagos/simulado/${sesion}/pagar`, { tarjeta: '4242 4242 4242 4242' });
  await m.ctx.colas.vaciar();
  const pedido = await c.get(`/api/publico/pedidos/${r.datos.token}`);
  return { reserva: r, pago, ok, pedido, sesion, token: r.datos.token };
}

describe('fase 4 · compra', () => {
  it('cartelera pública del festival, sin datos internos', async () => {
    const r = await m.cliente().get('/api/publico/eventos/asombra-2026');
    expect(r.statusCode).toBe(200);
    expect(r.datos.funciones).toHaveLength(19);
    expect(r.datos.islas.length).toBeGreaterThan(5);
    expect(JSON.stringify(r.datos)).not.toContain('organizador_id');
  });

  it('compra numerada completa: reserva, pago, entradas, factura y correo', async () => {
    const c = m.cliente();
    const { reserva, pago, ok, pedido } = await comprar(c, { funcionId: F.t01, butacas: ['PLATEA-F5-10', 'PLATEA-F5-11'] });
    expect(reserva.statusCode).toBe(200);
    expect(reserva.datos.total_cent).toBe(2 * 2200 + 2 * 100);
    expect(pago.datos.url).toContain('/pago-simulado/');
    expect(ok.statusCode).toBe(200);
    expect(pedido.datos.estado).toBe('pagado');
    expect(pedido.datos.entradas).toHaveLength(2);
    expect(pedido.datos.numero_factura).toMatch(/^ASOMBR-\d{4}-\d{6}$/);
    const correo = await m.ctx.db.one(`select asunto, html from correos_salientes where para = 'comprador@ejemplo.test' order by creado_en desc limit 1`);
    expect(correo!.asunto).toContain('[PRUEBA]');
    expect(correo!.html).toContain(pedido.datos.entradas[0].codigo);
    // ya no se pueden reservar
    const otra = await m.cliente().post('/api/publico/reservas', { funcionId: F.t01, butacas: ['PLATEA-F5-10'] });
    expect(otra.statusCode).toBe(409);
    expect(otra.datos.ocupadas).toEqual(['PLATEA-F5-10']);
  });

  it('la disponibilidad pública muestra vendidas y reservadas', async () => {
    const c = m.cliente();
    await c.post('/api/publico/reservas', { funcionId: F.t01, butacas: ['PLATEA-F6-1'] });
    const d = (await c.get(`/api/publico/funciones/${F.t01}/disponibilidad`)).datos;
    expect(d.vendidas).toContain('PLATEA-F5-10');
    expect(d.reservadas).toContain('PLATEA-F6-1');
  });

  it('mejor sitio disponible: juntas, centradas y nunca un espacio PMR', async () => {
    const r = await m.cliente().post('/api/publico/reservas', { funcionId: F.t01, mejorSitio: { cantidad: 4, zona: 'fondo' } });
    expect(r.statusCode).toBe(200);
    expect(r.datos.lineas.every((l: any) => l.tipo_butaca !== 'silla_ruedas')).toBe(true);
    expect(new Set(r.datos.lineas.map((l: any) => l.zona_codigo))).toEqual(new Set(['fondo']));
  });

  it('máximo 8 entradas por compra', async () => {
    const r = await m.cliente().post('/api/publico/reservas', { funcionId: F.t03, cantidad: 9 });
    expect(r.statusCode).toBe(400);
  });

  it('no se puede comprar una función sin precio ni una que se vende en Entradas Canarias', async () => {
    expect((await m.cliente().post('/api/publico/reservas', { funcionId: F.f07, cantidad: 1 })).statusCode).toBe(409);
    expect((await m.cliente().post('/api/publico/reservas', { funcionId: F.f01, cantidad: 1 })).statusCode).toBe(409);
    expect((await m.cliente().post('/api/publico/reservas', { funcionId: F.f03, cantidad: 1 })).statusCode).toBe(409);
  });

  it('hay que aceptar condiciones y privacidad', async () => {
    const c = m.cliente();
    const r = await c.post('/api/publico/reservas', { funcionId: F.t03, cantidad: 1 });
    const p = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, { ...DATOS, consentimientos: { condiciones: true, privacidad: false } });
    expect(p.statusCode).toBe(400);
  });

  it('una reserva caducada no se puede pagar y libera sus plazas', async () => {
    const c = m.cliente();
    const r = await c.post('/api/publico/reservas', { funcionId: F.t01, butacas: ['PLATEA-F10-5'] });
    await m.ctx.db.query(`update pedidos set expira_en = now() - interval '1 second' where codigo = $1`, [r.datos.codigo]);
    const p = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, DATOS);
    expect(p.statusCode).toBe(409);
    expect(p.datos.error).toBe('reserva_caducada');
    const otra = await m.cliente().post('/api/publico/reservas', { funcionId: F.t01, butacas: ['PLATEA-F10-5'] });
    expect(otra.statusCode).toBe(200);
  });

  it('el mismo aviso de pago dos veces no emite dos veces (idempotencia)', async () => {
    const c = m.cliente();
    const r = await c.post('/api/publico/reservas', { funcionId: F.t03, cantidad: 2 });
    const pago = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, DATOS);
    const sesion = String(pago.datos.url).split('?')[0].split('/').pop()!;
    const pedidoId = (await m.ctx.db.one('select id from pedidos where codigo = $1', [r.datos.codigo]))!.id;
    const { cuerpo, firma } = (m.ctx.pasarela as PasarelaSimulada).avisoFirmado('pago_completado', sesion, pedidoId, r.datos.total_cent);
    const enviar = () => m.app.inject({ method: 'POST', url: '/api/pagos/webhook/simulada', payload: cuerpo, headers: { 'content-type': 'application/json', 'x-firma-simulada': firma } });
    const [a, b] = [await enviar(), await enviar()];
    expect(a.json().recibido).toBe(true);
    expect(b.json().duplicado).toBe(true);
    const n = await m.ctx.db.one('select count(*)::int as n from entradas where pedido_id = $1', [pedidoId]);
    expect(n!.n).toBe(2);
  });

  it('rechaza avisos con la firma mal', async () => {
    const r = await m.app.inject({ method: 'POST', url: '/api/pagos/webhook/simulada', payload: '{"tipo":"pago_completado"}', headers: { 'content-type': 'application/json', 'x-firma-simulada': 'falsa' } });
    expect(r.statusCode).toBe(400);
  });

  it('la tarjeta de rechazo no paga', async () => {
    const c = m.cliente();
    const r = await c.post('/api/publico/reservas', { funcionId: F.t03, cantidad: 1 });
    const pago = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, DATOS);
    const sesion = String(pago.datos.url).split('?')[0].split('/').pop()!;
    expect((await c.post(`/api/pagos/simulado/${sesion}/pagar`, { tarjeta: '4000 0000 0000 0002' })).statusCode).toBe(402);
    expect((await c.get(`/api/publico/pedidos/${r.datos.token}`)).datos.estado).toBe('pago');
  });
});

describe('fase 4 · sin sobreventa', () => {
  it('300 personas intentan reservar a la vez la misma butaca: solo una lo consigue', async () => {
    const intentos = await Promise.all(
      Array.from({ length: 300 }, () => m.cliente().post('/api/publico/reservas', { funcionId: F.t02, butacas: ['PLATEA-F3-7'] })),
    );
    const ok = intentos.filter((r) => r.statusCode === 200);
    expect(ok).toHaveLength(1);
    expect(intentos.filter((r) => r.statusCode === 409)).toHaveLength(299);
  });

  it('200 pagos simultáneos de la misma butaca (con reservas caducadas): solo uno recibe la entrada y al resto se les devuelve', async () => {
    const butaca = 'PLATEA-F8-9';
    // 200 pedidos distintos sobre la misma butaca, como si sus reservas hubieran caducado
    const pedidos: { id: string; sesion: string; total: number }[] = [];
    for (let i = 0; i < 200; i++) {
      const r = await crearReserva(m.ctx, { funcionId: F.t02, butacas: [butaca] });
      const { url } = await prepararPago(m.ctx, r.token, DATOS);
      const id = (await m.ctx.db.one('select id from pedidos where codigo = $1', [r.codigo]))!.id;
      await m.ctx.almacen.liberarButacas(F.t02, [butaca], id);
      pedidos.push({ id, sesion: url.split('?')[0].split('/').pop()!, total: r.total_cent });
    }
    const pas = m.ctx.pasarela as PasarelaSimulada;
    await Promise.all(pedidos.map((p) => {
      const { cuerpo } = pas.avisoFirmado('pago_completado', p.sesion, p.id, p.total);
      return procesarEventoPago(m.ctx, 'simulada', JSON.parse(cuerpo.toString()));
    }));
    await m.ctx.colas.vaciar();
    const vivas = await m.ctx.db.one(`select count(*)::int as n from entradas where funcion_id = $1 and butaca_codigo = $2 and estado = 'valida'`, [F.t02, butaca]);
    expect(vivas!.n).toBe(1);
    const estados = await m.ctx.db.query(`select estado, count(*)::int as n from pedidos where id = any($1::uuid[]) group by estado`, [pedidos.map((p) => p.id)]);
    const porEstado = Object.fromEntries(estados.map((e) => [e.estado, e.n]));
    expect(porEstado.pagado).toBe(1);
    expect(porEstado.devuelto).toBe(199);
    const dev = await m.ctx.db.one(`select count(*)::int as n from devoluciones where pedido_id = any($1::uuid[]) and estado = 'hecha'`, [pedidos.map((p) => p.id)]);
    expect(dev!.n).toBe(199);
  });

  it('aforo general: 250 intentos a la vez para 200 plazas → como mucho 200', async () => {
    const libres = await m.ctx.db.one('select aforo - vendidas_general as n from funciones where id = $1', [F.t03]);
    const reservadas = await m.ctx.almacen.cantidadReservada(F.t03);
    const intentos = await Promise.all(Array.from({ length: 250 }, () => m.cliente().post('/api/publico/reservas', { funcionId: F.t03, cantidad: 1 })));
    const ok = intentos.filter((r) => r.statusCode === 200).length;
    expect(ok).toBe(libres!.n - reservadas);
    expect(await m.ctx.almacen.cantidadReservada(F.t03)).toBe(libres!.n);
  });
});


describe('fase 4 · cambio de plano con ventas', () => {
  it('traslada las entradas si sus butacas existen y exige reasignar las que no', async () => {
    const g = await m.cliente().entrar('produccion@taquilla.test');
    const { pedido } = await comprar(m.cliente(), { funcionId: F.t02, butacas: ['PLATEA-F19-1', 'PLATEA-F2-1'] });
    expect(pedido.datos.estado).toBe('pagado');
    const f = (await g.get(`/api/funciones/${F.t02}`)).datos;
    const plano = (await m.ctx.db.one('select plano_id from versiones_plano where id = $1', [f.version_plano_id]))!.plano_id;
    const nueva = (await g.post(`/api/planos/${plano}/versiones`)).datos;
    const v = (await g.get(`/api/versiones/${nueva.id}`)).datos;
    v.receta.bloques[0].hasta = 18;
    v.receta.aforo = { butacas: 510 - 11, pmr: 3 };
    expect((await g.pedir('PUT', `/api/versiones/${nueva.id}`, { receta: v.receta })).datos.comprobacion.ok).toBe(true);
    const sin = await g.post(`/api/funciones/${F.t02}/cambiar-plano`, { versionId: nueva.id });
    expect(sin.statusCode).toBe(409);
    expect(sin.datos.butacas).toEqual(['PLATEA-F19-1']);
    const ok = await g.post(`/api/funciones/${F.t02}/cambiar-plano`, { versionId: nueva.id, reasignaciones: { 'PLATEA-F19-1': 'PLATEA-F18-1' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.datos.reasignadas).toHaveLength(1);
    const e = await m.ctx.db.query('select butaca_codigo from entradas where pedido_id = (select id from pedidos where codigo = $1) order by butaca_codigo', [pedido.datos.codigo]);
    expect(e.map((x) => x.butaca_codigo)).toEqual(['PLATEA-F18-1', 'PLATEA-F2-1']);
    expect((await m.ctx.db.one('select estado from versiones_plano where id = $1', [nueva.id]))!.estado).toBe('congelada');
  });
});
