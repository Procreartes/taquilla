'use client';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { guardarDecision, reabrirAviso, useAvisoPedido, useDecisionCookies } from '@/lib/meta';

/**
 * Aviso de cookies de medición (píxel de Meta). No es una ventana modal: no bloquea la página.
 * «Aceptar» y «Rechazar» tienen el mismo peso visual (criterio de la AEPD).
 */
export default function AvisoCookies() {
  const { t } = useT();
  const decision = useDecisionCookies();
  const pedido = useAvisoPedido();
  if (decision !== null || !pedido) return null;
  return (
    <section className="aviso-cookies" role="region" aria-labelledby="aviso-cookies-titulo">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="aviso-cookies-titulo" className="aviso-cookies-titulo">{t('cookiesTitulo')}</h2>
        <p className="small" style={{ margin: 0 }}>{t('cookiesTexto')} <Link href="/legal/cookies">{t('cookiesMas')}</Link></p>
      </div>
      <div className="fila aviso-cookies-botones">
        <button type="button" className="btn sec" onClick={() => guardarDecision(false)}>{t('cookiesRechazar')}</button>
        <button type="button" className="btn sec" onClick={() => guardarDecision(true)}>{t('cookiesAceptar')}</button>
      </div>
    </section>
  );
}

export function EnlaceConfigurarCookies() {
  const { t } = useT();
  return <button type="button" className="enlace-boton" onClick={reabrirAviso}>{t('cookiesConfigurar')}</button>;
}
