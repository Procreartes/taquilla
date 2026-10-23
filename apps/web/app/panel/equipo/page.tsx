'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { NOMBRE_ROL, ROLES } from '@taquilla/dominio';

type Miembro = { id: string; email: string; nombre: string; rol: string; totp_activo: boolean; ultimo_acceso: string | null };

export default function Equipo() {
  const [lista, setLista] = useState<Miembro[]>([]);
  const [nuevo, setNuevo] = useState({ email: '', nombre: '', rol: 'taquilla' });
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const cargar = () => api<Miembro[]>('/api/organizador/equipo').then(setLista);
  useEffect(() => {
    cargar();
  }, []);
  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tipo: 'ok', texto: ok });
      cargar();
    } catch (e: any) {
      setMsg({ tipo: 'bad', texto: e.message });
    }
  };
  return (
    <div className="stack">
      <h1>Equipo</h1>
      <div className="panel desliza">
        <table className="tabla">
          <caption className="sr-only">Personas con acceso a este organizador</caption>
          <thead><tr><th>Persona</th><th>Rol</th><th>2FA</th><th>Último acceso</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {lista.map((m) => (
              <tr key={m.id}>
                <td><b>{m.nombre}</b><br /><span className="small muted">{m.email}</span></td>
                <td>
                  <label className="sr-only" htmlFor={`rol-${m.id}`}>Rol de {m.nombre}</label>
                  <select id={`rol-${m.id}`} value={m.rol} onChange={(e) => accion(() => api(`/api/organizador/equipo/${m.id}`, { metodo: 'PATCH', cuerpo: { rol: e.target.value } }), 'Rol cambiado')}>
                    {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
                  </select>
                </td>
                <td>{m.totp_activo ? <span className="tag ok">Activa</span> : <span className="tag bad">No</span>}</td>
                <td className="small">{m.ultimo_acceso ? new Date(m.ultimo_acceso).toLocaleString('es-ES') : '—'}</td>
                <td>
                  <button className="btn sec sm" onClick={() => confirm(`¿Quitar a ${m.nombre} del equipo?`) && accion(() => api(`/api/organizador/equipo/${m.id}`, { metodo: 'DELETE' }), 'Quitado del equipo')}>Quitar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); accion(() => api('/api/organizador/equipo', { cuerpo: nuevo }), 'Añadido al equipo'); }}>
        <h2>Añadir persona</h2>
        <div className="g3">
          <label className="campo">Nombre<input required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
          <label className="campo">Correo<input type="email" required value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></label>
          <label className="campo">Rol
            <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
            </select>
          </label>
        </div>
        <div><button className="btn">Añadir</button></div>
      </form>
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
    </div>
  );
}
