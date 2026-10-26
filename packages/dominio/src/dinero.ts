/**
 * Importes en céntimos (enteros) para no arrastrar errores de redondeo.
 * Los precios al público llevan el impuesto incluido (IGIC en Canarias, IVA en Península).
 */

export const MODOS_VENTA = ['numerada', 'general', 'libre'] as const;
export type ModoVenta = (typeof MODOS_VENTA)[number];

/** Separa base imponible y cuota de un importe con impuesto incluido. */
export function desgloseImpuesto(totalCent: number, tipoPct: number) {
  const base = Math.round(totalCent / (1 + tipoPct / 100));
  return { base, cuota: totalCent - base, total: totalCent };
}

/**
 * Gastos de gestión de una entrada. Con porcentaje: ese % del precio (redondeado al céntimo),
 * así que una entrada gratuita no paga gastos. Sin porcentaje: el importe fijo por entrada.
 */
export function gastosPorEntrada(precioCent: number, o: { gastos_gestion_cent: number; gastos_gestion_pct?: number | string | null }): number {
  const pct = o.gastos_gestion_pct === null || o.gastos_gestion_pct === undefined || o.gastos_gestion_pct === '' ? null : Number(o.gastos_gestion_pct);
  if (pct !== null && Number.isFinite(pct)) return Math.round((precioCent * pct) / 100);
  return precioCent > 0 ? o.gastos_gestion_cent : 0;
}

export function euros(cent: number): string {
  return (cent / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

/** Convierte euros (número o texto «12,50») a céntimos. null si está vacío o no es válido. */
export function aCentimos(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export interface EstadoVendible {
  modo: ModoVenta;
  /** Códigos de zona del plano (numerada) o ['general']. */
  zonas: string[];
  precios: Record<string, number | null | undefined>;
  aforo?: number | null;
  ventaExterna?: string | null;
  planoCuadra?: boolean;
}

/** Motivos por los que una función no se puede poner a la venta (vacío = se puede). */
export function motivosNoVendible(f: EstadoVendible): string[] {
  const m: string[] = [];
  if (f.modo === 'libre') m.push('Es de acceso libre: aparece en la cartelera pero no vende entradas');
  if (f.ventaExterna) m.push('La venta oficial está en otra plataforma');
  if (f.modo === 'numerada' && f.planoCuadra === false) m.push('El plano no cuadra con el aforo oficial');
  if (f.modo === 'general' && !(Number(f.aforo) > 0)) m.push('Falta el aforo');
  if (f.modo !== 'libre') {
    const sin = f.zonas.filter((z) => f.precios[z] === null || f.precios[z] === undefined);
    if (sin.length) m.push(`Precio por confirmar en ${sin.length === f.zonas.length ? 'todas las zonas' : `${sin.length} zona${sin.length > 1 ? 's' : ''}`}`);
  }
  return m;
}

/**
 * Reparte un importe entre socios por porcentaje sin perder ni inventar céntimos
 * (método del resto mayor). Los porcentajes deben sumar 100.
 */
export function repartir<T extends { porcentaje: number }>(cent: number, socios: T[]): (T & { importe: number })[] {
  if (!socios.length) return [];
  const suma = socios.reduce((s, x) => s + Number(x.porcentaje), 0);
  if (Math.abs(suma - 100) > 0.001) throw new Error(`Los porcentajes de los socios suman ${suma} y deben sumar 100`);
  const exactos = socios.map((s) => (cent * Number(s.porcentaje)) / 100);
  const base = exactos.map((x) => (cent >= 0 ? Math.floor(x) : Math.ceil(x)));
  let resto = cent - base.reduce((a, b) => a + b, 0);
  const orden = exactos.map((x, i) => ({ i, frac: Math.abs(x - base[i]) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; resto !== 0; k = (k + 1) % orden.length) {
    base[orden[k].i] += Math.sign(resto);
    resto -= Math.sign(resto);
  }
  return socios.map((s, i) => ({ ...s, importe: base[i] }));
}
