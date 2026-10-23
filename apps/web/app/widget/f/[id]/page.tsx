'use client';
import { use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import TarjetaFuncion from '@/componentes/TarjetaFuncion';

export default function WidgetFuncion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useT();
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    api(`/api/publico/funciones/${id}`)
      .then((d) => setF({ ...d, precio_desde: d.zonas.length ? Math.min(...d.zonas.map((z: any) => z.precio_cent ?? Infinity)) : null, zonas_con_precio: d.zonas.filter((z: any) => z.precio_cent !== null).length }))
      .catch(() => setF(false));
  }, [id]);
  if (f === false) return <p className="aviso bad">—</p>;
  if (!f) return <p role="status">{t('cargando')}</p>;
  const color = (f.islas ?? []).find((i: any) => i.id === f.isla)?.colores?.acento ?? 'var(--accent)';
  return <TarjetaFuncion f={{ ...f, precio_desde: Number.isFinite(f.precio_desde) ? f.precio_desde : null }} color={color} base={window.location.origin} />;
}
