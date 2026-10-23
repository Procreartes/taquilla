/**
 * Liquidación de una función (o de un festival sumando funciones) y borderó para la SGAE.
 * Todo en céntimos. Los precios llevan el impuesto incluido.
 *
 *  bruto            = suma de precios de entradas vendidas (sin gastos de gestión)
 *  devoluciones     = lo devuelto de esas entradas (sin gastos)
 *  bruto neto       = bruto − devoluciones
 *  impuesto         = cuota incluida en el bruto neto (IGIC / IVA)
 *  base             = bruto neto − impuesto
 *  comisión pasarela= lo que cobra Stripe (lo paga el organizador: cargo directo)
 *  derechos autor   = % sobre la base (SGAE, tipo configurable)
 *  neto organizador = bruto neto − comisión pasarela  (el impuesto lo ingresa el organizador)
 *  gastos de gestión: son de la plataforma, se informan aparte y no entran en el reparto
 */
import { desgloseImpuesto, repartir } from './dinero';

export interface MovimientoLiquidacion {
  /** Importe de entradas cobrado (sin gastos). */
  importeEntradas: number;
  gastos: number;
  comisionPasarela: number | null;
  entradas: number;
}

export interface DatosLiquidacion {
  pedidos: MovimientoLiquidacion[];
  devoluciones: { importe: number; gastosDevueltos: number }[];
  invitaciones: number;
  impuestoTipo: number;
  impuestoNombre: string;
  derechosAutorPct: number;
  socios: { nombre: string; porcentaje: number }[];
  /** Comisión estimada si la pasarela no la ha informado: 1,5 % + 0,25 €. */
  estimarComision?: (importeCent: number) => number;
}

export const comisionEstimadaStripe = (importe: number) => (importe > 0 ? Math.round(importe * 0.015) + 25 : 0);

export function calcularLiquidacion(d: DatosLiquidacion) {
  const est = d.estimarComision ?? comisionEstimadaStripe;
  const bruto = d.pedidos.reduce((s, p) => s + p.importeEntradas, 0);
  const gastos = d.pedidos.reduce((s, p) => s + p.gastos, 0);
  const entradas = d.pedidos.reduce((s, p) => s + p.entradas, 0);
  let comisionEstimada = false;
  const comision = d.pedidos.reduce((s, p) => {
    if (p.comisionPasarela === null) {
      comisionEstimada = comisionEstimada || p.importeEntradas + p.gastos > 0;
      return s + est(p.importeEntradas + p.gastos);
    }
    return s + p.comisionPasarela;
  }, 0);
  const devoluciones = d.devoluciones.reduce((s, x) => s + x.importe - x.gastosDevueltos, 0);
  const gastosDevueltos = d.devoluciones.reduce((s, x) => s + x.gastosDevueltos, 0);
  const brutoNeto = bruto - devoluciones;
  const { base, cuota } = desgloseImpuesto(brutoNeto, d.impuestoTipo);
  const derechosAutor = Math.round((base * d.derechosAutorPct) / 100);
  const neto = brutoNeto - comision;
  return {
    entradas,
    invitaciones: d.invitaciones,
    bruto,
    devoluciones,
    brutoNeto,
    impuesto: { nombre: d.impuestoNombre, tipo: d.impuestoTipo, cuota },
    base,
    comisionPasarela: comision,
    comisionEstimada,
    gastosGestion: { cobrados: gastos, devueltos: gastosDevueltos, netos: gastos - gastosDevueltos },
    derechosAutor: { porcentaje: d.derechosAutorPct, importe: derechosAutor },
    netoOrganizador: neto,
    netoTrasDerechos: neto - derechosAutor,
    reparto: d.socios.length ? repartir(neto - derechosAutor, d.socios) : [],
  };
}

export type Liquidacion = ReturnType<typeof calcularLiquidacion>;

/** Datos públicos agregados: oculta grupos pequeños para que nadie sea identificable. */
export function agregarPublico<T extends string>(filas: { clave: T | null; n: number }[], minimo = 5) {
  const visibles = filas.filter((f) => f.clave && f.n >= minimo).sort((a, b) => b.n - a.n);
  const otros = filas.filter((f) => !f.clave || f.n < minimo).reduce((s, f) => s + f.n, 0);
  return [...visibles.map((f) => ({ clave: f.clave as string, n: f.n })), ...(otros ? [{ clave: 'Otros / sin dato', n: otros }] : [])];
}
