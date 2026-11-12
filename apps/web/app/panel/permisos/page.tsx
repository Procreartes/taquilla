'use client';
/*
 * Permisos de cada persona en todos los organizadores (solo superadmin).
 * Quien entra por primera vez desde el portal recibe «Producción» (o «Administración») en cada organizador;
 * aquí se ajusta de una vez, sin ir cambiando de organizador en «Equipo».
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSesion } from '@/lib/sesion';
import { NOMBRE_ROL, ROLES } from '@taquilla/dominio';

const QUE_PERMITE: Record<(typeof ROLES)[number], string> = {
  admin: 'todo, incluidos los datos del organizador, el cobro con Stripe, el equipo, devoluciones y auditoría.',
  produccion: 'crear y editar eventos, recintos, planos y precios; invitaciones; validar en la puerta; ver ventas e informes.',
  taquilla: 'vender en la taquilla física e invitaciones; ver ventas e informes.',
  puerta: 'solo validar entradas en la puerta.',
  contabilidad: 'ver ventas, informes y liquidaciones; hacer devoluciones; ver la auditoría.',
  lectura: 'solo ver eventos, recintos, ventas e informes.',
};

type Org = { id: string; nombre: string; es_prueba: boolean };
type Persona = { id: string; email: string; nombre: string; activo: boolean; superadmin: boolean; ultimo_acceso: string | null; roles: Record<string, string> };
type Borrador = { activo: boolean; roles: Record<string, string | null> };

export default function Permisos() {
  const { yo } = useSesion();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [borrador, setBorrador] = useState<Record<string, Borrador>>({});
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = () =>
    api<{ organizadores: Org[]; personas: Persona[] }>('/api/plataforma/equipo').then((r) => {
      setOrgs(r.organizadores);
      setPersonas(r.personas);
      setBorrador({});
    });
  useEffect(() => {
    if (yo?.usuario.superadmin) cargar().catch((e) => setMsg({ tipo: 'bad', texto: e.message }));
  }, [yo?.usuario.superadmin]);

  if (yo && !yo.usuario.superadmin) return <p className="aviso bad">Esta página es solo para la administración de la plataforma.</p>;

  const valor = (p: Persona): Borrador => borrador[p.id] ?? { activo: p.activo, roles: { ...p.roles } };
  const cambiar = (p: Persona, cambio: Partial<Borrador>) => setBorrador({ ...borrador, [p.id]: { ...valor(p), ...cambio } });
  const guardar = async (p: Persona) => {
    setMsg(null);
    const v = valor(p);
    const roles: Record<string, string | null> = {};
    for (const o of orgs) roles[o.id] = v.roles[o.id] ?? null;
    try {
      await api(`/api/plataforma/equipo/${p.id}`, { metodo: 'PUT', cuerpo: { activo: v.activo, roles } });
      setMsg({ tipo: 'ok', texto: `Permisos de ${p.nombre} guardados` });
      cargar();
    } catch (e: any) {
      setMsg({ tipo: 'bad', texto: e.message });
    }
  };

  return (
    <div className="stack">
      <h1>Permisos</h1>
      <p className="muted">
        Qué puede hacer cada persona en cada organizador. Quien entra por primera vez desde el portal recibe «{NOMBRE_ROL.produccion}» en todos
        (o «{NOMBRE_ROL.admin}» si es administración del portal). Cambia lo que haga falta y pulsa «Guardar» en su fila.
      </p>
      <div className="panel desliza">
        <table className="tabla">
          <caption className="sr-only">Permisos de cada persona por organizador</caption>
          <thead>
            <tr>
              <th>Persona</th>
              <th>Activa</th>
              {orgs.map((o) => <th key={o.id}>{o.nombre}{o.es_prueba ? <span className="tag">Prueba</span> : null}</th>)}
              <th><span className="sr-only">Guardar</span></th>
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => {
              const v = valor(p);
              const pendiente = Boolean(borrador[p.id]);
              return (
                <tr key={p.id}>
                  <td>
                    <b>{p.nombre}</b>{p.superadmin ? <> <span className="tag ok">Superadmin</span></> : null}
                    <br /><span className="small muted">{p.email}</span>
                    <br /><span className="small muted">Último acceso: {p.ultimo_acceso ? new Date(p.ultimo_acceso).toLocaleString('es-ES') : '—'}</span>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`act-${p.id}`}>{p.nombre} puede entrar</label>
                    <input id={`act-${p.id}`} type="checkbox" checked={v.activo} disabled={p.id === yo?.usuario.id} onChange={(e) => cambiar(p, { activo: e.target.checked })} />
                  </td>
                  {orgs.map((o) => (
                    <td key={o.id}>
                      <label className="sr-only" htmlFor={`rol-${p.id}-${o.id}`}>Rol de {p.nombre} en {o.nombre}</label>
                      <select id={`rol-${p.id}-${o.id}`} value={v.roles[o.id] ?? ''} onChange={(e) => cambiar(p, { roles: { ...v.roles, [o.id]: e.target.value || null } })}>
                        <option value="">Sin acceso</option>
                        {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
                      </select>
                    </td>
                  ))}
                  <td>
                    <button className="btn sm" disabled={!pendiente} onClick={() => guardar(p)}>Guardar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
      <div className="panel stack">
        <h2>Qué permite cada rol</h2>
        <ul className="small">
          {ROLES.map((r) => <li key={r}><b>{NOMBRE_ROL[r]}</b>: {QUE_PERMITE[r]}</li>)}
        </ul>
        <p className="small muted">Desmarcar «Activa» impide entrar de cualquier forma (portal, Microsoft o contraseña) y cierra sus sesiones abiertas.</p>
      </div>
    </div>
  );
}
