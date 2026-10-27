/**
 * Imágenes subidas desde el panel (cartel vertical e imagen para listados).
 * Se guardan en la base de datos y se sirven desde la propia web (/api/publico/imagenes/:id),
 * así cumplen la CSP (img-src 'self') sin depender de almacenamiento externo.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto';
import { exigir } from '../auth';
import { auditar } from '../auditoria';
import { invalido, noEncontrado } from '../errores';

export const MAX_IMAGEN = 5 * 1024 * 1024;

/** Detecta el tipo por la firma del fichero (no por lo que diga el navegador) y lee el tamaño en píxeles. */
export function leerImagen(b: Buffer): { tipo: 'image/jpeg' | 'image/png' | 'image/webp'; ancho: number | null; alto: number | null } | null {
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { tipo: 'image/png', ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      const largo = b.readUInt16BE(i + 2);
      // SOF0..SOF15 salvo DHT(C4), JPG(C8) y DAC(CC)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { tipo: 'image/jpeg', alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
      i += 2 + largo;
    }
    return { tipo: 'image/jpeg', ancho: null, alto: null };
  }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const f = b.toString('ascii', 12, 16);
    if (f === 'VP8X') return { tipo: 'image/webp', ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3) };
    if (f === 'VP8 ') return { tipo: 'image/webp', ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
    if (f === 'VP8L') { const v = b.readUInt32LE(21); return { tipo: 'image/webp', ancho: (v & 0x3fff) + 1, alto: ((v >> 14) & 0x3fff) + 1 }; }
    return { tipo: 'image/webp', ancho: null, alto: null };
  }
  return null;
}

export async function rutasImagenes(app: FastifyInstance, ctx: Contexto) {
  app.post('/api/imagenes', { bodyLimit: Math.ceil(MAX_IMAGEN * 1.4) + 4096 }, async (req) => {
    const c = exigir(ctx, req, 'eventos.editar');
    const { base64 } = z.object({ base64: z.string().min(16).max(Math.ceil(MAX_IMAGEN * 1.37) + 16) }).parse(req.body);
    const datos = Buffer.from(base64.replace(/^data:[^,]*,/, ''), 'base64');
    if (datos.length > MAX_IMAGEN) throw invalido('La imagen pesa más de 5 MB: redúcela antes de subirla');
    const info = leerImagen(datos);
    if (!info) throw invalido('Solo se admiten imágenes JPG, PNG o WebP');
    const r = await ctx.db.one<{ id: string }>(
      'insert into imagenes (organizador_id, tipo, ancho, alto, bytes, tamano, creado_por) values ($1, $2, $3, $4, $5, $6, $7) returning id',
      [c.organizadorId, info.tipo, info.ancho, info.alto, datos, datos.length, c.usuarioId],
    );
    await auditar(ctx.db, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'imagen.subir', entidad: 'imagen', entidadId: r!.id, datos: { tipo: info.tipo, ancho: info.ancho, alto: info.alto, tamano: datos.length }, ip: req.ip });
    return { id: r!.id, url: `/api/publico/imagenes/${r!.id}`, tipo: info.tipo, ancho: info.ancho, alto: info.alto };
  });

  app.get('/api/publico/imagenes/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const i = await ctx.db.one<{ tipo: string; bytes: Buffer }>('select tipo, bytes from imagenes where id = $1', [id]);
    if (!i) throw noEncontrado('Imagen');
    // El id cambia con cada subida: se puede guardar en caché para siempre.
    reply.header('cache-control', 'public, max-age=31536000, immutable');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('content-security-policy', "default-src 'none'");
    return reply.type(i.tipo).send(Buffer.isBuffer(i.bytes) ? i.bytes : Buffer.from(i.bytes as any));
  });
}
