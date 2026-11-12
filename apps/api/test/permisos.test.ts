import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montar } from './ayuda';

let m: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  m = await montar();
});
afterAll(async () => m.cerrar());

describe('permisos de cada persona en todos los organizadores (superadmin)', () => {
  it('solo la administración de plataforma los ve y los cambia', async () => {
    const g = await m.cliente().entrar('gerencia@asombra.test');
    expect((await g.get('/api/plataforma/equipo')).statusCode).toBe(403);
    const u = await m.ctx.db.one<{ id: string }>(`select id from usuarios where email = 'gerencia@asombra.test'`);
    expect((await g.pedir('PUT', `/api/plataforma/equipo/${u!.id}`, { activo: true, roles: {} })).statusCode).toBe(403);
  });

  it('cambia roles, quita accesos y desactiva', async () => {
    const sa = await m.cliente().entrar('admin@taquilla.test');
    const r = await sa.get('/api/plataforma/equipo');
    expect(r.statusCode).toBe(200);
    const orgs: { id: string }[] = r.datos.organizadores;
    expect(orgs.length).toBeGreaterThan(0);

    // Persona nueva con producción en todos (como al entrar desde el portal)
    const p = (await m.ctx.db.one<{ id: string }>(`insert into usuarios (email, nombre) values ('nueva@grupolivon.com', 'Nueva') returning id`))!;
    for (const o of orgs) await m.ctx.db.query(`insert into membresias (usuario_id, organizador_id, rol) values ($1, $2, 'produccion')`, [p.id, o.id]);

    const [primero, ...resto] = orgs;
    const roles: Record<string, string | null> = { [primero.id]: 'lectura' };
    for (const o of resto) roles[o.id] = null;
    expect((await sa.pedir('PUT', `/api/plataforma/equipo/${p.id}`, { activo: true, roles })).statusCode).toBe(200);
    const ahora = await m.ctx.db.query<{ organizador_id: string; rol: string }>('select organizador_id, rol from membresias where usuario_id = $1', [p.id]);
    expect(ahora).toEqual([{ organizador_id: primero.id, rol: 'lectura' }]);

    expect((await sa.pedir('PUT', `/api/plataforma/equipo/${p.id}`, { activo: false, roles: {} })).statusCode).toBe(200);
    expect((await m.ctx.db.one<{ activo: boolean }>('select activo from usuarios where id = $1', [p.id]))!.activo).toBe(false);
  });

  it('no deja un organizador sin administración ni desactivarse a uno mismo', async () => {
    const sa = await m.cliente().entrar('admin@taquilla.test');
    const yo = (await m.ctx.db.one<{ id: string }>(`select id from usuarios where email = 'admin@taquilla.test'`))!;
    expect((await sa.pedir('PUT', `/api/plataforma/equipo/${yo.id}`, { activo: false, roles: {} })).statusCode).toBe(409);

    const admins = await m.ctx.db.query<{ usuario_id: string; organizador_id: string }>(
      `select usuario_id, organizador_id from membresias where rol = 'admin' and organizador_id in (
         select organizador_id from membresias where rol = 'admin' group by organizador_id having count(*) = 1)`);
    if (admins[0]) {
      const r = await sa.pedir('PUT', `/api/plataforma/equipo/${admins[0].usuario_id}`, { activo: true, roles: { [admins[0].organizador_id]: 'lectura' } });
      expect(r.statusCode).toBe(409);
    }
  });
});
