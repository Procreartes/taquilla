import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montar } from './ayuda';

let m: Awaited<ReturnType<typeof montar>>;
let F: Record<string, string> = {};
let EVENTO = '';
beforeAll(async () => {
  m = await montar();
  F = Object.fromEntries((await m.ctx.db.query('select codigo, id from funciones')).map((f) => [f.codigo, f.id]));
  EVENTO = (await m.ctx.db.one(`select id from eventos where slug = 'asombra-2026'`))!.id;
});
afterAll(async () => m.cerrar());

const DATOS = (isla: string) => ({ nombre: 'Público de Prueba', email: `p-${isla.toLowerCase().replace(/\s/g, '')}@ejemplo.test`, isla, municipio: 'Prueba', pais: 'España', idioma: 'es', consentimientos: { condiciones: true, privacidad: true } });

async function comprar(cuerpo: object, isla = 'Fuerteventura') {
  const c = m.cliente();
  const r = await c.post('/api/publico/reservas', cuerpo);
  if (r.statusCode !== 200) throw new Error(r.body);
  const pago = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, DATOS(isla));
  await c.post(`/api/pagos/simulado/${String(pago.datos.url).split('?')[0].split('/').pop()}/pagar`, { tarjeta: '4242424242424242' });
  await m.ctx.colas.vaciar();
  return (await m.ctx.db.one('select id, codigo, total_cent from pedidos where codigo = $1', [r.datos.codigo]))!;
}

