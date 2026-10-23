/**
 * Entradas: QR firmados, PDF y validación en puerta.
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { codigoFuncionQr, comprobarFirma, firmaEstatica, leerQr, llaveRotacion, qrEstatico, sha256Texto, type LecturaQr } from '@taquilla/dominio';
import type { Contexto } from '../contexto';
import type { Consultor } from '../db';
import { eur, fechaTexto } from './plantillas';

export async function llavesEntradas(ctx: Contexto, entradas: { codigo: string; funcion_id: string }[]) {
  return Promise.all(entradas.map(async (e) => ({ codigo: e.codigo, fcod: codigoFuncionQr(e.funcion_id), llave: await llaveRotacion(ctx.config.SECRETO_QR, e.funcion_id, e.codigo) })));
}

/** PDF con una página por entrada y su QR estático firmado. */
export async function pdfEntradas(ctx: Contexto, p: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Entradas ${p.codigo}`, Author: p.organizador_nombre } });
  const trozos: Buffer[] = [];
  doc.on('data', (b: Buffer) => trozos.push(b));
  const fin = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(trozos))));
  const vivas = p.entradas.filter((e: any) => ['valida', 'usada'].includes(e.estado));
  for (const [i, e] of vivas.entries()) {
    if (i) doc.addPage();
    if (p.es_prueba) {
      doc.save().rotate(-30, { origin: [300, 420] }).fontSize(70).fillColor('#e7a43a').opacity(0.25).text('PRUEBA', 90, 380).restore().opacity(1);
    }
    doc.fillColor('#4f596c').fontSize(10).text(p.evento_nombre.toUpperCase(), { characterSpacing: 1 });
    doc.moveDown(0.3).fillColor('#131a28').fontSize(24).font('Helvetica-Bold').text(p.titulo);
    doc.moveDown(0.3).font('Helvetica').fontSize(13).text(`${fechaTexto(p.fecha)}${p.hora ? ' · ' + p.hora : ''}`);
    doc.text(`${p.recinto_nombre}${p.municipio ? ', ' + p.municipio : ''}`);
    doc.moveDown(1);
    const y = doc.y;
    const qr = await QRCode.toBuffer(await qrEstatico(ctx.config.SECRETO_QR, p.funcion_id, e.codigo), { errorCorrectionLevel: 'M', margin: 1, width: 360 });
    doc.image(qr, 48, y, { width: 200 });
    doc.font('Helvetica-Bold').fontSize(18).text(e.descripcion, 270, y + 10, { width: 280 });
    doc.font('Helvetica').fontSize(12).fillColor('#4f596c').text(`Zona: ${e.zona_codigo}`, 270, doc.y + 6, { width: 280 });
    if (e.tipo_butaca === 'silla_ruedas') doc.fillColor('#131a28').text('Espacio para silla de ruedas · acceso adaptado', { width: 280 });
    doc.fillColor('#131a28').text(`Precio: ${eur(e.precio_cent)} (${p.impuesto_nombre} incluido)`, { width: 280 });
    doc.font('Courier-Bold').fontSize(14).text(e.codigo, 270, doc.y + 10, { width: 280 });
    doc.font('Helvetica').fontSize(10).fillColor('#4f596c').text(`Pedido ${p.codigo} · ${p.comprador_nombre ?? ''}`, 270, doc.y + 6, { width: 280 });
    doc.fillColor('#131a28').fontSize(10).text(
      'Enseña este código en la puerta (impreso o en el móvil). Cada entrada vale para una sola persona y un solo acceso. ' +
        'En el móvil, abre tus entradas desde el enlace del correo: su código cambia cada pocos segundos.',
      48, y + 230, { width: 500 },
    );
    doc.moveDown(1).fontSize(9).fillColor('#4f596c').text(`Organiza: ${p.organizador_razon_social || p.organizador_nombre}${p.organizador_cif ? ' · CIF ' + p.organizador_cif : ''} · Factura simplificada ${p.numero_factura}`, { width: 500 });
  }
  if (!vivas.length) doc.fontSize(14).text('Este pedido no tiene entradas válidas.');
  doc.end();
  return fin;
}

// ------------------------------------------------------------------------------------------------
// Puerta

export type ResultadoPuerta = {
  resultado: 'valida' | 'usada' | 'caducado' | 'otra_funcion' | 'anulada' | 'desconocida' | 'manipulada';
  mensaje: string;
  detalle?: string;
  entrada?: { codigo: string; descripcion: string; zona: string; pmr: boolean };
  usadaEn?: string;
};

const hora = (d: string | Date) => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Canary' });

/** Valida un QR en línea y, si es válido, marca la entrada como usada (operación atómica). */
export async function validarEnLinea(ctx: Contexto, organizadorId: string, funcionId: string, texto: string, dispositivo: string, usuarioId: string): Promise<ResultadoPuerta> {
  const l = leerQr(texto);
  const registrar = (resultado: ResultadoPuerta['resultado'], entradaId: string | null, codigo: string | null) =>
    ctx.db.query(
      `insert into accesos (organizador_id, funcion_id, entrada_id, codigo, dispositivo, usuario_id, resultado, leido_en) values ($1, $2, $3, $4, $5, $6, $7, now())`,
      [organizadorId, funcionId, entradaId, codigo, dispositivo, usuarioId, resultado],
    );
  if (!l) {
    await registrar('desconocida', null, null);
    return { resultado: 'desconocida', mensaje: 'Código no válido', detalle: 'No es una entrada de esta plataforma.' };
  }
  const e = await ctx.db.one<any>(
    `select e.id, e.codigo, e.funcion_id, e.estado, e.usada_en, e.descripcion, e.zona_codigo, e.tipo_butaca, f.titulo, f.fecha, to_char(f.hora, 'HH24:MI') as hora, r.nombre as recinto
       from entradas e join funciones f on f.id = e.funcion_id join recintos r on r.id = f.recinto_id
      where e.codigo = $1 and e.organizador_id = $2`,
    [l.codigo, organizadorId],
  );
  if (!e) {
    await registrar('desconocida', null, l.codigo);
    return { resultado: 'desconocida', mensaje: 'Entrada no encontrada', detalle: 'Puede ser falsa o de otro organizador.' };
  }
  const firma = await comprobarFirma(l, await datosFirma(ctx, e.funcion_id, e.codigo));
  if (firma === 'manipulado') {
    await registrar('manipulada', e.id, e.codigo);
    return { resultado: 'manipulada', mensaje: 'Código manipulado', detalle: 'La firma no coincide.' };
  }
  const info = { codigo: e.codigo, descripcion: e.descripcion, zona: e.zona_codigo, pmr: e.tipo_butaca === 'silla_ruedas' };
  if (e.funcion_id !== funcionId) {
    await registrar('otra_funcion', e.id, e.codigo);
    return { resultado: 'otra_funcion', mensaje: 'Es de otra función', detalle: `${e.titulo} · ${fechaTexto(e.fecha)}${e.hora ? ' · ' + e.hora : ''} · ${e.recinto}`, entrada: info };
  }
  if (['anulada', 'devuelta'].includes(e.estado)) {
    await registrar('anulada', e.id, e.codigo);
    return { resultado: 'anulada', mensaje: 'Entrada anulada', detalle: e.estado === 'devuelta' ? 'Se devolvió el dinero de esta entrada.' : 'Esta entrada se anuló.', entrada: info };
  }
  if (firma === 'caducado') {
    await registrar('caducado', e.id, e.codigo);
    return { resultado: 'caducado', mensaje: 'QR caducado', detalle: 'Parece una captura antigua: pide que abra la entrada en el móvil o el PDF.', entrada: info };
  }
  const r = await ctx.db.one<{ usada_en: string }>(
    `update entradas set estado = 'usada', usada_en = now() where id = $1 and estado = 'valida' returning usada_en`, [e.id],
  );
  if (!r) {
    const u = await ctx.db.one<{ usada_en: string }>('select usada_en from entradas where id = $1', [e.id]);
    await registrar('usada', e.id, e.codigo);
    return { resultado: 'usada', mensaje: 'Ya utilizada', detalle: `Entró a las ${hora(u!.usada_en)} · ${e.descripcion}`, entrada: info, usadaEn: u!.usada_en };
  }
  await registrar('valida', e.id, e.codigo);
  return { resultado: 'valida', mensaje: 'Adelante', detalle: `${e.descripcion}${info.pmr ? ' · acceso adaptado' : ''}`, entrada: info, usadaEn: r.usada_en };
}

async function datosFirma(ctx: Contexto, funcionId: string, codigo: string) {
  const fcod = codigoFuncionQr(funcionId);
  return {
    llave: await llaveRotacion(ctx.config.SECRETO_QR, funcionId, codigo),
    huellaEstatica: await sha256Texto(await firmaEstatica(ctx.config.SECRETO_QR, fcod, codigo)),
  };
}

/** Paquete para validar sin conexión: entradas de la función con su llave y la huella de la firma estática. */
export async function paquetePuerta(ctx: Contexto, organizadorId: string, funcionId: string) {
  const f = await ctx.db.one<any>(
    `select f.id, f.titulo, f.fecha, to_char(f.hora, 'HH24:MI') as hora, r.nombre as recinto from funciones f join recintos r on r.id = f.recinto_id
      where f.id = $1 and f.organizador_id = $2`,
    [funcionId, organizadorId],
  );
  if (!f) return null;
  const entradas = await ctx.db.query<any>(`select codigo, estado, usada_en, descripcion, zona_codigo, tipo_butaca from entradas where funcion_id = $1`, [funcionId]);
  const otras = await ctx.db.query<any>(
    `select f.id, f.titulo, f.fecha, to_char(f.hora, 'HH24:MI') as hora, r.nombre as recinto from funciones f join recintos r on r.id = f.recinto_id
      where f.organizador_id = $1 and f.id <> $2 and f.modo_venta <> 'libre'`,
    [organizadorId, funcionId],
  );
  return {
    funcion: { ...f, fcod: codigoFuncionQr(f.id) },
    generado_en: new Date().toISOString(),
    entradas: await Promise.all(entradas.map(async (e) => ({
      codigo: e.codigo, estado: e.estado, usada_en: e.usada_en, descripcion: e.descripcion, zona: e.zona_codigo, pmr: e.tipo_butaca === 'silla_ruedas',
      ...(await datosFirma(ctx, funcionId, e.codigo)),
    }))),
    otras: Object.fromEntries(otras.map((o) => [codigoFuncionQr(o.id), `${o.titulo} · ${fechaTexto(o.fecha)}${o.hora ? ' · ' + o.hora : ''} · ${o.recinto}`])),
  };
}

export interface LecturaSinConexion {
  codigo: string;
  resultado: string;
  leidoEn: string;
}

/**
 * Sincroniza las lecturas hechas sin conexión. Gana la lectura más antigua: si otra puerta
 * ya dejó pasar esa entrada antes, se marca como doble acceso para revisarlo.
 */
export async function sincronizarLecturas(c: Consultor, organizadorId: string, funcionId: string, dispositivo: string, usuarioId: string, lecturas: LecturaSinConexion[]) {
  const dobles: { codigo: string; leidoEn: string; antes: string }[] = [];
  let aplicadas = 0;
  for (const l of [...lecturas].sort((a, b) => a.leidoEn.localeCompare(b.leidoEn))) {
    // reintento de una sincronización anterior: ya está registrada
    if (await c.one(`select 1 from accesos where dispositivo = $1 and codigo = $2 and leido_en = $3 and modo = 'sin_conexion'`, [dispositivo, l.codigo, l.leidoEn])) continue;
    const e = await c.one<any>('select id, estado, usada_en from entradas where codigo = $1 and funcion_id = $2', [l.codigo, funcionId]);
    let resultado = ['valida', 'usada', 'caducado', 'otra_funcion', 'anulada', 'desconocida', 'manipulada'].includes(l.resultado) ? l.resultado : 'desconocida';
    if (e && l.resultado === 'valida') {
      const r = await c.one(`update entradas set estado = 'usada', usada_en = $2 where id = $1 and estado = 'valida' returning id`, [e.id, l.leidoEn]);
      if (!r) {
        resultado = 'doble_sin_conexion';
        dobles.push({ codigo: l.codigo, leidoEn: l.leidoEn, antes: e.usada_en });
      } else aplicadas++;
    }
    await c.query(
      `insert into accesos (organizador_id, funcion_id, entrada_id, codigo, dispositivo, usuario_id, resultado, modo, leido_en)
       values ($1, $2, $3, $4, $5, $6, $7, 'sin_conexion', $8) on conflict do nothing`,
      [organizadorId, funcionId, e?.id ?? null, l.codigo, dispositivo, usuarioId, resultado, l.leidoEn],
    );
  }
  return { aplicadas, dobles };
}

export type { LecturaQr };
