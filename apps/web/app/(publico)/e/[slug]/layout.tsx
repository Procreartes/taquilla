import type { Metadata } from 'next';
import { fechaCompartir, leerPublico, metadatosCompartir } from '@/lib/metadatos';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const e = await leerPublico<any>(`/api/publico/eventos/${encodeURIComponent(slug)}`);
  if (!e) return { title: 'Evento no encontrado' };
  const fs: any[] = e.funciones ?? [];
  const fechas = fs.length === 1 ? fechaCompartir(fs[0].fecha) : fs.length ? `${fs.length} funciones desde el ${fechaCompartir(fs[0].fecha)}` : '';
  const resumen = e.descripcion ? String(e.descripcion).replace(/\s+/g, ' ').slice(0, 150) : 'Compra tus entradas y llévalas en el móvil.';
  return metadatosCompartir({
    titulo: e.nombre,
    descripcion: [fechas && fechas.charAt(0).toUpperCase() + fechas.slice(1), resumen].filter(Boolean).join(' · '),
    url: `/e/${slug}`,
    imagen: e.imagen_url || e.imagen_tarjeta_url ? `/api/publico/og/evento/${encodeURIComponent(slug)}` : null,
    alt: e.nombre,
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
