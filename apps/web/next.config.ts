import type { NextConfig } from 'next';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

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
    ];
    return [
      { source: '/((?!widget).*)', headers: [...seguras, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      { source: '/widget/:ruta*', headers: seguras },
    ];
  },
};

export default config;
