'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Correo = { id: string; para: string; asunto: string; estado: string; creado_en: string; adjuntos: string[] };

export default function Correos() {
  const [lista, setLista] = useState<Correo[]>([]);
  const [abierto, setAbierto] = useState<any>(null);
  useEffect(() => {
    api<Correo[]>('/api/organizador/correos').then(setLista);
  }, []);
  return (
    <div className="stack">
      <h1>Correos de prueba</h1>
      <p className="aviso">En este entorno no se envía ningún correo real: todos se quedan aquí (y en Mailpit si se usa Docker, en <span className="mono">http://localhost:8025</span>).</p>
      <div className="dos">
        <div className="panel desliza">
          <table className="tabla">
            <thead><tr><th>Cuándo</th><th>Para</th><th>Asunto</th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td className="small">{new Date(c.creado_en).toLocaleString('es-ES')}</td>
                  <td className="small">{c.para}</td>
                  <td><button className="btn sec sm" onClick={() => api(`/api/organizador/correos/${c.id}`).then(setAbierto)}>{c.asunto}</button>{c.adjuntos.length > 0 && <span className="small muted"> · 📎 {c.adjuntos.length}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lista.length && <p className="vacio">Aún no hay correos.</p>}
        </div>
        <div className="panel stack">
          {abierto ? (
            <>
              <p className="small"><b>Para:</b> {abierto.para}<br /><b>Asunto:</b> {abierto.asunto}</p>
              {abierto.adjuntos.map((a: any) => a.descargable && (
                <a key={a.indice} className="btn sec sm" href={`/api/organizador/correos/${abierto.id}/adjunto/${a.indice}`}>Descargar {a.nombre}</a>
              ))}
              <iframe title={`Contenido del correo: ${abierto.asunto}`} sandbox="" srcDoc={abierto.html} style={{ width: '100%', height: 600, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} />
            </>
          ) : <p className="muted">Elige un correo para verlo.</p>}
        </div>
      </div>
    </div>
  );
}
