import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Agenda', description: 'Todas las próximas funciones en Canarias: conciertos, festivales y espectáculos.' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
