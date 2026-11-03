'use client';
/**
 * Píxel de Meta (Facebook/Instagram) con consentimiento previo.
 *
 * - Cada organizador puede tener su píxel; solo se carga en las páginas de sus eventos.
 * - No se carga NADA de Meta hasta que la persona pulsa «Aceptar» en el aviso de cookies (LSSI art. 22.2).
 * - Se usa `trackSingle` para que cada evento vaya solo al píxel de ese organizador.
 * - La compra lleva `eventID = compra-<pedido>`, el mismo que manda el servidor (API de Conversiones):
 *   así Meta no la cuenta dos veces.
 */
import { useEffect, useSyncExternalStore } from 'react';

const CLAVE = 'cookies-medicion';
const VERSION = 1;
const CAMBIO = 'taquilla:cookies';

export type Decision = 'si' | 'no' | null;

function leerDecision(): Decision {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    return g?.v === VERSION && (g.medicion === true || g.medicion === false) ? (g.medicion ? 'si' : 'no') : null;
  } catch {
    return null;
  }
}

export function guardarDecision(acepta: boolean) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ v: VERSION, medicion: acepta, fecha: new Date().toISOString() }));
  } catch {}
  window.dispatchEvent(new Event(CAMBIO));
  // Retirar el consentimiento: se recarga para descargar el píxel y no seguir midiendo.
  if (!acepta && typeof window.fbq === 'function') window.location.reload();
}

/** Vuelve a mostrar el aviso de cookies (enlace «Configurar cookies» del pie). */
export function reabrirAviso() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {}
  avisoPedido = true;
  window.dispatchEvent(new Event(CAMBIO));
}

const suscribir = (fn: () => void) => {
  window.addEventListener(CAMBIO, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(CAMBIO, fn);
    window.removeEventListener('storage', fn);
  };
};

export const useDecisionCookies = () => useSyncExternalStore(suscribir, leerDecision, () => null);

/** El aviso solo aparece en páginas que usan un píxel (o cuando se pide desde el pie). */
let avisoPedido = false;
export const useAvisoPedido = () => useSyncExternalStore(suscribir, () => avisoPedido, () => false);
function pedirAviso() {
  if (avisoPedido) return;
  avisoPedido = true;
  window.dispatchEvent(new Event(CAMBIO));
}

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

const iniciados = new Set<string>();

function cargarScript() {
  if (window.fbq) return;
  // Fragmento oficial de Meta (cola de llamadas hasta que carga fbevents.js)
  const n: any = function (...args: unknown[]) {
    n.callMethod ? n.callMethod(...args) : n.queue.push(args);
  };
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  // La web es una SPA: los PageView los mandamos nosotros, una vez por página y solo al píxel que toca.
  n.disablePushState = true;
  n.allowDuplicatePageViews = false;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
}

function iniciar(pixelId: string) {
  cargarScript();
  if (!iniciados.has(pixelId)) {
    window.fbq('init', pixelId);
    iniciados.add(pixelId);
  }
}

/** Activa el píxel del organizador en la página (si hay consentimiento) y manda el PageView. */
export function usePixel(pixelId: string | null | undefined) {
  const decision = useDecisionCookies();
  useEffect(() => {
    if (!pixelId) return;
    if (decision === null) pedirAviso();
    if (decision !== 'si') return;
    iniciar(pixelId);
    window.fbq('trackSingle', pixelId, 'PageView');
  }, [pixelId, decision]);
}

/** Manda un evento estándar al píxel del organizador. No hace nada sin consentimiento. */
export function rastrear(pixelId: string | null | undefined, evento: string, datos: Record<string, unknown> = {}, eventID?: string) {
  if (!pixelId || leerDecision() !== 'si') return;
  iniciar(pixelId);
  window.fbq('trackSingle', pixelId, evento, datos, eventID ? { eventID } : undefined);
}

/** Compra: una sola vez por pedido en este navegador (aunque se recargue la página). */
export function rastrearCompra(pixelId: string | null | undefined, p: { codigo: string; total_cent: number; evento_slug: string; titulo: string; entradas: number }) {
  if (!pixelId || leerDecision() !== 'si') return;
  const k = 'meta-compra:' + p.codigo;
  try {
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, '1');
  } catch {}
  rastrear(pixelId, 'Purchase', {
    currency: 'EUR', value: p.total_cent / 100, num_items: p.entradas,
    content_type: 'product', content_ids: [p.evento_slug], content_name: p.titulo,
  }, `compra-${p.codigo}`);
}

/** Lo que necesita el servidor para la API de Conversiones (solo con consentimiento). */
export function datosMedicion(): { medicion: boolean; meta?: { fbp?: string; fbc?: string } } {
  if (leerDecision() !== 'si') return { medicion: false };
  const galleta = (n: string) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.slice(n.length + 1);
  const fbp = galleta('_fbp');
  let fbc = galleta('_fbc');
  // Si se llega desde un anuncio y el píxel aún no ha creado _fbc, se construye a partir de fbclid.
  if (!fbc) {
    const fbclid = new URLSearchParams(window.location.search).get('fbclid') ?? sessionStorage.getItem('fbclid');
    if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  }
  return { medicion: true, meta: { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) } };
}

/** Guarda el fbclid de la llegada desde un anuncio, por si la compra se hace en otra página. */
export function recordarFbclid() {
  try {
    const f = new URLSearchParams(window.location.search).get('fbclid');
    if (f) sessionStorage.setItem('fbclid', f);
  } catch {}
}
