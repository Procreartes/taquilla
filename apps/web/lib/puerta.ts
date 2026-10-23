/**
 * Lógica de la app de puerta: en línea primero; si no hay red, valida con el paquete descargado
 * y guarda las lecturas para sincronizarlas al volver la conexión.
 */
import { comprobarFirma, leerQr } from '@taquilla/dominio';

export type EntradaPaquete = { codigo: string; estado: string; usada_en: string | null; descripcion: string; zona: string; pmr: boolean; llave: string; huellaEstatica: string };
export type Paquete = { funcion: { id: string; titulo: string; fecha: string; hora: string | null; recinto: string; fcod: string }; generado_en: string; entradas: EntradaPaquete[]; otras: Record<string, string> };
export type Lectura = { codigo: string; resultado: string; leidoEn: string };
export type Resultado = { resultado: string; mensaje: string; detalle?: string; sinConexion?: boolean };

const clave = (f: string, k: string) => `puerta:${f}:${k}`;

export function guardar<T>(f: string, k: string, v: T) {
  try {
    localStorage.setItem(clave(f, k), JSON.stringify(v));
  } catch {}
}
export function leer<T>(f: string, k: string): T | null {
  try {
    const v = localStorage.getItem(clave(f, k));
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export function idDispositivo(): string {
  try {
    let d = localStorage.getItem('puerta:dispositivo');
    if (!d) {
      d = 'disp-' + crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12);
      localStorage.setItem('puerta:dispositivo', d);
    }
    return d;
  } catch {
    return 'disp-sin-almacenamiento';
  }
}

const hora = (d: string) => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** Validación sin conexión con el paquete local. Marca la entrada como usada en el paquete. */
export async function validarSinConexion(p: Paquete, texto: string): Promise<{ r: Resultado; lectura?: Lectura }> {
  const l = leerQr(texto);
  if (!l) return { r: { resultado: 'desconocida', mensaje: 'Código no válido', detalle: 'No es una entrada de esta plataforma.', sinConexion: true } };
  if ('fcod' in l && l.fcod !== p.funcion.fcod) {
    return { r: { resultado: 'otra_funcion', mensaje: 'Es de otra función', detalle: p.otras[l.fcod] ?? 'Función de otro organizador o desconocida', sinConexion: true } };
  }
  const e = p.entradas.find((x) => x.codigo === l.codigo);
  const ahora = new Date().toISOString();
  if (!e) return { r: { resultado: 'desconocida', mensaje: 'Entrada no encontrada', detalle: 'No está en la lista descargada de esta función.', sinConexion: true }, lectura: { codigo: l.codigo, resultado: 'desconocida', leidoEn: ahora } };
  const firma = await comprobarFirma(l, e);
  if (firma === 'manipulado') return { r: { resultado: 'manipulada', mensaje: 'Código manipulado', detalle: 'La firma no coincide.', sinConexion: true }, lectura: { codigo: e.codigo, resultado: 'manipulada', leidoEn: ahora } };
  if (['anulada', 'devuelta'].includes(e.estado)) return { r: { resultado: 'anulada', mensaje: 'Entrada anulada', sinConexion: true }, lectura: { codigo: e.codigo, resultado: 'anulada', leidoEn: ahora } };
  if (firma === 'caducado') return { r: { resultado: 'caducado', mensaje: 'QR caducado', detalle: 'Parece una captura antigua: pide que abra la entrada en el móvil o el PDF.', sinConexion: true }, lectura: { codigo: e.codigo, resultado: 'caducado', leidoEn: ahora } };
  if (e.estado === 'usada') return { r: { resultado: 'usada', mensaje: 'Ya utilizada', detalle: `Entró a las ${e.usada_en ? hora(e.usada_en) : '¿?'} · ${e.descripcion}`, sinConexion: true }, lectura: { codigo: e.codigo, resultado: 'usada', leidoEn: ahora } };
  e.estado = 'usada';
  e.usada_en = ahora;
  return { r: { resultado: 'valida', mensaje: 'Adelante', detalle: `${e.descripcion}${e.pmr ? ' · acceso adaptado' : ''}`, sinConexion: true }, lectura: { codigo: e.codigo, resultado: 'valida', leidoEn: ahora } };
}
