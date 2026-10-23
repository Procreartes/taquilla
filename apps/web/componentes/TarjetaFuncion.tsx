'use client';
import { eur, fechaLarga } from '@/lib/api';
import { accionFuncion } from '@/lib/funciones';
import { useT } from '@/lib/i18n';

/** Tarjeta compacta de función para el widget: la compra se abre en Taquilla, en una pestaña nueva. */
export default function TarjetaFuncion({ f, color, base }: { f: any; color: string; base: string }) {
  const { t, locale, idioma } = useT();
  const a = accionFuncion(f);
  return (
    <article className="panel stack" style={{ borderTop: `5px solid ${color}`, gap: 6 }}>
      {f.es_prueba && <span className="tag demo">{t('funcionPrueba')}</span>}
      <h2 style={{ fontSize: 18 }}>{f.titulo}</h2>
      <p className="small muted"><span className="capital">{fechaLarga(f.fecha, locale)}</span> · {f.hora ?? t('horaPorConfirmar')}<br />{f.recinto_nombre}{f.municipio ? `, ${f.municipio}` : ''}</p>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <span className="small">{f.modo_venta !== 'libre' && f.precio_desde != null ? `${t('desde')} ${eur(f.precio_desde)}` : ''}</span>
        {a.tipo === 'comprar' ? (
          <a className="btn acento sm" href={`${base}/f/${f.id}?lang=${idioma}`} target="_blank" rel="noopener">{t('comprar')}</a>
        ) : a.tipo === 'externa' ? (
          <a className="btn sec sm" href={f.venta_externa_url} target="_blank" rel="noopener noreferrer">{t('ventaOficial')}</a>
        ) : <span className="small">{t(a.texto)}</span>}
      </div>
    </article>
  );
}
