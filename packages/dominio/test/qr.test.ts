import { describe, expect, it } from 'vitest';
import { comprobarFirma, firmaEstatica, leerQr, llaveRotacion, qrEstatico, qrRotatorio, sha256Texto, ventanaActual, codigoFuncionQr, VENTANA_QR_MS } from '../src';

const SECRETO = 'secreto-de-prueba-para-los-qr-0123456789';
const FUNCION = 'dec77b0d-ead0-469a-ad53-2165b79d764f';
const CODIGO = 'TKT-ABCD2345';

async function datosEntrada() {
  const fcod = codigoFuncionQr(FUNCION);
  return { llave: await llaveRotacion(SECRETO, FUNCION, CODIGO), huellaEstatica: await sha256Texto(await firmaEstatica(SECRETO, fcod, CODIGO)), fcod };
}

describe('QR firmados', () => {
  it('el QR estático se lee y su firma cuadra', async () => {
    const e = await datosEntrada();
    const l = leerQr(await qrEstatico(SECRETO, FUNCION, CODIGO))!;
    expect(l).toMatchObject({ tipo: 'estatico', codigo: CODIGO, fcod: 'DEC77B0D' });
    expect(await comprobarFirma(l, e)).toBe('ok');
  });
  it('detecta un QR estático manipulado', async () => {
    const e = await datosEntrada();
    const bueno = await qrEstatico(SECRETO, FUNCION, CODIGO);
    const qr = bueno.slice(0, -4) + (bueno.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(await comprobarFirma(leerQr(qr)!, e)).toBe('manipulado');
    // la firma de otra entrada tampoco vale para esta
    const otra = await qrEstatico(SECRETO, FUNCION, 'TKT-ZZZZ2345');
    expect(await comprobarFirma({ ...leerQr(otra)!, codigo: CODIGO } as any, e)).toBe('manipulado');
  });
  it('el QR rotatorio cambia cada 15 s y caduca', async () => {
    const e = await datosEntrada();
    const ahora = Date.now();
    const v = ventanaActual(ahora);
    const a = await qrRotatorio(e.llave, e.fcod, CODIGO, v);
    const b = await qrRotatorio(e.llave, e.fcod, CODIGO, v + 1);
    expect(a).not.toBe(b);
    expect(await comprobarFirma(leerQr(a)!, e, ahora)).toBe('ok');
    expect(await comprobarFirma(leerQr(a)!, e, ahora + 10 * VENTANA_QR_MS)).toBe('caducado');
  });
  it('un QR rotatorio hecho con otra llave no vale', async () => {
    const e = await datosEntrada();
    const otra = await llaveRotacion('otro-secreto-distinto-0123456789abcdef', FUNCION, CODIGO);
    expect(await comprobarFirma(leerQr(await qrRotatorio(otra, e.fcod, CODIGO))!, e)).toBe('manipulado');
  });
  it('rechaza textos que no son entradas y acepta el código tecleado', () => {
    expect(leerQr('https://ejemplo.com')).toBeNull();
    expect(leerQr('tkt-abcd2345')).toEqual({ tipo: 'manual', codigo: CODIGO });
  });
});
