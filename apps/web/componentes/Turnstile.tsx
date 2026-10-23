'use client';
/** Cloudflare Turnstile (anti-bots). Solo se carga si la plataforma tiene clave configurada. */
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string; remove(id: string): void };
  }
}

export default function Turnstile({ clave, onToken, idioma }: { clave: string | null; onToken: (t: string) => void; idioma: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!clave || !ref.current) return;
    let id: string | null = null;
    const pintar = () => {
      if (window.turnstile && ref.current && !id) id = window.turnstile.render(ref.current, { sitekey: clave, language: idioma, callback: onToken, 'refresh-expired': 'auto' });
    };
    if (window.turnstile) pintar();
    else if (!document.querySelector('script[data-turnstile]')) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.dataset.turnstile = '1';
      s.onload = pintar;
      document.head.appendChild(s);
    } else {
      const i = setInterval(() => window.turnstile && (pintar(), clearInterval(i)), 200);
      return () => clearInterval(i);
    }
    return () => {
      if (id) window.turnstile?.remove(id);
    };
  }, [clave, onToken, idioma]);
  if (!clave) return null;
  return <div ref={ref} />;
}
