'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

export type Yo = {
  sesion: boolean;
  completa: boolean;
  usuario: { id: string; email: string; nombre: string; superadmin: boolean; totpActivo: boolean };
  organizadorId: string | null;
  rol: string | null;
  rolNombre: string | null;
  permisos: string[];
  organizadores: { id: string; nombre: string; rol: string; es_prueba: boolean }[];
  modoDemo: boolean;
};

const Ctx = createContext<{ yo: Yo | null; recargar: () => Promise<void>; puede: (p: string) => boolean }>({
  yo: null,
  recargar: async () => {},
  puede: () => false,
});

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const [yo, setYo] = useState<Yo | null>(null);
  const recargar = useCallback(async () => {
    const y = await api<Yo>('/api/auth/yo');
    if (!y.sesion || !y.completa) {
      window.location.href = '/entrar';
      return;
    }
    setYo(y);
  }, []);
  useEffect(() => {
    recargar();
  }, [recargar]);
  const puede = useCallback((p: string) => !!yo?.permisos.includes(p), [yo]);
  return <Ctx.Provider value={{ yo, recargar, puede }}>{children}</Ctx.Provider>;
}

export const useSesion = () => useContext(Ctx);
