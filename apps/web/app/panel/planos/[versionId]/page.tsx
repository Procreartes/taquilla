'use client';
/**
 * Editor de planos por bloques de filas, con vista previa a escala, ajustes a mano
 * y comprobación automática contra el aforo oficial. Guarda solo en borradores.
 */
import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { comprobar, generar, type Asiento, type Bloque, type RecetaPlano } from '@taquilla/dominio';
import PlanoSvg from '@/componentes/PlanoSvg';
import { api } from '@/lib/api';
import { useSesion } from '@/lib/sesion';

type Version = { id: string; numero: number; estado: string; receta: RecetaPlano; plano_id: string; plano_nombre: string; recinto_id: string; recinto_nombre: string };
type Herramienta = 'zona' | 'bloqueo' | 'acompanante' | 'visibilidad' | 'quitar';
const HERRAMIENTAS: [Herramienta, string][] = [['zona', 'Cambiar zona'], ['bloqueo', 'Bloqueo técnico'], ['acompanante', 'Acompañante PMR'], ['visibilidad', 'Visibilidad reducida'], ['quitar', 'Quitar / reponer']];
const COLORES = ['#c2410c', '#9333ea', '#0e7490', '#4d7c0f', '#be185d'];
const uid = () => Math.random().toString(36).slice(2, 7);

