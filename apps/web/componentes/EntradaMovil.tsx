'use client';
/**
 * Entrada en el móvil con QR rotatorio firmado: cambia cada 15 s, así una captura de pantalla
 * o una foto no sirven para entrar. Se calcula en el propio móvil con la llave de la entrada.
 */
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { VENTANA_QR_MS, qrRotatorio, ventanaActual } from '@taquilla/dominio';
import { api, eur } from '@/lib/api';
import { useT } from '@/lib/i18n';

type Llave = { codigo: string; fcod: string; llave: string };
const cacheLlaves = new Map<string, Promise<Llave[]>>();

export default function EntradaMovil({ token, entrada, funcion }: { token: string; entrada: any; funcion: any }) {
  const { t } = useT();
  const lienzo = useRef<HTMLCanvasElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const [llave, setLlave] = useState<Llave | null>(null);
  const activa = entrada.estado === 'valida';

  useEffect(() => {
    if (!activa) return;
    if (!cacheLlaves.has(token)) cacheLlaves.set(token, api<Llave[]>(`/api/publico/pedidos/${token}/llaves`));
    cacheLlaves.get(token)!.then((ls) => setLlave(ls.find((l) => l.codigo === entrada.codigo) ?? null)).catch(() => {});
  }, [token, entrada.codigo, activa]);

  useEffect(() => {
    if (!llave) return;
    let ventana = -1, vivo = true;
    const pintar = async () => {
      const v = ventanaActual();
      if (v !== ventana && lienzo.current) {
        ventana = v;
        await QRCode.toCanvas(lienzo.current, await qrRotatorio(llave.llave, llave.fcod, llave.codigo, v), { width: 220, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#131a28', light: '#ffffff' } });
      }
      if (barra.current) barra.current.style.width = `${100 - ((Date.now() % VENTANA_QR_MS) / VENTANA_QR_MS) * 100}%`;
      if (vivo) requestAnimationFrame(() => setTimeout(pintar, 250));
    };
    pintar();
    return () => {
      vivo = false;
    };
  }, [llave]);

  return (
    <article className="panel stack" aria-label={`${funcion.titulo} · ${entrada.descripcion}`} style={{ alignItems: 'center', textAlign: 'center', overflow: 'hidden' }}>
      {funcion.cartel_url && <img src={funcion.cartel_url} alt="" className="entrada-banda" />}
      <p className="small muted" style={{ margin: 0 }}>{funcion.titulo}</p>
      <span className="tag">{entrada.zona_codigo}{entrada.tipo_butaca === 'silla_ruedas' ? ' · PMR' : ''}</span>
      <h3>{entrada.descripcion}</h3>
      {activa ? (
        <>
          <canvas ref={lienzo} width={220} height={220} role="img" aria-label={`Código QR de la entrada ${entrada.codigo}. Cambia cada 15 segundos.`} style={{ background: '#fff', borderRadius: 8 }} />
          <div style={{ width: 220, height: 6, background: 'var(--soft)', borderRadius: 99, overflow: 'hidden' }} aria-hidden="true">
            <div ref={barra} style={{ height: '100%', width: '100%', background: 'var(--accent)' }} />
          </div>
        </>
      ) : (
        <p className="tag ok">{entrada.estado === 'usada' ? `${t('verEntradas')} ✓ ${entrada.usada_en ? new Date(entrada.usada_en).toLocaleTimeString() : ''}` : entrada.estado}</p>
      )}
      <p className="mono small">{entrada.codigo}</p>
      <p className="small">{eur(entrada.precio_cent)}</p>
    </article>
  );
}