describe('fase 6 · panel y dinero', () => {
  it('panel por función: vendidas, ocupación por zona e ingresos', async () => {
    await comprar({ funcionId: F.t01, butacas: ['PLATEA-F1-1', 'PLATEA-F1-2'] });
    await comprar({ funcionId: F.t01, butacas: ['PLATEA-F18-10'] }, 'Gran Canaria');
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const r = (await g.get(`/api/panel/funciones/${F.t01}`)).datos.resumen;
    expect(r.vendidas).toBe(3);
    expect(r.plazas).toBe(379);
    const pref = r.zonas.find((z: any) => z.codigo === 'preferente');
    expect(pref.vendidas).toBe(2);
    expect(r.bruto).toBe(2 * 2200 + 1400);
    expect(r.gastos).toBe(300);
  });

  it('panel por festival suma todas las funciones', async () => {
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const r = (await g.get(`/api/panel/eventos/${EVENTO}`)).datos;
    expect(r.totales.vendidas).toBeGreaterThanOrEqual(3);
    expect(r.funciones.some((f: any) => f.codigo === 'f07')).toBe(true);
  });

  it('devolución individual: libera la butaca y devuelve por la pasarela', async () => {
    const p = await comprar({ funcionId: F.t01, butacas: ['PLATEA-F3-3', 'PLATEA-F3-4'] });
    const g = await m.cliente().entrar('contabilidad@taquilla.test');
    const det = (await g.get(`/api/panel/pedidos/${p.id}`)).datos;
    const una = det.entradas[0];
    const r = await g.post(`/api/panel/pedidos/${p.id}/devolver`, { entradas: [una.id], incluirGastos: false, motivo: 'Petición del cliente' });
    expect(r.statusCode).toBe(200);
    expect(r.datos.importe).toBe(2200);
    await m.ctx.colas.vaciar();
    const tras = (await g.get(`/api/panel/pedidos/${p.id}`)).datos;
    expect(tras.estado).toBe('devuelto_parcial');
    expect(tras.devoluciones[0].estado).toBe('hecha');
    // la butaca vuelve a estar a la venta
    expect((await m.cliente().post('/api/publico/reservas', { funcionId: F.t01, butacas: ['PLATEA-F3-3'] })).statusCode).toBe(200);
    const aud = (await (await m.cliente().entrar('gerencia@asombra.test')).get('/api/organizador/auditoria')).datos;
    expect(aud.some((a: any) => a.accion === 'pedido.devolver')).toBe(true);
  });

  it('producción no puede hacer devoluciones', async () => {
    const p = await comprar({ funcionId: F.t03, cantidad: 1 });
    const pr = await m.cliente().entrar('produccion@taquilla.test');
    expect((await pr.post(`/api/panel/pedidos/${p.id}/devolver`, { motivo: 'xxx' })).statusCode).toBe(403);
  });

  it('invitaciones, acreditaciones y protocolo', async () => {
    const t = await m.cliente().entrar('taquilla@taquilla.test');
    const prot = await t.post(`/api/panel/funciones/${F.t01}/protocolo`, { butacas: ['PLATEA-F2-9', 'PLATEA-F2-10'], nombre: 'Presidencia del Cabildo' });
    expect(prot.statusCode).toBe(200);
    // el público ya no puede comprarlas
    expect((await m.cliente().post('/api/publico/reservas', { funcionId: F.t01, butacas: ['PLATEA-F2-9'] })).statusCode).toBe(409);
    const disp = (await m.cliente().get(`/api/publico/funciones/${F.t01}/disponibilidad`)).datos;
    expect(disp.protocolo).toContain('PLATEA-F2-9');
    // se convierte en invitación
    const inv = await t.post(`/api/panel/funciones/${F.t01}/invitaciones`, { nombre: 'Presidencia del Cabildo', butacas: ['PLATEA-F2-9', 'PLATEA-F2-10'] });
    expect(inv.statusCode).toBe(200);
    expect(inv.datos.codigo).toMatch(/^INV-/);
    const acr = await t.post(`/api/panel/funciones/${F.t03}/invitaciones`, { nombre: 'Prensa · Canarias7', tipo: 'acreditacion', cantidad: 2 });
    expect(acr.statusCode).toBe(200);
    const lista = (await t.get(`/api/panel/funciones/${F.t01}/invitaciones`)).datos;
    expect(lista.invitaciones[0].entradas).toHaveLength(2);
    expect(lista.protocolo).toHaveLength(0);
    // una invitación sin usar se puede anular; una entrada vendida no
    const cod = lista.invitaciones[0].entradas[0].codigo;
    expect((await t.post(`/api/panel/entradas/${cod}/anular`, { motivo: 'No viene' })).statusCode).toBe(200);
  });

  it('liquidación por función con reparto 50 % entre coproductores', async () => {
    const c = await m.cliente().entrar('contabilidad@taquilla.test');
    const l = (await c.get(`/api/panel/funciones/${F.t01}/liquidacion`)).datos.liquidacion;
    expect(l.bruto).toBeGreaterThan(0);
    expect(l.devoluciones).toBe(2200);
    expect(l.base + l.impuesto.cuota).toBe(l.brutoNeto);
    expect(l.reparto.map((r: any) => r.nombre)).toEqual(['Grupo Livon', 'Héctor Sansegundo']);
    expect(l.reparto.reduce((s: number, r: any) => s + r.importe, 0)).toBe(l.netoTrasDerechos);
    expect(l.invitaciones).toBe(1);
    const fest = (await c.get(`/api/panel/eventos/${EVENTO}/liquidacion`)).datos;
    expect(fest.reparto).toHaveLength(2);
    expect(fest.funciones.every((f: any) => f.titulo)).toBe(true);
  });

  it('borderó SGAE en HTML y CSV', async () => {
    const c = await m.cliente().entrar('contabilidad@taquilla.test');
    const h = await c.get(`/api/panel/funciones/${F.t01}/bordero`);
    expect(h.headers['content-type']).toContain('text/html');
    expect(h.body).toContain('Borderó de taquilla');
    expect(h.body).toContain('Derechos de autor');
    const csv = await c.get(`/api/panel/funciones/${F.t01}/bordero?formato=csv`);
    expect(csv.body).toContain('Localidad;Precio');
  });

  it('exporta pedidos y entradas en CSV y Excel, sin inyección de fórmulas', async () => {
    const c = m.cliente();
    const r = await c.post('/api/publico/reservas', { funcionId: F.t03, cantidad: 1 });
    const pago = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, { ...DATOS('Lanzarote'), nombre: '=HYPERLINK("http://malo")' });
    await c.post(`/api/pagos/simulado/${String(pago.datos.url).split('?')[0].split('/').pop()}/pagar`, { tarjeta: '4242424242424242' });
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const csv = await g.get(`/api/panel/funciones/${F.t03}/exportar?tipo=pedidos&formato=csv`);
    expect(csv.body.charCodeAt(0)).toBe(0xfeff);
    expect(csv.body).toContain(`'=HYPERLINK`);
    const xlsx = await m.app.inject({ method: 'GET', url: `/api/panel/funciones/${F.t03}/exportar?tipo=entradas&formato=xlsx`, headers: { cookie: g.cookie } });
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('datos de público agregados por isla, ocultando grupos pequeños', async () => {
    for (let i = 0; i < 5; i++) await comprar({ funcionId: F.t03, cantidad: 1 }, 'Fuerteventura');
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const r = (await g.get(`/api/panel/eventos/${EVENTO}/publico`)).datos;
    expect(r.isla.find((x: any) => x.clave === 'Fuerteventura').n).toBeGreaterThanOrEqual(5);
    expect(r.isla.some((x: any) => x.clave === 'Lanzarote')).toBe(false);
    expect(JSON.stringify(r)).not.toContain('@');
  });

  it('cancelar una función devuelve todo (con gastos) y avisa a cada comprador', async () => {
    const p1 = await comprar({ funcionId: F.t02, butacas: ['PLATEA-F4-1'] });
    const p2 = await comprar({ funcionId: F.t02, butacas: ['PLATEA-F4-2', 'PLATEA-F4-4'] });
    const g = await m.cliente().entrar('gerencia@asombra.test');
    expect((await g.post(`/api/panel/funciones/${F.t02}/cancelar`, { motivo: 'Prueba', confirmacion: 'no' })).statusCode).toBe(400);
    const r = await g.post(`/api/panel/funciones/${F.t02}/cancelar`, { motivo: 'Indisposición del artista (prueba)', confirmacion: 'CANCELAR' });
    expect(r.statusCode).toBe(200);
    await m.ctx.colas.vaciar();
    for (const p of [p1, p2]) {
      const d = await m.ctx.db.one(`select estado from pedidos where id = $1`, [p.id]);
      expect(d!.estado).toBe('devuelto');
      const dev = await m.ctx.db.one(`select coalesce(sum(importe_cent), 0)::int as n from devoluciones where pedido_id = $1 and estado = 'hecha'`, [p.id]);
      expect(dev!.n).toBe(p.total_cent);
    }
    expect((await m.cliente().post('/api/publico/reservas', { funcionId: F.t02, cantidad: 1 })).statusCode).toBe(409);
    const correos = await m.ctx.db.one(`select count(*)::int as n from correos_salientes where asunto like '%Función cancelada%'`);
    expect(correos!.n).toBe(2);
  });

  it('otro organizador no ve paneles ni liquidaciones de ASOMBRA', async () => {
    const t = await m.cliente().entrar('teatro@ejemplo.test');
    expect((await t.get(`/api/panel/funciones/${F.t01}`)).statusCode).toBe(404);
    expect((await t.get(`/api/panel/funciones/${F.t01}/liquidacion`)).statusCode).toBe(404);
    expect((await t.get(`/api/panel/eventos/${EVENTO}/publico`)).statusCode).toBe(404);
    expect((await t.get(`/api/panel/funciones/${F.t01}/exportar`)).statusCode).toBe(404);
  });

  it('resumen del panel: cifras, ventas por día, próximas funciones y dinero solo para quien ve informes', async () => {
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const r = (await g.get('/api/panel/resumen?pruebas=1')).datos;
    expect(r.entradas.vendidas).toBeGreaterThanOrEqual(3);
    expect(r.serie).toHaveLength(30);
    expect(r.serie.at(-1).entradas).toBeGreaterThanOrEqual(3);
    expect(r.dinero.cobrado).toBeGreaterThan(0);
    expect(r.dinero.neto).toBeLessThanOrEqual(r.dinero.cobrado);
    const t01 = r.proximas.find((f: any) => f.id === F.t01);
    if (t01) expect(t01.vendidas).toBeGreaterThan(0);
    expect(r.ultimos.length).toBeGreaterThan(0);
    const p = await m.cliente().entrar('puerta@taquilla.test');
    const rp = (await p.get('/api/panel/resumen?pruebas=1'));
    if (rp.statusCode === 200) {
      expect(rp.datos.dinero).toBeNull();
      expect(rp.datos.ultimos).toEqual([]);
      expect(rp.datos.serie.every((d: any) => d.cobrado === null)).toBe(true);
    } else expect(rp.statusCode).toBe(403);
  });
});
