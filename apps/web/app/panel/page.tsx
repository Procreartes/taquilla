'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { api, eur, fechaCorta } from '@/lib/api';
import { useSesion } from '@/lib/sesion';
import { ESTADO_FUNCION } from '@/lib/textos';

type Dia = { dia: string; entradas: number; cobrado: number | null };
type Proxima = {
  id: string; titulo: string; fecha: string; hora: string | null; estado: string; modo_venta: string; es_prueba: boolean; venta_externa: boolean;
  evento_nombre: string; recinto: string; municipio: string | null; plazas: number | null; vendidas: number; invitaciones: number; ocupacion: number | null; importe: number | null;
};
type Resumen = {
  organizador: string;
  entradas: { vendidas: number; invitaciones: number; vendidas_hoy: number; dentro: number };
  funciones: { a_la_venta: number; proximas: number };
  dinero: null | { entradas: number; gastos: number; cobrado: number; comisiones: number; pedidos: number; cobrado_hoy: number; devuelto: number; neto: number };
  proximas: Proxima[];
  serie: Dia[];
  ultimos: { id: string; codigo: string; total_cent: number; pagado_en: string; estado: string; canal: string; titulo: string; entradas: number }[];
};

const num = (n: number) => n.toLocaleString('es-ES');
const pct = (x: number) => `${Math.round(x * 100)} %`;
const diaCorto = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

function Cifra({ etiqueta, valor, sub }: { etiqueta: string; valor: string; sub?: string }) {
  return (
    <div className="cifra">
      <span className="etq">{etiqueta}</span>
      <span className="num">{valor}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

/** Barras de entradas vendidas por día, con tooltip al pasar o al enfocar con el teclado. */
function VentasPorDia({ serie }: { serie: Dia[] }) {
  const id = useId();
  const [activo, setActivo] = useState<number | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 220, M = { t: 12, r: 8, b: 26, l: 34 };
  const max = Math.max(4, ...serie.map((d) => d.entradas));
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  const tope = Math.ceil(max / paso) * paso;
  const marcas = [0, tope / 2, tope];
  const ancho = (W - M.l - M.r) / serie.length;
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - v / tope);
  const total = serie.reduce((s, d) => s + d.entradas, 0);
  const d = activo !== null ? serie[activo] : null;
  return (
    <div className="grafica" ref={caja}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{`Entradas vendidas por día en los últimos ${serie.length} días: ${total} en total.`}</title>
        {marcas.map((m) => (
          <g key={m}>
            <line className="rejilla" x1={M.l} x2={W - M.r} y1={y(m)} y2={y(m)} />
            <text className="eje" x={M.l - 6} y={y(m) + 4} textAnchor="end">{num(m)}</text>
          </g>
        ))}
        {serie.map((s, i) => {
          const x = M.l + i * ancho;
          const h = H - M.b - y(s.entradas);
          const w = Math.max(2, ancho - 2);
          return (
            <g key={s.dia} className={activo === i ? 'activa' : ''}>
              {s.entradas > 0 && (
                <path className="barra" d={`M${x + 1},${H - M.b} v${-Math.max(0, h - 3)} q0,-3 3,-3 h${w - 6} q3,0 3,3 v${Math.max(0, h - 3)} z`} />
              )}
              <rect className="zona-hit" x={x} y={M.t} width={ancho} height={H - M.t - M.b} tabIndex={0}
                aria-label={`${diaCorto(s.dia)}: ${s.entradas} entradas${s.cobrado !== null ? `, ${eur(s.cobrado)}` : ''}`}
                onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)} onFocus={() => setActivo(i)} onBlur={() => setActivo(null)} />
            </g>
          );
        })}
        {serie.map((s, i) => (i % Math.max(1, Math.round(serie.length / Math.max(2, Math.floor(W / 90)))) === 0) && (
          <text key={`e${s.dia}`} className="eje" x={M.l + i * ancho + ancho / 2} y={H - 8} textAnchor="middle">{diaCorto(s.dia)}</text>
        ))}
      </svg>
      {d && activo !== null && (
        <div className="tooltip" style={(() => {
          const x = M.l + activo * ancho + ancho / 2;
          const desplaza = x > W - 130 ? '-100%' : x < 130 ? '0' : '-50%';
          return { left: x, top: Math.max(0, y(d.entradas) - 6), transform: `translate(${desplaza}, -100%)` };
        })()}>
          <b>{diaCorto(d.dia)}</b> · {d.entradas} entradas{d.cobrado !== null ? ` · ${eur(d.cobrado)}` : ''}
        </div>
      )}
    </div>
  );
}

