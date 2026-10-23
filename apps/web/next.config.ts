import type { NextConfig } from 'next';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';
const produccion = process.env.NODE_ENV === 'production';

// Política de contenidos: solo recursos propios, las fuentes de Google y Turnstile de Cloudflare.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@taquilla/dominio'],
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:ruta*', destination: `${API}/api/:ruta*` }];
  },
  async headers() {
    const seguras = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
      ...(produccion ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
    ];
    return [
      {
        source: '/((?!widget).*)',
        headers: [...seguras, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, ...(produccion ? [{ key: 'Content-Security-Policy', value: `${csp}; frame-ancestors 'self'` }] : [])],
      },
      // El widget «Comprar» se puede insertar en otras webs
      { source: '/widget/:ruta*', headers: [...seguras, ...(produccion ? [{ key: 'Content-Security-Policy', value: `${csp}; frame-ancestors *` }] : [])] },
    ];
  },
};

export default config;
