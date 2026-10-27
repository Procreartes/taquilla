import type { MetadataRoute } from 'next';
import { leerPublico } from '@/lib/metadatos';

const URL_PUBLICA = process.env.URL_PUBLICA || 'https://entradas.grupolivon.com';
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const eventos = (await leerPublico<any[]>('/api/publico/eventos')) ?? [];
  const agenda = (await leerPublico<any[]>('/api/publico/agenda')) ?? [];
  return [
    { url: `${URL_PUBLICA}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${URL_PUBLICA}/agenda`, changeFrequency: 'daily', priority: 0.8 },
    ...eventos.filter((e) => !e.es_prueba).map((e) => ({ url: `${URL_PUBLICA}/e/${e.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...agenda.filter((f) => !f.es_prueba).map((f) => ({ url: `${URL_PUBLICA}/f/${f.id}`, changeFrequency: 'daily' as const, priority: 0.6 })),
  ];
}
