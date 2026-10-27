'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ProveedorIdioma, SelectorIdioma, useT } from '@/lib/i18n';

function Buscador({ onBuscar, id }: { onBuscar?: () => void; id: string }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form role="search" className="buscador" onSubmit={(e) => {
      e.preventDefault();
      router.push(q.trim() ? `/agenda?q=${encodeURIComponent(q.trim())}` : '/agenda');
      onBuscar?.();
    }}>
      <label htmlFor={id} className="sr-only">{t('buscarBoton')}</label>
      <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('buscarPh')} enterKeyHint="search" />
      <button className="buscador-btn" aria-label={t('buscarBoton')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="m20 20-4-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
      </button>
    </form>
  );
}

function Cabecera() {
  const { t } = useT();
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const idMenu = useId();
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => setAbierto(false), [ruta]);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAbierto(false); boton.current?.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [abierto]);
  const enlaces = [
    { href: '/', texto: t('inicio') },
    { href: '/#cartelera', texto: t('cartelera') },
    { href: '/agenda', texto: t('agenda') },
    { href: '/cuenta', texto: t('cuenta') },
  ];
  const actual = (h: string) => (h === ruta ? 'page' : undefined);
  return (
    <header className="barra barra-publica">
      <Link className="marca" href="/">
        <img src="/icono.svg" alt="" width={30} height={30} /> Taquilla
      </Link>
      <nav aria-label="Principal" className="nav-escritorio">
        {enlaces.slice(1).map((l) => <Link key={l.href} className="pill" href={l.href} aria-current={actual(l.href)}>{l.texto}</Link>)}
      </nav>
      <div className="barra-derecha">
        <div className="solo-escritorio"><Buscador id="buscar-escritorio" /></div>
        <div className="solo-escritorio"><SelectorIdioma /></div>
        <button ref={boton} type="button" className="hamburguesa" aria-expanded={abierto} aria-controls={idMenu} onClick={() => setAbierto(!abierto)}>
          <span className="sr-only">{abierto ? t('cerrarMenu') : t('menu')}</span>
          <span className="hamburguesa-lineas" aria-hidden="true"><i /><i /><i /></span>
        </button>
      </div>
      <div id={idMenu} className="menu-movil" hidden={!abierto}>
        <Buscador id="buscar-movil" onBuscar={() => setAbierto(false)} />
        <nav aria-label={t('menu')}>
          <ul>
            {enlaces.map((l) => <li key={l.href}><Link href={l.href} aria-current={actual(l.href)} onClick={() => setAbierto(false)}>{l.texto}</Link></li>)}
          </ul>
        </nav>
        <SelectorIdioma />
      </div>
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
      <p style={{ marginTop: 10 }}>Taquilla · Grupo Livon</p>
      <p style={{ marginTop: 6 }}><Link href="/entrar" className="pie-equipo">Acceso del equipo</Link></p>
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
