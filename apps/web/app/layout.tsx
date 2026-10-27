import type { Metadata, Viewport } from 'next';
import './globals.css';

const URL_PUBLICA = process.env.URL_PUBLICA || 'https://entradas.grupolivon.com';
const DESCRIPCION = 'Entradas para conciertos, festivales y espectáculos en Canarias. Elige tu butaca y llévate la entrada en el móvil.';

export const metadata: Metadata = {
  metadataBase: new URL(URL_PUBLICA),
  title: { default: 'Taquilla · Entradas en Canarias', template: '%s · Taquilla' },
  description: DESCRIPCION,
  manifest: '/manifest.webmanifest',
  applicationName: 'Taquilla',
  openGraph: {
    type: 'website', siteName: 'Taquilla · Grupo Livon', locale: 'es_ES', url: '/',
    title: 'Taquilla · Entradas en Canarias', description: DESCRIPCION,
    images: [{ url: '/og-portada.jpg', width: 1200, height: 630, type: 'image/jpeg', alt: 'Lo mejor se vive en directo · Taquilla' }],
  },
  twitter: { card: 'summary_large_image', title: 'Taquilla · Entradas en Canarias', description: DESCRIPCION, images: ['/og-portada.jpg'] },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#131a28' };

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
        />
      </head>
      <body>
        <a className="saltar" href="#contenido">Saltar al contenido</a>
        {children}
      </body>
    </html>
  );
}
