'use client';
/** Sala de espera de la cola virtual: muestra el puesto y entrega el pase cuando llega el turno. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import Turnstile from './Turnstile';

export default function SalaEspera({ funcionId, turnstile, idioma, onPase }: { funcionId: string; turnstile: string | null; idioma: string; onPase: (p: string) => void }) {
  const [estado, setEstado] = useState<any>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const turno = useRef<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clave = 'cola:' + funcionId;

  const guardar = (t: string | null) => {
    turno.current = t;
    try {
      if (t) sessionStorage.setItem(clave, t);
      else sessionStorage.removeItem(clave);
    } catch {}
  };

  const consultar = useCallback(async () => {
    if (!turno.current) return;
    try {
      const e = await api(`/api/publico/cola/${funcionId}/estado?turno=${encodeURIComponent(turno.current)}`);
      if (e.invalido) {
        guardar(null);
        setEstado(null);
        return;
      }
      setEstado(e);
      if (!e.activa) return onPase('');
      if (e.pase) return onPase(e.pase);
    } catch {}
    temporizador.current = setTimeout(consultar, 5000);
  }, [funcionId, onPase]);

  useEffect(() => {
    try {
      turno.current = sessionStorage.getItem(clave);
    } catch {}
    if (turno.current) consultar();
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [clave, consultar]);

  async function entrar() {
    setError('');
    try {
      const e = await api(`/api/publico/cola/${funcionId}/entrar`, { cuerpo: { turnstile: token || undefined } });
      if (!e.activa) return onPase('');
      guardar(e.turno);
      setEstado(e);
      if (e.pase) onPase(e.pase);
      else temporizador.current = setTimeout(consultar, 5000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const min = estado ? Math.ceil(estado.esperaSegundos / 60) : 0;
  return (
    <section className="panel stack" aria-live="polite" style={{ textAlign: 'center' }}>
      <h2>Sala de espera</h2>
      {!estado ? (
        <>
          <p>Hay mucha gente comprando. Para que sea justo, entra en la cola: te avisaremos en esta misma página cuando sea tu turno.</p>
          <Turnstile clave={turnstile} onToken={setToken} idioma={idioma} />
          <div><button className="btn acento" disabled={!!turnstile && !token} onClick={entrar}>Entrar en la cola</button></div>
        </>
      ) : !estado.abierta ? (
        <p>La venta abre a las <b>{new Date(estado.apertura).toLocaleTimeString(idioma, { hour: '2-digit', minute: '2-digit' })}</b>. No cierres esta página: tienes tu sitio guardado.</p>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--f-display)', fontSize: 40, fontWeight: 800 }}>{estado.delante}</p>
          <p>personas delante de ti · unos {min} minuto{min === 1 ? '' : 's'}</p>
          <p className="small muted">No cierres ni recargues la página.</p>
        </>
      )}
      {error && <p className="aviso bad" role="alert">{error}</p>}
    </section>
  );
}
