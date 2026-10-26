'use client';
import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { api, eur, fechaLarga } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { accionFuncion } from '@/lib/funciones';

type Isla = { id: string; nombre: string; estado?: string; etiqueta?: string; colores: { base: string; acento: string; claro: string } };
type Funcion = {
  imagen_url?: string | null;
  id: string; titulo: string; artistas: string[]; fecha: string; hora: string | null; modo_venta: string; estado: string; venta_externa_url: string | null;
  es_prueba: boolean; verificar: boolean; recinto_nombre: string; municipio: string | null; isla: string; precio_desde: number | null; zonas_con_precio: number; edad_minima: number | null;
};

export default function Cartelera({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t, locale } = useT();
  const [e, setE] = useState<any>(null);
  const [error, setError] = useState('');
  const [isla, setIsla] = useState('todas');
  useEffect(() => {
    api(`/api/publico/eventos/${slug}`).then(setE).catch((err) => setError(err.message));
    try {
      const g = sessionStorage.getItem('isla:' + slug);
      if (g) setIsla(g);
    } catch {}
  }, [slug]);
  const islas: Isla[] = e?.islas ?? [];
  const porId = useMemo(() => Object.fromEntries(islas.map((i) => [i.id, i])), [islas]);
  const elegir = (i: string) => {
    setIsla(i);
    try {
      sessionStorage.setItem('isla:' + slug, i);
    } catch {}
  };
  if (error) return <p className="aviso bad" role="alert">{error}</p>;
  if (!e) return <p role="status">{t('cargando')}</p>;
  const funciones: Funcion[] = e.funciones.filter((f: Funcion) => isla === 'todas' || f.isla === isla);

  return (
    <>
      <header className="stack" style={{ gap: 6 }}>
        <span className="tag">{e.organizador_nombre}</span>
        <h1>{e.nombre}</h1>
      </header>
      <div role="group" aria-label={t('filtrarIsla')} className="fila" style={{ gap: 6 }}>
        <button className="pill" aria-pressed={isla === 'todas'} onClick={() => elegir('todas')}>{t('todas')}</button>
        {islas.map((i) => (
          <button key={i.id} className="pill" aria-pressed={isla === i.id} onClick={() => elegir(i.id)} disabled={i.estado === 'proximamente'}
            style={isla === i.id ? { background: i.colores.acento, color: '#fff', borderColor: i.colores.acento } : undefined}>
            <i className="mu" style={{ background: i.colores.acento, borderRadius: 99 }} aria-hidden="true" />
            {i.nombre}{i.estado === 'proximamente' && <span className="small"> · {i.etiqueta ?? t('proximamente')}</span>}
          </button>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{funciones.length} · {t('cartelera')}</p>
      <div className="rejilla">
        {funciones.map((f) => {
          const a = accionFuncion(f);
          const color = porId[f.isla]?.colores.acento ?? 'var(--line)';
          return (
            <article key={f.id} className="panel stack" style={{ borderTop: `5px solid ${color}`, gap: 8 }}>
              {f.imagen_url && <img src={f.imagen_url} alt="" loading="lazy" width={1024} height={1536} style={{ width: '100%', height: 'auto', borderRadius: 8 }} />}
              <div className="fila" style={{ justifyContent: 'space-between' }}>
                <span className="small" style={{ fontWeight: 700, color: 'var(--muted)' }}>{porId[f.isla]?.nombre ?? f.isla}</span>
                {f.es_prueba && <span className="tag demo">{t('funcionPrueba')}</span>}
              </div>
              <h2>{f.titulo}</h2>
              {f.artistas.length > 0 && <p className="small">{f.artistas.join(' · ')}</p>}
              <p className="small muted">
                <span className="capital">{fechaLarga(f.fecha, locale)}</span> · {f.hora ?? t('horaPorConfirmar')}<br />
                {f.recinto_nombre}{f.municipio ? `, ${f.municipio}` : ''}
              </p>
              {f.edad_minima ? <p className="small">{t('edadMinima', { n: f.edad_minima })}</p> : null}
              <div className="fila" style={{ justifyContent: 'space-between', marginTop: 'auto' }}>
                <span className="small">{f.modo_venta === 'libre' ? '' : f.precio_desde !== null ? `${t('desde')} ${eur(f.precio_desde)}` : t('precioPorConfirmar')}</span>
                {a.tipo === 'comprar' ? (
                  <Link className="btn acento sm" href={`/f/${f.id}`} aria-label={`${t('comprar')}: ${f.titulo}, ${fechaLarga(f.fecha, locale)}`}>{t('comprar')}</Link>
                ) : a.tipo === 'externa' ? (
                  <a className="btn sec sm" href={f.venta_externa_url!} target="_blank" rel="noopener noreferrer">{t('ventaOficial')}</a>
                ) : (
                  <Link className="small" href={`/f/${f.id}`}>{t(a.texto)}</Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
