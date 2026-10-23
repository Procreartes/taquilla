'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSesion } from '@/lib/sesion';

type Version = { id: string; numero: number; estado: string; butacas: number; pmr: number; ok: boolean; actualizado_en: string };
type Detalle = { id: string; nombre: string; municipio: string | null; isla: string | null; planos: { id: string; nombre: string; versiones: Version[] }[] };

export default function Recinto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { puede } = useSesion();
  const [r, setR] = useState<Detalle | null>(null);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const cargar = () => api<Detalle>(`/api/recintos/${id}`).then(setR);
  useEffect(() => {
    cargar();
  }, [id]);
  if (!r) return <p role="status">Cargando…</p>;
  const editar = puede('recintos.editar');

  const nuevoPlano = async () => {
    const nombre = prompt('Nombre del plano (p. ej. «Aforo completo» o «Sin anfiteatro»)', 'Aforo completo');
    if (!nombre) return;
    const p = await api(`/api/recintos/${id}/planos`, { cuerpo: { nombre } });
    router.push(`/panel/planos/${p.version.id}`);
  };
  const importar = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    try {
      const documento = JSON.parse(await f.text());
      const p = await api(`/api/recintos/${id}/importar`, { cuerpo: { documento } });
      setMsg({
        tipo: p.diferencias.length ? 'warn' : 'ok',
        texto: p.diferencias.length ? `Importado, pero las butacas del fichero no coinciden con su receta en ${p.diferencias.length} puntos: se usa la receta.` : `Importado: ${p.version.comprobacion.but} butacas + ${p.version.comprobacion.pmr} PMR.`,
      });
      cargar();
    } catch (err: any) {
      setMsg({ tipo: 'bad', texto: err instanceof SyntaxError ? 'El fichero no es un JSON válido.' : err.message });
    }
  };
  const versionNueva = async (planoId: string) => {
    const v = await api(`/api/planos/${planoId}/versiones`, { cuerpo: {} });
    router.push(`/panel/planos/${v.id}`);
  };

  return (
    <div className="stack">
      <p><Link href="/panel/recintos">← Recintos</Link></p>
      <h1>{r.nombre}</h1>
      <p className="muted">{[r.municipio, r.isla].filter(Boolean).join(' · ')}</p>
      {r.planos.map((p) => (
        <section key={p.id} className="panel stack">
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <h2>{p.nombre}</h2>
            {editar && <button className="btn sec sm" onClick={() => versionNueva(p.id)}>Crear versión nueva</button>}
          </div>
          <div className="desliza">
            <table className="tabla">
              <thead><tr><th>Versión</th><th>Estado</th><th className="num">Butacas</th><th className="num">PMR</th><th>Comprobación</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {p.versiones.map((v) => (
                  <tr key={v.id}>
                    <td>v{v.numero}</td>
                    <td>{v.estado === 'congelada' ? <span className="tag ok">A la venta (congelada)</span> : <span className="tag">Borrador</span>}</td>
                    <td className="num">{v.butacas}</td>
                    <td className="num">{v.pmr}</td>
                    <td>{v.ok ? <span className="tag ok">Cuadra</span> : <span className="tag bad">No cuadra</span>}</td>
                    <td className="fila">
                      <Link className="btn sm" href={`/panel/planos/${v.id}`}>{v.estado === 'congelada' || !editar ? 'Ver' : 'Editar'}</Link>
                      <a className="btn sec sm" href={`/api/versiones/${v.id}/exportar`} download>Exportar</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!r.planos.length && <p className="vacio">Este recinto no tiene plano: sus funciones se venden por aforo general.</p>}
      {editar && (
        <div className="panel fila">
          <button className="btn" onClick={nuevoPlano}>Nuevo plano</button>
          <label className="btn sec" style={{ cursor: 'pointer' }}>
            Importar plano (plano-taquilla/1)
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => importar(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
    </div>
  );
}
