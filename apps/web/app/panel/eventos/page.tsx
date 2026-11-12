'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, ErrorApi, fechaCorta } from '@/lib/api';
import { useSesion } from '@/lib/sesion';
import FormEvento, { slugDe, type DatosEvento } from '@/componentes/FormEvento';

type Evento = {
  id: string; slug: string; nombre: string; tipo: string; categoria: string | null;
  publicado: boolean; destacado: boolean; es_prueba: boolean;
  imagen_url: string | null; imagen_tarjeta_url: string | null;
  funciones: number; a_la_venta: number; desde: string | null; hasta: string | null; proxima: string | null;
  plazas: number; vendidas: number; invitaciones: number; vendidas_total: number;
};
type Filtro = 'marcha' | 'pasados' | 'borradores' | 'todos';
type Vista = 'tarjetas' | 'lista';

// Fecha de hoy en Canarias (AAAA-MM-DD), para separar lo que está en marcha de lo ya celebrado.
const hoyCanarias = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary' }).format(new Date());

const enMarcha = (e: Evento, hoy: string) => !e.hasta || e.hasta >= hoy;

function Estado({ e, hoy }: { e: Evento; hoy: string }) {
  if (e.es_prueba) return <span className="tag demo">Prueba</span>;
  if (!enMarcha(e, hoy)) return <span className="tag">Celebrado</span>;
  if (!e.publicado) return <span className="tag">Borrador</span>;
  if (e.a_la_venta) return <span className="tag ok">A la venta</span>;
  return <span className="tag">Publicado</span>;
}

function Ocupacion({ e }: { e: Evento }) {
  if (!e.plazas) return <p className="small muted">{e.vendidas_total ? `${e.vendidas_total} entradas vendidas` : 'Sin plazas por vender'}</p>;
  const pv = Math.min(100, (e.vendidas / e.plazas) * 100);
  const pi = Math.min(100 - pv, (e.invitaciones / e.plazas) * 100);
  return (
    <div className="ocupa">
      <div className="ocupa-barra" role="img" aria-label={`${e.vendidas} vendidas y ${e.invitaciones} invitaciones de ${e.plazas} plazas`}>
        <i className="v" style={{ width: `${pv}%` }} />
        <i className="inv" style={{ width: `${pi}%` }} />
      </div>
      <span className="small muted">
        <b className="mono" style={{ color: 'var(--ink)' }}>{e.vendidas}</b> / {e.plazas} vendidas
        {e.invitaciones ? ` · ${e.invitaciones} inv.` : ''} · {Math.round(pv + pi)} %
      </span>
    </div>
  );
}

