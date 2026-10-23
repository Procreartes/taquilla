import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { leerConfig } from '../src/config';
import { montar } from './ayuda';

let m: Awaited<ReturnType<typeof montar>>;
let F: Record<string, string> = {};
beforeAll(async () => {
  m = await montar();
  F = Object.fromEntries((await m.ctx.db.query('select codigo, id from funciones')).map((f) => [f.codigo, f.id]));
});
afterAll(async () => m.cerrar());

describe('fase 7 · cola virtual', () => {
  it('sin pase no se puede reservar; con su turno se recibe un pase firmado', async () => {
    const g = await m.cliente().entrar('produccion@taquilla.test');
    const apertura = new Date(Date.now() - 2 * 60_000).toISOString();
    expect((await g.patch(`/api/funciones/${F.t03}`, { cola_virtual: true, cola_apertura: apertura, cola_ritmo: 1 })).statusCode).toBe(200);
    expect((await m.cliente().post('/api/publico/reservas', { funcionId: F.t03, cantidad: 1 })).statusCode).toBe(403);
    const c = m.cliente();
    const turnos = [];
    for (let i = 0; i < 4; i++) turnos.push((await c.post(`/api/publico/cola/${F.t03}/entrar`)).datos);
    // ritmo 1 por minuto y abierta hace 2 minutos → pasan los 2 primeros
    expect(turnos.map((t) => !!t.pase)).toEqual([true, true, false, false]);
    expect(turnos[3].delante).toBe(2);
    expect((await c.post('/api/publico/reservas', { funcionId: F.t03, cantidad: 1, pase: turnos[0].pase })).statusCode).toBe(200);
    expect((await c.post('/api/publico/reservas', { funcionId: F.t03, cantidad: 1, pase: turnos[0].pase.replace(/.$/, 'x') })).statusCode).toBe(403);
    const est = (await c.get(`/api/publico/cola/${F.t03}/estado?turno=${encodeURIComponent(turnos[3].turno)}`)).datos;
    expect(est.pase).toBeNull();
    expect((await c.get(`/api/publico/cola/${F.t03}/estado?turno=99.falso`)).datos.invalido).toBe(true);
  });

  it('antes de la hora de apertura nadie pasa', async () => {
    const g = await m.cliente().entrar('produccion@taquilla.test');
    await g.patch(`/api/funciones/${F.t01}`, { cola_virtual: true, cola_apertura: new Date(Date.now() + 3600_000).toISOString() });
    const t = (await m.cliente().post(`/api/publico/cola/${F.t01}/entrar`)).datos;
    expect(t.abierta).toBe(false);
    expect(t.pase).toBeNull();
    expect(t.esperaSegundos).toBeGreaterThan(3000);
    await g.patch(`/api/funciones/${F.t01}`, { cola_virtual: false });
    expect((await m.cliente().post('/api/publico/reservas', { funcionId: F.t01, mejorSitio: { cantidad: 1 } })).statusCode).toBe(200);
  });

  it('5.000 personas entran en la cola a la vez y cada una recibe un número distinto', async () => {
    const r = await Promise.all(Array.from({ length: 5000 }, () => m.ctx.colaVirtual!.entrar(F.t03)));
    const numeros = new Set(r.map((x: any) => x.turno.split('.')[0]));
    expect(numeros.size).toBe(5000);
  });
});

describe('fase 7 · seguridad', () => {
  it('alta en el equipo: enlace de un solo uso para definir una contraseña fuerte', async () => {
    const a = await m.cliente().entrar('gerencia@asombra.test');
    expect((await a.post('/api/organizador/equipo', { email: 'nueva.taquilla@asombra.test', nombre: 'Nueva Taquilla', rol: 'taquilla' })).statusCode).toBe(200);
    const correo = await m.ctx.db.one(`select texto from correos_salientes where para = 'nueva.taquilla@asombra.test' order by creado_en desc limit 1`);
    const token = correo!.texto.match(/t=([A-Za-z0-9_-]+)/)![1];
    const c = m.cliente();
    expect((await c.post('/api/auth/definir-clave', { token, clave: 'corta' })).statusCode).toBe(400);
    expect((await c.post('/api/auth/definir-clave', { token, clave: 'mi-taquilla-123456' })).statusCode).toBe(400);
    expect((await c.post('/api/auth/definir-clave', { token, clave: 'Verde-Faro-Duna-2026' })).statusCode).toBe(200);
    expect((await c.get('/api/auth/yo')).datos.rol).toBe('taquilla');
    expect((await m.cliente().post('/api/auth/definir-clave', { token, clave: 'Otra-Clave-Larga-99' })).statusCode).toBe(400);
  });

  it('cabeceras de seguridad', async () => {
    const r = await m.app.inject({ method: 'GET', url: '/api/salud' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBeDefined();
    expect(r.headers['strict-transport-security']).toBeDefined();
  });

  it('se niega a arrancar con claves reales de Stripe o sin secretos en producción', () => {
    expect(() => leerConfig({ STRIPE_SECRET_KEY: 'sk_live_123' } as any)).toThrow(/modo prueba/);
    expect(() => leerConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' } as any)).toThrow(/SECRETO_SESION/);
  });

  it('los buscadores no permiten inyección SQL', async () => {
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const r = await g.get(`/api/panel/funciones/${F.t01}/pedidos?q=${encodeURIComponent("' or 1=1; drop table pedidos; --")}`);
    expect(r.statusCode).toBe(200);
    expect(r.datos).toEqual([]);
    expect(await m.ctx.db.one('select count(*)::int as n from pedidos')).toBeTruthy();
  });

  it('el rol de puerta no llega a nada de administración ni de dinero', async () => {
    const p = await m.cliente().entrar('puerta@taquilla.test');
    for (const [metodo, url] of [
      ['GET', `/api/panel/funciones/${F.t01}/liquidacion`], ['GET', `/api/panel/funciones/${F.t01}/exportar`], ['GET', '/api/organizador/auditoria'],
      ['POST', `/api/panel/funciones/${F.t01}/cancelar`], ['PUT', `/api/funciones/${F.t01}/precios`], ['GET', '/api/organizador/correos'],
    ] as const) {
      expect((await p.pedir(metodo, url, metodo === 'GET' ? undefined : {})).statusCode, `${metodo} ${url}`).toBe(403);
    }
  });

  it('los textos se guardan tal cual y no se interpretan como HTML en las facturas', async () => {
    const c = m.cliente();
    const r = await c.post('/api/publico/reservas', { funcionId: F.t01, mejorSitio: { cantidad: 1 } });
    const pago = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, { nombre: '<script>alert(1)</script>', email: 'xss@ejemplo.test', idioma: 'es', consentimientos: { condiciones: true, privacidad: true } });
    await c.post(`/api/pagos/simulado/${String(pago.datos.url).split('?')[0].split('/').pop()}/pagar`, { tarjeta: '4242424242424242' });
    await m.ctx.colas.vaciar();
    const correo = await m.ctx.db.one(`select html from correos_salientes where para = 'xss@ejemplo.test' limit 1`);
    expect(correo!.html).not.toContain('<script>');
  });
});
