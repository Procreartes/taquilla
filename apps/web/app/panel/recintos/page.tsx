'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSesion } from '@/lib/sesion';

type Recinto = { id: string; codigo: string; nombre: string; municipio: string | null; isla: string | null; planos: number; verificar: boolean };

export default function Recintos() {
  const { puede } = useSesion();
  const [lista, setLista] = useState<Recinto[]>([]);
  const [nuevo, setNuevo] = useState({ nombre: '', codigo: '', municipio: '', isla: '' });
  const [msg, setMsg] = useState('');
  const cargar = () => api<Recinto[]>('/api/recintos').then(setLista);
  useEffect(() => {
    cargar();
  }, []);
  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/recintos', { cuerpo: { ...nuevo, municipio: nuevo.municipio || null, isla: nuevo.isla || null } });
      setNuevo({ nombre: '', codigo: '', municipio: '', isla: '' });
      cargar();
    } catch (err: any) {
      setMsg(err.message);
    }
  };
  return (
    <div className="stack">
      <h1>Recintos y planos</h1>
      <div className="rejilla">
        {lista.map((r) => (
          <Link key={r.id} href={`/panel/recintos/${r.id}`} className="panel" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>{r.nombre}</h2>
            <p className="small muted">{[r.municipio, r.isla].filter(Boolean).join(' · ') || 'Sin ubicación'}</p>
            <p className="small">{r.planos ? `${r.planos} plano${r.planos > 1 ? 's' : ''}` : 'Sin plano: venta por aforo general'}{r.verificar && <> · <span className="tag demo">verificar datos</span></>}</p>
          </Link>
        ))}
      </div>
      {!lista.length && <p className="vacio">Aún no hay recintos.</p>}
      {puede('recintos.editar') && (
        <form className="panel stack" onSubmit={crear}>
          <h2>Nuevo recinto</h2>
          <div className="g2">
            <label className="campo">Nombre<input required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value, codigo: nuevo.codigo || '' })} /></label>
            <label className="campo">Código interno<span className="ayuda">Minúsculas, números y guiones (p. ej. teatro-guiniguada)</span>
              <input required pattern="[a-z0-9-]{2,60}" value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value.toLowerCase() })} />
            </label>
            <label className="campo">Municipio<input value={nuevo.municipio} onChange={(e) => setNuevo({ ...nuevo, municipio: e.target.value })} /></label>
            <label className="campo">Isla o provincia<input value={nuevo.isla} onChange={(e) => setNuevo({ ...nuevo, isla: e.target.value })} /></label>
          </div>
          {msg && <p className="aviso bad" role="alert">{msg}</p>}
          <div><button className="btn">Crear recinto</button></div>
        </form>
      )}
    </div>
  );
}
