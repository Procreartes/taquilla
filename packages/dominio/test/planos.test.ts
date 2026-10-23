import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  butacasExportadas, comprobar, diferenciasImportacion, exportarPlano, generar, mejorSitio, numeracionFila, planoNuevo,
  type DocumentoPlano, type RecetaPlano,
} from '../src';

const leer = (f: string): DocumentoPlano => JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'datos', 'planos', f), 'utf8'));
const antigua = leer('antigua.json');
const pdr = leer('puerto-del-rosario.json');
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('numeración', () => {
  it('fila de 22 en pares e impares con impares a la izquierda: 21 19 … 3 1 2 4 … 22', () => {
    const esperado = [21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
    expect(numeracionFila(22, { numeracion: 'pares_impares', imparesA: 'izquierda' })).toEqual(esperado);
  });
  it('con impares a la derecha es la imagen en espejo', () => {
    const esperado = [22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
    expect(numeracionFila(22, { numeracion: 'pares_impares', imparesA: 'derecha' })).toEqual(esperado);
  });
  it('consecutiva desde la derecha y desde la izquierda', () => {
    expect(numeracionFila(5, { numeracion: 'derecha' })).toEqual([5, 4, 3, 2, 1]);
    expect(numeracionFila(5, { numeracion: 'izquierda' })).toEqual([1, 2, 3, 4, 5]);
  });
  it('fila impar en pares e impares', () => {
    expect(numeracionFila(5, { numeracion: 'pares_impares', imparesA: 'izquierda' })).toEqual([5, 3, 1, 2, 4]);
  });
});

describe('Centro Cultural Polivalente de Antigua', () => {
  const c = comprobar(antigua.plano);
  it('da 377 butacas + 2 PMR y se puede vender', () => {
    expect(c.but).toBe(377);
    expect(c.pmr).toBe(2);
    expect(c.ok).toBe(true);
  });
  it('F-17-4 es la butaca de acompañante PMR', () => {
    const a = generar(antigua.plano).asientos.find((x) => x.codigo === 'PLATEA-F17-4');
    expect(a?.tipo).toBe('acompanante');
  });
  it('genera exactamente las mismas butacas que el fichero oficial', () => {
    expect(butacasExportadas(generar(antigua.plano))).toEqual(antigua.butacas);
    expect(diferenciasImportacion(antigua)).toEqual([]);
  });
});

describe('Auditorio Insular de Puerto del Rosario', () => {
  const c = comprobar(pdr.plano);
  it('da 510 butacas (402 patio + 108 anfiteatro) + 3 PMR', () => {
    expect(c.but).toBe(510);
    expect(c.pmr).toBe(3);
    expect(c.ok).toBe(true);
    const g = generar(pdr.plano);
    const patio = g.asientos.filter((a) => a.seccion === 'PLATEA' && a.tipo !== 'silla_ruedas').length;
    const anf = g.asientos.filter((a) => a.seccion === 'ANF').length;
    expect(patio).toBe(402);
    expect(anf).toBe(108);
  });
  it('avisa de que faltan butacas de acompañante PMR', () => {
    expect(c.av.some((t) => t.includes('acompañante'))).toBe(true);
  });
  it('genera exactamente las mismas butacas que el fichero oficial', () => {
    expect(butacasExportadas(generar(pdr.plano))).toEqual(pdr.butacas);
  });
  it('la fila 1 del patio numera 21 … 1 2 … 22 sin las butacas que sustituyen los PMR', () => {
    const fila = generar(pdr.plano).asientos.filter((a) => a.seccion === 'PLATEA' && a.fila === 'F-1' && a.tipo === 'normal').sort((a, b) => a.x - b.x);
    expect(fila.map((a) => +a.numero)).toEqual([21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 12, 14, 16, 18, 20, 22]);
  });
});

describe('comprobación', () => {
  it('si no cuadra con el aforo oficial, no se puede vender', () => {
    const p = copia(antigua.plano);
    p.aforo = { butacas: 380, pmr: 2 };
    const c = comprobar(p);
    expect(c.ok).toBe(false);
    expect(c.err[0]).toContain('380');
  });
  it('butacas sin zona impiden vender', () => {
    const p = copia(antigua.plano);
    p.bloques[0].tramos = [{ desde: 1, hasta: 10, zona: 'preferente' }];
    expect(comprobar(p).ok).toBe(false);
  });
  it('avisa de zonas vacías y bloqueos', () => {
    const p = copia(antigua.plano);
    p.zonas.push({ codigo: 'vip', nombre: 'VIP', color: '#000000' });
    p.ajustes = { ...p.ajustes, 'PLATEA-F1-10': { bloqueado: true } };
    const c = comprobar(p);
    expect(c.av.some((t) => t.includes('VIP'))).toBe(true);
    expect(c.av.some((t) => t.includes('bloqueo técnico'))).toBe(true);
    expect(c.vend).toBe(377 + 2 - 1);
  });
  it('detecta códigos repetidos entre bloques', () => {
    const p = copia(pdr.plano);
    p.bloques[1].codigo = 'PLATEA';
    p.bloques[1].prefijo = 'F-';
    expect(comprobar(p).err.some((t) => t.includes('repetidas'))).toBe(true);
  });
  it('quitar a mano y excepciones de fila', () => {
    const p: RecetaPlano = planoNuevo();
    p.bloques[0].excepciones = [{ fila: 2, butacas: 14 }];
    p.ajustes = { 'PLATEA-F1-1': { quitada: true } };
    p.aforo = { butacas: 16 * 10 - 2 - 1, pmr: 0 };
    const c = comprobar(p);
    expect(c.but).toBe(157);
    expect(c.ok).toBe(true);
  });
  it('exportar e importar conserva el plano', () => {
    const doc = exportarPlano(antigua.plano);
    expect(doc.formato).toBe('plano-taquilla/1');
    expect(doc.comprobacion?.butacas).toBe(377);
    expect(diferenciasImportacion(doc)).toEqual([]);
  });
});

describe('mejor sitio disponible', () => {
  const g = generar(antigua.plano);
  it('asigna butacas juntas en la primera fila, centradas', () => {
    const r = mejorSitio(g.asientos, () => true, { cantidad: 4 })!;
    expect(r).toHaveLength(4);
    const as = r.map((c) => g.asientos.find((a) => a.codigo === c)!);
    expect(new Set(as.map((a) => a.fila))).toEqual(new Set(['F-1']));
    expect(as.map((a) => +a.numero).sort((a, b) => a - b)).toEqual([9, 10, 11, 12]);
  });
  it('si la primera fila está llena, pasa a la siguiente', () => {
    const r = mejorSitio(g.asientos, (c) => !c.startsWith('PLATEA-F1-'), { cantidad: 2 })!;
    expect(r.every((c) => c.startsWith('PLATEA-F2-'))).toBe(true);
  });
  it('nunca asigna un espacio PMR sin pedirlo', () => {
    for (let n = 1; n <= 8; n++) {
      const r = mejorSitio(g.asientos, () => true, { cantidad: n, zona: 'fondo' }) ?? [];
      expect(r.some((c) => c.includes('PMR'))).toBe(false);
    }
  });
  it('si se pide PMR, da el espacio y el acompañante', () => {
    const r = mejorSitio(g.asientos, () => true, { cantidad: 2, pmr: 1 })!;
    expect(r[0]).toContain('PMR');
    expect(r[1]).toBe('PLATEA-F17-4');
  });
  it('no junta butacas separadas por el pasillo central', () => {
    const gp = generar(pdr.plano);
    const r = mejorSitio(gp.asientos, () => true, { cantidad: 11, zona: 'platea' })!;
    const as = r.map((c) => gp.asientos.find((a) => a.codigo === c)!).sort((a, b) => a.x - b.x);
    for (let i = 1; i < as.length; i++) expect(as[i].x - as[i - 1].x).toBeLessThan(80);
  });
  it('devuelve null si no hay sitio', () => {
    expect(mejorSitio(g.asientos, () => false, { cantidad: 1 })).toBeNull();
  });
});

describe('mejor sitio con pasillo central', () => {
  it('12 juntas no caben en media fila de Puerto del Rosario (11 por lado)', () => {
    const gp = generar(pdr.plano);
    const r = mejorSitio(gp.asientos.filter((a) => a.seccion === 'PLATEA'), () => true, { cantidad: 12 });
    expect(r).toBeNull();
  });
});
