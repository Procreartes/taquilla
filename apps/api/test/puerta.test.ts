import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { qrEstatico, qrRotatorio, ventanaActual } from '@taquilla/dominio';
import { montar, type Cliente } from './ayuda';

let m: Awaited<ReturnType<typeof montar>>;
let F: Record<string, string> = {};
beforeAll(async () => {
  m = await montar();
  F = Object.fromEntries((await m.ctx.db.query('select codigo, id from funciones')).map((f) => [f.codigo, f.id]));
});
afterAll(async () => m.cerrar());

const DATOS = { nombre: 'Público de Prueba', email: 'publico@ejemplo.test', idioma: 'es', consentimientos: { condiciones: true, privacidad: true } };

async function comprar(cuerpo: object) {
  const c = m.cliente();
  const r = await c.post('/api/publico/reservas', cuerpo);
  if (r.statusCode !== 200) throw new Error(r.body);
  const pago = await c.post(`/api/publico/pedidos/${r.datos.token}/pagar`, DATOS);
  await c.post(`/api/pagos/simulado/${String(pago.datos.url).split('?')[0].split('/').pop()}/pagar`, { tarjeta: '4242424242424242' });
  await m.ctx.colas.vaciar();
  const pedido = (await c.get(`/api/publico/pedidos/${r.datos.token}`)).datos;
  const llaves = (await c.get(`/api/publico/pedidos/${r.datos.token}/llaves`)).datos;
  return { token: r.datos.token, pedido, llaves, c };
}

const puerta = async (): Promise<Cliente> => m.cliente().entrar('puerta@taquilla.test');
const validar = (c: Cliente, funcionId: string, qr: string, dispositivo = 'puerta-1') => c.post('/api/puerta/validar', { funcionId, qr, dispositivo });

