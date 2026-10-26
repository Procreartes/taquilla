'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/** Solo se vuelve a rutas de esta misma web. */
function destino() {
  const v = new URLSearchParams(window.location.search).get('volver') ?? '';
  return /^\/(panel|puerta)(\/|$)/.test(v) ? v : '/panel';
}

const ERRORES: Record<string, string> = {
  entra_no_configurado: 'El acceso con Microsoft 365 no está configurado todavía.',
  entra_estado: 'La sesión con Microsoft caducó. Vuelve a intentarlo.',
  entra_token: 'Microsoft no confirmó tu identidad. Vuelve a intentarlo.',
  entra_sin_alta: 'Tu cuenta de Microsoft no está dada de alta en ningún equipo. Pide a la administración que te añada.',
};

type UsuarioPrueba = { email: string; nombre: string; accesos: string; superadmin: boolean };

export default function Entrar() {
  const router = useRouter();
  const [paso, setPaso] = useState<'clave' | '2fa'>('clave');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pruebas, setPruebas] = useState<UsuarioPrueba[]>([]);
  const [entra, setEntra] = useState(false);

  useEffect(() => {
    api<UsuarioPrueba[]>('/api/auth/usuarios-prueba').then(setPruebas).catch(() => {});
    api('/api/auth/opciones').then((o) => setEntra(o.entra)).catch(() => {});
    const err = new URLSearchParams(window.location.search).get('error');
    if (err) setError(ERRORES[err] ?? 'No se pudo entrar.');
    api('/api/auth/yo').then((y) => {
      if (y.sesion && y.completa) router.replace(destino());
      else if (y.sesion && !y.usuario?.totpActivo) router.replace('/panel/seguridad');
      else if (y.sesion) setPaso('2fa');
    }).catch(() => {});
  }, [router]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      if (paso === 'clave') {
        const r = await api('/api/auth/entrar', { cuerpo: { email, clave } });
        if (r.necesita2fa && !r.configurar2fa) setPaso('2fa');
        else router.push(r.configurar2fa ? '/panel/seguridad' : destino());
      } else {
        await api('/api/auth/2fa', { cuerpo: { codigo } });
        router.push(destino());
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  async function comoPrueba(em: string) {
    setError('');
    try {
      await api('/api/auth/demo', { cuerpo: { email: em } });
      router.push(destino());
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <main id="contenido" className="wrap" style={{ maxWidth: 520 }}>
      <h1>Entrar</h1>
      <p className="muted">Acceso para el equipo de cada organizador.</p>
      <form className="panel stack" onSubmit={enviar} noValidate>
        {paso === 'clave' ? (
          <>
            <label className="campo">Correo
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="campo">Contraseña
              <input type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
            </label>
          </>
        ) : (
          <label className="campo">Código de verificación
            <span className="ayuda">Los 6 números que muestra tu aplicación de autenticación.</span>
            <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} />
          </label>
        )}
        {error && <p className="aviso bad" role="alert">{error}</p>}
        <button className="btn" disabled={ocupado}>{paso === 'clave' ? 'Entrar' : 'Verificar'}</button>
        {entra && <a className="btn sec" href="/api/auth/entra/inicio">Entrar con Microsoft 365</a>}
      </form>

      {pruebas.length > 0 && (
        <section className="panel stack" aria-labelledby="t-pruebas">
          <h2 id="t-pruebas">Usuarios de prueba <span className="tag demo">modo demostración</span></h2>
          <p className="small muted">Solo existen en este ordenador. Cada uno tiene un rol distinto para comprobar los permisos.</p>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {pruebas.map((u) => (
              <li key={u.email} className="fila" style={{ justifyContent: 'space-between' }}>
                <span>
                  <b>{u.nombre}</b>
                  <br />
                  <span className="small muted">{u.superadmin ? 'Ve todos los organizadores' : u.accesos}</span>
                </span>
                <button type="button" className="btn sec sm" onClick={() => comoPrueba(u.email)} aria-label={`Entrar como ${u.nombre}`}>Entrar como…</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
