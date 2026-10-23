'use client';
import { use, useEffect, useState } from 'react';
import { api } from '@/lib/api';

const TITULOS: Record<string, string> = {
  'aviso-legal': 'Aviso legal',
  privacidad: 'Política de privacidad',
  condiciones: 'Condiciones de compra',
  cookies: 'Política de cookies',
};

export default function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = use(params);
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    api(`/api/publico/legal/${doc}`).then((r) => setTexto(r.texto)).catch(() => setTexto(''));
  }, [doc]);
  return (
    <article className="stack" style={{ maxWidth: 760 }}>
      <h1>{TITULOS[doc] ?? 'Información legal'}</h1>
      <p className="aviso warn"><b>BORRADOR</b> pendiente de revisión legal. No usar en producción sin revisar.</p>
      {texto === null ? <p role="status">Cargando…</p> : <div style={{ whiteSpace: 'pre-wrap' }}>{texto}</div>}
    </article>
  );
}
