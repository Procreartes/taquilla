import { describe, expect, it } from 'vitest';
import { PERMISOS, ROLES, puede } from '../src';

describe('roles y permisos', () => {
  it('administración lo puede todo', () => {
    for (const p of PERMISOS) expect(puede('admin', p)).toBe(true);
  });
  it('puerta solo valida entradas y ve eventos', () => {
    expect(puede('puerta', 'puerta.validar')).toBe(true);
    expect(puede('puerta', 'pedidos.ver')).toBe(false);
    expect(puede('puerta', 'devoluciones.hacer')).toBe(false);
  });
  it('solo lectura no modifica nada', () => {
    for (const p of PERMISOS) {
      if (p.endsWith('.ver')) continue;
      expect(puede('lectura', p)).toBe(false);
    }
  });
  it('sin rol no hay permisos', () => {
    expect(puede(null, 'eventos.ver')).toBe(false);
  });
  it('todos los roles están definidos', () => {
    expect(ROLES.length).toBe(6);
  });
});
