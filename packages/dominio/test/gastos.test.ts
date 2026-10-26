import { describe, expect, it } from 'vitest';
import { gastosPorEntrada } from '../src/dinero';

describe('gastos de gestión por entrada', () => {
  it('con porcentaje: ese % del precio, redondeado al céntimo', () => {
    expect(gastosPorEntrada(1500, { gastos_gestion_cent: 100, gastos_gestion_pct: 8 })).toBe(120);
    expect(gastosPorEntrada(1250, { gastos_gestion_cent: 100, gastos_gestion_pct: '8.00' })).toBe(100);
    expect(gastosPorEntrada(999, { gastos_gestion_cent: 100, gastos_gestion_pct: 8 })).toBe(80);
  });
  it('una entrada gratuita no paga gastos, con porcentaje o con importe fijo', () => {
    expect(gastosPorEntrada(0, { gastos_gestion_cent: 100, gastos_gestion_pct: 8 })).toBe(0);
    expect(gastosPorEntrada(0, { gastos_gestion_cent: 100, gastos_gestion_pct: null })).toBe(0);
  });
  it('sin porcentaje: el importe fijo por entrada', () => {
    expect(gastosPorEntrada(1500, { gastos_gestion_cent: 100, gastos_gestion_pct: null })).toBe(100);
    expect(gastosPorEntrada(1500, { gastos_gestion_cent: 100 })).toBe(100);
  });
});
