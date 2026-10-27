'use client';
import { useState } from 'react';
import SubirImagen from './SubirImagen';

export type DatosEvento = {
  nombre: string;
  tipo: 'festival' | 'gira' | 'evento';
  descripcion: string | null;
  imagen_url: string | null;
  imagen_tarjeta_url: string | null;
  imagen_destacada_url: string | null;
  categoria: 'musica' | 'festival' | 'espectaculo' | 'otros' | null;
  destacado: boolean;
  codigo_proyecto: string | null;
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
    imagen_destacada_url: inicial?.imagen_destacada_url ?? null,
    categoria: inicial?.categoria ?? null,
    destacado: inicial?.destacado ?? false,
    codigo_proyecto: inicial?.codigo_proyecto ?? '',
    publicado: inicial?.publicado ?? false,
  });
  const [ocupado, setOcupado] = useState(false);
  const cambiar = (c: Partial<DatosEvento>) => setD({ ...d, ...c });

  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      setOcupado(true);
      try { await onGuardar({ ...d, descripcion: d.descripcion?.trim() || null, codigo_proyecto: d.codigo_proyecto?.trim() || null }); } finally { setOcupado(false); }
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
      <label className="campo">Categoría<span className="ayuda">Para los filtros de la portada (Música en vivo, Festivales, Espectáculos). Un evento de tipo «Festival» sale también en Festivales.</span>
        <select value={d.categoria ?? ''} disabled={desactivado} onChange={(e) => cambiar({ categoria: (e.target.value || null) as DatosEvento['categoria'] })}>
          <option value="">— Sin categoría —</option>
          <option value="musica">Música en vivo (conciertos)</option>
          <option value="espectaculo">Espectáculos (magia, humor, teatro)</option>
          <option value="festival">Festival</option>
          <option value="otros">Otros</option>
        </select>
      </label>
      <label className="campo">Código de proyecto (contabilidad)
        <span className="ayuda">El mismo código que en ClickUp y en Contabilidad (por ejemplo «P26-ASOMBRA»). Con él, lo vendido en cada función entra solo como ingreso de taquilla del proyecto. Si lo dejas vacío, el ingreso entra igual en la sociedad, sin proyecto.</span>
        <input value={d.codigo_proyecto ?? ''} maxLength={40} pattern="[A-Za-z0-9._\-]{1,40}" disabled={desactivado} onChange={(e) => cambiar({ codigo_proyecto: e.target.value })} style={{ maxWidth: 260 }} />
      </label>
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
      <fieldset className="panel stack" style={{ gap: 10 }}>
        <legend style={{ fontWeight: 700 }}>Evento destacado en la portada</legend>
        <label className="check">
          <input type="checkbox" checked={d.destacado} disabled={desactivado} onChange={(e) => cambiar({ destacado: e.target.checked })} />
          <span>Destacar este evento<br /><span className="small muted">Sale en grande debajo de la cabecera. Si hay varios destacados, se muestra el más próximo.</span></span>
        </label>
        {d.destacado && (
          <SubirImagen etiqueta="Imagen panorámica para el destacado (opcional)" formato="panoramica" desactivado={desactivado}
            ayuda="Imagen ancha sin texto importante en los bordes. Ideal 1920 × 800 px. Si no la pones, se muestra el cartel."
            valor={d.imagen_destacada_url} onCambio={(u) => cambiar({ imagen_destacada_url: u })} />
        )}
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={d.publicado} disabled={desactivado} onChange={(e) => cambiar({ publicado: e.target.checked })} />
        <span>Publicado en la web<br /><span className="small muted">Mientras no lo marques, el evento no aparece en la portada aunque tenga funciones.</span></span>
      </label>
      {!desactivado && <div><button className="btn" disabled={ocupado}>{ocupado ? 'Guardando…' : boton}</button></div>}
    </form>
  );
}
