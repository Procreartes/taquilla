'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import SubirImagen from './SubirImagen';

type Recinto = { id: string; nombre: string; municipio: string | null; isla: string | null; planos: number };
type Version = { id: string; numero: number; estado: string; butacas: number | null; pmr: number | null; ok: boolean | null };
type Plano = { id: string; nombre: string; versiones: Version[] | null };

export type DatosFuncion = {
  titulo: string;
  artistas: string[];
  fecha: string;
  hora: string | null;
  recinto_id: string;
  modo_venta: 'numerada' | 'general' | 'libre';
  version_plano_id: string | null;
  aforo: number | null;
  venta_externa_url: string | null;
  nota: string | null;
  edad_minima: number | null;
  imagen_url: string | null;
  imagen_tarjeta_url: string | null;
  publicada: boolean;
};

/**
 * Formulario de una función (fecha concreta de un evento).
 * Con `conPrecio` pide además un precio único para todas las zonas (al crear).
 */
export default function FormFuncion({ inicial, boton, onGuardar, conPrecio, bloqueoVenta, desactivado }: {
  inicial?: Partial<DatosFuncion>;
  boton: string;
  onGuardar: (d: DatosFuncion, precioCent: number | null) => Promise<void>;
  conPrecio?: boolean;
  /** Si ya hay ventas, no se puede cambiar recinto ni modo de venta. */
  bloqueoVenta?: boolean;
  desactivado?: boolean;
}) {
  const [d, setD] = useState<DatosFuncion>({
    titulo: inicial?.titulo ?? '',
    artistas: inicial?.artistas ?? [],
    fecha: inicial?.fecha ?? '',
    hora: inicial?.hora ?? '',
    recinto_id: inicial?.recinto_id ?? '',
    modo_venta: inicial?.modo_venta ?? 'numerada',
    version_plano_id: inicial?.version_plano_id ?? null,
    aforo: inicial?.aforo ?? null,
    venta_externa_url: inicial?.venta_externa_url ?? '',
    nota: inicial?.nota ?? '',
    edad_minima: inicial?.edad_minima ?? null,
    imagen_url: inicial?.imagen_url ?? null,
    imagen_tarjeta_url: inicial?.imagen_tarjeta_url ?? null,
    publicada: inicial?.publicada ?? true,
  });
  const [artistas, setArtistas] = useState((inicial?.artistas ?? []).join(', '));
  const [precio, setPrecio] = useState('');
  const [recintos, setRecintos] = useState<Recinto[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cambiar = (c: Partial<DatosFuncion>) => setD((x) => ({ ...x, ...c }));

  useEffect(() => {
    api<Recinto[]>('/api/recintos').then(setRecintos).catch(() => setRecintos([]));
  }, []);
  useEffect(() => {
    if (!d.recinto_id) return setPlanos([]);
    api<{ planos: Plano[] }>(`/api/recintos/${d.recinto_id}`).then((r) => {
      setPlanos(r.planos);
      // Al crear, propone la versión más reciente que cuadra (mejor si está congelada).
      if (!d.version_plano_id) {
        const vs = r.planos.flatMap((p) => p.versiones ?? []).filter((v) => v.ok);
        const mejor = vs.find((v) => v.estado === 'congelada') ?? vs[0];
        if (mejor) cambiar({ version_plano_id: mejor.id });
      }
    }).catch(() => setPlanos([]));
  }, [d.recinto_id]);

  const versiones = planos.flatMap((p) => (p.versiones ?? []).map((v) => ({ ...v, plano: p.nombre })));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let precioCent: number | null = null;
    if (conPrecio && d.modo_venta !== 'libre' && precio.trim() !== '') {
      precioCent = Math.round(Number(precio.replace(',', '.')) * 100);
      if (!Number.isFinite(precioCent) || precioCent < 0) return setError('El precio tiene que ser un número positivo (por ejemplo 15 o 12,50).');
    }
    if (d.modo_venta === 'numerada' && !d.version_plano_id) return setError('Elige el plano de butacas o cambia el modo de venta.');
    setOcupado(true);
    try {
      await onGuardar({
        ...d,
        artistas: artistas.split(',').map((a) => a.trim()).filter(Boolean),
        hora: d.hora || null,
        version_plano_id: d.modo_venta === 'numerada' ? d.version_plano_id : null,
        aforo: d.modo_venta === 'general' ? d.aforo : null,
        venta_externa_url: d.venta_externa_url?.trim() || null,
        nota: d.nota?.trim() || null,
      }, precioCent);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <form className="stack" onSubmit={enviar}>
      <div className="g2">
        <label className="campo">Título de la función<span className="ayuda">Lo que verá el público, p. ej. «ASOMBRA Tenerife».</span>
          <input required maxLength={200} value={d.titulo} disabled={desactivado} onChange={(e) => cambiar({ titulo: e.target.value })} />
        </label>
        <label className="campo">Artistas<span className="ayuda">Separados por comas. Opcional.</span>
          <input value={artistas} disabled={desactivado} onChange={(e) => setArtistas(e.target.value)} />
        </label>
      </div>
      <div className="g3">
        <label className="campo">Fecha<input type="date" required value={d.fecha} disabled={desactivado} onChange={(e) => cambiar({ fecha: e.target.value })} /></label>
        <label className="campo">Hora<span className="ayuda">Vacía = por confirmar</span><input type="time" value={d.hora ?? ''} disabled={desactivado} onChange={(e) => cambiar({ hora: e.target.value })} /></label>
        <label className="campo">Edad mínima<span className="ayuda">Vacía = todos los públicos</span>
          <input type="number" min={0} max={21} value={d.edad_minima ?? ''} disabled={desactivado} onChange={(e) => cambiar({ edad_minima: e.target.value === '' ? null : Number(e.target.value) })} />
        </label>
      </div>
      <div className="g2">
        <label className="campo">Recinto
          <span className="ayuda">{recintos.length ? <>¿No está? Créalo en <Link href="/panel/recintos">Recintos</Link>.</> : <>Aún no hay recintos: crea uno en <Link href="/panel/recintos">Recintos</Link>.</>}</span>
          <select required value={d.recinto_id} disabled={desactivado || bloqueoVenta} onChange={(e) => cambiar({ recinto_id: e.target.value, version_plano_id: null })}>
            <option value="">— Elige el recinto —</option>
            {recintos.map((r) => <option key={r.id} value={r.id}>{r.nombre}{r.municipio ? ` · ${r.municipio}` : ''}</option>)}
          </select>
        </label>
        <label className="campo">Tipo de venta
          <select value={d.modo_venta} disabled={desactivado || bloqueoVenta} onChange={(e) => cambiar({ modo_venta: e.target.value as DatosFuncion['modo_venta'] })}>
            <option value="numerada">Butaca numerada (con plano)</option>
            <option value="general">Entrada general (por aforo, sin butaca)</option>
            <option value="libre">Gratis / acceso libre</option>
          </select>
        </label>
      </div>
      {bloqueoVenta && <p className="small muted">Ya hay entradas vendidas: el recinto y el tipo de venta no se pueden cambiar.</p>}
      {d.modo_venta === 'numerada' && (
        <label className="campo">Plano de butacas
          <span className="ayuda">{!d.recinto_id ? 'Elige antes el recinto.' : versiones.length ? 'Solo se pueden vender planos que cuadran.' : <>Este recinto no tiene plano: créalo en <Link href={`/panel/recintos/${d.recinto_id}`}>el recinto</Link> o usa entrada general.</>}</span>
          <select value={d.version_plano_id ?? ''} disabled={desactivado || !versiones.length} onChange={(e) => cambiar({ version_plano_id: e.target.value || null })}>
            <option value="">— Elige el plano —</option>
            {versiones.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.ok}>
                {v.plano} · v{v.numero} · {v.butacas ?? '?'} butacas{v.pmr ? ` + ${v.pmr} PMR` : ''} · {v.estado === 'congelada' ? 'congelado' : 'borrador'}{v.ok ? '' : ' (no cuadra)'}
              </option>
            ))}
          </select>
        </label>
      )}
      {d.modo_venta === 'general' && (
        <label className="campo">Aforo (entradas a la venta)
          <input type="number" min={1} max={200000} value={d.aforo ?? ''} disabled={desactivado} onChange={(e) => cambiar({ aforo: e.target.value === '' ? null : Number(e.target.value) })} />
        </label>
      )}
      {conPrecio && d.modo_venta !== 'libre' && (
        <label className="campo">Precio de la entrada (€)<span className="ayuda">Con impuestos incluidos, igual para todas las zonas. Luego puedes poner un precio distinto por zona. Vacío = por confirmar.</span>
          <input inputMode="decimal" value={precio} placeholder="15" onChange={(e) => setPrecio(e.target.value)} style={{ maxWidth: 160 }} />
        </label>
      )}
      <label className="campo">Venta en otra plataforma (opcional)
        <span className="ayuda">Si la venta oficial es en otra web (p. ej. Entradas Canarias), pega aquí el enlace: el botón de comprar llevará allí y aquí no se venderá.</span>
        <input type="url" placeholder="https://…" value={d.venta_externa_url ?? ''} disabled={desactivado} onChange={(e) => cambiar({ venta_externa_url: e.target.value })} />
      </label>
      <label className="campo">Nota para el público<span className="ayuda">Opcional: duración, idioma, accesibilidad…</span>
        <textarea rows={2} maxLength={1000} value={d.nota ?? ''} disabled={desactivado} onChange={(e) => cambiar({ nota: e.target.value })} />
      </label>
      <div className="g2">
        <SubirImagen etiqueta="Cartel (vertical)" formato="vertical" desactivado={desactivado}
          ayuda="Ficha de compra. Si lo dejas vacío, se usa el del evento."
          valor={d.imagen_url} onCambio={(u) => cambiar({ imagen_url: u })} />
        <SubirImagen etiqueta="Imagen para listados (cuadrada o apaisada)" formato="cuadrada" desactivado={desactivado}
          ayuda="Tarjetas de la cartelera. Si falta, se usa el cartel."
          valor={d.imagen_tarjeta_url} onCambio={(u) => cambiar({ imagen_tarjeta_url: u })} />
      </div>
      <label className="check">
        <input type="checkbox" checked={d.publicada} disabled={desactivado} onChange={(e) => cambiar({ publicada: e.target.checked })} />
        <span>Visible en la web<br /><span className="small muted">Se ve en la página del evento (si el evento está publicado). Solo se puede comprar cuando la pongas a la venta.</span></span>
      </label>
      {error && <p className="aviso bad" role="alert">{error}</p>}
      {!desactivado && <div><button className="btn" disabled={ocupado}>{ocupado ? 'Guardando…' : boton}</button></div>}
    </form>
  );
}
