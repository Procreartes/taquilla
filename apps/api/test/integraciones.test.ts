import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { montar } from './ayuda';

let m: Awaited<ReturnType<typeof montar>>;
let F: Record<string, string> = {};
let servidor: Server;
let url = '';
const recibidos: { cuerpo: string; firma: string; evento: string }[] = [];

beforeAll(async () => {
  m = await montar();
  F = Object.fromEntries((await m.ctx.db.query('select codigo, id from funciones')).map((f) => [f.codigo, f.id]));
  servidor = createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      recibidos.push({ cuerpo: b, firma: String(req.headers['x-taquilla-firma']), evento: String(req.headers['x-taquilla-evento']) });
      res.end('ok');
    });
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(servidor.address() as any).port}/n8n`;
});
afterAll(async () => {
  servidor.close();
  await m.cerrar();
});

async function comprar(cantidad: number) {
  const c = m.cliente();
  const r = await c.post('/api/publico/reservas', { funcionId: F.t03, cantidad });
  const pago = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, { nombre: 'N8N', email: 'n8n@ejemplo.test', idioma: 'es', consentimientos: { condiciones: true, privacidad: true } });
  await c.post(`/api/pagos/simulado/${String(pago.datos.url).split('?')[0].split('/').pop()}/pagar`, { tarjeta: '4242424242424242' });
  await m.ctx.colas.vaciar();
}

describe('fase 8 · webhooks para n8n', () => {
  it('envía venta, 90 % de aforo y agotado, firmados', async () => {
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const alta = await g.post('/api/organizador/webhooks', { nombre: 'n8n local', url, eventos: ['venta', 'agotado', 'devolucion', 'aforo_90'] });
    expect(alta.statusCode).toBe(200);
    const secreto = alta.datos.secreto;
    await g.patch(`/api/funciones/${F.t03}`, { aforo: 10 });
    await comprar(5);
    await comprar(4);
    await comprar(1);
    await m.ctx.colas.vaciar();
    const eventos = recibidos.map((r) => r.evento);
    expect(eventos.filter((e) => e === 'venta')).toHaveLength(3);
    expect(eventos.filter((e) => e === 'aforo_90')).toHaveLength(1);
    expect(eventos.filter((e) => e === 'agotado')).toHaveLength(1);
    for (const r of recibidos) {
      const [t, v1] = r.firma.split(',').map((x) => x.split('=')[1]);
      expect(createHmac('sha256', secreto).update(`${t}.${r.cuerpo}`).digest('hex')).toBe(v1);
    }
    const venta = JSON.parse(recibidos.find((r) => r.evento === 'venta')!.cuerpo);
    expect(venta.funcion.titulo).toContain('aforo general');
    expect(JSON.stringify(venta)).not.toContain('n8n@ejemplo.test');
    const lista = (await g.get('/api/organizador/webhooks')).datos;
    expect(lista[0].entregas.every((e: any) => e.estado === 'entregado')).toBe(true);
    expect(JSON.stringify(lista)).not.toContain(secreto);
  });

  it('aviso de prueba y baja', async () => {
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const w = (await g.get('/api/organizador/webhooks')).datos[0];
    const antes = recibidos.length;
    expect((await g.post(`/api/organizador/webhooks/${w.id}/probar`)).statusCode).toBe(200);
    await m.ctx.colas.vaciar();
    expect(recibidos.length).toBe(antes + 1);
    expect((await g.del(`/api/organizador/webhooks/${w.id}`)).statusCode).toBe(200);
  });

  it('otro organizador no ve ni borra webhooks ajenos y el rol de taquilla no los gestiona', async () => {
    const g = await m.cliente().entrar('gerencia@asombra.test');
    const w = (await g.post('/api/organizador/webhooks', { nombre: 'otro', url, eventos: ['venta'] })).datos;
    const t = await m.cliente().entrar('teatro@ejemplo.test');
    expect((await t.get('/api/organizador/webhooks')).datos).toEqual([]);
    expect((await t.del(`/api/organizador/webhooks/${w.id}`)).statusCode).toBe(404);
    const tq = await m.cliente().entrar('taquilla@taquilla.test');
    expect((await tq.get('/api/organizador/webhooks')).statusCode).toBe(403);
  });

  it('en producción rechaza http y direcciones privadas', async () => {
    const { urlPermitida } = await import('../src/servicios/webhooks');
    expect(await urlPermitida('http://ejemplo.com/x', true)).toMatch(/https/);
    expect(await urlPermitida('https://127.0.0.1/x', true)).toMatch(/privadas/);
    expect(await urlPermitida('https://192.168.1.10/x', true)).toMatch(/privadas/);
    expect(await urlPermitida('ftp://x', false)).toMatch(/http/);
  });
});
