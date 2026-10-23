'use client';
import { useEffect } from 'react';
import { ProveedorIdioma } from '@/lib/i18n';

/** Páginas para insertar en otras webs: sin cabecera ni pie, y avisan de su altura al iframe. */
export default function LayoutWidget({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const avisar = () => window.parent?.postMessage({ taquillaAltura: document.documentElement.scrollHeight }, '*');
    const o = new ResizeObserver(avisar);
    o.observe(document.body);
    avisar();
    return () => o.disconnect();
  }, []);
  return (
    <ProveedorIdioma>
      <main id="contenido" style={{ padding: 12 }}>{children}</main>
    </ProveedorIdioma>
  );
}
