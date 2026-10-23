'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { api, eur, fechaCorta } from '@/lib/api';
import { useSesion } from '@/lib/sesion';
import { ESTADO_FUNCION, MODO_VENTA } from '@/lib/textos';

type Socio = { nombre: string; cif: string | null; porcentaje: number };

export default function Evento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { puede } = useSesion();
  const [e, setE] = useState<any>(null);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const cargar = () => api(`/api/eventos/${id}`).then((d) => {
    setE(d);
    setSocios(d.socios);
  });
  useEffect(() => {
    cargar();
  }, [id]);
  if (!e) return <p role="status">Cargando…</p>;
  const islas: Record<string, { nombre: string; colores: { acento: string } }> = Object.fromEntries((e.datos?.islas ?? []).map((i: any) => [i.id, i]));
  const suma = socios.reduce((s, x) => s + Number(x.porcentaje || 0), 0);

  const guardarSocios = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api(`/api/eventos/${id}/socios`, { metodo: 'PUT', cuerpo: { socios: socios.map((s) => ({ ...s, porcentaje: Number(s.porcentaje), cif: s.cif || null })) } });
      setMsg({ tipo: 'ok', texto: 'Reparto guardado.' });
    } catch (err: any) {
      setMsg({ tipo: 'bad', texto: err.message });
    }
  };

  const precioTexto = (f: any) => {
    if (f.modo_venta === 'libre') return 'Gratis';
    const ps = Object.values(f.precios ?? {}) as number[];
    if (!ps.length) return <span className="tag demo">Precio por confirmar</span>;
    const min = Math.min(...ps), max = Math.max(...ps);
    return min === max ? eur(min) : `${eur(min)} – ${eur(max)}`;
  };

  return (
    <div className="stack">
      <p><Link href="/panel/eventos">← Eventos</Link></p>
      <h1>{e.nombre}</h1>
      {e.datos?.fuente && <p className="small muted">Fuente de la programación: {e.datos.fuente}</p>}
      <div className="panel desliza">
        <table className="tabla">
          <caption className="sr-only">Funciones del evento</caption>
          <thead><tr><th>Fecha</th><th>Función</th><th>Recinto</th><th>Venta</th><th>Precio</th><th>Estado</th></tr></thead>
          <tbody>
            {e.funciones.map((f: any) => (
              <tr key={f.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(f.fecha)}<br /><span className="small muted">{f.hora ?? 'Hora por confirmar'}</span></td>
                <td>
                  <Link href={`/panel/funciones/${f.id}`}><b>{f.titulo}</b></Link>
                  {f.es_prueba && <> <span className="tag demo">prueba</span></>}
                  {f.verificar && <> <span className="tag demo">verificar</span></>}
                </td>
                <td>
                  <span className="mu" style={{ background: islas[f.isla]?.colores.acento ?? 'var(--line)', display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} aria-hidden="true" />
                  {f.recinto_nombre}<br /><span className="small muted">{islas[f.isla]?.nombre ?? f.isla}</span>
                </td>
                <td>{MODO_VENTA[f.modo_venta]}{f.venta_externa_url && <><br /><span className="small muted">Oficial: Entradas Canarias</span></>}</td>
                <td>{precioTexto(f)}</td>
                <td><span className={`tag ${ESTADO_FUNCION[f.estado].clase}`}>{ESTADO_FUNCION[f.estado].texto}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="panel stack" onSubmit={guardarSocios}>
        <h2>Coproducción · reparto de la liquidación</h2>
        {socios.map((s, i) => (
          <div key={i} className="g3">
            <label className="campo">Socio<input value={s.nombre} disabled={!puede('eventos.editar')} onChange={(ev) => setSocios(socios.map((x, j) => (j === i ? { ...x, nombre: ev.target.value } : x)))} /></label>
            <label className="campo">CIF / NIF<input value={s.cif ?? ''} disabled={!puede('eventos.editar')} onChange={(ev) => setSocios(socios.map((x, j) => (j === i ? { ...x, cif: ev.target.value } : x)))} /></label>
            <label className="campo">Porcentaje (%)<input type="number" step="0.01" min="0" max="100" value={s.porcentaje} disabled={!puede('eventos.editar')} onChange={(ev) => setSocios(socios.map((x, j) => (j === i ? { ...x, porcentaje: ev.target.value as any } : x)))} /></label>
          </div>
        ))}
        <p className={`small ${Math.abs(suma - 100) < 0.001 || !socios.length ? 'muted' : ''}`} style={{ color: socios.length && Math.abs(suma - 100) >= 0.001 ? 'var(--bad)' : undefined }}>
          {socios.length ? `Suma: ${suma} %` : 'Sin coproducción: todo para el organizador.'}
        </p>
        {puede('eventos.editar') && (
          <div className="fila">
            <button type="button" className="btn sec sm" onClick={() => setSocios([...socios, { nombre: '', cif: '', porcentaje: 0 }])}>Añadir socio</button>
            {socios.length > 0 && <button type="button" className="btn sec sm" onClick={() => setSocios(socios.slice(0, -1))}>Quitar el último</button>}
            <button className="btn sm">Guardar reparto</button>
          </div>
        )}
        {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
      </form>
    </div>
  );
}
