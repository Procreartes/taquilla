import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Puerta',
  manifest: '/puerta.webmanifest',
  appleWebApp: { capable: true, title: 'Puerta', statusBarStyle: 'black-translucent' },
};
export const viewport: Viewport = { themeColor: '#0b7a42' };

export default function LayoutPuerta({ children }: { children: React.ReactNode }) {
  return <main id="contenido" className="wrap" style={{ maxWidth: 720 }}>{children}</main>;
}
