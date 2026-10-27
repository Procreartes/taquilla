/**
 * Variantes de imágenes: miniatura para WhatsApp/redes (1200×630), versión ligera para correo y PDF.
 * La imagen original puede estar en la base de datos (/api/publico/imagenes/:id) o ser un fichero de la web (/carteles/…).
 */
import type { Contexto } from '../contexto';

export type Variante = 'og' | 'correo' | 'pdf';

const RUTA_PROPIA = /^\/api\/publico\/imagenes\/([0-9a-f-]{36})$/;
const cache = new Map<string, Buffer>();
const MAX_CACHE = 200;

async function sharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    return null;
  }
}

/** Bytes originales de una imagen a partir de su URL (propia, de la web o https). */
export async function bytesDeImagen(ctx: Contexto, url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  const propia = url.match(RUTA_PROPIA);
  if (propia) {
    const r = await ctx.db.one<{ bytes: Buffer }>('select bytes from imagenes where id = $1', [propia[1]]);
    return r ? (Buffer.isBuffer(r.bytes) ? r.bytes : Buffer.from(r.bytes as any)) : null;
  }
  const absoluta = url.startsWith('/') ? `${ctx.config.URL_PUBLICA.replace(/\/$/, '')}${url}` : url;
  if (!/^https?:\/\//.test(absoluta)) return null;
  try {
    const res = await fetch(absoluta, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const b = Buffer.from(await res.arrayBuffer());
    return b.length <= 8 * 1024 * 1024 ? b : null;
  } catch {
    return null;
  }
}

/** Devuelve la variante en JPEG (o null si no hay imagen o no se puede procesar). */
export async function varianteImagen(ctx: Contexto, url: string | null | undefined, v: Variante): Promise<Buffer | null> {
  if (!url) return null;
  const clave = `${v}:${url}`;
  const ya = cache.get(clave);
  if (ya) return ya;
  const original = await bytesDeImagen(ctx, url);
  if (!original) return null;
  const s = await sharp();
  if (!s) return null;
  let salida: Buffer;
  try {
    if (v === 'og') {
      // Fondo: la propia imagen ampliada y desenfocada; encima, la imagen entera centrada.
      const fondo = await s(original).rotate().resize(1200, 630, { fit: 'cover' }).blur(28).modulate({ brightness: 0.55 }).toBuffer();
      const frente = await s(original).rotate().resize(1200, 590, { fit: 'inside' }).toBuffer();
      salida = await s(fondo).composite([{ input: frente, gravity: 'center' }]).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    } else {
      const ancho = v === 'correo' ? 600 : 900;
      salida = await s(original).rotate().resize({ width: ancho, height: 1400, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    }
  } catch {
    return null;
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(clave, salida);
  return salida;
}

/** La mejor imagen para compartir: la de listados si existe; si no, el cartel. */
export const imagenParaCompartir = (x: { imagen_tarjeta_url?: string | null; imagen_url?: string | null }) => x.imagen_tarjeta_url || x.imagen_url || null;
/** El cartel para la entrada: el vertical si existe; si no, la de listados. */
export const imagenCartel = (x: { imagen_url?: string | null; imagen_tarjeta_url?: string | null }) => x.imagen_url || x.imagen_tarjeta_url || null;
