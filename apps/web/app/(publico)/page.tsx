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
      <h1>{t('cartelera')}</h1>
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