function Ocupacion({ f }: { f: Proxima }) {
  if (!f.plazas) return <span className="small muted">{f.modo_venta === 'libre' ? 'Acceso libre' : f.venta_externa ? 'Venta en otra web' : 'Sin aforo'}</span>;
  const v = Math.min(1, f.vendidas / f.plazas), inv = Math.min(1 - v, f.invitaciones / f.plazas);
  return (
    <div className="ocupa">
      <div className="ocupa-barra" role="img" aria-label={`${f.vendidas} vendidas y ${f.invitaciones} invitaciones de ${f.plazas} plazas`}>
        {v > 0 && <i className="v" style={{ width: `${v * 100}%` }} />}
        {inv > 0 && <i className="inv" style={{ width: `${inv * 100}%` }} />}
      </div>
      <span className="small muted"><b style={{ color: 'var(--ink)' }}>{pct(f.ocupacion ?? 0)}</b> · {num(f.vendidas)} vendidas{f.invitaciones ? ` + ${num(f.invitaciones)} inv.` : ''} de {num(f.plazas)}</span>
    </div>
  );
}

export default function Panel() {
  const { yo, puede } = useSesion();
  const org = yo?.organizadores.find((o) => o.id === yo.organizadorId);
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState('');
  const [pruebas, setPruebas] = useState(false);
  const [dias, setDias] = useState(30);
  const [tabla, setTabla] = useState(false);

  useEffect(() => {
    if (!org) return;
    setError('');
    api<Resumen>(`/api/panel/resumen?dias=${dias}&pruebas=${pruebas ? 1 : 0}`).then(setR).catch((e) => setError(e.message));
  }, [org?.id, pruebas, dias]);

  const vendidas30 = r?.serie.reduce((s, d) => s + d.entradas, 0) ?? 0;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Hola, {yo?.usuario.nombre.split(' ')[0]}</h1>
          {org ? (
            <p className="muted" style={{ margin: 0 }}>Resumen de <b>{org.nombre}</b>{org.es_prueba && <> <span className="tag demo">de prueba</span></>}</p>
          ) : (
            <p className="aviso warn">Elige un organizador arriba para empezar.</p>
          )}
        </div>
        {org && (
          <div className="fila" style={{ gap: 8 }}>
            <div className="fila" role="group" aria-label="Periodo de la gráfica" style={{ gap: 4 }}>
              {[30, 90].map((n) => <button key={n} type="button" className="pill" aria-pressed={dias === n} onClick={() => setDias(n)}>{n} días</button>)}
            </div>
            {!org.es_prueba && (
              <label className="check small"><input type="checkbox" checked={pruebas} onChange={(e) => setPruebas(e.target.checked)} /> Incluir funciones de prueba</label>
            )}
          </div>
        )}
      </div>

      {yo && !yo.usuario.totpActivo && (
        <p className="aviso warn">Tu cuenta aún no tiene verificación en dos pasos. <Link href="/panel/seguridad">Actívala ahora</Link>: es obligatoria para el equipo en producción.</p>
      )}
      {error && <p className="aviso bad" role="alert">{error}</p>}
      {org && !r && !error && <p role="status">Cargando el resumen…</p>}

      {r && (
        <>
          <section className="cifras-resumen" aria-label="Cifras principales">
            <Cifra etiqueta="Entradas vendidas" valor={num(r.entradas.vendidas)} sub={r.entradas.vendidas_hoy ? `+${num(r.entradas.vendidas_hoy)} hoy` : 'Ninguna hoy'} />
            {r.dinero && <Cifra etiqueta="Cobrado" valor={eur(r.dinero.cobrado)} sub={`${r.dinero.cobrado_hoy ? `+${eur(r.dinero.cobrado_hoy)} hoy · ` : ''}${num(r.dinero.pedidos)} pedidos`} />}
            {r.dinero && <Cifra etiqueta="Neto estimado" valor={eur(r.dinero.neto)} sub={`Tras ${eur(r.dinero.devuelto)} devuelto y ${eur(r.dinero.comisiones)} de comisiones`} />}
            <Cifra etiqueta="Invitaciones y acreditaciones" valor={num(r.entradas.invitaciones)} sub={`${num(r.entradas.dentro)} personas ya han entrado`} />
            <Cifra etiqueta="Funciones a la venta" valor={num(r.funciones.a_la_venta)} sub={`${num(r.funciones.proximas)} próximas en total`} />
          </section>

          <section className="panel stack" aria-labelledby="t-ventas">
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <div>
                <h2 id="t-ventas">Entradas vendidas por día</h2>
                <p className="small muted" style={{ margin: 0 }}>{num(vendidas30)} en los últimos {r.serie.length} días{r.dinero ? ` · ${eur(r.serie.reduce((s, d) => s + (d.cobrado ?? 0), 0))} cobrados` : ''}</p>
              </div>
              <button type="button" className="btn sec sm" aria-pressed={tabla} onClick={() => setTabla(!tabla)}>{tabla ? 'Ver gráfica' : 'Ver como tabla'}</button>
            </div>
            {tabla ? (
              <div className="desliza" style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="tabla">
                  <caption className="sr-only">Entradas vendidas por día</caption>
                  <thead><tr><th>Día</th><th style={{ textAlign: 'right' }}>Entradas</th>{r.dinero && <th style={{ textAlign: 'right' }}>Cobrado</th>}</tr></thead>
                  <tbody>{[...r.serie].reverse().map((d) => (
                    <tr key={d.dia}><td>{diaCorto(d.dia)}</td><td style={{ textAlign: 'right' }}>{d.entradas}</td>{r.dinero && <td style={{ textAlign: 'right' }}>{eur(d.cobrado ?? 0)}</td>}</tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <VentasPorDia serie={r.serie} />}
          </section>

          <section className="panel stack" aria-labelledby="t-proximas">
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <h2 id="t-proximas">Próximas funciones</h2>
              <div className="leyenda" aria-hidden="true"><span><i style={{ background: 'var(--serie1)' }} />Vendidas</span><span><i style={{ background: 'var(--serie2)' }} />Invitaciones</span></div>
            </div>
            {!r.proximas.length ? <p className="vacio">No hay funciones próximas. <Link href="/panel/eventos">Crea un evento</Link>.</p> : (
              <div>
                {r.proximas.map((f) => {
                  const est = ESTADO_FUNCION[f.estado];
                  return (
                    <div key={f.id} className="fila-funcion">
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/panel/funciones/${f.id}`}><b>{f.titulo}</b></Link>
                        {f.es_prueba && <> <span className="tag demo">prueba</span></>}
                        <div className="small muted"><span className="capital">{fechaCorta(f.fecha)}</span> · {f.hora ?? 'hora por confirmar'} · {f.recinto}{f.municipio ? `, ${f.municipio}` : ''}</div>
                      </div>
                      <Ocupacion f={f} />
                      <div style={{ textAlign: 'right', display: 'grid', gap: 4, justifyItems: 'end' }}>
                        {f.importe !== null && f.modo_venta !== 'libre' && !f.venta_externa && <b style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(f.importe)}</b>}
                        {est && <span className={`tag ${est.clase}`}>{est.texto}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {r.dinero && (
            <section className="g2" aria-label="Dinero y últimos pedidos">
              <div className="panel stack">
                <h2>Desglose del dinero</h2>
                <table className="tabla">
                  <tbody>
                    <tr><td>Entradas (impuesto incluido)</td><td style={{ textAlign: 'right' }}>{eur(r.dinero.entradas)}</td></tr>
                    <tr><td>Gastos de gestión</td><td style={{ textAlign: 'right' }}>{eur(r.dinero.gastos)}</td></tr>
                    <tr><td><b>Cobrado</b></td><td style={{ textAlign: 'right' }}><b>{eur(r.dinero.cobrado)}</b></td></tr>
                    <tr><td>Devuelto</td><td style={{ textAlign: 'right' }}>{r.dinero.devuelto ? `−${eur(r.dinero.devuelto)}` : eur(0)}</td></tr>
                    <tr><td>Comisiones de la pasarela</td><td style={{ textAlign: 'right' }}>{r.dinero.comisiones ? `−${eur(r.dinero.comisiones)}` : eur(0)}</td></tr>
                    <tr><td><b>Neto estimado</b></td><td style={{ textAlign: 'right' }}><b>{eur(r.dinero.neto)}</b></td></tr>
                  </tbody>
                </table>
                <p className="small muted" style={{ margin: 0 }}>Estimación antes de impuestos y derechos de autor. El detalle por función está en su liquidación.</p>
              </div>
              <div className="panel stack">
                <h2>Últimos pedidos</h2>
                {!r.ultimos.length ? <p className="vacio">Aún no hay pedidos.</p> : (
                  <table className="tabla">
                    <tbody>
                      {r.ultimos.map((p) => (
                        <tr key={p.id}>
                          <td><span className="mono small">{p.codigo}</span><br /><span className="small muted">{p.titulo} · {p.entradas} {p.entradas === 1 ? 'entrada' : 'entradas'}{p.canal === 'taquilla' ? ' · taquilla' : ''}</span></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <b>{eur(p.total_cent)}</b><br />
                            <span className="small muted">{new Date(p.pagado_en).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Canary' })}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}
          {!puede('informes.ver') && <p className="small muted">Las cifras de dinero solo las ven administración, producción, taquilla y contabilidad.</p>}
        </>
      )}
    </div>
  );
}
