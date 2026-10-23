'use client';
import { use, useEffect, useState } from 'react';
import NavFuncion from '@/componentes/NavFuncion';
import TablaLiquidacion from '@/componentes/TablaLiquidacion';
import { api, fechaLarga } from '@/lib/api';

export default function Liquidacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/api/panel/funciones/${id}/liquidacion`).then(setD).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <p className="aviso bad" role="alert">{error}</p>;
  if (!d) return <p role="status">Cargando…</p>;
  return (
    <div className="stack">
      <h1>Liquidación · {d.funcion.titulo}</h1>
      <p className="muted"><span className="capital">{fechaLarga(d.funcion.fecha)}</span> · {d.funcion.recinto}</p>
      <NavFuncion id={id} />
      {d.funcion.es_prueba && <p className="aviso warn">Función de PRUEBA: importes ficticios.</p>}
      <section className="panel desliza"><TablaLiquidacion l={d.liquidacion} /></section>
      <div className="fila">
        <a className="btn" href={`/api/panel/funciones/${id}/bordero`} target="_blank" rel="noopener noreferrer">Borderó SGAE (imprimir)</a>
        <a className="btn sec" href={`/api/panel/funciones/${id}/bordero?formato=csv`}>Borderó CSV</a>
      </div>
    </div>
  );
}
