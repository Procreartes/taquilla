'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { api, eur, fechaCorta } from '@/lib/api';
import { useSesion } from '@/lib/sesion';

function Barras({ titulo, datos, total }: { titulo: string; datos: { clave: string; n: number }[]; total: number }) {
  return (
    <section className="panel stack">
      <h3>{titulo}</h3>
      {datos.length ? (
        <table className="tabla">
          <caption className="sr-only">{titulo}</caption>
          <tbody>
            {datos.map((d) => (
              <tr key={d.clave}>
                <th scope="row" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 14, color: 'var(--ink)', width: '40%' }}>{d.clave}</th>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div aria-hidden="true" style={{ height: 12, borderRadius: 4, background: 'var(--accent)', width: `${Math.max(2, (d.n / Math.max(1, total)) * 100)}%` }} />
                    <span className="small">{d.n} ({Math.round((d.n / Math.max(1, total)) * 100)} %)</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted small">Sin datos todavía.</p>}
    </section>
  );
}

export default function Informe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { puede } = useSesion();
  const [panel, setPanel] = useState<any>(null);
  const [liq, setLiq] = useState<any>(null);
  const [pub, setPub] = useState<any>(null);
  useEffect(() => {
    api(`/api/panel/eventos/${id}`).then(setPanel);
    api(`/api/panel/eventos/${id}/publico`).then(setPub);
    if (puede('liquidacion.ver')) api(`/api/panel/eventos/${id}/liquidacion`).then(setLiq).catch(() => {});
  }, [id, puede]);
  if (!panel) return <p role="status">Cargando…</p>;
  const t = panel.totales;
  return (
    <div className="stack">
      <p><Link href={`/panel/eventos/${id}`}>← {panel.evento.nombre}</Link></p>
      <h1>Informe del festival</h1>
      <div className="kpis">
        <div className="kpi"><b>{t.vendidas}</b><span>Entradas vendidas</span></div>
        <div className="kpi"><b>{eur(t.bruto)}</b><span>Ingresos por entradas</span></div>
        <div className="kpi"><b>{eur(t.gastos)}</b><span>Gastos de gestión</span></div>
        <div className="kpi"><b>{eur(t.devoluciones)}</b><span>Devuelto</span></div>
        <div className="kpi"><b>{t.invitaciones}</b><span>Invitaciones</span></div>
        <div className="kpi"><b>{t.dentro}</b><span>Han entrado</span></div>
      </div>
      <section className="panel desliza">
        <h2>Por función</h2>
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Función</th><th>Recinto</th><th className="num">Vendidas</th><th className="num">Ocupación</th><th className="num">Ingresos</th><th className="num">Dentro</th></tr></thead>
          <tbody>
            {panel.funciones.map((f: any) => (
              <tr key={f.id}>
                <td className="small">{fechaCorta(f.fecha)}</td>
                <td><Link href={`/panel/funciones/${f.id}/ventas`}>{f.titulo}</Link>{f.es_prueba && <span className="tag demo"> prueba</span>}{f.venta_externa && <span className="small muted"> · Entradas Canarias</span>}</td>
                <td className="small">{f.recinto}</td>
                <td className="num">{f.vendidas}</td>
                <td className="num">{f.ocupacion !== null ? `${Math.round(f.ocupacion * 100)} %` : '—'}</td>
                <td className="num">{eur(f.bruto)}</td>
                <td className="num">{f.dentro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {liq && (
        <section className="panel stack">
          <h2>Liquidación del festival (ventas en esta plataforma)</h2>
          <table className="tabla"><tbody>
            <tr><td>Bruto</td><td className="num">{eur(liq.totales.bruto)}</td></tr>
            <tr><td>Devoluciones</td><td className="num">−{eur(liq.totales.devoluciones)}</td></tr>
            <tr><td>Impuesto incluido</td><td className="num">{eur(liq.totales.impuesto)}</td></tr>
            <tr><td>Comisiones de la pasarela</td><td className="num">−{eur(liq.totales.comisionPasarela)}</td></tr>
            <tr><td>Derechos de autor</td><td className="num">−{eur(liq.totales.derechosAutor)}</td></tr>
            <tr><td><b>Neto a repartir</b></td><td className="num"><b>{eur(liq.totales.netoTrasDerechos)}</b></td></tr>
            {liq.reparto.map((r: any) => <tr key={r.nombre}><td>→ {r.nombre} ({r.porcentaje} %)</td><td className="num">{eur(r.importe)}</td></tr>)}
            <tr><td>Gastos de gestión (plataforma)</td><td className="num">{eur(liq.totales.gastosGestion)}</td></tr>
          </tbody></table>
        </section>
      )}
      {pub && (
        <>
          <h2>Procedencia del público</h2>
          <p className="small muted">{pub.total} entradas de {pub.pedidos} compras en la web. Datos agregados: los grupos de menos de {pub.minimoGrupo} personas se suman en «Otros», para que nadie sea identificable. Útil para memorias de subvenciones e informes de impacto.</p>
          <div className="rejilla">
            <Barras titulo="Isla" datos={pub.isla} total={pub.total} />
            <Barras titulo="País" datos={pub.pais} total={pub.total} />
            <Barras titulo="Municipio" datos={pub.municipio} total={pub.total} />
          </div>
        </>
      )}
    </div>
  );
}
