/**
 * «Mejor sitio disponible»: butacas juntas, en la fila más cercana al escenario
 * y lo más centradas posible. Nunca asigna un espacio para silla de ruedas ni una
 * butaca de acompañante si no se pide expresamente.
 */
import type { Asiento } from './planos';

export interface PeticionMejorSitio {
  cantidad: number;
  /** Código de zona o 'cualquiera'. */
  zona?: string;
  /** Número de espacios para silla de ruedas pedidos (el resto de la cantidad son acompañantes). */
  pmr?: number;
}

const filaDe = (a: Asiento) => a.seccion + '|' + a.fila;

export function mejorSitio(asientos: Asiento[], libre: (codigo: string) => boolean, p: PeticionMejorSitio): string[] | null {
  const n = Math.max(1, Math.floor(p.cantidad));
  const zonaOk = (a: Asiento) => !p.zona || p.zona === 'cualquiera' || a.zona === p.zona;
  const disponible = (a: Asiento) => !a.quitada && !a.bloqueado && libre(a.codigo) && zonaOk(a);
  const filas = new Map<string, Asiento[]>();
  for (const a of asientos) {
    if (a.quitada) continue;
    const k = filaDe(a);
    if (!filas.has(k)) filas.set(k, []);
    filas.get(k)!.push(a);
  }
  const orden = [...filas.values()].sort((A, B) => A[0].y - B[0].y);

  if (p.pmr && p.pmr > 0) return mejorSitioPmr(orden, disponible, Math.min(p.pmr, n), n - Math.min(p.pmr, n));

  for (const f of orden) {
    const fs = f.filter((a) => a.tipo !== 'silla_ruedas').sort((a, b) => a.x - b.x);
    if (!fs.length) continue;
    const cx = (fs[0].x + fs[fs.length - 1].x) / 2;
    let best: { d: number; tramo: Asiento[] } | null = null;
    for (let i = 0; i + n <= fs.length; i++) {
      const tramo = fs.slice(i, i + n);
      if (!tramo.every((a) => disponible(a) && a.tipo !== 'acompanante')) continue;
      // juntas de verdad: sin pasillo central ni huecos entre medias
      if (tramo.some((a, k) => k && a.x - tramo[k - 1].x > a.ancho * 1.6)) continue;
      const d = Math.abs((tramo[0].x + tramo[n - 1].x) / 2 - cx);
      if (!best || d < best.d) best = { d, tramo };
    }
    if (best) return best.tramo.map((a) => a.codigo);
  }
  return null;
}

function mejorSitioPmr(orden: Asiento[][], disponible: (a: Asiento) => boolean, nPmr: number, nAcomp: number): string[] | null {
  for (const f of orden) {
    const espacios = f.filter((a) => a.tipo === 'silla_ruedas' && disponible(a)).sort((a, b) => a.x - b.x);
    if (espacios.length < nPmr) continue;
    const elegidos = espacios.slice(0, nPmr);
    const cx = elegidos.reduce((s, a) => s + a.x, 0) / elegidos.length;
    // acompañantes: primero las butacas marcadas como acompañante, luego las más cercanas
    const resto = f
      .filter((a) => a.tipo !== 'silla_ruedas' && disponible(a))
      .sort((a, b) => (a.tipo === 'acompanante' ? 0 : 1) - (b.tipo === 'acompanante' ? 0 : 1) || Math.abs(a.x - cx) - Math.abs(b.x - cx));
    if (resto.length < nAcomp) continue;
    return [...elegidos, ...resto.slice(0, nAcomp)].map((a) => a.codigo);
  }
  return null;
}
