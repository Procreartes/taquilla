'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, eur, fechaLarga } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function Cuenta() {
  const { t, locale } = useT();
  const [datos, setDatos] = useState<{ email: string; pedidos: any[] } | null | 'sin'>(null);
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  const cargar = () => api('/api/cliente/pedidos').then(setDatos).catch(() => setDatos('sin'));
  useEffect(() => {
    const acceso = new URLSearchParams(window.location.search).get('acceso');
    if (acceso) {
      api('/api/cliente/entrar', { cuerpo: { acceso } })
        .then(() => {
          window.history.replaceState(null, '', '/cuenta');
          cargar();
        })
        .catch((e) => {
          setError(e.message);
          setDatos('sin');
        });
    } else cargar();
  }, []);

  if (datos === null) return <p role="status">{t('cargando')}</p>;
  if (datos === 'sin') {
    return (
      <div className="stack" style={{ maxWidth: 520 }}>
        <h1>{t('cuenta')}</h1>
        <p>Escribe el correo con el que compraste y te enviaremos un enlace para ver todas tus entradas. Sin contraseñas.</p>
        {enviado ? (
          <p className="aviso ok" role="status">Si hay compras con ese correo, te acabamos de enviar el enlace. Revisa tu bandeja de entrada.</p>
        ) : (
          <form className="panel stack" onSubmit={async (e) => { e.preventDefault(); setError(''); try { await api('/api/cliente/acceso', { cuerpo: { email } }); setEnviado(true); } catch (err: any) { setError(err.message); } }}>
            <label className="campo">{t('email')}<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <button className="btn">Enviarme el enlace</button>
          </form>
        )}
        {error && <p className="aviso bad" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1>{t('cuenta')}</h1>
        <button className="btn sec sm" onClick={async () => { await api('/api/cliente/salir', { cuerpo: {} }); setDatos('sin'); }}>Salir</button>
      </div>
      <p className="muted">{datos.email}</p>
      <div className="rejilla">
        {datos.pedidos.map((p) => (
          <Link key={p.codigo} href={p.enlace} className="panel stack" style={{ textDecoration: 'none', color: 'inherit', gap: 6 }}>
            {p.es_prueba && <span className="tag demo">{t('funcionPrueba')}</span>}
            <h2>{p.titulo}</h2>
            <p className="small muted"><span className="capital">{fechaLarga(p.fecha, locale)}</span>{p.hora ? ` · ${p.hora}` : ''} · {p.recinto_nombre}</p>
            <p className="small">{p.entradas} · {eur(p.total_cent)} · <span className="mono">{p.codigo}</span></p>
          </Link>
        ))}
      </div>
      {!datos.pedidos.length && <p className="vacio">No hay compras con este correo.</p>}
    </div>
  );
}
