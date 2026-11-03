import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { montar } from './ayuda';

let m: Awaited<ReturnType<typeof montar>>;
let F: Record<string, string> = {};
let servidor: Server;
const recibidos: { url: string; auth: string; cuerpo: any }[] = [];
let respuesta = 200;
const TOKEN = 'EAAtokenDePruebaDeMeta1234567890abcdef';
const FBP = 'fb.1.1730000000000.1234567890';
const FBC = 'fb.1.1730000000000.IwAR_anuncio-123';

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      recibidos.push({ url: String(req.url), auth: String(req.headers.authorization), cuerpo: JSON.parse(b) });
      res.statusCode = respuesta;
      res.end(JSON.stringify({ events_received: 1 }));
    });
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
  m = await montar({ META_API_URL: `http://127.0.0.1:${(servidor.address() as any).port}/v23.0` });
  F = Object.fromEntries((await m.ctx.db.query('select codigo, id from funciones')).map((f) => [f.codigo, f.id]));
});
afterAll(async () => {
  servidor.close();
  await m.cerrar();
});

async function comprar(extra: { consentimientos?: object; meta?: object } = {}, email = 'meta@ejemplo.test') {
  const c = m.cliente();
  const r = await c.post('/api/publico/reservas', { funcionId: F.t03, cantidad: 2 });
  const pago = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, {
    nombre: 'Público Meta', email, idioma: 'es',
    consentimientos: { condiciones: true, privacidad: true, ...extra.consentimientos },
    ...(extra.meta ? { meta: extra.meta } : {}),
  });
  expect(pago.statusCode).toBe(200);
  await c.post(`/api/pagos/simulado/${String(pago.datos.url).split('?')[0].split('/').pop()}/pagar`, { tarjeta: '4242424242424242' });
  await m.ctx.colas.vaciar();
  return { token: r.datos.token as string, codigo: r.datos.codigo as string };
}

describe('Meta · píxel y API de Conversiones', () => {
  it('sin configurar no se envía nada', async () => {
    await comprar({ consentimientos: { medicion: true }, meta: { fbp: FBP } });
    expect(recibidos).toHaveLength(0);
  });

  it('el organizador guarda el píxel y el token; el token nunca se devuelve', async () => {
    const g = await m.cliente().entrar('gerencia@asombra.test');
    expect((await g.patch('/api/organizador', { meta_pixel_id: 'abc' })).statusCode).toBe(400);
    const r = await g.patch('/api/organizador', { meta_pixel_id: '123456789012345', meta_codigo_prueba: 'TEST12345' });
    expect(r.statusCode).toBe(200);
    expect(r.datos.meta_pixel_id).toBe('123456789012345');
    const t = await g.pedir('PUT', '/api/organizador/meta-token', { token: TOKEN });
    expect(t.statusCode).toBe(200);
    const org = await g.get('/api/organizador');
    expect(org.datos.meta_capi_activa).toBe(true);
    expect(JSON.stringify(org.datos)).not.toContain(TOKEN);
    // El ID del píxel es público (lo necesita el navegador)
    const f = await m.cliente().get(`/api/publico/funciones/${F.t03}`);
    expect(f.datos.meta_pixel_id).toBe('123456789012345');
    // Otro organizador no puede tocar el de ASOMBRA
    const otro = await m.cliente().entrar('teatro@ejemplo.test');
    await otro.pedir('PUT', '/api/organizador/meta-token', { token: null });
    expect((await g.get('/api/organizador')).datos.meta_capi_activa).toBe(true);
  });

  it('con consentimiento manda la compra con el mismo event_id que el navegador y borra los datos de atribución', async () => {
    const { codigo } = await comprar({ consentimientos: { medicion: true }, meta: { fbp: FBP, fbc: FBC } }, 'Meta@Ejemplo.test');
    expect(recibidos).toHaveLength(1);
    const r = recibidos[0];
    expect(r.url).toBe('/v23.0/123456789012345/events');
    expect(r.auth).toBe(`Bearer ${TOKEN}`);
    expect(r.cuerpo.test_event_code).toBe('TEST12345');
    const ev = r.cuerpo.data[0];
    expect(ev.event_name).toBe('Purchase');
    expect(ev.event_id).toBe(`compra-${codigo}`);
    expect(ev.action_source).toBe('website');
    expect(ev.custom_data.currency).toBe('EUR');
    expect(ev.custom_data.num_items).toBe(2);
    expect(ev.custom_data.value).toBeGreaterThan(0);
    expect(ev.user_data.em).toEqual([createHash('sha256').update('meta@ejemplo.test').digest('hex')]);
    expect(ev.user_data.fbp).toBe(FBP);
    expect(ev.user_data.fbc).toBe(FBC);
    expect(ev.user_data.client_user_agent).toBeDefined();
    expect(JSON.stringify(r.cuerpo)).not.toContain('ejemplo.test');
    const p = await m.ctx.db.one<any>('select meta_atribucion, meta_enviado_en from pedidos where codigo = $1', [codigo]);
    expect(p.meta_atribucion).toBeNull();
    expect(p.meta_enviado_en).not.toBeNull();
    // Repetir el trabajo no lo manda dos veces
    await m.ctx.colas.encolar('meta.compra', { pedidoId: (await m.ctx.db.one<any>('select id from pedidos where codigo = $1', [codigo])).id });
    await m.ctx.colas.vaciar();
    expect(recibidos).toHaveLength(1);
  });

  it('sin consentimiento no se guarda ni se envía nada', async () => {
    const { codigo } = await comprar({ consentimientos: { medicion: false }, meta: { fbp: FBP } });
    expect(recibidos).toHaveLength(1);
    const p = await m.ctx.db.one<any>('select meta_atribucion, meta_enviado_en from pedidos where codigo = $1', [codigo]);
    expect(p.meta_atribucion).toBeNull();
    expect(p.meta_enviado_en).toBeNull();
  });

  it('una cookie de Meta mal formada no impide comprar', async () => {
    await comprar({ consentimientos: { medicion: true }, meta: { fbp: '<script>', fbc: 'x'.repeat(2000) } });
    expect(recibidos).toHaveLength(2);
    expect(recibidos[1].cuerpo.data[0].user_data.fbp).toBeUndefined();
  });

  it('si Meta rechaza el token se apunta la respuesta y no se reintenta', async () => {
    respuesta = 400;
    const { codigo } = await comprar({ consentimientos: { medicion: true }, meta: { fbp: FBP } });
    respuesta = 200;
    const p = await m.ctx.db.one<any>('select meta_atribucion, meta_respuesta from pedidos where codigo = $1', [codigo]);
    expect(p.meta_respuesta).toMatch(/^400/);
    expect(p.meta_atribucion).toBeNull();
  });
});
