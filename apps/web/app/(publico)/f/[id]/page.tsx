'use client';
/**
 * Ficha de función y compra en 3 pasos: 1) elegir entradas, 2) datos y pago, 3) entradas.
 * La reserva (10 minutos) empieza al pulsar «Continuar».
 */
import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { gastosPorEntrada, generar, type Asiento } from '@taquilla/dominio';
import PlanoSvg, { type EstadoButaca } from '@/componentes/PlanoSvg';
import { api, eur, fechaLarga } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { accionFuncion } from '@/lib/funciones';
import SalaEspera from '@/componentes/SalaEspera';
import Turnstile from '@/componentes/Turnstile';

type Zona = { codigo: string; nombre: string; color: string; precio_cent: number | null };

export default function FichaFuncion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale, idioma } = useT();
  const [f, setF] = useState<any>(null);
  const [error, setError] = useState('');
  const [disp, setDisp] = useState<{ vendidas: string[]; reservadas: string[]; protocolo: string[] }>({ vendidas: [], reservadas: [], protocolo: [] });
  const [sel, setSel] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);
  const [busca, setBusca] = useState({ cantidad: 2, zona: 'cualquiera', pmr: false });
  const [reserva, setReserva] = useState<any>(null);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pase, setPase] = useState<string | null>(null);
  const [antibots, setAntibots] = useState('');
  const recibirPase = useCallback((p: string) => setPase(p), []);

  const cargarDisp = useCallback(() => api(`/api/publico/funciones/${id}/disponibilidad`).then(setDisp).catch(() => {}), [id]);
  useEffect(() => {
    api(`/api/publico/funciones/${id}`).then(setF).catch((e) => setError(e.message));
    cargarDisp();
    const i = setInterval(cargarDisp, 15_000);
    try {
      const r = sessionStorage.getItem('reserva:' + id);
      if (r) api(`/api/publico/pedidos/${r}`).then((p) => (['reserva'].includes(p.estado) && new Date(p.expira_en) > new Date() ? setReserva({ ...p, token: r }) : sessionStorage.removeItem('reserva:' + id))).catch(() => {});
    } catch {}
    return () => clearInterval(i);
  }, [id, cargarDisp]);

  const plano = useMemo(() => (f?.plano ? generar(f.plano) : null), [f]);
  const zonas: Zona[] = f?.zonas ?? [];
  const precioZona = useMemo(() => Object.fromEntries(zonas.map((z) => [z.codigo, z.precio_cent ?? 0])), [zonas]);
  const ocupadas = useMemo(() => new Set([...disp.vendidas, ...disp.protocolo]), [disp]);
  const reservadas = useMemo(() => new Set(disp.reservadas), [disp]);
  const porCodigo = useMemo(() => new Map(plano?.asientos.map((a) => [a.codigo, a]) ?? []), [plano]);

  if (error) return <p className="aviso bad" role="alert">{error}</p>;
  if (!f) return <p role="status">{t('cargando')}</p>;

  const max = f.max_entradas_pedido as number;
  const pctGastos = f.gastos_gestion_pct === null || f.gastos_gestion_pct === undefined ? null : Number(f.gastos_gestion_pct);
  const accion = accionFuncion(f);
  const color = (f.islas ?? []).find((i: any) => i.id === f.isla)?.colores?.acento ?? 'var(--accent)';
  const n = f.modo_venta === 'numerada' ? sel.length : cantidad;
  const preciosSel = f.modo_venta === 'numerada' ? sel.map((c) => precioZona[porCodigo.get(c)?.zona ?? ''] ?? 0) : Array.from({ length: cantidad }, () => precioZona.general ?? 0);
  const importe = preciosSel.reduce((s, p) => s + p, 0);
  const gastosTotal = preciosSel.reduce((s, p) => s + gastosPorEntrada(p, f), 0);

  const estado = (c: string): EstadoButaca => (ocupadas.has(c) ? 'vendida' : reservadas.has(c) ? 'reservada' : 'libre');
  const alternar = (a: Asiento) => {
    setAviso('');
    if (sel.includes(a.codigo)) return setSel(sel.filter((x) => x !== a.codigo));
    if (sel.length >= max) return setAviso(t('maxEntradas', { n: max }));
    setSel([...sel, a.codigo]);
  };

  async function reservar(cuerpo: object) {
    setOcupado(true);
    setAviso('');
    try {
      const r = await api('/api/publico/reservas', { cuerpo: { funcionId: id, ...cuerpo, pase: pase || undefined, turnstile: antibots || undefined } });
      try {
        sessionStorage.setItem('reserva:' + id, r.token);
      } catch {}
      setReserva(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      if (e.codigo === 'sin_pase') {
        try { sessionStorage.removeItem('cola:' + id); } catch {}
        setPase(null);
        setAviso(e.message);
      } else if (e.codigo === 'ocupadas') {
        setSel((s) => s.filter((c) => !e.datos.ocupadas.includes(c)));
        setAviso(t('ocupadas'));
        cargarDisp();
      } else setAviso(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function soltar() {
    if (reserva) await api(`/api/publico/reservas/${reserva.token}`, { metodo: 'DELETE' }).catch(() => {});
    try {
      sessionStorage.removeItem('reserva:' + id);
    } catch {}
    setReserva(null);
    setSel([]);
    cargarDisp();
  }

  return (
    <>
      <header className="stack" style={{ gap: 6, borderLeft: `6px solid ${color}`, paddingLeft: 14 }}>
        <Link className="small" href={`/e/${f.evento_slug}`}>← {f.evento_nombre}</Link>
        <h1>{f.titulo}</h1>
        {f.artistas?.length > 0 && <p>{f.artistas.join(' · ')}</p>}
        {f.programa && <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{f.programa.map((p: any) => <li key={p.titulo}>{p.titulo} · {p.artista}</li>)}</ul>}
        <p className="muted"><span className="capital">{fechaLarga(f.fecha, locale)}</span> · {f.hora ?? t('horaPorConfirmar')} · {f.recinto_nombre}{f.municipio ? `, ${f.municipio}` : ''}</p>
        {f.edad_minima ? <p className="small">{t('edadMinima', { n: f.edad_minima })}</p> : null}
      </header>
      {f.es_prueba && <p className="aviso warn"><b>{t('funcionPrueba')}.</b> {t('funcionPruebaDetalle')}</p>}
      {f.verificar && <p className="aviso">{t('verificar')}</p>}

      {!f.vendible ? (
        <section className="panel">
          {accion.tipo === 'externa' ? (
            <a className="btn acento" href={f.venta_externa_url} target="_blank" rel="noopener noreferrer">{t('ventaOficial')}</a>
          ) : (
            <p><b>{t(accion.texto)}</b>{f.modo_venta === 'libre' && <><br />{t('gratisDetalle')}</>}</p>
          )}
        </section>
      ) : reserva ? (
        <Paso2 reserva={reserva} f={f} onVolver={soltar} />
      ) : f.cola && pase === null ? (
        <SalaEspera funcionId={id} turnstile={f.turnstile} idioma={idioma} onPase={recibirPase} />
      ) : (
        <>
          <p className="small muted" aria-live="polite">{t('paso', { n: 1 })} · {t('paso1')}</p>
          <div className="dos">
            <div className="stack">
              {f.modo_venta === 'numerada' && plano ? (
                <>
                  <form className="panel fila" onSubmit={(e) => { e.preventDefault(); reservar({ mejorSitio: { cantidad: busca.cantidad, zona: busca.zona, pmr: busca.pmr ? 1 : 0 } }); }}>
                    <b>{t('mejorSitio')}</b>
                    <label className="fila small">{t('cuantas')}
                      <select value={busca.cantidad} onChange={(e) => setBusca({ ...busca, cantidad: +e.target.value })} style={{ width: 'auto' }}>
                        {Array.from({ length: max }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
                      </select>
                    </label>
                    <label className="fila small">{t('zona')}
                      <select value={busca.zona} onChange={(e) => setBusca({ ...busca, zona: e.target.value })} style={{ width: 'auto' }}>
                        <option value="cualquiera">{t('cualquiera')}</option>
                        {zonas.map((z) => <option key={z.codigo} value={z.codigo}>{z.nombre} · {eur(z.precio_cent ?? 0)}</option>)}
                      </select>
                    </label>
                    <label className="check"><input type="checkbox" checked={busca.pmr} onChange={(e) => setBusca({ ...busca, pmr: e.target.checked })} /> {t('necesitoPmr')}</label>
                    <button className="btn sec sm" disabled={ocupado}>{t('buscar')}</button>
                  </form>
                  <section className="panel stack" aria-labelledby="t-plano">
                    <h2 id="t-plano">{t('elegirEnPlano')}</h2>
                    <div className="leyenda">
                      {zonas.map((z) => <span key={z.codigo}><i className="mu" style={{ background: z.color }} />{z.nombre} · {eur(z.precio_cent ?? 0)}</span>)}
                      <span><i className="mu" style={{ background: 'var(--sold)' }} />{t('vendida')}</span>
                      <span><i className="mu" style={{ background: 'var(--sel)' }} />{t('elegida')}</span>
                      <span><i className="mu" style={{ border: '2px dashed var(--ink)' }} />{t('acompanante')}</span>
                    </div>
                    <div className="mapa">
                      <PlanoSvg plano={plano} zonas={f.plano.zonas} modo="venta" titulo={`${t('elegirEnPlano')} · ${f.recinto_nombre}`} estado={estado} seleccion={sel} onButaca={alternar}
                        extra={(a) => `, ${eur(precioZona[a.zona] ?? 0)}`} />
                    </div>
                  </section>
                </>
              ) : (
                <section className="panel stack">
                  <h2>{zonas[0]?.nombre}</h2>
                  <p>{eur(precioZona.general ?? 0)}{f.quedan !== null && f.quedan < 50 && <> · <b>{t('quedan', { n: f.quedan })}</b></>}</p>
                  <label className="campo" style={{ maxWidth: 200 }}>{t('cuantas')}
                    <select value={cantidad} onChange={(e) => setCantidad(+e.target.value)}>
                      {Array.from({ length: Math.min(max, f.quedan ?? max) }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
                    </select>
                  </label>
                </section>
              )}
            </div>
            <aside className="panel stack" aria-labelledby="t-sel" style={{ position: 'sticky', top: 12 }}>
              <h2 id="t-sel">{t('tuSeleccion')}</h2>
              {f.modo_venta === 'numerada' && !sel.length ? <p className="muted small">{t('nada')}</p> : (
                <>
                  {f.modo_venta === 'numerada' && (
                    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 6 }}>
                      {sel.map((c) => {
                        const a = porCodigo.get(c)!;
                        return (
                          <li key={c} className="fila" style={{ justifyContent: 'space-between' }}>
                            <span className="small">{a.fila} · {a.tipo === 'silla_ruedas' ? a.numero : a.numero} <span className="muted">({zonas.find((z) => z.codigo === a.zona)?.nombre})</span></span>
                            <button className="btn sec sm" onClick={() => alternar(a)} aria-label={`${t('quitar')} ${a.fila} ${a.numero}`}>×</button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <Totales importe={importe} n={n} gastosTotal={gastosTotal} f={f} />
                  {!f.cola && <Turnstile clave={f.turnstile} onToken={setAntibots} idioma={idioma} />}
                  <button className="btn acento ancho" disabled={ocupado || !n || (!!f.turnstile && !f.cola && !antibots)} onClick={() => reservar(f.modo_venta === 'numerada' ? { butacas: sel } : { cantidad })}>{t('continuar')}</button>
                  {f.modo_venta === 'numerada' && <button className="btn sec sm" onClick={() => setSel([])}>{t('vaciar')}</button>}
                </>
              )}
              <p className="small muted">{t('maxEntradas', { n: max })} · {t('gastosGestion')}: {pctGastos !== null ? t('porcentajePrecio', { x: String(pctGastos).replace('.', ',') }) : t('porEntrada', { x: eur(f.gastos_gestion_cent) })}</p>
              {aviso && <p className="aviso warn" role="alert">{aviso}</p>}
            </aside>
          </div>
        </>
      )}
      <span hidden>{idioma}</span>
    </>
  );
}

function Totales({ importe, n, gastosTotal, f }: { importe: number; n: number; gastosTotal: number; f: any }) {
  const { t } = useT();
  const total = importe + gastosTotal;
  const tipo = Number(f.impuesto_tipo);
  const cuota = total - Math.round(total / (1 + tipo / 100));
  return (
    <dl className="stack small" style={{ gap: 4, margin: 0 }}>
      <div className="fila" style={{ justifyContent: 'space-between' }}><dt>{n} ×</dt><dd style={{ margin: 0 }}>{eur(importe)}</dd></div>
      <div className="fila" style={{ justifyContent: 'space-between' }}><dt>{t('gastosGestion')}</dt><dd style={{ margin: 0 }}>{eur(gastosTotal)}</dd></div>
      <div className="fila" style={{ justifyContent: 'space-between', fontSize: 18, fontWeight: 800 }}><dt>{t('total')}</dt><dd style={{ margin: 0 }}>{eur(total)}</dd></div>
      <div className="fila muted" style={{ justifyContent: 'space-between' }}><dt>{t('impuestoIncluido', { imp: f.impuesto_nombre, t: tipo })}</dt><dd style={{ margin: 0 }}>{eur(cuota)}</dd></div>
    </dl>
  );
}

function Paso2({ reserva, f, onVolver }: { reserva: any; f: any; onVolver: () => void }) {
  const { t, idioma } = useT();
  const [d, setD] = useState({ nombre: '', email: '', telefono: '', codigoPostal: '', pais: 'España', municipio: '', isla: '' });
  const [c, setC] = useState({ condiciones: false, privacidad: false, comunicacionesOrganizador: false, comunicacionesPlataforma: false });
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [queda, setQueda] = useState(0);
  useEffect(() => {
    const fin = new Date(reserva.expira_en).getTime();
    const tic = () => setQueda(Math.max(0, fin - Date.now()));
    tic();
    const i = setInterval(tic, 1000);
    return () => clearInterval(i);
  }, [reserva.expira_en]);
  const mm = String(Math.floor(queda / 60000)).padStart(2, '0'), ss = String(Math.floor(queda / 1000) % 60).padStart(2, '0');

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!d.nombre.trim() || !/^\S+@\S+\.\S+$/.test(d.email)) return setError(`${t('nombre')} · ${t('email')}`);
    if (!c.condiciones || !c.privacidad) return setError(`${t('aceptoCondiciones')} · ${t('aceptoPrivacidad')}`);
    setOcupado(true);
    try {
      const r = await api(`/api/publico/pedidos/${reserva.token}/pagar`, {
        cuerpo: { ...d, telefono: d.telefono || null, idioma, consentimientos: c },
      });
      window.location.href = r.url;
    } catch (err: any) {
      setError(err.codigo === 'reserva_caducada' ? t('reservaCaducada') : err.message);
      setOcupado(false);
    }
  }

  return (
    <form className="dos" onSubmit={pagar} noValidate>
      <div className="stack">
        <p className="small muted">{t('paso', { n: 2 })} · {t('paso2')}</p>
        <section className="panel stack">
          <div className="g2">
            <label className="campo">{t('nombre')}<input required autoComplete="name" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} /></label>
            <label className="campo">{t('email')}<span className="ayuda">{t('emailAyuda')}</span><input required type="email" autoComplete="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
            <label className="campo">{t('telefono')}<input type="tel" autoComplete="tel" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} /></label>
          </div>
          <fieldset className="stack" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12 }}>
            <legend className="small" style={{ fontWeight: 700 }}>{t('procedencia')}</legend>
            <p className="small muted">{t('procedenciaAyuda')}</p>
            <div className="g2">
              <label className="campo">{t('codigoPostal')}<input autoComplete="postal-code" value={d.codigoPostal} onChange={(e) => setD({ ...d, codigoPostal: e.target.value })} /></label>
              <label className="campo">{t('pais')}<input autoComplete="country-name" value={d.pais} onChange={(e) => setD({ ...d, pais: e.target.value })} /></label>
              <label className="campo">{t('municipio')}<input autoComplete="address-level2" value={d.municipio} onChange={(e) => setD({ ...d, municipio: e.target.value })} /></label>
              <label className="campo">{t('isla')}
                <select value={d.isla} onChange={(e) => setD({ ...d, isla: e.target.value })}>
                  <option value="">—</option>
                  {['Gran Canaria', 'Tenerife', 'Lanzarote', 'Fuerteventura', 'La Palma', 'La Gomera', 'El Hierro', 'La Graciosa'].map((i) => <option key={i}>{i}</option>)}
                </select>
              </label>
            </div>
          </fieldset>
          <div className="stack" style={{ gap: 8 }}>
            <label className="check"><input type="checkbox" checked={c.condiciones} onChange={(e) => setC({ ...c, condiciones: e.target.checked })} /> <span>{t('aceptoCondiciones')} (<Link href="/legal/condiciones" target="_blank">{t('condiciones')}</Link>)</span></label>
            <label className="check"><input type="checkbox" checked={c.privacidad} onChange={(e) => setC({ ...c, privacidad: e.target.checked })} /> <span>{t('aceptoPrivacidad')} (<Link href="/legal/privacidad" target="_blank">{t('privacidad')}</Link>)</span></label>
            <label className="check"><input type="checkbox" checked={c.comunicacionesOrganizador} onChange={(e) => setC({ ...c, comunicacionesOrganizador: e.target.checked })} /> {t('comOrganizador', { org: f.organizador_nombre })}</label>
            <label className="check"><input type="checkbox" checked={c.comunicacionesPlataforma} onChange={(e) => setC({ ...c, comunicacionesPlataforma: e.target.checked })} /> {t('comPlataforma')}</label>
          </div>
        </section>
      </div>
      <aside className="panel stack">
        <p className="aviso" role="timer" aria-live="off">{t('tiempoReserva', { m: `${mm}:${ss}` })}</p>
        <h2>{t('tuSeleccion')}</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{reserva.lineas.map((l: any) => <li key={l.id}>{l.descripcion} · {l.zona_nombre} · {eur(l.precio_cent)}</li>)}</ul>
        <Totales importe={reserva.importe_entradas_cent} n={reserva.lineas.length} gastosTotal={reserva.lineas.reduce((s: number, l: any) => s + (l.gastos_cent ?? 0), 0)} f={f} />
        {error && <p className="aviso bad" role="alert">{error}</p>}
        <button className="btn acento ancho" disabled={ocupado || queda === 0}>{t('pagar', { x: eur(reserva.total_cent) })}</button>
        <button type="button" className="btn sec sm" onClick={onVolver}>{t('volver')}</button>
        <p className="small muted">{t('pagoSeguro')}</p>
      </aside>
    </form>
  );
}
