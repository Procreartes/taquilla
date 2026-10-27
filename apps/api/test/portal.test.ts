import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montar } from './ayuda';
import { verificarPase } from '../src/modulos/portal';

const SECRETO = 'clave-compartida-del-portal-de-pruebas-0123456789';
let m: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  m = await montar({ PORTAL_SSO_SECRET: SECRETO });
});
afterAll(async () => m.cerrar());

function firmar(datos: Record<string, unknown>, secreto = SECRETO) {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const ahora = Math.floor(Date.now() / 1000);
  const h = b({ alg: 'HS256' });
  const p = b({ iss: 'portal-livon', aud: 'taquilla', iat: ahora, exp: ahora + 120, jti: randomUUID(), ...datos });
  return `${h}.${p}.${createHmac('sha256', secreto).update(`${h}.${p}`).digest('base64url')}`;
}

describe('entrada desde el portal de Grupo Livon', () => {
  it('verifica firma, emisor, destinatario, caducidad y destino', () => {
    expect(verificarPase(firmar({ email: 'A@B.es', mfa: true, destino: '/panel/eventos' }), SECRETO)).toMatchObject({ email: 'a@b.es', mfa: true, destino: '/panel/eventos' });
    expect(verificarPase(firmar({ email: 'a@b.es' }, 'otra-clave-distinta-de-la-buena-0123456789'), SECRETO)).toBeNull();
    expect(verificarPase(firmar({ email: 'a@b.es', aud: 'horario' }), SECRETO)).toBeNull();
    expect(verificarPase(firmar({ email: 'a@b.es', exp: Math.floor(Date.now() / 1000) - 60 }), SECRETO)).toBeNull();
    expect(verificarPase(firmar({ email: 'a@b.es', destino: 'https://malo.example' }), SECRETO)?.destino).toBeNull();
  });

  it('abre sesión completa a quien entró con Microsoft y el pase solo vale una vez', async () => {
    const c = m.cliente();
    const pase = firmar({ email: 'produccion@taquilla.test', name: 'Producción', mfa: true, destino: '/panel/eventos' });
    const r = await c.post('/api/auth/portal', { pase });
    expect(r.statusCode).toBe(200);
    expect(r.datos).toMatchObject({ destino: '/panel/eventos', necesita2fa: false });
    const yo = await c.get('/api/auth/yo');
    expect(yo.datos.completa).toBe(true);
    expect((await m.cliente().post('/api/auth/portal', { pase })).statusCode).toBe(401);
  });

  it('rechaza pases falsos y cuentas sin alta en la Taquilla', async () => {
    expect((await m.cliente().post('/api/auth/portal', { pase: firmar({ email: 'produccion@taquilla.test' }, 'clave-falsa-pero-bastante-larga-0123456789') })).statusCode).toBe(401);
    const r = await m.cliente().post('/api/auth/portal', { pase: firmar({ email: 'nadie@grupolivon.com', mfa: true }) });
    expect(r.statusCode).toBe(403);
    expect(r.datos.mensaje).toContain('Equipo');
  });

  it('informa de si está activado', async () => {
    expect((await m.cliente().get('/api/auth/portal/info')).datos).toEqual({ activo: true, url: 'https://portal.grupolivon.com' });
  });
});
