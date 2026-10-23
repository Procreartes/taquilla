'use client';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { api, eur, fechaLarga } from '@/lib/api';
import { useSesion } from '@/lib/sesion';
import NavFuncion from '@/componentes/NavFuncion';

const ESTADO_PEDIDO: Record<string, string> = { pagado: 'Pagado', devuelto: 'Devuelto', devuelto_parcial: 'Devuelto en parte', conflicto: 'Conflicto (devuelto)' };

export default function Ventas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { puede } = useSesion();
  const [d, setD] = useState<any>(null);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState<any>(null);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(() => {
    api(`/api/panel/funciones/${id}`).then(setD);
    if (puede('pedidos.ver')) api(`/api/panel/funciones/${id}/pedidos${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setPedidos);
  }, [id, q, puede]);
  useEffect(() => {
    cargar();
    const i = setInterval(cargar, 30_000);
    return () => clearInterval(i);
  }, [cargar]);
  if (!d) return <p role="status">Cargando…</p>;
  const { funcion: f, resumen: r } = d;

  const abrir = (pid: string) => api(`/api/panel/pedidos/${pid}`).then(setAbierto);
  async function devolver(entradas: string[] | undefined, incluirGastos: boolean) {
    const motivo = prompt('Motivo de la devolución (queda en la auditoría)');
    if (!motivo) return;
    try {
      const x = await api(`/api/panel/pedidos/${abierto.id}/devolver`, { cuerpo: { entradas, incluirGastos, motivo } });
      setMsg({ tipo: 'ok', texto: `Devolución de ${eur(x.importe)} en marcha (${x.entradas} entrada${x.entradas > 1 ? 's' : ''}).` });
      setTimeout(() => { abrir(abierto.id); cargar(); }, 1200);
    } catch (e: any) {
      setMsg({ tipo: 'bad', texto: e.message });
    }
  }
  async function cancelar() {
    const motivo = prompt('Vas a CANCELAR la función y devolver TODAS las entradas (con gastos). Escribe el motivo:');
    if (!motivo) return;
    if (prompt('Para confirmar escribe CANCELAR') !== 'CANCELAR') return;
    try {
      const x = await api(`/api/panel/funciones/${id}/cancelar`, { cuerpo: { motivo, confirmacion: 'CANCELAR' } });
      setMsg({ tipo: 'ok', texto: `Función cancelada. Se están devolviendo ${x.pedidos} pedidos y avisando a cada comprador.` });
      cargar();
    } catch (e: any) {
      setMsg({ tipo: 'bad', texto: e.message });
    }
  }

  return (
    <div className="stack">
      <p><Link href={`/panel/eventos/${f.evento_id}`}>← {f.evento_nombre}</Link></p>
      <h1>{f.titulo}</h1>
      <p className="muted"><span className="capital">{fechaLarga(f.fecha)}</span> · {f.hora ?? '—'} · {f.recinto_nombre}</p>
      <NavFuncion id={id} />
      {f.es_prueba && <p className="aviso warn">Función de PRUEBA.</p>}
      <div className="kpis">
        <div className="kpi"><b>{r.vendidas}</b><span>Entradas vendidas</span></div>
        <div className="kpi"><b>{r.plazas ? `${Math.round((r.ocupacion ?? 0) * 100)} %` : '—'}</b><span>Ocupación{r.plazas ? ` (de ${r.plazas})` : ''}</span></div>
        <div className="kpi"><b>{eur(r.bruto)}</b><span>Ingresos por entradas</span></div>
        <div className="kpi"><b>{eur(r.gastos)}</b><span>Gastos de gestión</span></div>
        <div className="kpi"><b>{r.invitaciones}</b><span>Invitaciones</span></div>
        <div className="kpi"><b>{r.dentro}</b><span>Dentro del recinto</span></div>
      </div>
      <section className="panel desliza">
        <h2>Ocupación por zona</h2>
        <table className="tabla">
          <thead><tr><th>Zona</th><th className="num">Plazas</th><th className="num">Vendidas</th><th className="num">Invitaciones</th><th className="num">Ocupación</th><th className="num">Importe</th></tr></thead>
          <tbody>
            {r.zonas.map((z: any) => (
              <tr key={z.codigo}>
                <td>{z.nombre}</td><td className="num">{z.plazas ?? '—'}</td><td className="num">{z.vendidas}</td><td className="num">{z.invitaciones}</td>
                <td className="num">{z.plazas ? `${Math.round(((z.vendidas + z.invitaciones) / z.plazas) * 100)} %` : '—'}</td><td className="num">{eur(z.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {puede('pedidos.ver') && (
        <section className="panel stack">
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <h2>Pedidos</h2>
            <div className="fila">
              <a className="btn sec sm" href={`/api/panel/funciones/${id}/exportar?tipo=pedidos&formato=csv`}>Pedidos CSV</a>
              <a className="btn sec sm" href={`/api/panel/funciones/${id}/exportar?tipo=pedidos&formato=xlsx`}>Pedidos Excel</a>
              <a className="btn sec sm" href={`/api/panel/funciones/${id}/exportar?tipo=entradas&formato=xlsx`}>Entradas Excel</a>
            </div>
          </div>
          <form className="fila" onSubmit={(e) => { e.preventDefault(); cargar(); }}>
            <label className="sr-only" htmlFor="buscar">Buscar pedido</label>
            <input id="buscar" placeholder="Código, nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
            <button className="btn sec sm">Buscar</button>
          </form>
          <div className="desliza">
            <table className="tabla">
              <thead><tr><th>Pedido</th><th>Comprador</th><th className="num">Entradas</th><th className="num">Total</th><th>Estado</th><th>Pagado</th></tr></thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td><button className="btn sec sm mono" onClick={() => abrir(p.id)}>{p.codigo}</button>{p.canal === 'invitacion' && <span className="tag"> invitación</span>}</td>
                    <td>{p.comprador_nombre}<br /><span className="small muted">{p.comprador_email}</span></td>
                    <td className="num">{p.entradas}</td><td className="num">{eur(p.total_cent)}</td>
                    <td>{ESTADO_PEDIDO[p.estado] ?? p.estado}</td>
                    <td className="small">{p.pagado_en ? new Date(p.pagado_en).toLocaleString('es-ES') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pedidos.length && <p className="vacio">Aún no hay pedidos.</p>}
          </div>
        </section>
      )}
      {abierto && (
        <section className="panel stack" aria-labelledby="t-pedido">
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <h2 id="t-pedido">Pedido <span className="mono">{abierto.codigo}</span></h2>
            <button className="btn sec sm" onClick={() => setAbierto(null)}>Cerrar</button>
          </div>
          <p className="small">{abierto.comprador_nombre} · {abierto.comprador_email} · {eur(abierto.total_cent)} · Factura {abierto.numero_factura ?? '—'}</p>
          <table className="tabla">
            <thead><tr><th>Entrada</th><th>Butaca</th><th className="num">Precio</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {abierto.entradas.map((e: any) => (
                <tr key={e.id}>
                  <td className="mono small">{e.codigo}</td><td>{e.descripcion}</td><td className="num">{eur(e.precio_cent)}</td>
                  <td>{e.estado}{e.usada_en ? ` · ${new Date(e.usada_en).toLocaleTimeString('es-ES')}` : ''}</td>
                  <td>{puede('devoluciones.hacer') && e.estado === 'valida' && e.tipo_entrada === 'venta' && <button className="btn sec sm" onClick={() => devolver([e.id], false)}>Devolver esta</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {puede('devoluciones.hacer') && abierto.entradas.some((e: any) => e.estado === 'valida' && e.tipo_entrada === 'venta') && (
            <div className="fila">
              <button className="btn sec sm" onClick={() => devolver(undefined, false)}>Devolver todo (sin gastos)</button>
              <button className="btn sec sm" onClick={() => devolver(undefined, true)}>Devolver todo con gastos de gestión</button>
            </div>
          )}
          {abierto.devoluciones.length > 0 && (
            <ul className="small">{abierto.devoluciones.map((d: any, i: number) => <li key={i}>{eur(d.importe_cent)} · {d.estado}{d.error ? ` (${d.error})` : ''} · {d.motivo}</li>)}</ul>
          )}
        </section>
      )}
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
      {puede('funciones.cancelar') && !['cancelada', 'finalizada'].includes(f.estado) && (
        <section className="panel stack" style={{ borderColor: 'var(--bad)' }}>
          <h2>Cancelar la función</h2>
          <p className="small">Deja de vender, anula las entradas y devuelve el importe completo (con gastos de gestión) a cada comprador, avisándole por correo.</p>
          <div><button className="btn peligro" onClick={cancelar}>Cancelar la función</button></div>
        </section>
      )}
    </div>
  );
}
