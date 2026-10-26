/** Factura simplificada (art. 7 del Reglamento de facturación). Plantilla pendiente de revisión por la asesoría. */
import { desgloseImpuesto } from '@taquilla/dominio';
import { eur, fechaTexto } from './plantillas';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function facturaHtml(p: any) {
  const tipo = Number(p.impuesto_tipo);
  const { base, cuota } = desgloseImpuesto(p.total_cent, tipo);
  const filas = p.entradas.map((e: any) => `<tr><td>${esc(e.descripcion)}</td><td class="n">${eur(e.precio_cent)}</td></tr>`).join('');
  const fecha = new Date(p.pagado_en).toLocaleDateString('es-ES');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura simplificada ${esc(p.numero_factura)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#131a28}table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid #d8dde7;text-align:left}.n{text-align:right}.borrador{background:#fcf1dd;border:1px solid #8a5608;padding:8px;border-radius:6px;font-size:13px}@media print{.borrador{display:none}}</style></head><body>
${p.es_prueba ? '<p class="borrador"><b>PRUEBA:</b> factura de una función ficticia. No tiene validez.</p>' : ''}

<h1>Factura simplificada</h1>
<p><b>Nº ${esc(p.numero_factura)}</b> · Fecha de expedición: ${esc(fecha)}</p>
<p><b>${esc(p.organizador_razon_social || p.organizador_nombre)}</b><br>CIF: ${esc(p.organizador_cif || 'pendiente')}<br>${esc(p.organizador_direccion || '')}</p>
<p>Concepto: entradas para «${esc(p.titulo)}», ${esc(fechaTexto(p.fecha))}${p.hora ? ' ' + esc(p.hora) : ''}, ${esc(p.recinto_nombre)}. Pedido ${esc(p.codigo)}.</p>
<table><thead><tr><th>Descripción</th><th class="n">Importe</th></tr></thead><tbody>${filas}
<tr><td>Gastos de gestión</td><td class="n">${eur(p.gastos_cent)}</td></tr></tbody>
<tfoot><tr><td>Base imponible</td><td class="n">${eur(base)}</td></tr>
<tr><td>${esc(p.impuesto_nombre)} (${tipo} %)</td><td class="n">${eur(cuota)}</td></tr>
<tr><th>Total</th><th class="n">${eur(p.total_cent)}</th></tr></tfoot></table>
<p style="font-size:13px;color:#4f596c">Impuesto incluido en el precio.</p>
</body></html>`;
}
