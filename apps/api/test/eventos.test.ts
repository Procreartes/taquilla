import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montar } from './ayuda';
import { leerDatos, sembrar } from '../src/semilla';

let m: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  m = await montar();
});
afterAll(async () => m.cerrar());

const asombra = async () => {
  const c = await m.cliente().entrar('produccion@taquilla.test');
  const ev = (await c.get('/api/eventos')).datos.find((e: any) => e.slug === 'asombra-2026');
  const det = (await c.get(`/api/eventos/${ev.id}`)).datos;
  return { c, ev, det, f: (codigo: string) => det.funciones.find((x: any) => x.codigo === codigo) };
};

describe('fase 3 · eventos y funciones', () => {
  it('importa las 16 funciones reales de ASOMBRA 2026 y las 3 de prueba', async () => {
    const { det } = await asombra();
    const reales = det.funciones.filter((f: any) => !f.es_prueba);
    expect(reales).toHaveLength(16);
    expect(det.funciones.filter((f: any) => f.es_prueba)).toHaveLength(3);
    expect(new Set(reales.map((f: any) => f.isla)).size).toBe(6);
  });

  it('asigna el plano de Puerto del Rosario y deja los modos de venta correctos', async () => {
    const { f } = await asombra();
    expect(f('f07').modo_venta).toBe('numerada');
    expect(f('f10').modo_venta).toBe('numerada');
    expect(f('f03').modo_venta).toBe('libre');
    expect(f('f12').modo_venta).toBe('general');
  });

  it('las funciones sin precio oficial quedan «por confirmar» y no se pueden vender', async () => {
    const { c, f } = await asombra();
    expect(f('f07').precios).toBeNull();
    const det = (await c.get(`/api/funciones/${f('f07').id}`)).datos;
    expect(det.motivos_no_vendible.some((m: string) => m.startsWith('Precio por confirmar'))).toBe(true);
    const r = await c.post(`/api/funciones/${f('f07').id}/poner-a-la-venta`);
    expect(r.statusCode).toBe(409);
  });

  it('las funciones con venta oficial en Entradas Canarias no se venden aquí', async () => {
    const { c, f } = await asombra();
    expect(f('f01').venta_externa_url).toContain('entradascanarias');
    expect(f('f01').precios).toEqual({ general: 1100 });
    const r = await c.post(`/api/funciones/${f('f01').id}/poner-a-la-venta`);
    expect(r.statusCode).toBe(409);
    expect(r.datos.motivos).toContain('La venta oficial está en otra plataforma');
  });

  it('las funciones de prueba están a la venta y su plano queda congelado', async () => {
    const { c, f } = await asombra();
    expect(f('t01').estado).toBe('a_la_venta');
    const det = (await c.get(`/api/funciones/${f('t01').id}`)).datos;
    expect(det.plano_estado).toBe('congelada');
    expect(det.zonas.map((z: any) => z.precio_cent)).toEqual([2200, 1800, 1400]);
  });

  it('al poner precio en todas las zonas, la función se puede vender; los cambios de precio se auditan', async () => {
    const { c, f } = await asombra();
    const id = f('f10').id;
    const r1 = await c.pedir('PUT', `/api/funciones/${id}/precios`, { precios: { platea: 1800 } });
    expect(r1.datos.motivos_no_vendible).toEqual(['Precio por confirmar en 1 zona']);
    const r2 = await c.pedir('PUT', `/api/funciones/${id}/precios`, { precios: { anfiteatro: 1500 } });
    expect(r2.datos.motivos_no_vendible).toEqual([]);
    const bad = await c.pedir('PUT', `/api/funciones/${id}/precios`, { precios: { vip: 100 } });
    expect(bad.statusCode).toBe(400);
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const aud = (await g.get('/api/organizador/auditoria')).datos;
    expect(aud.some((a: any) => a.accion === 'funcion.precios' && a.entidad_id === id)).toBe(true);
  });

  it('el rol de taquilla no puede cambiar precios', async () => {
    const { f } = await asombra();
    const t = await m.cliente().entrar('taquilla@taquilla.test');
    expect((await t.pedir('PUT', `/api/funciones/${f('f10').id}/precios`, { precios: { platea: 1 } })).statusCode).toBe(403);
  });

  it('la coproducción se reparte al 50 % y los porcentajes deben sumar 100', async () => {
    const { c, ev, det } = await asombra();
    expect(det.socios.map((s: any) => [s.nombre, s.porcentaje])).toEqual([['Grupo Livon', 50], ['Héctor Sansegundo', 50]]);
    const r = await c.pedir('PUT', `/api/eventos/${ev.id}/socios`, { socios: [{ nombre: 'A', porcentaje: 60 }, { nombre: 'B', porcentaje: 30 }] });
    expect(r.statusCode).toBe(400);
  });

  it('volver a importar no duplica nada', async () => {
    await sembrar(m.ctx.db, m.ctx.config);
    const { det } = await asombra();
    expect(det.funciones).toHaveLength(19);
    expect(det.socios).toHaveLength(2);
  });

  it('el importador rechaza una programación incoherente', async () => {
    const c = await m.cliente().entrar('produccion@taquilla.test');
    const p = leerDatos('programacion-asombra-2026.json');
    p.funciones[0].recinto = 'no-existe';
    const r = await c.post('/api/eventos/importar-programacion', { slug: 'prueba-mala', nombre: 'Mala', programacion: p });
    expect(r.statusCode).toBe(400);
  });

  it('una función numerada necesita un plano de su recinto', async () => {
    const { c, ev, f } = await asombra();
    const det = (await c.get(`/api/funciones/${f('t01').id}`)).datos;
    const otro = (await c.get(`/api/funciones/${f('t02').id}`)).datos;
    const r = await c.post(`/api/eventos/${ev.id}/funciones`, {
      codigo: 'x1', recinto_id: det.recinto_id, titulo: 'X', fecha: '2026-12-01', modo_venta: 'numerada', version_plano_id: otro.version_plano_id,
    });
    expect(r.statusCode).toBe(400);
  });

  it('otro organizador no ve los eventos de ASOMBRA', async () => {
    const { ev, f } = await asombra();
    const t = await m.cliente().entrar('teatro@ejemplo.test');
    expect((await t.get('/api/eventos')).datos).toEqual([]);
    expect((await t.get(`/api/eventos/${ev.id}`)).statusCode).toBe(404);
    expect((await t.get(`/api/funciones/${f('t01').id}`)).statusCode).toBe(404);
    expect((await t.pedir('PUT', `/api/funciones/${f('t01').id}/precios`, { precios: { fondo: 1 } })).statusCode).toBe(404);
  });
});
