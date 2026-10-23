'use client';
/** Entrada en el móvil. El QR rotatorio firmado se añade en la fase 5. */
import { eur } from '@/lib/api';

export default function EntradaMovil({ entrada, funcion }: { token: string; entrada: any; funcion: any }) {
  return (
    <article className="panel stack" aria-label={`${funcion.titulo} · ${entrada.descripcion}`}>
      <span className="tag">{entrada.zona_codigo}</span>
      <h3>{entrada.descripcion}</h3>
      <p className="small">{eur(entrada.precio_cent)}</p>
      <p className="mono small">{entrada.codigo}</p>
    </article>
  );
}
