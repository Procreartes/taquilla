import type { MetadataRoute } from 'next';

const URL_PUBLICA = process.env.URL_PUBLICA || 'https://entradas.grupolivon.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/panel', '/entrar', '/puerta', '/pedido', '/cuenta', '/api/', '/widget'] }],
    sitemap: `${URL_PUBLICA}/sitemap.xml`,
  };
}