export default function Eventos() {
  const { puede } = useSesion();
  const [lista, setLista] = useState<Evento[] | null>(null);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('marcha');
  const [vista, setVista] = useState<Vista>('tarjetas');
  const [busca, setBusca] = useState('');
  const [guardando, setGuardando] = useState<string | null>(null);
  const router = useRouter();
  const editar = puede('eventos.editar');
  const hoy = hoyCanarias();

  const crear = async (d: DatosEvento) => {
    setMsg(null);
    const s = slugDe(d.nombre);
    const base = s.length >= 2 ? s : 'evento';
    // Si el enlace ya existe, prueba con -2, -3…
    for (let i = 1; i <= 20; i++) {
      try {
        const e = await api<{ id: string }>('/api/eventos', { cuerpo: { ...d, slug: i === 1 ? base : `${base.slice(0, 76)}-${i}` } });
        router.push(`/panel/eventos/${e.id}?nuevo=1`);
        return;
      } catch (err: any) {
        if (!(err instanceof ErrorApi && err.status === 409)) { setMsg({ tipo: 'bad', texto: err.message }); return; }
      }
    }
    setMsg({ tipo: 'bad', texto: 'Ya hay demasiados eventos con ese nombre: cámbialo un poco.' });
  };
  const cargar = () => api<Evento[]>('/api/eventos').then(setLista);
  useEffect(() => {
    cargar();
    try {
      const v = localStorage.getItem('panel.eventos.vista');
      if (v === 'lista' || v === 'tarjetas') setVista(v);
    } catch {}
  }, []);
  const cambiarVista = (v: Vista) => {
    setVista(v);
    try { localStorage.setItem('panel.eventos.vista', v); } catch {}
  };

  // Cambio rápido de publicado/destacado sin entrar en la ficha
  const alternar = async (e: Evento, campo: 'publicado' | 'destacado') => {
    setMsg(null);
    setGuardando(e.id + campo);
    try {
      await api(`/api/eventos/${e.id}`, { metodo: 'PATCH', cuerpo: { [campo]: !e[campo] } });
      setLista((l) => l && l.map((x) => (x.id === e.id ? { ...x, [campo]: !e[campo] } : x)));
    } catch (err: any) {
      setMsg({ tipo: 'bad', texto: err.message });
    } finally {
      setGuardando(null);
    }
  };

  const importar = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    try {
      const programacion = JSON.parse(await f.text());
      const nombre = prompt('Nombre del evento', programacion?._meta?.edicion ?? '');
      if (!nombre) return;
      const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
      const r = await api('/api/eventos/importar-programacion', { cuerpo: { slug, nombre, programacion } });
      setMsg({ tipo: 'ok', texto: `Importadas ${r.funciones} funciones (${r.numeradas} numeradas, ${r.generales} por aforo general, ${r.libres} de acceso libre). ${r.sinPrecio} sin precio oficial.` });
      cargar();
    } catch (err: any) {
      setMsg({ tipo: 'bad', texto: err instanceof SyntaxError ? 'El fichero no es un JSON válido.' : err.message });
    }
  };

  const cuentas = useMemo(() => {
    const l = lista ?? [];
    return {
      marcha: l.filter((e) => enMarcha(e, hoy)).length,
      pasados: l.filter((e) => !enMarcha(e, hoy)).length,
      borradores: l.filter((e) => !e.publicado).length,
      todos: l.length,
    };
  }, [lista, hoy]);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (lista ?? [])
      .filter((e) => filtro === 'todos' || (filtro === 'marcha' ? enMarcha(e, hoy) : filtro === 'pasados' ? !enMarcha(e, hoy) : !e.publicado))
      .filter((e) => !q || `${e.nombre} ${e.tipo} ${e.categoria ?? ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
      // Los ya celebrados, del más reciente al más antiguo
      .sort((a, b) => (filtro === 'pasados' ? (b.hasta ?? '').localeCompare(a.hasta ?? '') : 0));
  }, [lista, filtro, busca, hoy]);

  const fechas = (e: Evento) => (e.desde ? (e.desde === e.hasta ? fechaCorta(e.desde) : `${fechaCorta(e.desde)} – ${fechaCorta(e.hasta!)}`) : 'Sin funciones');

  const interruptores = (e: Evento) => editar && (
    <div className="fila" style={{ gap: 6 }}>
      <button type="button" className="pill" aria-pressed={e.publicado} disabled={guardando === e.id + 'publicado'} onClick={() => alternar(e, 'publicado')}>
        {e.publicado ? '● Publicado en la web' : '○ Sin publicar'}
      </button>
      <button type="button" className="pill" aria-pressed={e.destacado} disabled={guardando === e.id + 'destacado'} onClick={() => alternar(e, 'destacado')}>
        {e.destacado ? '★ Destacado en portada' : '☆ Destacar en portada'}
      </button>
    </div>
  );

  const acciones = (e: Evento) => (
    <div className="fila" style={{ gap: 6 }}>
      <Link className="btn sm" href={`/panel/eventos/${e.id}`}>Editar</Link>
      {puede('informes.ver') && <Link className="btn sec sm" href={`/panel/eventos/${e.id}/informe`}>Informe</Link>}
      {e.publicado && <a className="btn sec sm" href={`/e/${e.slug}`} target="_blank" rel="noopener">Ver en la web ↗</a>}
    </div>
  );

  return (
    <div className="stack">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1>Eventos</h1>
        {editar && !nuevo && <button className="btn" onClick={() => setNuevo(true)}>+ Nuevo evento</button>}
      </div>
      {nuevo && (
        <section className="panel stack">
          <h2>Nuevo evento</h2>
          <p className="small muted">Paso 1 de 2: los datos generales y las imágenes. Después añadirás las funciones (fecha, recinto, plano y precio).</p>
          <FormEvento boton="Crear evento y seguir" onGuardar={crear} />
          <div><button type="button" className="btn sec sm" onClick={() => setNuevo(false)}>Cancelar</button></div>
        </section>
      )}

      <div className="fila eventos-filtros" style={{ justifyContent: 'space-between' }}>
        <div className="segmentos" role="group" aria-label="Qué eventos mostrar">
          {([['marcha', 'En marcha'], ['pasados', 'Celebrados'], ['borradores', 'Sin publicar'], ['todos', 'Todos']] as const).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{t} <span className="muted">{cuentas[k]}</span></button>
          ))}
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <input type="search" placeholder="Buscar evento…" aria-label="Buscar evento" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: 200 }} />
          <div className="segmentos" role="group" aria-label="Vista">
            <button type="button" aria-pressed={vista === 'tarjetas'} onClick={() => cambiarVista('tarjetas')}>▦ Tarjetas</button>
            <button type="button" aria-pressed={vista === 'lista'} onClick={() => cambiarVista('lista')}>☰ Lista</button>
          </div>
        </div>
      </div>

      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}

      {lista === null ? (
        <p className="vacio">Cargando eventos…</p>
      ) : !visibles.length ? (
        <p className="vacio">{lista.length ? 'Ningún evento coincide con este filtro.' : 'Aún no hay eventos.'}</p>
      ) : vista === 'tarjetas' ? (
        <div className="rejilla-eventos">
          {visibles.map((e) => {
            const cartel = e.imagen_tarjeta_url || e.imagen_url;
            return (
              <article key={e.id} className={`panel evento-tarjeta${enMarcha(e, hoy) ? '' : ' pasado'}`}>
                <Link href={`/panel/eventos/${e.id}`} className="evento-cartel" aria-label={`Editar ${e.nombre}`}>
                  {cartel ? <img src={cartel} alt="" loading="lazy" /> : <span className="evento-sin-cartel" aria-hidden="true">{e.nombre.slice(0, 1)}</span>}
                  <span className="evento-estado"><Estado e={e} hoy={hoy} /></span>
                  {e.destacado && <span className="evento-estrella" title="Destacado en portada">★</span>}
                </Link>
                <div className="stack" style={{ gap: 10, padding: '14px 16px 16px' }}>
                  <div>
                    <span className="small muted" style={{ textTransform: 'capitalize' }}>{e.categoria || e.tipo}</span>
                    <h2 style={{ fontSize: 20, marginTop: 2 }}><Link href={`/panel/eventos/${e.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{e.nombre}</Link></h2>
                  </div>
                  <p className="small" style={{ margin: 0 }}>
                    {e.proxima && e.proxima !== e.desde ? <>Próxima: <b>{fechaCorta(e.proxima)}</b><br /></> : null}
                    <span className="muted">{fechas(e)} · {e.funciones} {e.funciones === 1 ? 'función' : 'funciones'}{e.a_la_venta ? ` · ${e.a_la_venta} a la venta` : ''}</span>
                  </p>
                  <Ocupacion e={e} />
                  {interruptores(e)}
                  {acciones(e)}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tabla">
            <thead><tr><th></th><th>Evento</th><th>Fechas</th><th>Estado</th><th>Ocupación</th><th>Acciones</th></tr></thead>
            <tbody>
              {visibles.map((e) => {
                const cartel = e.imagen_tarjeta_url || e.imagen_url;
                return (
                  <tr key={e.id}>
                    <td style={{ width: 64 }}>{cartel ? <img src={cartel} alt="" loading="lazy" className="evento-mini" /> : <span className="evento-mini evento-sin-cartel" aria-hidden="true">{e.nombre.slice(0, 1)}</span>}</td>
                    <td><Link href={`/panel/eventos/${e.id}`}><b>{e.nombre}</b></Link><br /><span className="small muted">{e.categoria || e.tipo}</span></td>
                    <td className="small">{fechas(e)}<br /><span className="muted">{e.funciones} func.{e.proxima && e.proxima !== e.desde ? ` · próx. ${fechaCorta(e.proxima)}` : ''}</span></td>
                    <td><Estado e={e} hoy={hoy} />{e.destacado && <span className="small" title="Destacado"> ★</span>}</td>
                    <td style={{ minWidth: 160 }}><Ocupacion e={e} /></td>
                    <td><div className="stack" style={{ gap: 6 }}>{interruptores(e)}{acciones(e)}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editar && (
        <div className="panel fila">
          <label className="btn sec" style={{ cursor: 'pointer' }}>
            Importar programación (JSON)
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => importar(e.target.files?.[0])} />
          </label>
        </div>
      )}
    </div>
  );
}
