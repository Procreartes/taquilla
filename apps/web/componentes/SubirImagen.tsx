'use client';
import { useId, useState } from 'react';
import { api } from '@/lib/api';

const MAX_LADO = 2400;
const MAX_BYTES = 4 * 1024 * 1024;

/** Si la foto es enorme (móvil, cámara), la reduce en el navegador antes de subirla. */
async function prepararArchivo(f: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error('Solo se admiten imágenes JPG, PNG o WebP.');
  const img = await createImageBitmap(f).catch(() => null);
  if (!img) return f;
  const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
  if (escala === 1 && f.size <= MAX_BYTES) return f;
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo preparar la imagen.'))), 'image/jpeg', 0.88));
}

const aBase64 = (b: Blob) =>
  new Promise<string>((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => mal(new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(b);
  });

/** Campo para subir una imagen (cartel o imagen de listados). Devuelve la URL propia de la web. */
export default function SubirImagen({ etiqueta, ayuda, valor, onCambio, formato, desactivado }: {
  etiqueta: string;
  ayuda: string;
  valor: string | null;
  onCambio: (url: string | null) => void;
  formato: 'vertical' | 'cuadrada';
  desactivado?: boolean;
}) {
  const id = useId();
  const [estado, setEstado] = useState<{ tipo: 'subiendo' | 'bad' | 'ok'; texto: string } | null>(null);

  const subir = async (f: File | undefined) => {
    if (!f) return;
    setEstado({ tipo: 'subiendo', texto: 'Subiendo imagen…' });
    try {
      const r = await api<{ url: string; ancho: number | null; alto: number | null }>('/api/imagenes', { cuerpo: { base64: await aBase64(await prepararArchivo(f)) } });
      onCambio(r.url);
      const aviso =
        r.ancho && r.alto && formato === 'vertical' && r.ancho >= r.alto ? ' Ojo: no es vertical; el cartel se verá mejor en formato vertical.'
        : r.ancho && r.alto && formato === 'cuadrada' && r.alto > r.ancho * 1.1 ? ' Ojo: es vertical; para listados va mejor cuadrada o apaisada.'
        : '';
      setEstado({ tipo: 'ok', texto: `Imagen subida${r.ancho ? ` (${r.ancho} × ${r.alto} px)` : ''}.${aviso}` });
    } catch (err: any) {
      setEstado({ tipo: 'bad', texto: err.message });
    }
  };

  return (
    <div className="campo-imagen stack" style={{ gap: 6 }}>
      <span style={{ fontWeight: 600, fontSize: 14 }} id={`${id}-et`}>{etiqueta}</span>
      <span className="small muted" id={`${id}-ay`}>{ayuda}</span>
      <div className="fila" style={{ alignItems: 'flex-start' }}>
        <div className={`vista-imagen ${formato}`} aria-hidden={!valor}>
          {valor ? <img src={valor} alt={`Vista previa: ${etiqueta}`} /> : <span className="small muted">Sin imagen</span>}
        </div>
        {!desactivado && (
          <div className="stack" style={{ gap: 6 }}>
            <label className="btn sec sm" style={{ cursor: 'pointer' }}>
              {valor ? 'Cambiar imagen' : 'Subir imagen'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-describedby={`${id}-ay`}
                onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {valor && <button type="button" className="btn sec sm" onClick={() => { onCambio(null); setEstado(null); }}>Quitar</button>}
          </div>
        )}
      </div>
      {estado && <p className={`small ${estado.tipo === 'bad' ? 'aviso bad' : 'muted'}`} role="status">{estado.texto}</p>}
    </div>
  );
}
