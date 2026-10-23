/** Plantillas de correo (HTML sencillo y texto plano). */
import { desgloseImpuesto } from '@taquilla/dominio';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const eur = (cent: number) => (cent / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
export function fechaTexto(iso: string) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function marco(titulo: string, cuerpo: string, pie: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(titulo)}</title></head>
<body style="margin:0;background:#f3f5f9;font-family:Segoe UI,Arial,sans-serif;color:#131a28">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border:1px solid #d8dde7;border-radius:10px;padding:24px">${cuerpo}</div>
<p style="font-size:12px;color:#4f596c;line-height:1.5">${pie}</p></div></body></html>`;
}

// Textos del correo de confirmación (en y de PENDIENTES DE REVISIÓN NATIVA)
const TX = {
  es: { listo: '¡Tus entradas están listas!', pedido: 'Pedido', gastos: 'Gastos de gestión', total: 'Total', incluido: 'incluido', ver: 'Ver mis entradas',
    puerta: 'En la puerta enseña el código QR desde el móvil (cambia cada pocos segundos) o el PDF adjunto impreso.', factura: 'Factura simplificada nº',
    prueba: '<b>Función de PRUEBA:</b> estas entradas no son reales.', asunto: 'Tus entradas', motivo: 'Has recibido este correo porque has comprado entradas en Taquilla para un evento de', locale: 'es-ES' },
  en: { listo: 'Your tickets are ready!', pedido: 'Order', gastos: 'Booking fee', total: 'Total', incluido: 'included', ver: 'View my tickets',
    puerta: 'At the door, show the QR code on your phone (it changes every few seconds) or the attached PDF printed.', factura: 'Simplified invoice no.',
    prueba: '<b>TEST show:</b> these tickets are not real.', asunto: 'Your tickets', motivo: 'You are receiving this email because you bought tickets on Taquilla for an event by', locale: 'en-GB' },
  de: { listo: 'Deine Tickets sind bereit!', pedido: 'Bestellung', gastos: 'Servicegebühr', total: 'Gesamt', incluido: 'inklusive', ver: 'Meine Tickets ansehen',
    puerta: 'Zeige am Eingang den QR-Code auf dem Handy (er ändert sich alle paar Sekunden) oder das beigefügte PDF ausgedruckt.', factura: 'Vereinfachte Rechnung Nr.',
    prueba: '<b>TEST-Vorstellung:</b> Diese Tickets sind nicht echt.', asunto: 'Deine Tickets', motivo: 'Du erhältst diese E-Mail, weil du bei Taquilla Tickets für eine Veranstaltung von folgendem Veranstalter gekauft hast:', locale: 'de-DE' },
};

export function correoConfirmacion(p: any, urlPedido: string) {
  const x = TX[(p.idioma as keyof typeof TX) in TX ? (p.idioma as keyof typeof TX) : 'es'];
  const fecha = (() => {
    const [a, m, d] = String(p.fecha).split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString(x.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  })();
  const prueba = p.es_prueba ? `<p style="background:#fcf1dd;border:1px solid #8a5608;padding:10px;border-radius:8px">${x.prueba}</p>` : '';
  const filas = p.entradas.map((e: any) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eef1f6">${esc(e.descripcion)}</td><td style="padding:6px 0;border-bottom:1px solid #eef1f6;font-family:monospace">${esc(e.codigo)}</td><td style="padding:6px 0;border-bottom:1px solid #eef1f6;text-align:right">${eur(e.precio_cent)}</td></tr>`).join('');
  const { cuota } = desgloseImpuesto(p.total_cent, Number(p.impuesto_tipo));
  const cuerpo = `${prueba}
<h1 style="font-size:22px;margin:0 0 6px">${x.listo}</h1>
<p style="margin:0 0 16px;color:#4f596c">${x.pedido} <b>${esc(p.codigo)}</b></p>
<h2 style="font-size:18px;margin:0">${esc(p.titulo)}</h2>
<p style="margin:4px 0 16px">${esc(fecha)}${p.hora ? ' · ' + esc(p.hora) : ''}<br>${esc(p.recinto_nombre)}${p.municipio ? ', ' + esc(p.municipio) : ''}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${filas}
<tr><td style="padding:6px 0">${x.gastos}</td><td></td><td style="text-align:right">${eur(p.gastos_cent)}</td></tr>
<tr><td style="padding:6px 0"><b>${x.total}</b></td><td></td><td style="text-align:right"><b>${eur(p.total_cent)}</b></td></tr>
<tr><td style="padding:2px 0;color:#4f596c;font-size:12px">${esc(p.impuesto_nombre)} ${x.incluido} (${Number(p.impuesto_tipo)} %)</td><td></td><td style="text-align:right;color:#4f596c;font-size:12px">${eur(cuota)}</td></tr></table>
<p style="margin:20px 0"><a href="${esc(urlPedido)}" style="background:#131a28;color:#fff;padding:12px 20px;border-radius:99px;text-decoration:none;font-weight:700;display:inline-block">${x.ver}</a></p>
<p style="font-size:14px">${x.puerta}</p>
<p style="font-size:12px;color:#4f596c">${p.numero_factura ? `${x.factura} ${esc(p.numero_factura)} · ` : ''}${esc(p.organizador_razon_social || p.organizador_nombre)}${p.organizador_cif ? ' · CIF ' + esc(p.organizador_cif) : ''}</p>`;
  const texto = `${p.es_prueba ? 'FUNCIÓN DE PRUEBA: estas entradas no son reales.\n\n' : ''}Tus entradas para ${p.titulo}
${fechaTexto(p.fecha)}${p.hora ? ' · ' + p.hora : ''} · ${p.recinto_nombre}
Pedido ${p.codigo}

${p.entradas.map((e: any) => `- ${e.descripcion} · ${e.codigo} · ${eur(e.precio_cent)}`).join('\n')}
Gastos de gestión: ${eur(p.gastos_cent)}
Total: ${eur(p.total_cent)} (${p.impuesto_nombre} incluido)

Ver tus entradas: ${urlPedido}
Factura simplificada nº ${p.numero_factura}`;
  return {
    asunto: `${p.es_prueba ? '[PRUEBA] ' : ''}${x.asunto} · ${p.titulo}`,
    html: marco(x.asunto, cuerpo, `${x.motivo} ${esc(p.organizador_nombre)}.`),
    texto,
  };
}

