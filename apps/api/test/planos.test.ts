import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montar } from './ayuda';

let m: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  m = await montar();
});
afterAll(async () => m.cerrar());

const doc = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'datos', 'planos', f), 'utf8'));

describe('fase 2 · planos', () => {
  it('la semilla trae Puerto del Rosario y Antigua con su comprobación correcta', async () => {
    const c = await m.cliente().entrar('produccion@taquilla.test');
    const recintos = (await c.get('/api/recintos')).datos;
    const pdr = recintos.find((r: any) => r.codigo === 'auditorio-pdr');
    const det = (await c.get(`/api/recintos/${pdr.id}`)).datos;
    const v = det.planos[0].versiones[0];
    expect(v.butacas).toBe(510);
    expect(v.pmr).toBe(3);
    expect(v.ok).toBe(true);
  });

  it('importa un plano plano-taquilla/1 y lo exporta igual', async () => {
    const c = await m.cliente().entrar('produccion@taquilla.test');
    const r = (await c.post('/api/recintos', { codigo: 'sala-prueba', nombre: 'Sala de prueba' })).datos;
    const imp = await c.post(`/api/recintos/${r.id}/importar`, { documento: doc('antigua.json') });
    expect(imp.statusCode).toBe(200);
    expect(imp.datos.diferencias).toEqual([]);
    expect(imp.datos.version.comprobacion.but).toBe(377);
    const exp = await c.get(`/api/versiones/${imp.datos.version.id}/exportar`);
    expect(exp.datos.formato).toBe('plano-taquilla/1');
    expect(exp.datos.butacas).toEqual(doc('antigua.json').butacas);
  });

  it('rechaza un fichero que no es un plano', async () => {
    const c = await m.cliente().entrar('produccion@taquilla.test');
    const r = (await c.get('/api/recintos')).datos[0];
    const imp = await c.post(`/api/recintos/${r.id}/importar`, { documento: { formato: 'otro' } });
    expect(imp.statusCode).toBe(400);
  });

  it('un plano que no cuadra no se puede poner a la venta', async () => {
    const c = await m.cliente().entrar('produccion@taquilla.test');
    const r = (await c.post('/api/recintos', { codigo: 'sala-mal', nombre: 'Sala que no cuadra' })).datos;
    const p = (await c.post(`/api/recintos/${r.id}/planos`, { nombre: 'Aforo completo' })).datos;
    const v = (await c.get(`/api/versiones/${p.version.id}`)).datos;
    v.receta.aforo = { butacas: 999, pmr: 0 };
    const put = await c.pedir('PUT', `/api/versiones/${p.version.id}`, { receta: v.receta });
    expect(put.datos.comprobacion.ok).toBe(false);
    const cong = await c.post(`/api/versiones/${p.version.id}/congelar`);
    expect(cong.statusCode).toBe(409);
    expect(cong.datos.error).toBe('plano_no_cuadra');
  });

  it('una versión congelada no se puede editar; se crea una versión nueva', async () => {
    const c = await m.cliente().entrar('produccion@taquilla.test');
    const r = (await c.post('/api/recintos', { codigo: 'sala-ok', nombre: 'Sala que cuadra' })).datos;
    const p = (await c.post(`/api/recintos/${r.id}/planos`, { nombre: 'Aforo completo' })).datos;
    const v = (await c.get(`/api/versiones/${p.version.id}`)).datos;
    v.receta.aforo = { butacas: 160, pmr: 0 };
    expect((await c.pedir('PUT', `/api/versiones/${p.version.id}`, { receta: v.receta })).datos.comprobacion.ok).toBe(true);
    expect((await c.post(`/api/versiones/${p.version.id}/congelar`)).statusCode).toBe(200);
    const put = await c.pedir('PUT', `/api/versiones/${p.version.id}`, { receta: v.receta });
    expect(put.statusCode).toBe(409);
    // ni siquiera saltándose la API: la base de datos lo impide
    await expect(m.ctx.db.query(`update versiones_plano set receta = '{}' where id = $1`, [p.version.id])).rejects.toThrow(/congelada/);
    const nueva = await c.post(`/api/planos/${p.planoId}/versiones`);
    expect(nueva.datos.numero).toBe(2);
    expect(nueva.datos.estado).toBe('borrador');
  });

  it('solo lectura ve los planos pero no los edita', async () => {
    const c = await m.cliente().entrar('lectura@taquilla.test');
    const recintos = await c.get('/api/recintos');
    expect(recintos.statusCode).toBe(200);
    expect((await c.post('/api/recintos', { codigo: 'x-x', nombre: 'X' })).statusCode).toBe(403);
  });

  it('otro organizador no ve ni toca los planos de ASOMBRA', async () => {
    const a = await m.cliente().entrar('produccion@taquilla.test');
    const pdr = (await a.get('/api/recintos')).datos.find((r: any) => r.codigo === 'auditorio-pdr');
    const det = (await a.get(`/api/recintos/${pdr.id}`)).datos;
    const vid = det.planos[0].versiones[0].id;
    const t = await m.cliente().entrar('teatro@ejemplo.test');
    expect((await t.get('/api/recintos')).datos).toEqual([]);
    expect((await t.get(`/api/recintos/${pdr.id}`)).statusCode).toBe(404);
    expect((await t.get(`/api/versiones/${vid}`)).statusCode).toBe(404);
    expect((await t.get(`/api/versiones/${vid}/exportar`)).statusCode).toBe(404);
    expect((await t.post(`/api/versiones/${vid}/congelar`)).statusCode).toBe(404);
  });
});
