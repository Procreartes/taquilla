'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { api, eur } from '@/lib/api';
import { accionFuncion } from '@/lib/funciones';
import { useT, type Clave } from '@/lib/i18n';

type Funcion = {
  id: string; titulo: string; artistas: string[] | null; fecha: string; hora: string | null; modo_venta: string; estado: string; venta_externa_url: string | null;
  recinto_nombre: string; municipio: string | null; isla: string | null; evento_slug: string; evento_nombre: string; evento_tipo: string; categoria: string | null;
  imagen: string | null; precio_desde: number | null; zonas_con_precio: number; es_prueba: boolean;
};

const CATEGORIAS: { id: string; texto: Clave }[] = [
  { id: '', texto: 'todo' }, { id: 'musica', texto: 'heroMusica' }, { id: 'festival', texto: 'heroFestivales' }, { id: 'espectaculo', texto: 'heroEspectaculos' },
];

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function encaja(f: Funcion, cat: string, q: string) {
  if (cat === 'festival' && f.categoria !== 'festival' && f.evento_tipo !== 'festival') return false;
  if (cat && cat !== 'festival' && f.categoria !== cat) return false;
  if (!q) return true;
  const texto = normal([f.titulo, f.evento_nombre, ...(f.artistas ?? []), f.recinto_nombre, f.municipio, f.isla].filter(Boolean).join(' '));
  return normal(q).split(/\s+/).filter(Boolean).every((p) => texto.includes(p));
}

function Agenda() {
  const { t, locale } = useT();
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const cat = params.get('cat') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [lista, setLista] = useState<Funcion[] | null>(null);
  useEffect(() => setQ(params.get('q') ?? ''), [params]);
  useEffect(() => {
    api<Funcion[]>('/api/publico/agenda').then(setLista).catch(() => setLista([]));
  }, []);

  const ir = (cambios: Record<string, string>) => {
    const n = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) v ? n.set(k, v) : n.delete(k);
    router.replace(`${ruta}${n.toString() ? `?${n}` : ''}`, { scroll: false });
  };

  const filtradas = useMemo(() => (lista ?? []).filter((f) => encaja(f, cat, q)), [lista, cat, q]);
  // Agrupa por mes
  const meses = useMemo(() => {
    const m = new Map<string, Funcion[]>();
    for (const f of filtradas) {
      const k = String(f.fecha).slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return [...m.entries()];
  }, [filtradas]);
  const nombreMes = (k: string) => {
    const [a, m] = k.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <header className="stack" style={{ gap: 6 }}>
        <h1>{t('agenda')}</h1>
        <p className="muted" style={{ margin: 0 }}>{t('agendaSub')}</p>
      </header>
      <form role="search" className="buscador buscador-grande" onSubmit={(e) => { e.preventDefault(); ir({ q: q.trim() }); }}>
        <label htmlFor="buscar-agenda" className="sr-only">{t('buscarBoton')}</label>
        <input id="buscar-agenda" type="search" value={q} placeholder={t('buscarPh')} enterKeyHint="search"
          onChange={(e) => { setQ(e.target.value); if (!e.target.value) ir({ q: '' }); }} />
        <button className="buscador-btn" aria-label={t('buscarBoton')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="m20 20-4-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </form>
      <div className="fila" role="group" aria-label={t('agenda')}>
        {CATEGORIAS.map((c) => (
          <button key={c.id} type="button" className="pill" aria-pressed={cat === c.id} onClick={() => ir({ cat: c.id })}>{t(c.texto)}</button>
        ))}
      </div>
      {!lista ? <p role="status">{t('cargando')}</p> : (
        <>
          <p className="small muted" role="status" style={{ margin: 0 }}>{filtradas.length === 1 ? t('resultado1') : t('resultados', { n: filtradas.length })}</p>
          {!filtradas.length && (
            <div className="vacio stack" style={{ gap: 10 }}>
              <p style={{ margin: 0 }}>{t('sinResultados')}</p>
              {(q || cat) && <div><button type="button" className="btn sec sm" onClick={() => { setQ(''); ir({ q: '', cat: '' }); }}>{t('limpiar')}</button></div>}
            </div>
          )}
          {meses.map(([mes, fs]) => (
            <section key={mes} className="stack" style={{ gap: 10 }} aria-labelledby={`mes-${mes}`}>
              <h2 id={`mes-${mes}`} className="capital agenda-mes">{nombreMes(mes)}</h2>
              <ul className="agenda-lista">
                {fs.map((f) => {
                  const a = accionFuncion(f);
                  const [an, me, di] = String(f.fecha).slice(0, 10).split('-').map(Number);
                  const d = new Date(Date.UTC(an, me - 1, di, 12));
                  return (
                    <li key={f.id}>
                      <Link href={`/f/${f.id}`} className="agenda-fila">
                        <span className="agenda-dia" aria-hidden="true">
                          <small>{d.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })}</small>
                          <b>{di}</b>
                        </span>
                        {f.imagen ? <img src={f.imagen} alt="" loading="lazy" className="agenda-img" /> : <span className="agenda-img" aria-hidden="true" />}
                        <span className="agenda-info">
                          <b>{f.titulo}</b>
                          <span className="small muted">
                            <span className="sr-only">{d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} · </span>
                            {f.hora ?? t('horaPorConfirmar')} · {f.recinto_nombre}{f.municipio ? `, ${f.municipio}` : ''}
                          </span>
                          {f.evento_nombre !== f.titulo && <span className="small muted">{f.evento_nombre}</span>}
                        </span>
                        <span className="agenda-accion">
                          {f.modo_venta !== 'libre' && f.precio_desde != null && <span className="small">{t('desde')} {eur(f.precio_desde)}</span>}
                          <span className={`tag ${a.tipo === 'comprar' ? 'ok' : ''}`}>{t(a.texto)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

export default function PaginaAgenda() {
  return <Suspense fallback={<p role="status">…</p>}><Agenda /></Suspense>;
}
