import { describe, expect, it } from 'vitest';
import { agregarPublico, calcularLiquidacion } from '../src';

describe('liquidación', () => {
  const base = {
    impuestoTipo: 7, impuestoNombre: 'IGIC', derechosAutorPct: 10,
    socios: [{ nombre: 'Grupo Livon', porcentaje: 50 }, { nombre: 'Héctor Sansegundo', porcentaje: 50 }],
    invitaciones: 2,
  };
  it('calcula bruto, impuesto, comisiones, devoluciones, neto y reparto al 50 %', () => {
    const l = calcularLiquidacion({
      ...base,
      pedidos: [
        { importeEntradas: 4400, gastos: 200, comisionPasarela: 94, entradas: 2 },
        { importeEntradas: 1500, gastos: 100, comisionPasarela: 49, entradas: 1 },
      ],
      devoluciones: [{ importe: 1600, gastosDevueltos: 100 }],
    });
    expect(l.bruto).toBe(5900);
    expect(l.devoluciones).toBe(1500);
    expect(l.brutoNeto).toBe(4400);
    expect(l.impuesto.cuota).toBe(4400 - Math.round(4400 / 1.07));
    expect(l.base + l.impuesto.cuota).toBe(4400);
    expect(l.comisionPasarela).toBe(143);
    expect(l.gastosGestion).toEqual({ cobrados: 300, devueltos: 100, netos: 200 });
    expect(l.netoOrganizador).toBe(4400 - 143);
    expect(l.derechosAutor.importe).toBe(Math.round(l.base * 0.1));
    expect(l.reparto.reduce((s, r) => s + r.importe, 0)).toBe(l.netoTrasDerechos);
    expect(Math.abs(l.reparto[0].importe - l.reparto[1].importe)).toBeLessThanOrEqual(1);
  });
  it('estima la comisión de la pasarela si no se conoce y lo indica', () => {
    const l = calcularLiquidacion({ ...base, pedidos: [{ importeEntradas: 1000, gastos: 100, comisionPasarela: null, entradas: 1 }], devoluciones: [] });
    expect(l.comisionEstimada).toBe(true);
    expect(l.comisionPasarela).toBe(Math.round(1100 * 0.015) + 25);
  });
  it('sin ventas todo es cero', () => {
    const l = calcularLiquidacion({ ...base, pedidos: [], devoluciones: [] });
    expect(l.netoOrganizador).toBe(0);
    expect(l.reparto.map((r) => r.importe)).toEqual([0, 0]);
  });
  it('los datos de público ocultan grupos de menos de 5 personas', () => {
    expect(agregarPublico([{ clave: 'Fuerteventura', n: 40 }, { clave: 'Gran Canaria', n: 12 }, { clave: 'Alemania', n: 2 }, { clave: null, n: 3 }])).toEqual([
      { clave: 'Fuerteventura', n: 40 }, { clave: 'Gran Canaria', n: 12 }, { clave: 'Otros / sin dato', n: 5 },
    ]);
  });
});
