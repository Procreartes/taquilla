'use client';
import { useState } from 'react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { useSesion } from '@/lib/sesion';

export default function Seguridad() {
  const { yo, recargar } = useSesion();
  const [qr, setQr] = useState('');
  const [secreto, setSecreto] = useState('');
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  if (yo?.usuario.totpActivo) {
    return (
      <>
        <h1>Seguridad</h1>
        <p className="aviso ok">La verificación en dos pasos está activada.</p>
      </>
    );
  }
  const preparar = async () => {
    const r = await api('/api/auth/2fa/preparar', { cuerpo: {} });
    setSecreto(r.secreto);
    setQr(await QRCode.toDataURL(r.otpauth, { margin: 1, width: 220 }));
  };
  const activar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/auth/2fa/activar', { cuerpo: { codigo } });
      setMsg({ tipo: 'ok', texto: 'Activada. A partir de ahora te pediremos el código al entrar.' });
      recargar();
    } catch (err: any) {
      setMsg({ tipo: 'bad', texto: err.message });
    }
  };
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <h1>Verificación en dos pasos</h1>
      <p>Protege tu cuenta con un código que cambia cada 30 segundos (Microsoft Authenticator, Google Authenticator…).</p>
      {!qr ? (
        <div><button className="btn" onClick={preparar}>Empezar</button></div>
      ) : (
        <form className="panel stack" onSubmit={activar}>
          <img src={qr} alt="Código QR para añadir la cuenta a tu aplicación de autenticación" width={220} height={220} />
          <p className="small">Si no puedes escanearlo, escribe esta clave: <span className="mono">{secreto}</span></p>
          <label className="campo">Código de 6 números
            <input inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} />
          </label>
          <div><button className="btn">Activar</button></div>
        </form>
      )}
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
    </div>
  );
}
