'use client';
/**
 * Pasarela SIMULADA (solo en local, sin claves de Stripe). Imita la página de pago de Stripe:
 * al pagar, el servidor genera un aviso firmado y lo procesa por el mismo camino que un webhook real.
 */
import { use, useEffect, useState } from 'react';
import { api, eur } from '@/lib/api';

export default function PagoSimulado({ params }: { params: Promise<{ sesion: string }> }) {
  const { sesion } = use(params);
  const [p, setP] = useState<any>(null);
  const [tarjeta, setTarjeta] = useState('4242 4242 4242 4242');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    api(`/api/pagos/simulado/${sesion}`).then(setP).catch((e) => setError(e.message));
  }, [sesion]);

  // Solo se vuelve a páginas de esta misma web
  const volver = (q: string) => {
    const v = new URLSearchParams(window.location.search).get('vuelta') ?? '';
    let destino = '/cuenta';
    try {
      const u = new URL(v, window.location.origin);
      if (u.origin === window.location.origin && u.pathname.startsWith('/pedido/')) destino = u.pathname;
    } catch {}
    window.location.href = `${destino}?pago=${q}`;
  };
  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      await api(`/api/pagos/simulado/${sesion}/pagar`, { cuerpo: { tarjeta } });
      volver('ok');
    } catch (err: any) {
      setError(err.message);
      setOcupado(false);
    }
  }
  if (error && !p) return <p className="aviso bad" role="alert">{error}</p>;
  if (!p) return <p role="status">Cargando…</p>;
  return (
    <div className="stack" style={{ maxWidth: 480, margin: '0 auto', width: '100%' }}>
      <p className="aviso warn"><b>Pasarela de pago SIMULADA.</b> No se cobra nada. Tarjeta de prueba: 4242 4242 4242 4242 (paga) o 4000 0000 0000 0002 (rechazada).</p>
      <form className="panel stack" onSubmit={pagar}>
        <p className="small muted">{p.organizador}</p>
        <h1 style={{ fontSize: 28 }}>{eur(p.total_cent)}</h1>
        <p className="small">{p.titulo} · Pedido <span className="mono">{p.codigo}</span></p>
        <label className="campo">Número de tarjeta<input inputMode="numeric" autoComplete="off" value={tarjeta} onChange={(e) => setTarjeta(e.target.value)} /></label>
        <div className="g2">
          <label className="campo">Caducidad<input defaultValue="12/30" autoComplete="off" /></label>
          <label className="campo">CVC<input defaultValue="123" autoComplete="off" /></label>
        </div>
        {error && <p className="aviso bad" role="alert">{error}</p>}
        <button className="btn acento ancho" disabled={ocupado || p.estado !== 'pago'}>{ocupado ? 'Confirmando…' : `Pagar ${eur(p.total_cent)}`}</button>
        <button type="button" className="btn sec sm" onClick={async () => { await api(`/api/pagos/simulado/${sesion}/cancelar`, { cuerpo: {} }); volver('cancelado'); }}>Cancelar</button>
      </form>
    </div>
  );
}
