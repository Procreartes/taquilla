'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const EVENTOS = [
  ['venta', 'Venta'],
  ['agotado', 'Función agotada'],
  ['devolucion', 'Devolución'],
  ['aforo_90', '90 % del aforo'],
] as const;

export default function Integraciones() {
  const [hooks, setHooks] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState({ nombre: 'n8n', url: '', eventos: EVENTOS.map((e) => e[0]) as string[] });
  const [secreto, setSecreto] = useState('');
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const [eventos, setEventos] = useState<any[]>([]);
  const [w, setW] = useState({ evento: '', funcion: '', modo: 'boton' });
  const cargar = () => api('/api/organizador/webhooks').then(setHooks);
  useEffect(() => {
    cargar();
    api('/api/eventos').then(async (es) => {
      const det = await Promise.all(es.map((e: any) => api(`/api/eventos/${e.id}`)));
      setEventos(det);
      if (det[0]) setW((x) => ({ ...x, evento: det[0].slug }));
    });
  }, []);
  const accion = async (fn: () => Promise<any>, ok: string) => {
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ tipo: 'ok', texto: ok });
      cargar();
      return r;
    } catch (e: any) {
      setMsg({ tipo: 'bad', texto: e.message });
    }
  };
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const ev = eventos.find((e) => e.slug === w.evento);
  const fragmento = w.modo === 'cartelera'
    ? `<script src="${origen}/widget.js" data-evento="${w.evento}" data-modo="cartelera"></script>`
    : `<script src="${origen}/widget.js" ${w.funcion ? `data-funcion="${w.funcion}"` : `data-evento="${w.evento}"`} data-texto="Comprar entradas"></script>`;

  return (
    <div className="stack">
      <h1>Integraciones</h1>
      <section className="panel stack">
        <h2>Webhooks (n8n)</h2>
        <p className="small muted">Taquilla avisa a la dirección indicada cuando hay una venta, una función se agota, hay una devolución o se llega al 90 % del aforo. Cada aviso va firmado en la cabecera <span className="mono">X-Taquilla-Firma</span> (HMAC-SHA256 con el secreto).</p>
        {hooks.map((h) => (
          <div key={h.id} className="aviso stack" style={{ gap: 6 }}>
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <b>{h.nombre}</b>
              <div className="fila">
                <button className="btn sec sm" onClick={() => accion(() => api(`/api/organizador/webhooks/${h.id}/probar`, { cuerpo: {} }), 'Aviso de prueba enviado.')}>Enviar prueba</button>
                <button className="btn sec sm" onClick={() => confirm('¿Quitar este webhook?') && accion(() => api(`/api/organizador/webhooks/${h.id}`, { metodo: 'DELETE' }), 'Quitado.')}>Quitar</button>
              </div>
            </div>
            <span className="mono small" style={{ overflowWrap: 'anywhere' }}>{h.url}</span>
            <span className="small">{h.eventos.join(' · ')}</span>
            {h.entregas && <ul className="small" style={{ margin: 0 }}>{h.entregas.slice(0, 5).map((e: any) => <li key={e.id}>{new Date(e.creado_en).toLocaleString('es-ES')} · {e.evento} · {e.estado} {e.respuesta ? `(${String(e.respuesta).slice(0, 60)})` : ''}</li>)}</ul>}
          </div>
        ))}
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await accion(() => api('/api/organizador/webhooks', { cuerpo: nuevo }), 'Webhook creado.'); if (r?.secreto) setSecreto(r.secreto); }}>
          <div className="g2">
            <label className="campo">Nombre<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
            <label className="campo">Dirección (URL del webhook de n8n)<input type="url" required value={nuevo.url} onChange={(e) => setNuevo({ ...nuevo, url: e.target.value })} placeholder="https://n8n.ejemplo.com/webhook/…" /></label>
          </div>
          <fieldset className="fila" style={{ border: 0, padding: 0 }}>
            <legend className="small" style={{ fontWeight: 700 }}>Avisar de</legend>
            {EVENTOS.map(([k, t]) => (
              <label key={k} className="check"><input type="checkbox" checked={nuevo.eventos.includes(k)} onChange={(e) => setNuevo({ ...nuevo, eventos: e.target.checked ? [...nuevo.eventos, k] : nuevo.eventos.filter((x) => x !== k) })} /> {t}</label>
            ))}
          </fieldset>
          <div><button className="btn">Añadir webhook</button></div>
        </form>
        {secreto && <p className="aviso warn" role="status">Secreto para comprobar las firmas (cópialo ahora, no se volverá a mostrar): <span className="mono" style={{ overflowWrap: 'anywhere' }}>{secreto}</span></p>}
      </section>

      <section className="panel stack">
        <h2>Botón «Comprar» para otras webs</h2>
        <p className="small muted">Pega este código en la web del festival (por ejemplo, la de ASOMBRA). La compra se abre en Taquilla, en una pestaña nueva.</p>
        <div className="g3">
          <label className="campo">Evento
            <select value={w.evento} onChange={(e) => setW({ ...w, evento: e.target.value, funcion: '' })}>{eventos.map((e) => <option key={e.slug} value={e.slug}>{e.nombre}</option>)}</select>
          </label>
          <label className="campo">Función
            <select value={w.funcion} onChange={(e) => setW({ ...w, funcion: e.target.value })} disabled={w.modo === 'cartelera'}>
              <option value="">Todo el evento</option>
              {ev?.funciones.map((f: any) => <option key={f.id} value={f.id}>{f.fecha} · {f.titulo}</option>)}
            </select>
          </label>
          <label className="campo">Tipo
            <select value={w.modo} onChange={(e) => setW({ ...w, modo: e.target.value })}>
              <option value="boton">Botón</option>
              <option value="cartelera">Cartelera completa</option>
            </select>
          </label>
        </div>
        <label className="campo">Código para pegar<textarea readOnly value={fragmento} className="mono" style={{ minHeight: 80 }} onFocus={(e) => e.currentTarget.select()} /></label>
        <div><button type="button" className="btn sec sm" onClick={() => navigator.clipboard?.writeText(fragmento).then(() => setMsg({ tipo: 'ok', texto: 'Código copiado.' }))}>Copiar</button></div>
        <p className="small">Vista previa: <a href={w.modo === 'cartelera' ? `/widget/e/${w.evento}` : w.funcion ? `/widget/f/${w.funcion}` : `/e/${w.evento}`} target="_blank" rel="noopener">abrir</a></p>
      </section>
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
    </div>
  );
}
