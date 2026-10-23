/** Cliente de la API para el navegador (misma web: /api se reenvía al servidor). */
export class ErrorApi extends Error {
  constructor(public status: number, message: string, public codigo?: string, public datos?: any) {
    super(message);
  }
}

export async function api<T = any>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; señal?: AbortSignal } = {}): Promise<T> {
  const r = await fetch(ruta, {
    method: opciones.metodo ?? (opciones.cuerpo !== undefined ? 'POST' : 'GET'),
    headers: opciones.cuerpo !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    credentials: 'same-origin',
    signal: opciones.señal,
  });
  const tipo = r.headers.get('content-type') ?? '';
  const datos = tipo.includes('json') ? await r.json() : await r.text();
  if (!r.ok) {
    const msg = typeof datos === 'object' && datos?.mensaje ? datos.mensaje : `Error ${r.status}`;
    throw new ErrorApi(r.status, msg, datos?.error, datos);
  }
  return datos as T;
}

export const eur = (cent: number) =>
  (cent / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: cent % 100 ? 2 : 0 });

export function fechaLarga(iso: string, idioma = 'es-ES') {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString(idioma, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function fechaCorta(iso: string, idioma = 'es-ES') {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString(idioma, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
