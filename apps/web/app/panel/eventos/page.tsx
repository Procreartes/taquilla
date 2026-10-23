'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, fechaCorta } from '@/lib/api';
import { useSesion } from '@/lib/sesion';

type Evento = { id: string; slug: string; nombre: string; tipo: string; funciones: number; a_la_venta: number; desde: string | null; hasta: string | null; es_prueba: boolean };

export default function Eventos() {
  const { puede } = useSesion();
  const [lista, setLista] = useState<Evento[]>([]);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const cargar = () => api<Evento[]>('/api/eventos').then(setLista);
  useEffect(() => {
    cargar();
  }, []);

  const importar = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    try {
      const programacion = JSON.parse(await f.text());
      const nombre = prompt('Nombre del evento', programacion?._meta?.edicion ?? '');
      if (!nombre) return;
      const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
      const r = await api('/api/eventos/importar-programacion', { cuerpo: { slug, nombre, programacion } });
      setMsg({ tipo: 'ok', texto: `Importadas ${r.funciones} funciones (${r.numeradas} numeradas, ${r.generales} por aforo general, ${r.libres} de acceso libre). ${r.sinPrecio} sin precio oficial.` });
      cargar();
    } catch (err: any) {
      setMsg({ tipo: 'bad', texto: err instanceof SyntaxError ? 'El fichero no es un JSON válido.' : err.message });
    }
  };

  return (
    <div className="stack">
      <h1>Eventos</h1>
      <div className="rejilla">
        {lista.map((e) => (
          <Link key={e.id} href={`/panel/eventos/${e.id}`} className="panel" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="tag">{e.tipo}</span>
            <h2 style={{ marginTop: 8 }}>{e.nombre}</h2>
            <p className="small muted">{e.desde ? `${fechaCorta(e.desde)} – ${fechaCorta(e.hasta!)}` : 'Sin funciones'}</p>
            <p className="small">{e.funciones} funciones · {e.a_la_venta} a la venta aquí</p>
          </Link>
        ))}
      </div>
      {!lista.length && <p className="vacio">Aún no hay eventos.</p>}
      {puede('eventos.editar') && (
        <div className="panel fila">
          <label className="btn sec" style={{ cursor: 'pointer' }}>
            Importar programación (JSON)
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => importar(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
    </div>
  );
}
