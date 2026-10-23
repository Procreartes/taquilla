'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function Auditoria() {
  const [filas, setFilas] = useState<any[]>([]);
  useEffect(() => {
    api('/api/organizador/auditoria?limite=300').then(setFilas);
  }, []);
  return (
    <div className="stack">
      <h1>Registro de auditoría</h1>
      <p className="muted">Cambios de precios, devoluciones, invitaciones, anulaciones y permisos. No se puede borrar.</p>
      <div className="panel desliza">
        <table className="tabla">
          <thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="small">{new Date(f.creado_en).toLocaleString('es-ES')}</td>
                <td>{f.usuario ?? '—'}</td>
                <td className="mono small">{f.accion}</td>
                <td className="small mono" style={{ maxWidth: 420, overflowWrap: 'anywhere' }}>{JSON.stringify(f.datos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filas.length && <p className="vacio">Aún no hay registros.</p>}
      </div>
    </div>
  );
}