describe('fase 5 · entradas y puerta', () => {
  it('el QR rotatorio del móvil entra una vez; la segunda dice «ya utilizada» con la hora', async () => {
    const { llaves } = await comprar({ funcionId: F.t01, butacas: ['PLATEA-F7-3'] });
    const l = llaves[0];
    const p = await puerta();
    const r1 = await validar(p, F.t01, await qrRotatorio(l.llave, l.fcod, l.codigo));
    expect(r1.datos.resultado).toBe('valida');
    expect(r1.datos.mensaje).toBe('Adelante');
    const r2 = await validar(p, F.t01, await qrRotatorio(l.llave, l.fcod, l.codigo));
    expect(r2.datos.resultado).toBe('usada');
    expect(r2.datos.detalle).toMatch(/Entró a las \d{2}:\d{2}/);
  });

  it('una captura antigua del QR rotatorio está caducada', async () => {
    const { llaves } = await comprar({ funcionId: F.t01, butacas: ['PLATEA-F7-4'] });
    const l = llaves[0];
    const r = await validar(await puerta(), F.t01, await qrRotatorio(l.llave, l.fcod, l.codigo, ventanaActual() - 20));
    expect(r.datos.resultado).toBe('caducado');
  });

  it('el QR estático del PDF también vale', async () => {
    const { pedido } = await comprar({ funcionId: F.t03, cantidad: 1 });
    const qr = await qrEstatico(m.ctx.config.SECRETO_QR, F.t03, pedido.entradas[0].codigo);
    expect((await validar(await puerta(), F.t03, qr)).datos.resultado).toBe('valida');
  });

  it('dice si es de otra función y de cuál', async () => {
    const { llaves } = await comprar({ funcionId: F.t03, cantidad: 1 });
    const l = llaves[0];
    const r = await validar(await puerta(), F.t01, await qrRotatorio(l.llave, l.fcod, l.codigo));
    expect(r.datos.resultado).toBe('otra_funcion');
    expect(r.datos.detalle).toContain('aforo general');
  });

  it('detecta códigos manipulados, desconocidos y entradas anuladas', async () => {
    const { pedido, llaves } = await comprar({ funcionId: F.t03, cantidad: 2 });
    const p = await puerta();
    const qr = await qrRotatorio(llaves[0].llave, llaves[0].fcod, llaves[0].codigo);
    expect((await validar(p, F.t03, qr.slice(0, -3) + 'AAA')).datos.resultado).toBe('manipulada');
    expect((await validar(p, F.t03, 'hola')).datos.resultado).toBe('desconocida');
    await m.ctx.db.query(`update entradas set estado = 'devuelta' where codigo = $1`, [pedido.entradas[1].codigo]);
    const otra = llaves.find((x: any) => x.codigo === pedido.entradas[1].codigo) ?? { ...llaves[0], codigo: pedido.entradas[1].codigo };
    const qr2 = await qrEstatico(m.ctx.config.SECRETO_QR, F.t03, otra.codigo);
    expect((await validar(p, F.t03, qr2)).datos.resultado).toBe('anulada');
  });

  it('varios dispositivos a la vez con la misma entrada: solo entra una vez', async () => {
    const { llaves } = await comprar({ funcionId: F.t01, butacas: ['PLATEA-F7-5'] });
    const l = llaves[0];
    const p = await puerta();
    const qr = await qrRotatorio(l.llave, l.fcod, l.codigo);
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => validar(p, F.t01, qr, `puerta-${i}`)));
    expect(rs.filter((r) => r.datos.resultado === 'valida')).toHaveLength(1);
    expect(rs.filter((r) => r.datos.resultado === 'usada')).toHaveLength(19);
  });

  it('sin conexión: descarga el paquete y al sincronizar detecta la doble entrada entre dispositivos', async () => {
    const { pedido } = await comprar({ funcionId: F.t01, butacas: ['PLATEA-F7-6'] });
    const p = await puerta();
    const paquete = (await p.get(`/api/puerta/funciones/${F.t01}/paquete`)).datos;
    const e = paquete.entradas.find((x: any) => x.codigo === pedido.entradas[0].codigo);
    expect(e.llave).toBeTruthy();
    expect(e.huellaEstatica).toBeTruthy();
    expect(Object.keys(paquete.otras).length).toBeGreaterThan(0);
    const a = await p.post('/api/puerta/sincronizar', { funcionId: F.t01, dispositivo: 'movil-a', lecturas: [{ codigo: e.codigo, resultado: 'valida', leidoEn: new Date(Date.now() - 60_000).toISOString() }] });
    const b = await p.post('/api/puerta/sincronizar', { funcionId: F.t01, dispositivo: 'movil-b', lecturas: [{ codigo: e.codigo, resultado: 'valida', leidoEn: new Date().toISOString() }] });
    expect(a.datos.aplicadas).toBe(1);
    expect(b.datos.dobles).toHaveLength(1);
    // reintentar la misma sincronización no cambia nada
    const a2 = await p.post('/api/puerta/sincronizar', { funcionId: F.t01, dispositivo: 'movil-a', lecturas: [{ codigo: e.codigo, resultado: 'valida', leidoEn: new Date(Date.now() - 60_000).toISOString().slice(0, 19) + 'Z' }] });
    expect(a2.statusCode).toBe(200);
  });

  it('el aforo dentro se ve en tiempo real', async () => {
    const p = await puerta();
    const r = (await p.get(`/api/puerta/funciones/${F.t01}/estado`)).datos;
    expect(r.dentro).toBeGreaterThan(0);
    expect(r.vendidas).toBeGreaterThanOrEqual(r.dentro);
  });

  it('permisos: taquilla no valida en puerta y otro organizador no ve nada', async () => {
    const t = await m.cliente().entrar('taquilla@taquilla.test');
    expect((await t.get('/api/puerta/funciones')).statusCode).toBe(403);
    const otro = await m.cliente().entrar('teatro@ejemplo.test');
    expect((await otro.get(`/api/puerta/funciones/${F.t01}/paquete`)).statusCode).toBe(404);
    expect((await otro.post('/api/puerta/validar', { funcionId: F.t01, qr: 'x', dispositivo: 'otro-1' })).statusCode).toBe(404);
  });

  it('PDF de las entradas y adjunto en el correo', async () => {
    const { token, c } = await comprar({ funcionId: F.t01, butacas: ['PLATEA-F12-8'] });
    const pdf = await m.app.inject({ method: 'GET', url: `/api/publico/pedidos/${token}/pdf` });
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    const correo = await m.ctx.db.one(`select adjuntos from correos_salientes where para = 'publico@ejemplo.test' and asunto like '%Tus entradas%' order by creado_en desc limit 1`);
    expect(correo!.adjuntos[0].tipo).toBe('application/pdf');
    void c;
  });

  it('cuenta del cliente con enlace por correo', async () => {
    const c = m.cliente();
    expect((await c.post('/api/cliente/acceso', { email: 'publico@ejemplo.test' })).statusCode).toBe(200);
    expect((await c.post('/api/cliente/acceso', { email: 'nadie@ejemplo.test' })).statusCode).toBe(200);
    const correo = await m.ctx.db.one(`select texto from correos_salientes where para = 'publico@ejemplo.test' and asunto like 'Tu enlace%' order by creado_en desc limit 1`);
    const acceso = decodeURIComponent(correo!.texto.match(/acceso=([^\s]+)/)![1]);
    expect((await c.get('/api/cliente/pedidos')).statusCode).toBe(401);
    const r = await m.app.inject({ method: 'POST', url: '/api/cliente/entrar', payload: { acceso } });
    const cookie = String(r.headers['set-cookie']).split(';')[0];
    const lista = await m.app.inject({ method: 'GET', url: '/api/cliente/pedidos', headers: { cookie } });
    expect(lista.json().pedidos.length).toBeGreaterThan(3);
    expect(lista.json().pedidos[0].enlace).toMatch(/^\/pedido\//);
    expect(await m.ctx.db.one(`select 1 from correos_salientes where para = 'nadie@ejemplo.test'`)).toBeNull();
  });
});
