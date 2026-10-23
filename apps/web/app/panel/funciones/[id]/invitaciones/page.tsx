'use client';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { generar, type Asiento } from '@taquilla/dominio';
import PlanoSvg, { type EstadoButaca } from '@/componentes/PlanoSvg';
import NavFuncion from '@/componentes/NavFuncion';
import { api } from '@/lib/api';

export default function Invitaciones({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [f, setF] = useState<any>(null);
  const [lista, setLista] = useState<{ invitaciones: any[]; protocolo: any[] }>({ invitaciones: [], protocolo: [] });
  const [disp, setDisp] = useState<{ vendidas: string[]; reservadas: string[]; protocolo: string[] }>({ vendidas: [], reservadas: [], protocolo: [] });
  const [sel, setSel] = useState<string[]>([]);
  const [d, setD] = useState({ nombre: '', email: '', tipo: 'invitacion', cantidad: 1, nota: '', enviar: false });
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(() => {
    api(`/api/panel/funciones/${id}/invitaciones`).then(setLista);
    api(`/api/publico/funciones/${id}/disponibilidad`).then(setDisp);
  }, [id]);
  useEffect(() => {
    api(`/api/publico/funciones/${id}`).then(setF);
    cargar();
  }, [id, cargar]);
  const plano = useMemo(() => (f?.plano ? generar(f.plano) : null), [f]);
  if (!f) return <p role="status">Cargando…</p>;

  const vendidas = new Set(disp.vendidas), prot = new Set(disp.protocolo), reservadas = new Set(disp.reservadas);
  const protocoloDe = new Map(lista.protocolo.map((p) => [p.butaca_codigo, p]));
  const estado = (c: string): EstadoButaca => (vendidas.has(c) ? 'vendida' : reservadas.has(c) ? 'reservada' : 'libre');
  const alternar = (a: Asiento) => setSel((s) => (s.includes(a.codigo) ? s.filter((x) => x !== a.codigo) : [...s, a.codigo]));

  const accion = async (fn: () => Promise<any>, ok: (r: any) => string) => {
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ tipo: 'ok', texto: ok(r) });
      setSel([]);
      cargar();
    } catch (e: any) {
      setMsg({ tipo: 'bad', texto: e.message });
    }
  };
  const emitir = () => accion(
    () => api(`/api/panel/funciones/${id}/invitaciones`, { cuerpo: { nombre: d.nombre, email: d.email || null, tipo: d.tipo, nota: d.nota || null, enviar: d.enviar, ...(f.modo_venta === 'numerada' ? { butacas: sel } : { cantidad: d.cantidad }) } }),
    (r) => `Emitida ${r.codigo} (${r.entradas} entrada${r.entradas > 1 ? 's' : ''}). Enlace: ${r.enlace}`,
  );

  return (
    <div className="stack">
      <h1>{f.titulo}</h1>
      <NavFuncion id={id} />
      <div className="dos">
        <div className="stack">
          {plano && (
            <section className="panel stack">
              <h2>Elige butacas</h2>
              <p className="small muted">Las butacas de protocolo aparecen como no disponibles para el público. Selecciónalas para emitir la invitación a su nombre.</p>
              <div className="mapa">
                <PlanoSvg plano={plano} zonas={f.plano.zonas} modo="venta" titulo="Plano para invitaciones" seleccion={sel} onButaca={alternar}
                  estado={(c) => (prot.has(c) ? 'libre' : estado(c))} extra={(a) => (protocoloDe.has(a.codigo) ? `, protocolo: ${protocoloDe.get(a.codigo).nombre}` : '')} />
              </div>
              <p className="small">Seleccionadas: {sel.length ? sel.join(', ') : 'ninguna'}</p>
            </section>
          )}
          <section className="panel stack">
            <h2>Protocolo (butacas bloqueadas)</h2>
            {lista.protocolo.length ? (
              <table className="tabla"><tbody>
                {lista.protocolo.map((p) => (
                  <tr key={p.id}><td className="mono small">{p.butaca_codigo}</td><td>{p.nombre}</td><td>{p.nota}</td>
                    <td><button className="btn sec sm" onClick={() => accion(() => api(`/api/panel/protocolo/${p.id}`, { metodo: 'DELETE' }), () => 'Butaca liberada')}>Liberar</button></td></tr>
                ))}
              </tbody></table>
            ) : <p className="muted small">No hay butacas bloqueadas.</p>}
          </section>
          <section className="panel stack">
            <h2>Invitaciones y acreditaciones emitidas</h2>
            <table className="tabla">
              <thead><tr><th>Código</th><th>Para</th><th>Entradas</th></tr></thead>
              <tbody>
                {lista.invitaciones.map((i) => (
                  <tr key={i.id}><td className="mono small">{i.codigo}</td><td>{i.nombre}<br /><span className="small muted">{i.email}</span></td>
                    <td className="small">{i.entradas.map((e: any) => (
                      <div key={e.codigo}>{e.descripcion} · {e.tipo} · {e.estado}
                        {e.estado === 'valida' && <button className="btn sec sm" style={{ marginLeft: 6 }} onClick={() => { const m = prompt('Motivo de la anulación'); if (m) accion(() => api(`/api/panel/entradas/${e.codigo}/anular`, { cuerpo: { motivo: m } }), () => 'Anulada'); }}>Anular</button>}
                      </div>
                    ))}</td></tr>
                ))}
              </tbody>
            </table>
            {!lista.invitaciones.length && <p className="muted small">Aún no hay invitaciones.</p>}
          </section>
        </div>
        <aside className="panel stack">
          <h2>Para quién</h2>
          <label className="campo">Nombre<input value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} /></label>
          <label className="campo">Correo (opcional)<input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
          <label className="campo">Tipo
            <select value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })}>
              <option value="invitacion">Invitación</option>
              <option value="acreditacion">Acreditación (prensa, staff, artistas)</option>
            </select>
          </label>
          {f.modo_venta !== 'numerada' && <label className="campo">Cuántas<input type="number" min={1} max={50} value={d.cantidad} onChange={(e) => setD({ ...d, cantidad: +e.target.value })} /></label>}
          <label className="campo">Nota interna<input value={d.nota} onChange={(e) => setD({ ...d, nota: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={d.enviar} onChange={(e) => setD({ ...d, enviar: e.target.checked })} /> Enviar las entradas por correo</label>
          <button className="btn acento" disabled={!d.nombre || (f.modo_venta === 'numerada' && !sel.length)} onClick={emitir}>Emitir invitación</button>
          {f.modo_venta === 'numerada' && (
            <button className="btn sec" disabled={!d.nombre || !sel.length} onClick={() => accion(() => api(`/api/panel/funciones/${id}/protocolo`, { cuerpo: { butacas: sel, nombre: d.nombre, nota: d.nota || null } }), (r) => `${r.bloqueadas} butacas bloqueadas para ${d.nombre}`)}>
              Solo bloquear (protocolo)
            </button>
          )}
          {msg && <p className={`aviso ${msg.tipo}`} role="status" style={{ overflowWrap: 'anywhere' }}>{msg.texto}</p>}
        </aside>
      </div>
    </div>
  );
}
