'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSesion } from '@/lib/sesion';

export default function NavFuncion({ id }: { id: string }) {
  const ruta = usePathname();
  const { puede } = useSesion();
  const enlaces = [
    { href: `/panel/funciones/${id}`, texto: 'Datos y precios', p: 'eventos.ver' },
    { href: `/panel/funciones/${id}/ventas`, texto: 'Ventas y pedidos', p: 'informes.ver' },
    { href: `/panel/funciones/${id}/invitaciones`, texto: 'Invitaciones y protocolo', p: 'invitaciones.gestionar' },
    { href: `/panel/funciones/${id}/liquidacion`, texto: 'Liquidación', p: 'liquidacion.ver' },
  ].filter((e) => puede(e.p));
  return (
    <nav aria-label="Secciones de la función" className="fila" style={{ gap: 4 }}>
      {enlaces.map((e) => <Link key={e.href} className="pill" href={e.href} aria-current={ruta === e.href ? 'page' : undefined}>{e.texto}</Link>)}
    </nav>
  );
}
