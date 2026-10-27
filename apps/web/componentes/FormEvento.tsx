'use client';
import { useState } from 'react';
import SubirImagen from './SubirImagen';

export type DatosEvento = {
  nombre: string;
  tipo: 'festival' | 'gira' | 'evento';
  descripcion: string | null;
  imagen_url: string | null;
  imagen_tarjeta_url: string | null;
  publicado: boolean;
};

export const slugDe = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/** Formulario de datos de un evento (nuevo o existente). */
export default function FormEvento({ inicial, boton, onGuardar, desactivado }: {
  inicial?: Partial<DatosEvento>;
  boton: string;
  onGuardar: (d: DatosEvento) => Promise<void>;
  desactivado?: boolean;
}) {
  const [d, setD] = useState<DatosEvento>({
    nombre: inicial?.nombre ?? '',
    tipo: inicial?.tipo ?? 'evento',
    descripcion: inicial?.descripcion ?? '',
    imagen_url: inicial?.imagen_url ?? null,
    imagen_tarjeta_url: inicial?.imagen_tarjeta_url ?? null,
    publicado: inicial?.publicado ?? false,
  });
  const [ocupado, setOcupado] = useState(false);
  const cambiar = (c: Partial<DatosEvento>) => setD({ ...d, ...c });

  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      setOcupado(true);
      try { await onGuardar({ ...d, descripcion: d.descripcion?.trim() || null }); } finally { setOcupado(false); }
    }}>
      <div className="g2">
        <label className="campo">Nombre del evento
          <input required minLength={2} maxLength={200} value={d.nombre} disabled={desactivado} onChange={(e) => cambiar({ nombre: e.target.value })} />
        </label>
        <label className="campo">Tipo
          <select value={d.tipo} disabled={desactivado} onChange={(e) => cambiar({ tipo: e.target.value as DatosEvento['tipo'] })}>
            <option value="evento">Evento (una o pocas funciones)</option>
            <option value="gira">Gira (varias fechas y lugares)</option>
            <option value="festival">Festival</option>
          </select>
        </label>
      </div>
      <label className="campo">Descripción<span className="ayuda">Opcional. Se muestra en la página del evento.</span>
        <textarea rows={4} maxLength={5000} value={d.descripcion ?? ''} disabled={desactivado} onChange={(e) => cambiar({ descripcion: e.target.value })} />
      </label>
      <div className="g2">
        <SubirImagen etiqueta="Cartel (vertical)" formato="vertical" desactivado={desactivado}
          ayuda="Se ve en la ficha de compra. Ideal 1080 × 1620 px o similar (2:3)."
          valor={d.imagen_url} onCambio={(u) => cambiar({ imagen_url: u })} />
        <SubirImagen etiqueta="Imagen para listados (cuadrada o apaisada)" formato="cuadrada" desactivado={desactivado}
          ayuda="Se ve en la portada y en las tarjetas. Ideal 1200 × 1200 px. Si falta, se usa el cartel."
          valor={d.imagen_tarjeta_url} onCambio={(u) => cambiar({ imagen_tarjeta_url: u })} />
      </div>
      <label className="check">
        <input type="checkbox" checked={d.publicado} disabled={desactivado} onChange={(e) => cambiar({ publicado: e.target.checked })} />
        <span>Publicado en la web<br /><span className="small muted">Mientras no lo marques, el evento no aparece en la portada aunque tenga funciones.</span></span>
      </label>
      {!desactivado && <div><button className="btn" disabled={ocupado}>{ocupado ? 'Guardando…' : boton}</button></div>}
    </form>
  );
}
