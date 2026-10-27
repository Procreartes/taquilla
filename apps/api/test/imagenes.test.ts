import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montar } from './ayuda';
import { leerImagen } from '../src/modulos/imagenes';

let m: Awaited<ReturnType<typeof montar>>;
beforeAll(async () => {
  m = await montar();
});
afterAll(async () => m.cerrar());

// PNG de 3×2 píxeles
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg==', 'base64');

describe('imágenes del panel', () => {
  it('reconoce el formato por la firma del fichero y lee el tamaño', () => {
    expect(leerImagen(PNG)).toEqual({ tipo: 'image/png', ancho: 3, alto: 2 });
    expect(leerImagen(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it('producción sube un cartel, se sirve al público y se puede poner en un evento', async () => {
    const g = await m.cliente().entrar('produccion@taquilla.test');
    const r = await g.post('/api/imagenes', { base64: PNG.toString('base64') });
    expect(r.statusCode).toBe(200);
    expect(r.datos.url).toMatch(/^\/api\/publico\/imagenes\/[0-9a-f-]{36}$/);
    expect(r.datos.ancho).toBe(3);

    const pub = await m.cliente().get(r.datos.url);
    expect(pub.statusCode).toBe(200);
    expect(pub.headers['content-type']).toContain('image/png');
    expect(pub.headers['x-content-type-options']).toBe('nosniff');

    const ev = await g.post('/api/eventos', { slug: 'evento-con-cartel', nombre: 'Evento con cartel', imagen_url: r.datos.url, imagen_tarjeta_url: r.datos.url });
    expect(ev.statusCode).toBe(200);
    expect(ev.datos.imagen_tarjeta_url).toBe(r.datos.url);
  });

  it('rechaza lo que no es una imagen y a quien no puede editar eventos', async () => {
    const g = await m.cliente().entrar('produccion@taquilla.test');
    const mal = await g.post('/api/imagenes', { base64: Buffer.from('<script>alert(1)</script>.....').toString('base64') });
    expect(mal.statusCode).toBe(400);
    const lectura = await m.cliente().entrar('lectura@taquilla.test');
    expect((await lectura.post('/api/imagenes', { base64: PNG.toString('base64') })).statusCode).toBe(403);
    expect((await m.cliente().post('/api/imagenes', { base64: PNG.toString('base64') })).statusCode).toBe(401);
  });
});
