/**
 * Códigos QR firmados de las entradas. Funciona igual en el servidor (Node) y en el navegador
 * (WebCrypto), así el móvil del cliente y la app de puerta sin conexión pueden calcularlos.
 *
 *  - Estático (PDF):     T1S.<funcion>.<entrada>.<firma>
 *  - Rotatorio (móvil):  T1R.<funcion>.<entrada>.<ventana>.<mac>      (ventana = 15 s)
 *
 *  <funcion> son los 8 primeros caracteres del id de la función (para decir «es de otra función»).
 *  firma = HMAC(secreto, "S|funcion|entrada") · llave = HMAC(secreto, "K|funcion|entrada")
 *  mac = HMAC(llave, "R|ventana"). El cliente solo recibe la llave de SUS entradas, nunca el secreto.
 */

export const VENTANA_QR_MS = 15_000;
/** Ventanas de margen aceptadas (relojes desajustados): ±2 ventanas = ±30 s. */
export const MARGEN_VENTANAS = 2;

const te = new TextEncoder();
const b64url = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function hmac(clave: Uint8Array | string, mensaje: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', typeof clave === 'string' ? te.encode(clave) : (clave as Uint8Array<ArrayBuffer>), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, te.encode(mensaje)));
}

export async function sha256Texto(s: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s))));
}

export const codigoFuncionQr = (funcionId: string) => funcionId.replace(/-/g, '').slice(0, 8).toUpperCase();
export const ventanaActual = (ahora = Date.now()) => Math.floor(ahora / VENTANA_QR_MS);

/** Firma del QR estático (va en el PDF). */
export async function firmaEstatica(secreto: string, fcod: string, codigo: string) {
  return b64url(await hmac(secreto, `S|${fcod}|${codigo}`)).slice(0, 22);
}
export async function qrEstatico(secreto: string, funcionId: string, codigo: string) {
  const f = codigoFuncionQr(funcionId);
  return `T1S.${f}.${codigo}.${await firmaEstatica(secreto, f, codigo)}`;
}

/** Llave de rotación de una entrada (se entrega al titular y a los dispositivos de puerta). */
export async function llaveRotacion(secreto: string, funcionId: string, codigo: string) {
  return b64url(await hmac(secreto, `K|${codigoFuncionQr(funcionId)}|${codigo}`));
}

/** Contenido del QR rotatorio para una ventana de tiempo, calculado con la llave de la entrada. */
export async function qrRotatorio(llave: string, fcod: string, codigo: string, ventana = ventanaActual()) {
  return `T1R.${fcod}.${codigo}.${ventana}.${b64url(await hmac(deB64url(llave), `R|${ventana}`)).slice(0, 16)}`;
}

export type LecturaQr =
  | { tipo: 'estatico'; fcod: string; codigo: string; firma: string }
  | { tipo: 'rotatorio'; fcod: string; codigo: string; ventana: number; mac: string }
  /** El personal de puerta teclea el código impreso (cuando el QR no se puede leer). */
  | { tipo: 'manual'; codigo: string };

export function leerQr(texto: string): LecturaQr | null {
  const t = String(texto).trim();
  let m = t.match(/^T1S\.([0-9A-F]{8})\.(TKT-[A-Z0-9]{8})\.([A-Za-z0-9_-]{22})$/);
  if (m) return { tipo: 'estatico', fcod: m[1], codigo: m[2], firma: m[3] };
  m = t.match(/^T1R\.([0-9A-F]{8})\.(TKT-[A-Z0-9]{8})\.(\d{1,12})\.([A-Za-z0-9_-]{16})$/);
  if (m) return { tipo: 'rotatorio', fcod: m[1], codigo: m[2], ventana: Number(m[3]), mac: m[4] };
  m = t.toUpperCase().match(/^(TKT-[A-Z0-9]{8})$/);
  if (m) return { tipo: 'manual', codigo: m[1] };
  return null;
}

export type ComprobacionFirma = 'ok' | 'manipulado' | 'caducado';

/** Comprueba un QR leído contra los datos de la entrada (llave de rotación y huella de la firma estática). */
export async function comprobarFirma(l: LecturaQr, e: { llave: string; huellaEstatica: string }, ahora = Date.now()): Promise<ComprobacionFirma> {
  if (l.tipo === 'manual') return 'ok';
  if (l.tipo === 'estatico') return (await sha256Texto(l.firma)) === e.huellaEstatica ? 'ok' : 'manipulado';
  const esperado = await qrRotatorio(e.llave, l.fcod, l.codigo, l.ventana);
  if (!esperado.endsWith('.' + l.mac)) return 'manipulado';
  return Math.abs(ventanaActual(ahora) - l.ventana) <= MARGEN_VENTANAS ? 'ok' : 'caducado';
}
