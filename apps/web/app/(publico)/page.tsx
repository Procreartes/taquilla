'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, fechaCorta } from '@/lib/api';
import { useT } from '@/lib/i18n';

type Evento = {
  slug: string; nombre: string; tipo: string; categoria: string | null; descripcion: string | null; desde: string; hasta: string; funciones: number;
  imagen_url?: string | null; imagen_tarjeta_url?: string | null; imagen_destacada_url?: string | null; destacado: boolean;
  funcion_unica: string | null; lugares: string | null; imagen_funcion: string | null;
};

/** Como mucho tres lugares; si hay más, «y N más». */
function lugaresCortos(l: string | null, mas: (n: number) => string) {
  if (!l) return '';
  const xs = l.split(' · ');
  return xs.length <= 3 ? xs.join(' · ') : `${xs.slice(0, 3).join(' · ')} ${mas(xs.length - 3)}`;
}

const enlaceEvento = (e: Evento) => (e.funcion_unica ? `/f/${e.funcion_unica}` : `/e/${e.slug}`);

function Fechas({ e }: { e: Evento }) {
  const { locale } = useT();
  return <>{e.desde === e.hasta ? fechaCorta(e.desde, locale) : `${fechaCorta(e.desde, locale)} – ${fechaCorta(e.hasta, locale)}`}</>;
}

/** Bloque promocional del evento destacado (el más próximo de los marcados como destacados). */
function Destacado({ e }: { e: Evento }) {
  const { t } = useT();
  const panoramica = e.imagen_destacada_url;
  const imagen = panoramica || e.imagen_url || e.imagen_tarjeta_url || e.imagen_funcion;
  return (
    <section className={`destacado ${panoramica ? 'con-panoramica' : ''}`} aria-labelledby="destacado-titulo">
      {panoramica && <img src={panoramica} alt="" className="destacado-fondo" />}
      {!panoramica && imagen && <img src={imagen} alt="" className="destacado-cartel" />}
      <div className="destacado-texto">
        <span className="destacado-etiqueta">{t('destacado')}</span>
        <h2 id="destacado-titulo">{e.nombre}</h2>
        <p className="destacado-datos"><span className="capital"><Fechas e={e} /></span>{e.lugares ? ` · ${lugaresCortos(e.lugares, (n) => t('yMas', { n }))}` : ''}</p>
        {e.descripcion && <p className="destacado-desc">{e.descripcion.length > 180 ? `${e.descripcion.slice(0, 177)}…` : e.descripcion}</p>}
        <div><Link className="btn hero-btn" href={enlaceEvento(e)}>{e.funcion_unica ? t('comprarEntradas') : t('verEvento')}</Link></div>
      </div>
    </section>
  );
}

export default function Inicio() {
  const { t } = useT();
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  useEffect(() => {
    api<Evento[]>('/api/publico/eventos').then(setEventos).catch(() => setEventos([]));
  }, []);
  const destacado = eventos?.find((e) => e.destacado) ?? null;
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
            <Link className="btn hero-btn sec" href="/agenda">{t('heroAgenda')}</Link>
          </div>
        </div>
        <ul className="hero-tarjetas">
          <li><Link href="/agenda?cat=musica"><span className="hero-icono" aria-hidden="true">♪</span><b>{t('heroMusica')}</b><span>{t('heroMusicaTxt')}</span></Link></li>
          <li><Link href="/agenda?cat=festival"><span className="hero-icono" aria-hidden="true">✦</span><b>{t('heroFestivales')}</b><span>{t('heroFestivalesTxt')}</span></Link></li>
          <li><Link href="/agenda?cat=espectaculo"><span className="hero-icono" aria-hidden="true">◐</span><b>{t('heroEspectaculos')}</b><span>{t('heroEspectaculosTxt')}</span></Link></li>
        </ul>
      </section>
      {destacado && <Destacado e={destacado} />}
      <h2 id="cartelera" className="titulo-seccion">{t('cartelera')}</h2>
      {!eventos ? <p role="status">{t('cargando')}</p> : !eventos.length ? <p className="vacio">{t('sinEventos')}</p> : (
        <ul className="cartelera">
          {eventos.map((e) => {
            const tarjeta = e.imagen_tarjeta_url;
            const cartel = !tarjeta ? e.imagen_url || e.imagen_funcion : null;
            return (
              <li key={e.slug}>
                <Link href={enlaceEvento(e)} className="tarjeta-evento">
                  {tarjeta && <img src={tarjeta} alt="" loading="lazy" className="tarjeta-img" />}
                  {cartel && <span className="tarjeta-marco"><img src={cartel} alt="" loading="lazy" /></span>}
                  <span className="tag">{e.tipo}</span>
                  <h3>{e.nombre}</h3>
                  <p className="small muted"><span className="capital"><Fechas e={e} /></span>{e.lugares ? ` · ${lugaresCortos(e.lugares, (n) => t('yMas', { n }))}` : ''}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
