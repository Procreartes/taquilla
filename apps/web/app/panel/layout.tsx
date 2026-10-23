'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ProveedorSesion, useSesion } from '@/lib/sesion';
import { api } from '@/lib/api';

const ENLACES: { href: string; texto: string; permiso?: string }[] = [
  { href: '/panel', texto: 'Resumen' },
  { href: '/panel/eventos', texto: 'Eventos', permiso: 'eventos.ver' },
  { href: '/panel/recintos', texto: 'Recintos y planos', permiso: 'recintos.ver' },
  { href: '/panel/organizador', texto: 'Organizador', permiso: 'organizador.editar' },
  { href: '/panel/equipo', texto: 'Equipo', permiso: 'equipo.gestionar' },
  { href: '/puerta', texto: 'Puerta', permiso: 'puerta.validar' },
  { href: '/panel/integraciones', texto: 'Integraciones', permiso: 'organizador.editar' },
  { href: '/panel/correos', texto: 'Correos de prueba', permiso: 'correos.ver' },
  { href: '/panel/auditoria', texto: 'Auditoría', permiso: 'auditoria.ver' },
];

function Barra() {
  const { yo, puede } = useSesion();
  const ruta = usePathname();
  if (!yo) return null;
  const cambiar = async (id: string) => {
    await api('/api/auth/organizador', { cuerpo: { organizadorId: id } });
    window.location.reload();
  };
  const salir = async () => {
    await api('/api/auth/salir', { cuerpo: {} });
    window.location.href = '/entrar';
  };
  return (
    <header className="barra">
      <Link className="marca" href="/panel">Taquilla <span className="tag">Panel</span></Link>
      <nav aria-label="Panel">
        {ENLACES.filter((e) => !e.permiso || puede(e.permiso)).map((e) => (
          <Link key={e.href} className="pill" href={e.href} aria-current={ruta === e.href || (e.href !== '/panel' && ruta.startsWith(e.href)) ? 'page' : undefined}>{e.texto}</Link>
        ))}
      </nav>
      <div className="fila">
        <label className="sr-only" htmlFor="org">Organizador</label>
        <select id="org" value={yo.organizadorId ?? ''} onChange={(e) => cambiar(e.target.value)} style={{ maxWidth: 280 }}>
          {!yo.organizadorId && <option value="">Elige organizador</option>}
          {yo.organizadores.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
        <span className="small muted">{yo.usuario.nombre}{yo.rolNombre ? ` · ${yo.rolNombre}` : ''}</span>
        <button className="btn sec sm" onClick={salir}>Salir</button>
      </div>
    </header>
  );
}

export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorSesion>
      <Barra />
      <Contenido>{children}</Contenido>
    </ProveedorSesion>
  );
}

function Contenido({ children }: { children: React.ReactNode }) {
  const { yo } = useSesion();
  if (!yo) return <main id="contenido" className="wrap"><p className="muted" role="status">Cargando…</p></main>;
  return <main id="contenido" className="wrap">{children}</main>;
}
