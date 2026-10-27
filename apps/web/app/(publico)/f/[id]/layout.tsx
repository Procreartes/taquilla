import type { Metadata } from 'next';
import { fechaCompartir, leerPublico, metadatosCompartir } from '@/lib/metadatos';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const f = await leerPublico<any>(`/api/publico/funciones/${id}`);
  if (!f) return { title: 'Función no encontrada' };
  const lugar = `${f.recinto_nombre}${f.municipio ? `, ${f.municipio}` : ''}`;
  const cuando = `${fechaCompartir(f.fecha)}${f.hora ? ` · ${f.hora}` : ''}`;
  const tieneImagen = !!(f.imagen_url || f.imagen_tarjeta_url || f.evento_imagen_url || f.evento_imagen_tarjeta_url);
  return metadatosCompartir({
    titulo: f.titulo,
    descripcion: `${cuando.charAt(0).toUpperCase()}${cuando.slice(1)} · ${lugar}. Compra tus entradas y llévalas en el móvil.`,
    url: `/f/${id}`,
    imagen: tieneImagen ? `/api/publico/og/funcion/${id}` : null,
    alt: `Cartel: ${f.titulo}`,
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
