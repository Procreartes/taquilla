'use client';
import Link from 'next/link';
import { ProveedorIdioma, SelectorIdioma, useT } from '@/lib/i18n';

function Cabecera() {
  const { t } = useT();
  return (
    <header className="barra">
      <Link className="marca" href="/">
        <img src="/icono.svg" alt="" width={28} height={28} /> Taquilla
      </Link>
      <nav aria-label="Principal" className="fila">
        <Link className="pill" href="/cuenta">{t('cuenta')}</Link>
        <SelectorIdioma />
      </nav>
    </header>
  );
}

function Pie() {
  const { t } = useT();
  return (
    <footer className="pie">
      <nav aria-label="Legal" className="fila" style={{ justifyContent: 'center' }}>
        <Link href="/legal/aviso-legal">{t('legal')}</Link>
        <Link href="/legal/privacidad">{t('privacidad')}</Link>
        <Link href="/legal/condiciones">{t('condiciones')}</Link>
        <Link href="/legal/cookies">{t('cookies')}</Link>
      </nav>
      <p style={{ marginTop: 10 }}>Taquilla · Grupo Livon · ProCreArtes — entorno de pruebas</p>
    </footer>
  );
}

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorIdioma>
      <Cabecera />
      <main id="contenido" className="wrap">{children}</main>
      <Pie />
    </ProveedorIdioma>
  );
}
