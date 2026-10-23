import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import otplib from 'otplib';
import { montar } from './ayuda';

let m: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  m = await montar();
});
afterAll(async () => m.cerrar());

describe('fase 1 · base', () => {
  it('la API responde y las migraciones están aplicadas', async () => {
    const r = await m.cliente().get('/api/salud');
    expect(r.statusCode).toBe(200);
    const migs = await m.ctx.db.query('select nombre from schema_migraciones');
    expect(migs.length).toBeGreaterThan(0);
  });

  it('rechaza una contraseña incorrecta y lo deja en la auditoría', async () => {
    const r = await m.cliente().post('/api/auth/entrar', { email: 'gerencia@asombra.test', clave: 'mala' });
    expect(r.statusCode).toBe(401);
    const a = await m.ctx.db.one(`select count(*)::int as n from auditoria where accion = 'auth.fallo'`);
    expect(a!.n).toBeGreaterThan(0);
  });

  it('entra con usuario y contraseña y conoce sus permisos', async () => {
    const c = await m.cliente().entrar('contabilidad@taquilla.test');
    const yo = await c.get('/api/auth/yo');
    expect(yo.datos.rol).toBe('contabilidad');
    expect(yo.datos.permisos).toContain('liquidacion.ver');
    expect(yo.datos.permisos).not.toContain('equipo.gestionar');
  });

  it('sin sesión no se puede leer el organizador', async () => {
    const r = await m.cliente().get('/api/organizador');
    expect(r.statusCode).toBe(401);
  });

  it('el rol de puerta no puede editar el organizador ni ver el equipo', async () => {
    const c = await m.cliente().entrar('puerta@taquilla.test');
    expect((await c.patch('/api/organizador', { nombre: 'Hackeado' })).statusCode).toBe(403);
    expect((await c.get('/api/organizador/equipo')).statusCode).toBe(403);
  });

  it('administración edita los datos fiscales y queda auditado', async () => {
    const c = await m.cliente().entrar('gerencia@asombra.test');
    const r = await c.patch('/api/organizador', { cif: 'B12345678', impuesto_tipo: 7, gastos_gestion_cent: 100 });
    expect(r.statusCode).toBe(200);
    expect(r.datos.cif).toBe('B12345678');
    const a = await c.get('/api/organizador/auditoria');
    expect(a.datos.some((x: any) => x.accion === 'organizador.editar')).toBe(true);
  });

  it('valida los datos de entrada', async () => {
    const c = await m.cliente().entrar('gerencia@asombra.test');
    const r = await c.patch('/api/organizador', { color_primario: 'rojo', impuesto_tipo: 150 });
    expect(r.statusCode).toBe(400);
    expect(r.datos.detalles.length).toBe(2);
  });

  it('los datos de un organizador no se mezclan con los de otro', async () => {
    const asombra = await m.cliente().entrar('gerencia@asombra.test');
    const teatro = await m.cliente().entrar('teatro@ejemplo.test');
    const a = (await asombra.get('/api/organizador')).datos;
    const t = (await teatro.get('/api/organizador')).datos;
    expect(a.id).not.toBe(t.id);
    // El teatro no puede cambiarse al organizador de ASOMBRA
    const r = await teatro.post('/api/auth/organizador', { organizadorId: a.id });
    expect(r.statusCode).toBe(404);
    // Ni ve su equipo
    const equipo = (await teatro.get('/api/organizador/equipo')).datos;
    expect(equipo.every((u: any) => !u.email.endsWith('@taquilla.test'))).toBe(true);
  });

  it('gestiona el equipo y no deja al organizador sin administración', async () => {
    const c = await m.cliente().entrar('gerencia@asombra.test');
    const alta = await c.post('/api/organizador/equipo', { email: 'nueva@asombra.test', nombre: 'Persona nueva', rol: 'taquilla' });
    expect(alta.statusCode).toBe(200);
    const repetida = await c.post('/api/organizador/equipo', { email: 'nueva@asombra.test', nombre: 'Persona nueva', rol: 'taquilla' });
    expect(repetida.statusCode).toBe(409);
    const yo = (await c.get('/api/auth/yo')).datos;
    const quitarme = await c.patch(`/api/organizador/equipo/${yo.usuario.id}`, { rol: 'lectura' });
    expect(quitarme.statusCode).toBe(409);
  });

  it('verificación en dos pasos: se activa y luego se exige al entrar', async () => {
    const c = await m.cliente().entrar('produccion@taquilla.test');
    const p = await c.post('/api/auth/2fa/preparar');
    expect(p.statusCode).toBe(200);
    const codigo = otplib.authenticator.generate(p.datos.secreto);
    expect((await c.post('/api/auth/2fa/activar', { codigo })).statusCode).toBe(200);

    const nueva = m.cliente();
    const r = await nueva.post('/api/auth/entrar', { email: 'produccion@taquilla.test', clave: 'clave-de-los-tests-123' });
    expect(r.datos.necesita2fa).toBe(true);
    expect((await nueva.get('/api/organizador')).statusCode).toBe(401);
    expect((await nueva.post('/api/auth/2fa', { codigo: '000000' })).statusCode).toBe(401);
    expect((await nueva.post('/api/auth/2fa', { codigo: otplib.authenticator.generate(p.datos.secreto) })).statusCode).toBe(200);
    expect((await nueva.get('/api/organizador')).statusCode).toBe(200);
  });

  it('rechaza peticiones que cambian datos desde otro origen (CSRF)', async () => {
    const c = await m.cliente().entrar('gerencia@asombra.test');
    const r = await m.app.inject({ method: 'PATCH', url: '/api/organizador', payload: { telefono: '1' }, headers: { cookie: c.cookie, origin: 'https://malicioso.example' } });
    expect(r.statusCode).toBe(403);
  });

  it('solo la administración de plataforma da de alta organizadores', async () => {
    const g = await m.cliente().entrar('gerencia@asombra.test');
    expect((await g.post('/api/plataforma/organizadores', { slug: 'x-y', nombre: 'X' })).statusCode).toBe(403);
    const sa = await m.cliente().entrar('admin@taquilla.test');
    const r = await sa.post('/api/plataforma/organizadores', { slug: 'ayto-prueba', nombre: 'Ayuntamiento de prueba', impuesto_nombre: 'IVA', impuesto_tipo: 21 });
    expect(r.statusCode).toBe(200);
    expect(r.datos.impuesto_nombre).toBe('IVA');
  });
});

describe('límites de peticiones', () => {
  it('bloquea los intentos de entrar repetidos', async () => {
    const m2 = await montar({ LIMITE_ENTRAR_POR_MINUTO: '3' });
    const c = m2.cliente();
    const codigos = [];
    for (let i = 0; i < 5; i++) codigos.push((await c.post('/api/auth/entrar', { email: 'x@y.test', clave: 'z' })).statusCode);
    expect(codigos.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codigos.slice(3)).toEqual([429, 429]);
    await m2.cerrar();
  });
});
