'use client';
import { use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import TarjetaFuncion from '@/componentes/TarjetaFuncion';

export default function WidgetEvento({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t } = useT();
  const [e, setE] = useState<any>(null);
  useEffect(() => {
    api(`/api/publico/eventos/${slug}`).then(setE).catch(() => setE(false));
  }, [slug]);
  if (e === false) return <p className="aviso bad">—</p>;
  if (!e) return <p role="status">{t('cargando')}</p>;
  const color = (isla: string) => (e.islas ?? []).find((i: any) => i.id === isla)?.colores?.acento ?? e.color_primario;
  return (
    <div className="rejilla">
      {e.funciones.map((f: any) => <TarjetaFuncion key={f.id} f={f} color={color(f.isla)} base={window.location.origin} />)}
    </div>
  );
}
