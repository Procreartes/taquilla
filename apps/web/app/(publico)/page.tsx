'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, fechaCorta } from '@/lib/api';
import { useT } from '@/lib/i18n';

type Evento = { slug: string; nombre: string; tipo: string; desde: string; hasta: string; funciones: number; imagen_url?: string | null };

export default function Inicio() {
  const { t, locale } = useT();
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  useEffect(() => {
    api<Evento[]>('/api/publico/eventos').then(setEventos).catch(() => setEventos([]));
  }, []);
  return (
    <>
      <section className="hero" aria-labelledby="hero-titulo">
        <div className="hero-luces" aria-hidden="true" />
        <div className="hero-cuerpo">
          <div className="hero-marcas">
            <img src="/marca/dislate-blanco.png" alt="Dislate Producciones" width={80} height={96} />
            <img src="/marca/livon-blanco.png" alt="Grupo Livon" width={110} height={38} />
          </div>
          <h1 id="hero-titulo">{t('heroTitulo')}</h1>
          <p className="hero-sub">{t('heroSub')}</p>
          <div className="fila" style={{ gap: 10 }}>
            <a className="btn hero-btn" href="#cartelera">{t('heroEventos')}</a>
            <a className="btn hero-btn sec" href="#cartelera">{t('heroAgenda')}</a>
          </div>
        </div>
        <ul className="hero-tarjetas">
          <li><span className="hero-icono" aria-hidden="true">♪</span><b>{t('heroMusica')}</b><span>{t('heroMusicaTxt')}</span></li>
          <li><span className="hero-icono" aria-hidden="true">✦</span><b>{t('heroFestivales')}</b><span>{t('heroFestivalesTxt')}</span></li>
          <li><span className="hero-icono" aria-hidden="true">◐</span><b>{t('heroEspectaculos')}</b><span>{t('heroEspectaculosTxt')}</span></li>
        </ul>
      </section>
      <h2 id="cartelera" style={{ fontSize: 32, scrollMarginTop: 80 }}>{t('cartelera')}</h2>
      {!eventos ? <p role="status">{t('cargando')}</p> : (
        <div className="rejilla">
          {eventos.map((e) => (
            <Link key={e.slug} href={`/e/${e.slug}`} className="panel" style={{ textDecoration: 'none', color: 'inherit' }}>
              {e.imagen_url && <img src={e.imagen_url} alt="" loading="lazy" width={1024} height={1536} style={{ width: '100%', height: 'auto', borderRadius: 8, marginBottom: 8 }} />}
              <span className="tag">{e.tipo}</span>
              <h2 style={{ marginTop: 8 }}>{e.nombre}</h2>
              <p className="small muted">{fechaCorta(e.desde, locale)} – {fechaCorta(e.hasta, locale)} · {e.funciones}</p>
            </Link>
          ))}
        </div>
      )}
      <p className="small muted"><Link href="/entrar">Panel del equipo</Link></p>
    </>
  );
}
