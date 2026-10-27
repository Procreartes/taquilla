import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { montar } from './ayuda';
import { pdfEntradas } from '../src/servicios/entradas';
import { correoConfirmacion, urlImagenCorreo } from '../src/servicios/plantillas';
import { varianteImagen } from '../src/servicios/imagenes';

let m: Awaited<ReturnType<typeof montar>>;
let cartel: string;
let eventoSlug: string;
let funcionId: string;

beforeAll(async () => {
  m = await montar();
  const g = await m.cliente().entrar('produccion@taquilla.test');
  const jpg = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#5a2ca0' } }).jpeg().toBuffer();
  cartel = (await g.post('/api/imagenes', { base64: jpg.toString('base64') })).datos.url;
  const ev = await g.post('/api/eventos', { slug: 'concierto-portada', nombre: 'Concierto de la portada', tipo: 'evento', categoria: 'musica', destacado: true, publicado: true, imagen_url: cartel });
  expect(ev.statusCode).toBe(200);
  eventoSlug = ev.datos.slug;
  const recintos = await g.get('/api/recintos');
  const manana = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const f = await g.post(`/api/eventos/${ev.datos.id}/funciones`, { codigo: 'P1', recinto_id: recintos.datos[0].id, titulo: 'Gran concierto', artistas: ['Banda Prueba'], fecha: manana, hora: '21:00', modo_venta: 'general', aforo: 50 });
  expect(f.statusCode).toBe(200);
  funcionId = f.datos.id;
});
afterAll(async () => m.cerrar());

describe('portada, agenda y miniaturas para compartir', () => {
  it('la cartelera trae categoría, destacado y enlace directo si solo hay una función', async () => {
    const r = await m.cliente().get('/api/publico/eventos');
    const e = r.datos.find((x: any) => x.slug === eventoSlug);
    expect(e).toMatchObject({ categoria: 'musica', destacado: true, funcion_unica: funcionId });
  });

  it('la agenda lista las funciones futuras con su evento e imagen (heredada del evento)', async () => {
    const r = await m.cliente().get('/api/publico/agenda');
    const f = r.datos.find((x: any) => x.id === funcionId);
    expect(f).toMatchObject({ evento_slug: eventoSlug, categoria: 'musica', imagen: cartel, artistas: ['Banda Prueba'] });
    expect(r.datos.every((x: any) => String(x.fecha).slice(0, 10) >= new Date().toISOString().slice(0, 10))).toBe(true);
  });

  it('genera la miniatura 1200×630 de un evento y de una función', async () => {
    for (const ruta of [`/api/publico/og/evento/${eventoSlug}`, `/api/publico/og/funcion/${funcionId}`]) {
      const r = await m.app.inject({ method: 'GET', url: ruta });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toContain('image/jpeg');
      const meta = await sharp(r.rawPayload).metadata();
      expect([meta.width, meta.height]).toEqual([1200, 630]);
    }
    expect((await m.app.inject({ method: 'GET', url: '/api/publico/og/evento/no-existe' })).statusCode).toBe(404);
  });

  it('la versión para el correo es ligera (600 px de ancho)', async () => {
    const r = await m.app.inject({ method: 'GET', url: `${cartel}/correo` });
    expect(r.statusCode).toBe(200);
    expect((await sharp(r.rawPayload).metadata()).width).toBe(600);
  });

  it('el correo de las entradas lleva el cartel con dirección absoluta', () => {
    expect(urlImagenCorreo(cartel, 'https://entradas.grupolivon.com/pedido/abc')).toBe(`https://entradas.grupolivon.com${cartel}/correo`);
    expect(urlImagenCorreo('/carteles/x.jpg', 'https://entradas.grupolivon.com/pedido/abc')).toBe('https://entradas.grupolivon.com/carteles/x.jpg');
    const c = correoConfirmacion({ titulo: 'Gran concierto', fecha: '2026-12-01', hora: '21:00', recinto_nombre: 'Teatro', codigo: 'ABC', entradas: [], gastos_cent: 0, total_cent: 1500,
      impuesto_tipo: 3, impuesto_nombre: 'IGIC', organizador_nombre: 'Org', cartel_url: cartel, idioma: 'es' }, 'https://entradas.grupolivon.com/pedido/abc');
    expect(c.html).toContain(`<img src="https://entradas.grupolivon.com${cartel}/correo"`);
  });

  it('el PDF de las entradas incluye el cartel', async () => {
    const base = { codigo: 'ABC', organizador_nombre: 'Org', evento_nombre: 'Evento', titulo: 'Gran concierto', fecha: '2026-12-01', hora: '21:00', recinto_nombre: 'Teatro',
      funcion_id: funcionId, impuesto_nombre: 'IGIC', numero_factura: 'F-1', entradas: [{ codigo: 'TKT-AAAA-BBBB', estado: 'valida', descripcion: 'General', zona_codigo: 'general', precio_cent: 1500 }] };
    const sin = await pdfEntradas(m.ctx, base);
    const con = await pdfEntradas(m.ctx, { ...base, cartel_url: cartel });
    expect(con.toString('latin1')).toContain('/Subtype /Image');
    expect(con.length).toBeGreaterThan(sin.length);
    expect(await varianteImagen(m.ctx, null, 'pdf')).toBeNull();
  });
});