export default function Editor({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = use(params);
  const router = useRouter();
  const { puede } = useSesion();
  const [v, setV] = useState<Version | null>(null);
  const [receta, setReceta] = useState<RecetaPlano | null>(null);
  const [herr, setHerr] = useState<Herramienta>('zona');
  const [zonaHerr, setZonaHerr] = useState('');
  const [guardado, setGuardado] = useState<'si' | 'pendiente' | 'guardando' | 'error'>('si');
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<Version>(`/api/versiones/${versionId}`).then((d) => {
      setV(d);
      setReceta(d.receta);
      setZonaHerr(d.receta.zonas[0]?.codigo ?? '');
    });
  }, [versionId]);

  const g = useMemo(() => (receta ? generar(receta) : null), [receta]);
  const c = useMemo(() => (receta && g ? comprobar(receta, g) : null), [receta, g]);
  const soloLectura = !v || v.estado === 'congelada' || !puede('recintos.editar');

  if (!v || !receta || !g || !c) return <p role="status">Cargando…</p>;

  function cambiar(fn: (r: RecetaPlano) => void) {
    if (soloLectura) return;
    const r: RecetaPlano = structuredClone(receta!);
    fn(r);
    setReceta(r);
    setGuardado('pendiente');
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => guardar(r), 700);
  }

  async function guardar(r: RecetaPlano) {
    setGuardado('guardando');
    try {
      await api(`/api/versiones/${versionId}`, { metodo: 'PUT', cuerpo: { receta: r } });
      setGuardado('si');
    } catch (err: any) {
      setGuardado('error');
      setMsg({ tipo: 'bad', texto: err.datos?.detalles?.map((d: any) => `${d.campo}: ${d.mensaje}`).join(' · ') || err.message });
    }
  }

  const editarButaca = (a: Asiento) =>
    cambiar((r) => {
      r.ajustes = r.ajustes || {};
      const j = r.ajustes[a.codigo] || (r.ajustes[a.codigo] = {});
      if (herr === 'zona') j.zona = zonaHerr;
      else if (herr === 'bloqueo') a.bloqueado ? delete j.bloqueado : (j.bloqueado = true);
      else if (herr === 'quitar') a.quitada ? delete j.quitada : (j.quitada = true);
      else if (a.tipo === 'silla_ruedas') setMsg({ tipo: 'warn', texto: 'Los espacios PMR se cambian en «Espacios para silla de ruedas» del bloque.' });
      else {
        const t = herr === 'acompanante' ? 'acompanante' : 'visibilidad_reducida';
        if (a.tipo === t) delete j.tipo;
        else j.tipo = t;
      }
      if (!Object.keys(j).length) delete r.ajustes[a.codigo];
    });

  const setBloque = (i: number, k: keyof Bloque, val: any) => cambiar((r) => ((r.bloques[i] as any)[k] = val));
  const listaBloque = (i: number, k: 'tramos' | 'pmr' | 'quitar' | 'excepciones', fn: (l: any[], b: Bloque) => void) =>
    cambiar((r) => {
      const b = r.bloques[i];
      b[k] = (b[k] || []) as any;
      fn(b[k] as any[], b);
    });

  async function congelar() {
    if (guardado !== 'si') await guardar(receta!);
    if (!confirm('Al ponerlo a la venta, esta versión queda congelada y ya no se podrá cambiar. ¿Seguir?')) return;
    try {
      await api(`/api/versiones/${versionId}/congelar`, { cuerpo: {} });
      setV({ ...v!, estado: 'congelada' });
      setMsg({ tipo: 'ok', texto: 'Versión congelada: ya se puede usar para vender.' });
    } catch (err: any) {
      setMsg({ tipo: 'bad', texto: err.message });
    }
  }
  async function versionNueva() {
    const n = await api(`/api/planos/${v!.plano_id}/versiones`, { cuerpo: {} });
    router.push(`/panel/planos/${n.id}`);
  }

  const num = (val: string) => (val === '' ? '' : Number(val));

  return (
    <div className="stack">
      <p><Link href={`/panel/recintos/${v.recinto_id}`}>← {v.recinto_nombre}</Link></p>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1>{v.plano_nombre} · v{v.numero}</h1>
        <div className="fila">
          {v.estado === 'congelada' ? <span className="tag ok">A la venta (congelada)</span> : <span className="tag">Borrador</span>}
          {!soloLectura && <span className="small muted" role="status" aria-live="polite">{{ si: 'Guardado', pendiente: 'Cambios sin guardar…', guardando: 'Guardando…', error: 'No se pudo guardar' }[guardado]}</span>}
          <a className="btn sec sm" href={`/api/versiones/${versionId}/exportar`} download>Exportar</a>
          {v.estado === 'congelada' && puede('recintos.editar') && <button className="btn sm" onClick={versionNueva}>Crear versión nueva</button>}
          {v.estado !== 'congelada' && puede('recintos.editar') && <button className="btn acento sm" onClick={congelar} disabled={!c.ok}>Poner a la venta</button>}
        </div>
      </div>
      {receta.notas && <p className="aviso warn">{receta.notas}</p>}
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}

      <div className="editor">
        <fieldset className="stack" disabled={soloLectura} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <section className="panel stack">
            <h2>Datos del plano</h2>
            <label className="campo">Nombre<input value={receta.nombre} onChange={(e) => cambiar((r) => (r.nombre = e.target.value))} /></label>
            <label className="campo">Fuente (plano oficial)<input value={receta.fuente ?? ''} onChange={(e) => cambiar((r) => (r.fuente = e.target.value))} /></label>
            <div className="g2">
              <label className="campo">Butacas según el plano oficial<input type="number" min="0" value={receta.aforo?.butacas ?? 0} onChange={(e) => cambiar((r) => (r.aforo = { butacas: +e.target.value || 0, pmr: r.aforo?.pmr ?? 0 }))} /></label>
              <label className="campo">Espacios PMR según el plano oficial<input type="number" min="0" value={receta.aforo?.pmr ?? 0} onChange={(e) => cambiar((r) => (r.aforo = { butacas: r.aforo?.butacas ?? 0, pmr: +e.target.value || 0 }))} /></label>
            </div>
          </section>

          <section className="panel stack">
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <h2>Zonas de precio</h2>
              <button type="button" className="btn sec sm" onClick={() => cambiar((r) => r.zonas.push({ codigo: 'z' + uid(), nombre: 'Zona ' + (r.zonas.length + 1), color: COLORES[r.zonas.length % COLORES.length], precio: 10 }))}>Añadir zona</button>
            </div>
            {receta.zonas.map((z, i) => (
              <div key={z.codigo} className="fila" style={{ flexWrap: 'nowrap' }}>
                <input type="color" aria-label={`Color de ${z.nombre}`} value={z.color} style={{ width: 52, padding: 4 }} onChange={(e) => cambiar((r) => (r.zonas[i].color = e.target.value))} />
                <input aria-label="Nombre de la zona" value={z.nombre} onChange={(e) => cambiar((r) => (r.zonas[i].nombre = e.target.value))} />
                <button type="button" className="icono" aria-label={`Quitar zona ${z.nombre}`} onClick={() => receta.zonas.length > 1 ? cambiar((r) => r.zonas.splice(i, 1)) : setMsg({ tipo: 'warn', texto: 'El plano necesita al menos una zona.' })}>×</button>
              </div>
            ))}
            <p className="small muted">Los precios reales se ponen en cada función.</p>
          </section>

          <section className="panel stack">
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <h2>Bloques de filas</h2>
              <button type="button" className="btn sec sm" onClick={() => cambiar((r) => {
                const u = r.bloques[r.bloques.length - 1];
                r.bloques.push({ id: 'b' + uid(), nombre: 'Anfiteatro', codigo: 'ANF' + (r.bloques.length + 1), desde: 1, hasta: 5, prefijo: 'A-', butacas: u?.butacas || 20, numeracion: u?.numeracion || 'derecha', imparesA: u?.imparesA || 'derecha', pasilloCentral: u?.pasilloCentral || 0, pasillos: '', tramos: [{ desde: 1, hasta: 5, zona: r.zonas[r.zonas.length - 1].codigo }], excepciones: [], quitar: [], pmr: [] });
              })}>Añadir bloque</button>
            </div>
            {receta.bloques.map((b, i) => (
              <details key={b.id} className="bloque" open={i === 0}>
                <summary>
                  <span>{b.nombre || 'Bloque'} <span className="small muted">· {b.prefijo}{b.desde} a {b.prefijo}{b.hasta} · {b.butacas} por fila</span></span>
                </summary>
                <div>
                  <div className="g2">
                    <label className="campo">Nombre<input value={b.nombre} onChange={(e) => setBloque(i, 'nombre', e.target.value)} /></label>
                    <label className="campo">Código interno<input value={b.codigo} onChange={(e) => setBloque(i, 'codigo', e.target.value)} /></label>
                  </div>
                  <div className="g3">
                    <label className="campo">Primera fila<input type="number" min="1" value={b.desde} onChange={(e) => setBloque(i, 'desde', num(e.target.value))} /></label>
                    <label className="campo">Última fila<input type="number" min="1" value={b.hasta} onChange={(e) => setBloque(i, 'hasta', num(e.target.value))} /></label>
                    <label className="campo">Prefijo<input value={b.prefijo} onChange={(e) => setBloque(i, 'prefijo', e.target.value)} /></label>
                  </div>
                  <div className="g2">
                    <label className="campo">Butacas por fila<input type="number" min="1" value={b.butacas} onChange={(e) => setBloque(i, 'butacas', num(e.target.value))} /></label>
                    <label className="campo">Pasillos detrás de las filas<input placeholder="7, 16" value={b.pasillos ?? ''} onChange={(e) => setBloque(i, 'pasillos', e.target.value)} /></label>
                  </div>
                  <div className="g2">
                    <label className="campo">Numeración
                      <select value={b.numeracion} onChange={(e) => setBloque(i, 'numeracion', e.target.value)}>
                        <option value="derecha">1, 2, 3… desde la derecha</option>
                        <option value="izquierda">1, 2, 3… desde la izquierda</option>
                        <option value="pares_impares">Pares e impares desde el centro</option>
                      </select>
                    </label>
                    <label className="campo">Pasillo central (cm)<input type="number" min="0" step="10" value={b.pasilloCentral ?? 0} onChange={(e) => setBloque(i, 'pasilloCentral', num(e.target.value))} /></label>
                  </div>
                  {b.numeracion === 'pares_impares' && (
                    <label className="campo">Impares a la
                      <select value={b.imparesA ?? 'derecha'} onChange={(e) => setBloque(i, 'imparesA', e.target.value)}>
                        <option value="derecha">derecha del espectador</option>
                        <option value="izquierda">izquierda del espectador</option>
                      </select>
                    </label>
                  )}
                  <ListaMini titulo="Zonas por filas" vacia="Sin tramos: las butacas quedarán sin zona." filas={b.tramos ?? []}
                    columnas={[['desde', 'Desde fila', 'number'], ['hasta', 'Hasta fila', 'number'], ['zona', 'Zona', 'zona']]} zonas={receta.zonas}
                    onAñadir={() => listaBloque(i, 'tramos', (l, bb) => { const u = l[l.length - 1]; l.push({ desde: u ? +u.hasta + 1 : +bb.desde, hasta: +bb.hasta, zona: receta.zonas[0].codigo }); })}
                    onCambiar={(j, k, val) => listaBloque(i, 'tramos', (l) => (l[j][k] = val))} onQuitar={(j) => listaBloque(i, 'tramos', (l) => l.splice(j, 1))} />
                  <ListaMini titulo="Espacios para silla de ruedas" filas={b.pmr ?? []}
                    columnas={[['fila', 'Fila', 'number'], ['sustituye', 'Sustituye a las butacas', 'text'], ['cantidad', 'Espacios', 'number']]}
                    onAñadir={() => listaBloque(i, 'pmr', (l, bb) => l.push({ fila: +bb.hasta, sustituye: '1, 2', cantidad: 1 }))}
                    onCambiar={(j, k, val) => listaBloque(i, 'pmr', (l) => (l[j][k] = val))} onQuitar={(j) => listaBloque(i, 'pmr', (l) => l.splice(j, 1))} />
                  <ListaMini titulo="Butacas que no existen" filas={b.quitar ?? []}
                    columnas={[['fila', 'Fila', 'number'], ['butacas', 'Butacas', 'text']]}
                    onAñadir={() => listaBloque(i, 'quitar', (l, bb) => l.push({ fila: +bb.desde, butacas: '1' }))}
                    onCambiar={(j, k, val) => listaBloque(i, 'quitar', (l) => (l[j][k] = val))} onQuitar={(j) => listaBloque(i, 'quitar', (l) => l.splice(j, 1))} />
                  <ListaMini titulo="Filas con otro número de butacas" filas={b.excepciones ?? []}
                    columnas={[['fila', 'Fila', 'number'], ['butacas', 'Butacas', 'number']]}
                    onAñadir={() => listaBloque(i, 'excepciones', (l, bb) => l.push({ fila: +bb.desde, butacas: +bb.butacas - 2 }))}
                    onCambiar={(j, k, val) => listaBloque(i, 'excepciones', (l) => (l[j][k] = val))} onQuitar={(j) => listaBloque(i, 'excepciones', (l) => l.splice(j, 1))} />
                  <button type="button" className="btn peligro sm" onClick={() => receta.bloques.length > 1 ? cambiar((r) => r.bloques.splice(i, 1)) : setMsg({ tipo: 'warn', texto: 'El plano necesita al menos un bloque.' })}>Quitar bloque</button>
                </div>
              </details>
            ))}
          </section>
        </fieldset>

        <div className="stack" style={{ minWidth: 0 }}>
          <section className="panel stack">
            <div className="cifras">
              <span>Butacas <b>{c.but}</b></span><span>PMR <b>{c.pmr}</b></span><span>Bloqueadas <b>{c.bl}</b></span><span>A la venta <b>{c.vend}</b></span>
            </div>
            <div className="informe" aria-live="polite">
              {c.ok && <div className="o">✓ El plano cuadra con el aforo oficial y se puede usar para vender.</div>}
              {c.err.map((t) => <div key={t} className="e">✕ {t}</div>)}
              {c.av.map((t) => <div key={t} className="a">! {t}</div>)}
            </div>
          </section>
          {!soloLectura && (
            <section className="panel stack">
              <h2 id="t-herr">Ajustes a mano</h2>
              <p className="small muted">Elige una herramienta y pulsa sobre las butacas del plano (o muévete con las flechas y pulsa Intro).</p>
              <div className="segmentos" role="group" aria-labelledby="t-herr">
                {HERRAMIENTAS.map(([k, t]) => <button key={k} type="button" aria-pressed={herr === k} onClick={() => setHerr(k)}>{t}</button>)}
              </div>
              {herr === 'zona' && (
                <label className="campo" style={{ maxWidth: 260 }}>Zona a aplicar
                  <select value={zonaHerr} onChange={(e) => setZonaHerr(e.target.value)}>{receta.zonas.map((z) => <option key={z.codigo} value={z.codigo}>{z.nombre}</option>)}</select>
                </label>
              )}
              <div><button type="button" className="btn sec sm" onClick={() => cambiar((r) => (r.ajustes = {}))}>Deshacer todos los ajustes a mano</button></div>
            </section>
          )}
          <section className="panel stack">
            <div className="leyenda">
              {receta.zonas.map((z) => <span key={z.codigo}><i className="mu" style={{ background: z.color }} />{z.nombre} · {g.asientos.filter((a) => !a.quitada && a.zona === z.codigo).length}</span>)}
              <span><i className="mu" style={{ border: '2px dashed var(--line)' }} />Quitada</span>
              <span><i className="mu" style={{ border: '2px dashed var(--ink)' }} />Acompañante</span>
            </div>
            <div className="mapa">
              {g.asientos.length ? (
                <PlanoSvg plano={g} zonas={receta.zonas} modo="editor" titulo={`Plano ${receta.nombre}`} onButaca={soloLectura ? undefined : editarButaca} />
              ) : <p className="vacio">Añade un bloque de filas para empezar a dibujar.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ListaMini({ titulo, vacia, filas, columnas, zonas, onAñadir, onCambiar, onQuitar }: {
  titulo: string;
  vacia?: string;
  filas: any[];
  columnas: [string, string, 'number' | 'text' | 'zona'][];
  zonas?: { codigo: string; nombre: string }[];
  onAñadir: () => void;
  onCambiar: (j: number, k: string, v: any) => void;
  onQuitar: (j: number) => void;
}) {
  return (
    <div className="mini">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <b className="small">{titulo}</b>
        <button type="button" className="btn sec sm" onClick={onAñadir}>Añadir</button>
      </div>
      {!filas.length && vacia && <span className="small muted">{vacia}</span>}
      {filas.map((f, j) => (
        <div key={j} className="mini-fila">
          {columnas.map(([k, et, tipo]) =>
            tipo === 'zona' ? (
              <select key={k} aria-label={et} value={f[k]} onChange={(e) => onCambiar(j, k, e.target.value)}>
                {zonas!.map((z) => <option key={z.codigo} value={z.codigo}>{z.nombre}</option>)}
              </select>
            ) : (
              <input key={k} aria-label={et} type={tipo} min={tipo === 'number' ? 1 : undefined} value={f[k]} onChange={(e) => onCambiar(j, k, tipo === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value)} />
            ),
          )}
          {columnas.length < 3 && <span />}
          <button type="button" className="icono" aria-label={`Quitar fila de ${titulo.toLowerCase()}`} onClick={() => onQuitar(j)}>×</button>
        </div>
      ))}
    </div>
  );
}
