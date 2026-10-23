import { describe, expect, it } from 'vitest';
import { aCentimos, desgloseImpuesto, motivosNoVendible, repartir } from '../src';

describe('dinero', () => {
  it('desglosa el IGIC incluido', () => {
    expect(desgloseImpuesto(1070, 7)).toEqual({ base: 1000, cuota: 70, total: 1070 });
    expect(desgloseImpuesto(1600, 7)).toEqual({ base: 1495, cuota: 105, total: 1600 });
  });
  it('convierte euros a céntimos', () => {
    expect(aCentimos('12,50')).toBe(1250);
    expect(aCentimos(11)).toBe(1100);
    expect(aCentimos('')).toBeNull();
    expect(aCentimos('-3')).toBeNull();
  });
  it('reparte al 50 % sin perder céntimos', () => {
    const r = repartir(1001, [{ nombre: 'Grupo Livon', porcentaje: 50 }, { nombre: 'Héctor Sansegundo', porcentaje: 50 }]);
    expect(r.map((x) => x.importe)).toEqual([501, 500]);
    expect(r.reduce((s, x) => s + x.importe, 0)).toBe(1001);
  });
  it('reparte por porcentajes cualesquiera', () => {
    const r = repartir(10000, [{ porcentaje: 33.33 }, { porcentaje: 33.33 }, { porcentaje: 33.34 }]);
    expect(r.reduce((s, x) => s + x.importe, 0)).toBe(10000);
    const neg = repartir(-999, [{ porcentaje: 50 }, { porcentaje: 50 }]);
    expect(neg.reduce((s, x) => s + x.importe, 0)).toBe(-999);
  });
  it('rechaza porcentajes que no suman 100', () => {
    expect(() => repartir(100, [{ porcentaje: 60 }, { porcentaje: 30 }])).toThrow();
  });
  it('sin precio no se puede vender', () => {
    expect(motivosNoVendible({ modo: 'numerada', zonas: ['a', 'b'], precios: { a: 1500 }, planoCuadra: true })).toEqual(['Precio por confirmar en 1 zona']);
    expect(motivosNoVendible({ modo: 'general', zonas: ['general'], precios: { general: 1000 }, aforo: 200 })).toEqual([]);
    expect(motivosNoVendible({ modo: 'general', zonas: ['general'], precios: {}, aforo: null }).length).toBe(2);
    expect(motivosNoVendible({ modo: 'libre', zonas: [], precios: {} }).length).toBe(1);
  });
});
