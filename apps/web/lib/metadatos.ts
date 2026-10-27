/** Metadatos para compartir (WhatsApp, redes): se generan en el servidor leyendo la API pública. */
import type { Metadata } from 'next';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

export async function leerPublico<T = any>(ruta: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${ruta}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export function fechaCompartir(iso: string) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function metadatosCompartir(o: { titulo: string; descripcion: string; url: string; imagen: string | null; alt: string }): Metadata {
  const imagen = o.imagen
    ? { url: o.imagen, width: 1200, height: 630, type: 'image/jpeg', alt: o.alt }
    : { url: '/og-portada.jpg', width: 1200, height: 630, type: 'image/jpeg', alt: 'Taquilla' };
  return {
    title: o.titulo,
    description: o.descripcion,
    alternates: { canonical: o.url },
    openGraph: { type: 'website', siteName: 'Taquilla · Grupo Livon', locale: 'es_ES', url: o.url, title: o.titulo, description: o.descripcion, images: [imagen] },
    twitter: { card: 'summary_large_image', title: o.titulo, description: o.descripcion, images: [imagen.url] },
  };
}
