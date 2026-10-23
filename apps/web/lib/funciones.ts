import type { Clave } from './i18n';

type Funcion = { modo_venta: string; estado: string; venta_externa_url: string | null; zonas_con_precio?: number; vendible?: boolean };

/** Qué puede hacer el público con una función, y con qué texto. */
export function accionFuncion(f: Funcion): { tipo: 'comprar' | 'externa' | 'info'; texto: Clave } {
  if (f.modo_venta === 'libre') return { tipo: 'info', texto: 'gratis' };
  if (f.venta_externa_url) return { tipo: 'externa', texto: 'ventaOficial' };
  if (f.estado === 'agotada') return { tipo: 'info', texto: 'agotado' };
  if (f.estado === 'cancelada') return { tipo: 'info', texto: 'cancelada' };
  if (f.estado === 'pausada') return { tipo: 'info', texto: 'pausada' };
  if (f.estado === 'a_la_venta') return { tipo: 'comprar', texto: 'comprar' };
  return { tipo: 'info', texto: f.zonas_con_precio || f.vendible ? 'entradasProximamente' : 'precioPorConfirmar' };
}

