'use client';
/**
 * App de puerta (PWA). Por función: descarga las entradas válidas, lee QR con la cámara
 * (o se teclea el código), valida en línea y, sin conexión, con el paquete local.
 * Al volver la conexión sincroniza las lecturas.
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fechaCorta } from '@/lib/api';
import { guardar, idDispositivo, leer, validarSinConexion, type Lectura, type Paquete, type Resultado } from '@/lib/puerta';

type Funcion = { id: string; titulo: string; fecha: string; hora: string | null; recinto_nombre: string; vendidas: number; dentro: number; es_prueba: boolean };

const COLORES: Record<string, [string, string]> = {
  valida: ['var(--okbg)', 'var(--ok)'],
  usada: ['var(--warnbg)', 'var(--warn)'],
  caducado: ['var(--warnbg)', 'var(--warn)'],
};

export default function Puerta() {
  const [funciones, setFunciones] = useState<Funcion[] | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [funcionId, setFuncionId] = useState<string>('');
  const [paquete, setPaquete] = useState<Paquete | null>(null);
  const [pendientes, setPendientes] = useState<Lectura[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [dentro, setDentro] = useState<{ dentro: number; vendidas: number } | null>(null);
  const [manual, setManual] = useState('');
  const [camara, setCamara] = useState(false);
  const [aviso, setAviso] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const ultimo = useRef<{ t: string; en: number }>({ t: '', en: 0 });
  const dispositivo = useRef('');

  useEffect(() => {
    dispositivo.current = idDispositivo();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw-puerta.js', { scope: '/puerta' }).catch(() => {});
    try {
      const f = localStorage.getItem('puerta:funcion');
      if (f) setFuncionId(f);
    } catch {}
    api<Funcion[]>('/api/puerta/funciones')
      .then(setFunciones)
      .catch((e) => (e.status === 401 || e.status === 403 ? setSinSesion(true) : setFunciones([])));
    const on = () => setEnLinea(true), off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setEnLinea(navigator.onLine);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Al elegir función: paquete local y descarga del actualizado
  useEffect(() => {
    if (!funcionId) return;
    try {
      localStorage.setItem('puerta:funcion', funcionId);
    } catch {}
    setPaquete(leer<Paquete>(funcionId, 'paquete'));
    setPendientes(leer<Lectura[]>(funcionId, 'pendientes') ?? []);
    descargar(funcionId);
  }, [funcionId]);

  const descargar = useCallback(async (f: string) => {
    try {
      const p = await api<Paquete>(`/api/puerta/funciones/${f}/paquete`);
      // conservar lo validado sin conexión que aún no se ha sincronizado
      const pend = leer<Lectura[]>(f, 'pendientes') ?? [];
      for (const l of pend) if (l.resultado === 'valida') {
        const e = p.entradas.find((x) => x.codigo === l.codigo);
        if (e) Object.assign(e, { estado: 'usada', usada_en: e.usada_en ?? l.leidoEn });
      }
      guardar(f, 'paquete', p);
      setPaquete(p);
      setEnLinea(true);
    } catch {
      setEnLinea(false);
    }
  }, []);

  const sincronizar = useCallback(async () => {
    if (!funcionId) return;
    const pend = leer<Lectura[]>(funcionId, 'pendientes') ?? [];
    try {
      if (pend.length) {
        const r = await api(`/api/puerta/sincronizar`, { cuerpo: { funcionId, dispositivo: dispositivo.current, lecturas: pend } });
        guardar(funcionId, 'pendientes', []);
        setPendientes([]);
        if (r.dobles.length) setAviso(`Al sincronizar se han detectado ${r.dobles.length} entradas que ya habían pasado por otra puerta: ${r.dobles.map((d: any) => d.codigo).join(', ')}`);
      }
      const e = await api(`/api/puerta/funciones/${funcionId}/estado`);
      setDentro(e);
      const p = leer<Paquete>(funcionId, 'paquete');
      if (p) {
        const usadas = new Map<string, string>(e.usadas.map((u: any) => [u.codigo, u.usada_en]));
        for (const x of p.entradas) if (usadas.has(x.codigo)) Object.assign(x, { estado: 'usada', usada_en: usadas.get(x.codigo) });
        guardar(funcionId, 'paquete', p);
        setPaquete({ ...p });
      }
      setEnLinea(true);
    } catch {
      setEnLinea(false);
    }
  }, [funcionId]);

  useEffect(() => {
    if (!funcionId) return;
    sincronizar();
    const i = setInterval(sincronizar, 20_000);
    return () => clearInterval(i);
  }, [funcionId, sincronizar]);

  const procesar = useCallback(async (texto: string) => {
    if (!funcionId) return;
    const ahora = Date.now();
    if (ultimo.current.t === texto && ahora - ultimo.current.en < 3000) return;
    ultimo.current = { t: texto, en: ahora };
    let r: Resultado | null = null;
    try {
      const ctrl = new AbortController();
      const corte = setTimeout(() => ctrl.abort(), 2500);
      r = await api<Resultado>('/api/puerta/validar', { cuerpo: { funcionId, qr: texto, dispositivo: dispositivo.current }, señal: ctrl.signal });
      clearTimeout(corte);
      setEnLinea(true);
      if (r.resultado === 'valida' && paquete) {
        const codigo = texto.match(/TKT-[A-Z0-9]{8}/i)?.[0]?.toUpperCase();
        const e = paquete.entradas.find((x) => x.codigo === codigo);
        if (e) Object.assign(e, { estado: 'usada', usada_en: new Date().toISOString() });
        guardar(funcionId, 'paquete', paquete);
      }
    } catch (e: any) {
      if (e?.status && e.status < 500 && e.status !== 408) {
        r = { resultado: 'desconocida', mensaje: 'Error', detalle: e.message };
      } else if (paquete) {
        setEnLinea(false);
        const v = await validarSinConexion(paquete, texto);
        r = v.r;
        guardar(funcionId, 'paquete', paquete);
        if (v.lectura) {
          const pend = [...(leer<Lectura[]>(funcionId, 'pendientes') ?? []), v.lectura];
          guardar(funcionId, 'pendientes', pend);
          setPendientes(pend);
        }
      } else r = { resultado: 'desconocida', mensaje: 'Sin conexión', detalle: 'Descarga las entradas de la función cuando haya red.' };
    }
    setResultado(r);
    if (r.resultado === 'valida') setDentro((d) => (d ? { ...d, dentro: d.dentro + 1 } : d));
    if (navigator.vibrate) navigator.vibrate(r.resultado === 'valida' ? 80 : [200, 80, 200]);
  }, [funcionId, paquete]);

  // Cámara: BarcodeDetector si existe; si no, jsQR
  useEffect(() => {
    if (!camara) return;
    let flujo: MediaStream | null = null, vivo = true;
    const lienzo = document.createElement('canvas');
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = flujo;
        await video.current.play();
        const Detector = (window as any).BarcodeDetector;
        const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;
        const jsQR = detector ? null : (await import('jsqr')).default;
        const bucle = async () => {
          if (!vivo || !video.current) return;
          const v = video.current;
          if (v.readyState >= 2) {
            if (detector) {
              const cs = await detector.detect(v).catch(() => []);
              if (cs[0]?.rawValue) await procesar(cs[0].rawValue);
            } else if (jsQR) {
              lienzo.width = v.videoWidth;
              lienzo.height = v.videoHeight;
              const c2 = lienzo.getContext('2d', { willReadFrequently: true })!;
              c2.drawImage(v, 0, 0);
              const img = c2.getImageData(0, 0, lienzo.width, lienzo.height);
              const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
              if (r?.data) await procesar(r.data);
            }
          }
          setTimeout(bucle, 200);
        };
        bucle();
      } catch {
        setAviso('No se puede usar la cámara. Teclea el código de la entrada.');
        setCamara(false);
      }
    })();
    return () => {
      vivo = false;
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [camara, procesar]);

  if (sinSesion) {
    return (
      <div className="stack">
        <h1>Puerta</h1>
        <p>Entra con tu usuario del equipo (rol de puerta) para validar entradas.</p>
        <div><Link className="btn" href="/entrar?volver=/puerta">Entrar</Link></div>
      </div>
    );
  }
  if (!funciones) return <p role="status">Cargando…</p>;
  const f = funciones.find((x) => x.id === funcionId);
  const [fondo, borde] = resultado ? COLORES[resultado.resultado] ?? ['var(--badbg)', 'var(--bad)'] : ['var(--soft)', 'var(--line)'];
  const usadasLocal = paquete?.entradas.filter((e) => e.estado === 'usada').length ?? 0;

  return (
    <div className="stack">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 28 }}>Puerta</h1>
        <span className={`tag ${enLinea ? 'ok' : 'bad'}`} role="status">{enLinea ? 'En línea' : 'Sin conexión'}{pendientes.length ? ` · ${pendientes.length} por sincronizar` : ''}</span>
      </div>
      <label className="campo">Función
        <select value={funcionId} onChange={(e) => { setFuncionId(e.target.value); setResultado(null); }}>
          <option value="">Elige la función</option>
          {funciones.map((x) => <option key={x.id} value={x.id}>{fechaCorta(x.fecha)} · {x.hora ?? '--:--'} · {x.titulo} · {x.recinto_nombre}</option>)}
        </select>
      </label>
      {funcionId && (
        <>
          <div className="kpis">
            <div className="kpi"><b>{dentro?.dentro ?? usadasLocal}</b><span>Dentro</span></div>
            <div className="kpi"><b>{dentro?.vendidas ?? paquete?.entradas.filter((e) => ['valida', 'usada'].includes(e.estado)).length ?? 0}</b><span>Vendidas</span></div>
            <div className="kpi"><b>{paquete ? new Date(paquete.generado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}</b><span>Lista descargada</span></div>
          </div>
          {f?.es_prueba && <p className="aviso warn">Función de PRUEBA.</p>}
          <section aria-live="assertive" aria-atomic="true" style={{ background: fondo, border: `3px solid ${borde}`, borderRadius: 12, padding: 20, minHeight: 120, textAlign: 'center' }}>
            {resultado ? (
              <>
                <p style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 34, color: borde }}>{resultado.mensaje}</p>
                {resultado.detalle && <p style={{ fontSize: 18 }}>{resultado.detalle}</p>}
                {resultado.sinConexion && <p className="small muted">Validado sin conexión</p>}
              </>
            ) : <p className="muted" style={{ fontSize: 18 }}>Esperando lectura…</p>}
          </section>
          <div className="fila">
            <button className="btn acento" onClick={() => setCamara(!camara)}>{camara ? 'Parar cámara' : 'Leer con la cámara'}</button>
            <button className="btn sec" onClick={() => { descargar(funcionId); sincronizar(); }}>Actualizar lista</button>
          </div>
          {camara && <video ref={video} muted playsInline aria-label="Vista de la cámara para leer el código QR" style={{ width: '100%', borderRadius: 12, background: '#000' }} />}
          <form className="panel fila" onSubmit={(e) => { e.preventDefault(); ultimo.current = { t: '', en: 0 }; procesar(manual.trim()); setManual(''); }}>
            <label className="campo" style={{ flex: 1 }}>Código de la entrada
              <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="TKT-XXXXXXXX o contenido del QR" autoCapitalize="characters" autoComplete="off" />
            </label>
            <button className="btn">Validar</button>
          </form>
          {aviso && <p className="aviso warn" role="alert">{aviso}</p>}
        </>
      )}
    </div>
  );
}