export function correoConflicto(p: any) {
  const cuerpo = `<h1 style="font-size:20px;margin:0 0 10px">No hemos podido emitir tus entradas</h1>
<p>Lo sentimos: mientras completabas el pago, las plazas que habías elegido para <b>${esc(p.titulo)}</b> dejaron de estar disponibles.</p>
<p>Te devolvemos el importe completo (<b>${eur(p.total_cent)}</b>) a la misma tarjeta. Según tu banco, puede tardar de 5 a 10 días en aparecer.</p>
<p>Pedido <b>${esc(p.codigo)}</b></p>`;
  return {
    asunto: `Devolución de tu pedido ${p.codigo}`,
    html: marco('Devolución', cuerpo, 'Si tienes cualquier duda, responde a este correo.'),
    texto: `No hemos podido emitir tus entradas para ${p.titulo}: las plazas dejaron de estar disponibles mientras pagabas.\nTe devolvemos ${eur(p.total_cent)} a la misma tarjeta.\nPedido ${p.codigo}`,
  };
}

export function correoCancelacion(p: any, motivo: string) {
  const cuerpo = `<h1 style="font-size:20px;margin:0 0 10px">Función cancelada</h1>
<p>Sentimos comunicarte que <b>${esc(p.titulo)}</b> del ${esc(fechaTexto(p.fecha))} se ha cancelado.</p>
<p>Motivo: ${esc(motivo)}</p>
<p>Te devolvemos el importe completo de tu compra, gastos de gestión incluidos (<b>${eur(p.total_cent)}</b>), a la misma tarjeta. Según tu banco puede tardar de 5 a 10 días.</p>
<p>Pedido <b>${esc(p.codigo)}</b>. Tus entradas ya no son válidas.</p>`;
  return {
    asunto: `${p.es_prueba ? '[PRUEBA] ' : ''}Función cancelada · ${p.titulo}`,
    html: marco('Función cancelada', cuerpo, `Organiza ${esc(p.organizador_nombre)}.`),
    texto: `${p.titulo} (${fechaTexto(p.fecha)}) se ha cancelado. Motivo: ${motivo}\nTe devolvemos ${eur(p.total_cent)} a la misma tarjeta.\nPedido ${p.codigo}`,
  };
}
