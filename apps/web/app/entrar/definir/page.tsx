'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function DefinirClave() {
  const router = useRouter();
  const [clave, setClave] = useState('');
  const [repite, setRepite] = useState('');
  const [error, setError] = useState('');
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (clave.length < 12) return setError('La contraseña tiene que tener al menos 12 caracteres.');
    if (clave !== repite) return setError('Las dos contraseñas no coinciden.');
    const token = new URLSearchParams(window.location.search).get('t') ?? '';
    try {
      await api('/api/auth/definir-clave', { cuerpo: { token, clave } });
      router.push('/panel/seguridad');
    } catch (err: any) {
      setError(err.message);
    }
  }
  return (
    <main id="contenido" className="wrap" style={{ maxWidth: 520 }}>
      <h1>Define tu contraseña</h1>
      <p className="muted">Al menos 12 caracteres. Mejor una frase que puedas recordar, por ejemplo tres o cuatro palabras con algún número.</p>
      <form className="panel stack" onSubmit={enviar} noValidate>
        <label className="campo">Contraseña nueva<input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} /></label>
        <label className="campo">Repítela<input type="password" autoComplete="new-password" value={repite} onChange={(e) => setRepite(e.target.value)} /></label>
        {error && <p className="aviso bad" role="alert">{error}</p>}
        <button className="btn">Guardar y entrar</button>
      </form>
      <p className="small muted">Después te pediremos que actives la verificación en dos pasos.</p>
    </main>
  );
}
