'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { api, eur, fechaLarga } from '@/lib/api';
import { useT } from '@/lib/i18n';
import EntradaMovil from '@/componentes/EntradaMovil';

export default function Pedido({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, locale } = useT();
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState('');
  const [cancelado, setCancelado] = useState(false);

  useEffect(() => {
    setCancelado(new URLSearchParams(window.location.search).get('pago') === 'cancelado');
    let vivo = true, intentos = 0;
    const cargar = async () => {
      try {
        const d = await api(`/api/publico/pedidos/${token}`);
        if (!vivo) return;
        setP(d);
        if (['reserva', 'pago'].includes(d.estado) && intentos++ < 90) setTimeout(cargar, 2000);
      } catch (e: any) {
        setError(e.message);
      }
    };
    cargar();
    return () => {
      vivo = false;
    };
  }, [token]);

  if (error) return <p className="aviso bad" role="alert">{error}</p>;
  if (!p) return <p role="status">{t('cargando')}</p>;
  const cabecera = (
    <header className="pedido-cabecera">
      {p.cartel_url && <img src={p.cartel_url} alt={`Cartel: ${p.titulo}`} className="pedido-cartel" />}
      <div className="stack" style={{ gap: 4 }}>
      <p className="small muted">{t('paso', { n: 3 })} · {t('paso3')}</p>
      <h1>{p.estado === 'pagado' ? t('listo') : p.titulo}</h1>
      <p className="muted">{p.titulo} · <span className="capital">{fechaLarga(p.fecha, locale)}</span>{p.hora ? ` · ${p.hora}` : ''} · {p.recinto_nombre}</p>
      <p className="small">{t('pedido')} <b className="mono">{p.codigo}</b></p>
      </div>
    </header>
  );

  if (['reserva', 'pago'].includes(p.estado)) {
    return (
      <>
        {cabecera}
        {cancelado ? (
          <div className="aviso warn stack">
            <p>{t('pagoCancelado')}</p>
            <div><Link className="btn sm" href={`/f/${p.funcion_id}`}>{t('volver')}</Link></div>
          </div>
        ) : <p className="aviso" role="status" aria-live="polite">{t('esperandoPago')}</p>}
      </>
    );
  }
  if (['conflicto', 'devuelto'].includes(p.estado) && !p.entradas.length) {
    return <>{cabecera}<p className="aviso bad" role="alert">{t('conflicto')}</p></>;
  }
  if (['caducado', 'cancelado'].includes(p.estado)) {
    return <>{cabecera}<p className="aviso warn">{t('reservaCaducada')}</p><div><Link className="btn" href={`/f/${p.funcion_id}`}>{t('comprarEntradas')}</Link></div></>;
  }

  return (
    <>
      {cabecera}
      {p.es_prueba && <p className="aviso warn"><b>{t('funcionPrueba')}.</b></p>}
      <p role="status">{t('enviadas', { email: p.comprador_email })}</p>
      <div className="fila">
        <a className="btn" href={`/api/publico/pedidos/${token}/pdf`}>{t('descargarPdf')}</a>
        <a className="btn sec" href={`/api/publico/pedidos/${token}/factura`} target="_blank" rel="noopener noreferrer">{t('factura')}</a>
      </div>
      <p className="small muted">{t('enseñaQr')}</p>
      <div className="rejilla">
        {p.entradas.map((e: any) => <EntradaMovil key={e.id} token={token} entrada={e} funcion={p} />)}
      </div>
      <p className="small muted">{t('total')}: {eur(p.total_cent)} · {t('factura')} {p.numero_factura}</p>
    </>
  );
}
