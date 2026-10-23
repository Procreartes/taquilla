/**
 * Panel por función y por festival: ventas, ocupación por zona, pedidos, exportaciones,
 * liquidación con reparto, borderó SGAE, datos de público, devoluciones, cancelación,
 * invitaciones y protocolo.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { agregarPublico, calcularLiquidacion } from '@taquilla/dominio';
import type { Contexto } from '../contexto';
import type { Consultor } from '../db';
import { exigir } from '../auth';
import { auditar } from '../auditoria';
import { conflicto, noEncontrado } from '../errores';
import { cancelarFuncion, devolverEntradas, emitirInvitacion } from '../servicios/dinero';
import { fechaTexto } from '../servicios/plantillas';

const uuid = z.string().uuid();

async function funcionDe(c: Consultor, organizadorId: string, id: string) {
  const f = await c.one<any>(
    `select f.*, to_char(f.hora, 'HH24:MI') as hora, r.nombre as recinto_nombre, r.municipio, r.isla, e.nombre as evento_nombre, e.id as evento_id,
            v.butacas as plano_butacas, v.receta->'zonas' as plano_zonas, (v.comprobacion->>'vend')::int as plano_plazas,
            o.impuesto_nombre, o.impuesto_tipo, o.sgae_porcentaje, o.sgae_pendiente, o.nombre as organizador_nombre, o.razon_social, o.cif
       from funciones f join recintos r on r.id = f.recinto_id join eventos e on e.id = f.evento_id join organizadores o on o.id = f.organizador_id
       left join versiones_plano v on v.id = f.version_plano_id
      where f.id = $1 and f.organizador_id = $2`,
    [id, organizadorId],
  );
  if (!f) throw noEncontrado('Función');
  return f;
}

/** Resumen de ventas de una función. */
export async function resumenFuncion(c: Consultor, f: any) {
  const porZona = await c.query<any>(
    `select zona_codigo, count(*) filter (where tipo_entrada = 'venta')::int as vendidas, count(*) filter (where tipo_entrada <> 'venta')::int as invitaciones,
            count(*) filter (where estado = 'usada')::int as dentro, coalesce(sum(precio_cent) filter (where tipo_entrada = 'venta'), 0)::int as importe
       from entradas where funcion_id = $1 and estado in ('valida', 'usada') group by zona_codigo`,
    [f.id],
  );
  const plazasZona: Record<string, number> = {};
  const nombres: Record<string, string> = { general: 'Entrada general' };
  if (f.modo_venta === 'numerada') {
    for (const z of f.plano_zonas ?? []) nombres[z.codigo] = z.nombre;
    for (const b of f.plano_butacas ?? []) if (!b.bloqueado) plazasZona[b.zona] = (plazasZona[b.zona] ?? 0) + 1;
  } else if (f.aforo) plazasZona.general = f.aforo;
  const protocolo = (await c.one<{ n: number }>(`select count(*)::int as n from bloqueos_protocolo where funcion_id = $1 and activo`, [f.id]))!.n;
  const dinero = await c.one<any>(
    `select count(*) filter (where canal <> 'invitacion')::int as pedidos, coalesce(sum(importe_entradas_cent), 0)::int as bruto, coalesce(sum(gastos_cent), 0)::int as gastos,
            coalesce(sum(comision_pasarela_cent), 0)::int as comisiones
       from pedidos where funcion_id = $1 and estado in ('pagado', 'devuelto', 'devuelto_parcial')`,
    [f.id],
  );
  const devoluciones = (await c.one<{ n: number }>(`select coalesce(sum(importe_cent), 0)::int as n from devoluciones where pedido_id in (select id from pedidos where funcion_id = $1) and estado = 'hecha'`, [f.id]))!.n;
  const zonas = Object.keys({ ...plazasZona, ...Object.fromEntries(porZona.map((z) => [z.zona_codigo, 1])) }).map((codigo) => {
    const z = porZona.find((x) => x.zona_codigo === codigo);
    return { codigo, nombre: nombres[codigo] ?? codigo, plazas: plazasZona[codigo] ?? null, vendidas: z?.vendidas ?? 0, invitaciones: z?.invitaciones ?? 0, dentro: z?.dentro ?? 0, importe: z?.importe ?? 0 };
  });
  const plazas = f.modo_venta === 'numerada' ? f.plano_plazas : f.aforo;
  const ocupadas = zonas.reduce((s, z) => s + z.vendidas + z.invitaciones, 0);
  return {
    plazas, vendidas: zonas.reduce((s, z) => s + z.vendidas, 0), invitaciones: zonas.reduce((s, z) => s + z.invitaciones, 0), protocolo,
    dentro: zonas.reduce((s, z) => s + z.dentro, 0), ocupacion: plazas ? ocupadas / plazas : null, zonas, ...dinero, devoluciones,
  };
}

export async function liquidacionFuncion(c: Consultor, f: any) {
  const pedidos = await c.query<any>(
    `select importe_entradas_cent, gastos_cent, comision_pasarela_cent, (select count(*)::int from entradas e where e.pedido_id = p.id) as n
       from pedidos p where funcion_id = $1 and canal <> 'invitacion' and estado in ('pagado', 'devuelto', 'devuelto_parcial')`,
    [f.id],
  );
  const devoluciones = await c.query<any>(
    `select d.importe_cent, d.gastos_devueltos_cent from devoluciones d join pedidos p on p.id = d.pedido_id where p.funcion_id = $1 and d.estado = 'hecha' and p.estado <> 'conflicto'`,
    [f.id],
  );
  const invitaciones = (await c.one<{ n: number }>(`select count(*)::int as n from entradas where funcion_id = $1 and tipo_entrada <> 'venta' and estado in ('valida', 'usada')`, [f.id]))!.n;
  const socios = await c.query<any>(`select nombre, porcentaje from socios_evento where evento_id = $1 order by orden`, [f.evento_id]);
  return calcularLiquidacion({
    pedidos: pedidos.map((p) => ({ importeEntradas: p.importe_entradas_cent, gastos: p.gastos_cent, comisionPasarela: p.comision_pasarela_cent, entradas: p.n })),
    devoluciones: devoluciones.map((d) => ({ importe: d.importe_cent, gastosDevueltos: d.gastos_devueltos_cent })),
    invitaciones, impuestoTipo: Number(f.impuesto_tipo), impuestoNombre: f.impuesto_nombre, derechosAutorPct: Number(f.sgae_porcentaje), socios,
  });
}

const csvCelda = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // evita la inyección de fórmulas al abrir el CSV en Excel
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

async function enviarTabla(reply: FastifyReply, formato: 'csv' | 'xlsx', nombre: string, columnas: [string, string][], filas: Record<string, unknown>[]) {
  if (formato === 'csv') {
    const txt = '﻿' + [columnas.map((c) => csvCelda(c[1])).join(';'), ...filas.map((f) => columnas.map((c) => csvCelda(f[c[0]])).join(';'))].join('\r\n');
    reply.header('content-disposition', `attachment; filename="${nombre}.csv"`);
    return reply.type('text/csv; charset=utf-8').send(txt);
  }
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(nombre.slice(0, 31));
  hoja.columns = columnas.map(([k, t]) => ({ header: t, key: k, width: Math.max(12, t.length + 2) }));
  hoja.getRow(1).font = { bold: true };
  for (const f of filas) hoja.addRow(Object.fromEntries(columnas.map(([k]) => [k, typeof f[k] === 'string' && /^[=+\-@]/.test(f[k] as string) ? `'${f[k]}` : f[k]])));
  reply.header('content-disposition', `attachment; filename="${nombre}.xlsx"`);
  return reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(await libro.xlsx.writeBuffer()));
}

const eurNum = (c: number | null | undefined) => (c === null || c === undefined ? null : Math.round(c) / 100);

export async function rutasPanel(app: FastifyInstance, ctx: Contexto) {
  app.get('/api/panel/funciones/:id', async (req) => {
    const c = exigir(ctx, req, 'informes.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const f = await funcionDe(ctx.db, c.organizadorId, id);
    const { plano_butacas: _b, ...info } = f;
    return { funcion: info, resumen: await resumenFuncion(ctx.db, f) };
  });

  app.get('/api/panel/funciones/:id/pedidos', async (req) => {
    const c = exigir(ctx, req, 'pedidos.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { q } = z.object({ q: z.string().max(100).optional() }).parse(req.query);
    await funcionDe(ctx.db, c.organizadorId, id);
    return ctx.db.query(
      `select p.id, p.codigo, p.estado, p.canal, p.comprador_nombre, p.comprador_email, p.total_cent, p.gastos_cent, p.pagado_en, p.numero_factura,
              (select count(*)::int from entradas e where e.pedido_id = p.id) as entradas,
              (select coalesce(sum(importe_cent), 0)::int from devoluciones d where d.pedido_id = p.id and d.estado = 'hecha') as devuelto
         from pedidos p where p.funcion_id = $1 and p.estado in ('pagado', 'devuelto', 'devuelto_parcial', 'conflicto')
          and ($2::text is null or p.codigo ilike '%' || $2 || '%' or p.comprador_email ilike '%' || $2 || '%' or p.comprador_nombre ilike '%' || $2 || '%')
        order by p.pagado_en desc nulls last limit 500`,
      [id, q || null],
    );
  });

  app.get('/api/panel/pedidos/:id', async (req) => {
    const c = exigir(ctx, req, 'pedidos.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const p = await ctx.db.one(`select id, codigo, estado, canal, comprador_nombre, comprador_email, comprador_telefono, total_cent, gastos_cent, importe_entradas_cent, pagado_en, numero_factura, pasarela, pago_id, notas, funcion_id from pedidos where id = $1 and organizador_id = $2`, [id, c.organizadorId]);
    if (!p) throw noEncontrado('Pedido');
    const entradas = await ctx.db.query(`select id, codigo, descripcion, zona_codigo, precio_cent, gastos_cent, estado, usada_en, tipo_entrada from entradas where pedido_id = $1 order by descripcion`, [id]);
    const devoluciones = await ctx.db.query(`select importe_cent, gastos_devueltos_cent, motivo, estado, error, creado_en, hecha_en from devoluciones where pedido_id = $1 order by creado_en`, [id]);
    return { ...p, entradas, devoluciones };
  });

  app.get('/api/panel/funciones/:id/exportar', async (req, reply) => {
    const c = exigir(ctx, req, 'pedidos.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { formato, tipo } = z.object({ formato: z.enum(['csv', 'xlsx']).default('csv'), tipo: z.enum(['pedidos', 'entradas']).default('entradas') }).parse(req.query);
    const f = await funcionDe(ctx.db, c.organizadorId, id);
    await auditar(ctx.db, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'exportar', entidad: 'funcion', entidadId: id, datos: { tipo, formato }, ip: req.ip });
    const nombre = `${f.codigo}-${tipo}`;
    if (tipo === 'pedidos') {
      const filas = await ctx.db.query(
        `select codigo, estado, canal, comprador_nombre, comprador_email, comprador_telefono, codigo_postal, municipio, isla, pais, importe_entradas_cent, gastos_cent, total_cent, numero_factura, pagado_en,
                consentimientos->>'comunicacionesOrganizador' as acepta_novedades
           from pedidos where funcion_id = $1 and estado in ('pagado', 'devuelto', 'devuelto_parcial', 'conflicto') order by pagado_en`,
        [id],
      );
      return enviarTabla(reply, formato, nombre, [
        ['codigo', 'Pedido'], ['estado', 'Estado'], ['canal', 'Canal'], ['comprador_nombre', 'Nombre'], ['comprador_email', 'Correo'], ['comprador_telefono', 'Teléfono'],
        ['codigo_postal', 'C. postal'], ['municipio', 'Municipio'], ['isla', 'Isla'], ['pais', 'País'], ['entradas_eur', 'Entradas (€)'], ['gastos_eur', 'Gastos (€)'],
        ['total_eur', 'Total (€)'], ['numero_factura', 'Factura'], ['pagado', 'Pagado'], ['acepta_novedades', 'Acepta novedades'],
      ], filas.map((p) => ({ ...p, entradas_eur: eurNum(p.importe_entradas_cent), gastos_eur: eurNum(p.gastos_cent), total_eur: eurNum(p.total_cent), pagado: p.pagado_en ? new Date(p.pagado_en).toLocaleString('es-ES', { timeZone: 'Atlantic/Canary' }) : '' })));
    }
    const filas = await ctx.db.query(
      `select e.codigo, e.descripcion, e.zona_codigo, e.tipo_entrada, e.estado, e.precio_cent, e.usada_en, e.titular_nombre, p.codigo as pedido, p.comprador_email
         from entradas e join pedidos p on p.id = e.pedido_id where e.funcion_id = $1 order by e.descripcion`,
      [id],
    );
    return enviarTabla(reply, formato, nombre, [
      ['codigo', 'Entrada'], ['descripcion', 'Butaca'], ['zona_codigo', 'Zona'], ['tipo_entrada', 'Tipo'], ['estado', 'Estado'], ['precio_eur', 'Precio (€)'],
      ['usada', 'Entró'], ['titular_nombre', 'Titular'], ['pedido', 'Pedido'], ['comprador_email', 'Correo'],
    ], filas.map((e) => ({ ...e, precio_eur: eurNum(e.precio_cent), usada: e.usada_en ? new Date(e.usada_en).toLocaleString('es-ES', { timeZone: 'Atlantic/Canary' }) : '' })));
  });

  // ---- Festival ----
  app.get('/api/panel/eventos/:id', async (req) => {
    const c = exigir(ctx, req, 'informes.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const e = await ctx.db.one('select id, nombre from eventos where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!e) throw noEncontrado('Evento');
    const ids = await ctx.db.query<{ id: string }>(`select id from funciones where evento_id = $1 and modo_venta <> 'libre' order by fecha, hora`, [id]);
    const funciones: any[] = [];
    for (const { id: fid } of ids) {
      const f = await funcionDe(ctx.db, c.organizadorId, fid);
      const r = await resumenFuncion(ctx.db, f);
      funciones.push({ id: f.id, codigo: f.codigo, titulo: f.titulo, fecha: f.fecha, hora: f.hora, recinto: f.recinto_nombre, isla: f.isla, estado: f.estado, es_prueba: f.es_prueba, venta_externa: !!f.venta_externa_url, ...r, zonas: undefined });
    }
    const suma = (k: string) => funciones.reduce((s, f: any) => s + (f[k] ?? 0), 0);
    return { evento: e, funciones, totales: { vendidas: suma('vendidas'), invitaciones: suma('invitaciones'), bruto: suma('bruto'), gastos: suma('gastos'), comisiones: suma('comisiones'), devoluciones: suma('devoluciones'), pedidos: suma('pedidos'), dentro: suma('dentro') } };
  });

  // ---- Liquidación ----
  app.get('/api/panel/funciones/:id/liquidacion', async (req) => {
    const c = exigir(ctx, req, 'liquidacion.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const f = await funcionDe(ctx.db, c.organizadorId, id);
    return { funcion: { id: f.id, titulo: f.titulo, fecha: f.fecha, hora: f.hora, recinto: f.recinto_nombre, impuesto_pendiente: true, sgae_pendiente: f.sgae_pendiente, es_prueba: f.es_prueba }, liquidacion: await liquidacionFuncion(ctx.db, f) };
  });

  app.get('/api/panel/eventos/:id/liquidacion', async (req) => {
    const c = exigir(ctx, req, 'liquidacion.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const e = await ctx.db.one('select id, nombre from eventos where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!e) throw noEncontrado('Evento');
    const ids = await ctx.db.query<{ id: string }>(`select id from funciones where evento_id = $1 and modo_venta <> 'libre' and venta_externa_url is null order by fecha, hora`, [id]);
    const filas: any[] = [];
    for (const { id: fid } of ids) {
      const f = await funcionDe(ctx.db, c.organizadorId, fid);
      filas.push({ id: f.id, titulo: f.titulo, fecha: f.fecha, es_prueba: f.es_prueba, liquidacion: await liquidacionFuncion(ctx.db, f) });
    }
    const total = (sel: (l: any) => number) => filas.reduce((s, x) => s + sel(x.liquidacion), 0);
    const socios = await ctx.db.query<any>('select nombre, porcentaje from socios_evento where evento_id = $1 order by orden', [id]);
    const repartoTotal = socios.map((s, i) => ({ ...s, importe: filas.reduce((t, x) => t + (x.liquidacion.reparto[i]?.importe ?? 0), 0) }));
    return {
      evento: e, funciones: filas,
      totales: { bruto: total((l) => l.bruto), devoluciones: total((l) => l.devoluciones), impuesto: total((l) => l.impuesto.cuota), comisionPasarela: total((l) => l.comisionPasarela), gastosGestion: total((l) => l.gastosGestion.netos), derechosAutor: total((l) => l.derechosAutor.importe), neto: total((l) => l.netoOrganizador), netoTrasDerechos: total((l) => l.netoTrasDerechos) },
      reparto: repartoTotal,
    };
  });

  // ---- Borderó SGAE ----
  app.get('/api/panel/funciones/:id/bordero', async (req, reply) => {
    const c = exigir(ctx, req, 'liquidacion.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { formato } = z.object({ formato: z.enum(['html', 'csv']).default('html') }).parse(req.query);
    const f = await funcionDe(ctx.db, c.organizadorId, id);
    const r = await resumenFuncion(ctx.db, f);
    const l = await liquidacionFuncion(ctx.db, f);
    const precios = await ctx.db.query<any>(
      `select e.zona_codigo, e.precio_cent, count(*)::int as n from entradas e where e.funcion_id = $1 and e.estado in ('valida', 'usada') and e.tipo_entrada = 'venta' group by 1, 2 order by 1, 2 desc`,
      [id],
    );
    const filas = precios.map((p) => ({ zona: r.zonas.find((z: any) => z.codigo === p.zona_codigo)?.nombre ?? p.zona_codigo, precio: eurNum(p.precio_cent), entradas: p.n, importe: eurNum(p.precio_cent * p.n) }));
    if (formato === 'csv') return enviarTabla(reply, 'csv', `bordero-${f.codigo}`, [['zona', 'Localidad'], ['precio', 'Precio (€)'], ['entradas', 'Entradas'], ['importe', 'Importe (€)']], filas);
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]!);
    const e2 = (c: number) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
    reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
    return reply.type('text/html; charset=utf-8').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Borderó ${esc(f.titulo)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#131a28}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #d8dde7;padding:6px;text-align:left}.n{text-align:right}.aviso{background:#fcf1dd;border:1px solid #8a5608;padding:8px;border-radius:6px;font-size:13px}@media print{.aviso{display:none}}</style></head><body>
${f.es_prueba ? '<p class="aviso"><b>PRUEBA</b>: función ficticia.</p>' : ''}
${f.sgae_pendiente ? `<p class="aviso">El porcentaje de derechos de autor (${Number(f.sgae_porcentaje)} %) está pendiente de confirmar según el contrato con la SGAE.</p>` : ''}
<h1>Borderó de taquilla</h1>
<p><b>Espectáculo:</b> ${esc(f.titulo)}<br><b>Fecha:</b> ${esc(fechaTexto(f.fecha))}${f.hora ? ' · ' + esc(f.hora) : ''}<br><b>Local:</b> ${esc(f.recinto_nombre)}${f.municipio ? ', ' + esc(f.municipio) : ''}<br>
<b>Organizador:</b> ${esc(f.razon_social || f.organizador_nombre)}${f.cif ? ' · CIF ' + esc(f.cif) : ''}<br><b>Aforo:</b> ${r.plazas ?? 'por confirmar'}</p>
<table><thead><tr><th>Localidad</th><th class="n">Precio</th><th class="n">Entradas</th><th class="n">Importe</th></tr></thead><tbody>
${filas.map((x) => `<tr><td>${esc(x.zona)}</td><td class="n">${e2(x.precio! * 100)}</td><td class="n">${x.entradas}</td><td class="n">${e2(x.importe! * 100)}</td></tr>`).join('')}
<tr><td>Invitaciones</td><td class="n">0,00 €</td><td class="n">${r.invitaciones}</td><td class="n">0,00 €</td></tr></tbody></table>
<table><tbody>
<tr><td>Recaudación bruta</td><td class="n">${e2(l.bruto)}</td></tr><tr><td>Devoluciones</td><td class="n">−${e2(l.devoluciones)}</td></tr>
<tr><td>Recaudación (impuestos incluidos)</td><td class="n">${e2(l.brutoNeto)}</td></tr><tr><td>${esc(l.impuesto.nombre)} (${l.impuesto.tipo} %)</td><td class="n">${e2(l.impuesto.cuota)}</td></tr>
<tr><th>Base (recaudación sin impuestos)</th><th class="n">${e2(l.base)}</th></tr><tr><td>Derechos de autor (${l.derechosAutor.porcentaje} % sobre la base)</td><td class="n">${e2(l.derechosAutor.importe)}</td></tr>
</tbody></table><p style="font-size:12px;color:#4f596c">Los gastos de gestión no forman parte de la recaudación de taquilla. Generado por Taquilla.</p></body></html>`);
  });

  // ---- Datos de público (agregados) ----
  app.get('/api/panel/eventos/:id/publico', async (req) => {
    const c = exigir(ctx, req, 'informes.ver');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { funcionId } = z.object({ funcionId: uuid.optional() }).parse(req.query);
    const e = await ctx.db.one('select id from eventos where id = $1 and organizador_id = $2', [id, c.organizadorId]);
    if (!e) throw noEncontrado('Evento');
    const agrupar = async (campo: 'isla' | 'municipio' | 'pais' | 'codigo_postal') =>
      agregarPublico(await ctx.db.query<any>(
        `select nullif(trim(p.${campo}), '') as clave, count(e.id)::int as n from pedidos p join funciones f on f.id = p.funcion_id join entradas e on e.pedido_id = p.id and e.estado in ('valida', 'usada')
          where f.evento_id = $1 and p.canal = 'web' and ($2::uuid is null or f.id = $2) group by 1`,
        [id, funcionId ?? null],
      ));
    const total = await ctx.db.one<{ n: number; pedidos: number }>(
      `select count(e.id)::int as n, count(distinct p.id)::int as pedidos from pedidos p join funciones f on f.id = p.funcion_id join entradas e on e.pedido_id = p.id and e.estado in ('valida', 'usada')
        where f.evento_id = $1 and p.canal = 'web' and ($2::uuid is null or f.id = $2)`,
      [id, funcionId ?? null],
    );
    return { total: total!.n, pedidos: total!.pedidos, isla: await agrupar('isla'), municipio: await agrupar('municipio'), pais: await agrupar('pais'), codigoPostal: await agrupar('codigo_postal'), minimoGrupo: 5 };
  });

  // ---- Devoluciones y cancelación ----
  app.post('/api/panel/pedidos/:id/devolver', async (req) => {
    const c = exigir(ctx, req, 'devoluciones.hacer');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const d = z.object({ entradas: z.array(uuid).max(50).optional(), incluirGastos: z.boolean().default(false), motivo: z.string().min(3).max(300) }).parse(req.body);
    const r = await ctx.db.tx((t) => devolverEntradas(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, pedidoId: id, ...d, ip: req.ip }));
    if (r.importe > 0) await ctx.colas.encolar('pago.devolver_pendientes', { pedidoId: id });
    await ctx.colas.encolar('webhook.saliente', { tipo: 'devolucion', pedidoId: id, importe: r.importe }).catch(() => {});
    return r;
  });

  app.post('/api/panel/funciones/:id/cancelar', async (req) => {
    const c = exigir(ctx, req, 'funciones.cancelar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { motivo, confirmacion } = z.object({ motivo: z.string().min(3).max(300), confirmacion: z.literal('CANCELAR') }).parse(req.body);
    void confirmacion;
    return cancelarFuncion(ctx, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, funcionId: id, motivo, ip: req.ip });
  });

  // ---- Invitaciones, acreditaciones y protocolo ----
  app.get('/api/panel/funciones/:id/invitaciones', async (req) => {
    const c = exigir(ctx, req, 'invitaciones.gestionar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    await funcionDe(ctx.db, c.organizadorId, id);
    const invitaciones = await ctx.db.query(
      `select p.id, p.codigo, p.comprador_nombre as nombre, p.comprador_email as email, p.notas, p.pagado_en,
              json_agg(json_build_object('codigo', e.codigo, 'descripcion', e.descripcion, 'estado', e.estado, 'tipo', e.tipo_entrada) order by e.descripcion) as entradas
         from pedidos p join entradas e on e.pedido_id = p.id where p.funcion_id = $1 and p.canal = 'invitacion' group by p.id order by p.pagado_en desc`,
      [id],
    );
    const protocolo = await ctx.db.query(`select id, butaca_codigo, nombre, nota, creado_en from bloqueos_protocolo where funcion_id = $1 and activo order by butaca_codigo`, [id]);
    return { invitaciones, protocolo };
  });

  app.post('/api/panel/funciones/:id/invitaciones', async (req) => {
    const c = exigir(ctx, req, 'invitaciones.gestionar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const d = z.object({
      nombre: z.string().min(2).max(150), email: z.string().email().max(200).nullable().optional(), tipo: z.enum(['invitacion', 'acreditacion']).default('invitacion'),
      butacas: z.array(z.string().max(60)).max(50).optional(), cantidad: z.number().int().min(1).max(50).optional(), nota: z.string().max(300).nullable().optional(), enviar: z.boolean().default(false),
    }).parse(req.body);
    return emitirInvitacion(ctx, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, funcionId: id, ip: req.ip, ...d });
  });

  app.post('/api/panel/funciones/:id/protocolo', async (req) => {
    const c = exigir(ctx, req, 'invitaciones.gestionar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const d = z.object({ butacas: z.array(z.string().max(60)).min(1).max(100), nombre: z.string().min(2).max(150), nota: z.string().max(300).nullable().optional() }).parse(req.body);
    const f = await funcionDe(ctx.db, c.organizadorId, id);
    if (f.modo_venta !== 'numerada') throw conflicto('El protocolo bloquea butacas: solo en funciones numeradas');
    const existen = new Set((f.plano_butacas as any[]).map((b) => b.codigo));
    for (const b of d.butacas) if (!existen.has(b)) throw conflicto(`La butaca ${b} no existe`);
    const reservadas = new Set(await ctx.almacen.butacasReservadas(id));
    const vendidas = await ctx.db.query<{ butaca_codigo: string }>(`select butaca_codigo from entradas where funcion_id = $1 and butaca_codigo = any($2::text[]) and estado in ('valida', 'usada')`, [id, d.butacas]);
    const ocupadas = [...vendidas.map((v) => v.butaca_codigo), ...d.butacas.filter((b) => reservadas.has(b))];
    if (ocupadas.length) throw conflicto('Alguna butaca ya está vendida o reservada', 'ocupadas', { ocupadas });
    return ctx.db.tx(async (t) => {
      for (const b of d.butacas) {
        const r = await t.one(
          `insert into bloqueos_protocolo (organizador_id, funcion_id, butaca_codigo, nombre, nota, creado_por) values ($1, $2, $3, $4, $5, $6)
           on conflict (funcion_id, butaca_codigo) where activo do nothing returning id`,
          [c.organizadorId, id, b, d.nombre, d.nota ?? null, c.usuarioId],
        );
        if (!r) throw conflicto(`La butaca ${b} ya está bloqueada por protocolo`);
      }
      await auditar(t, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'protocolo.bloquear', entidad: 'funcion', entidadId: id, datos: d, ip: req.ip });
      return { ok: true, bloqueadas: d.butacas.length };
    });
  });

  app.delete('/api/panel/protocolo/:id', async (req) => {
    const c = exigir(ctx, req, 'invitaciones.gestionar');
    const { id } = z.object({ id: uuid }).parse(req.params);
    const r = await ctx.db.one(`update bloqueos_protocolo set activo = false where id = $1 and organizador_id = $2 and activo returning funcion_id, butaca_codigo`, [id, c.organizadorId]);
    if (!r) throw noEncontrado('Bloqueo');
    await auditar(ctx.db, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'protocolo.liberar', entidad: 'funcion', entidadId: r.funcion_id, datos: { butaca: r.butaca_codigo }, ip: req.ip });
    return { ok: true };
  });

  app.post('/api/panel/entradas/:codigo/anular', async (req) => {
    const c = exigir(ctx, req, 'invitaciones.gestionar');
    const { codigo } = z.object({ codigo: z.string().regex(/^TKT-[A-Z0-9]{8}$/) }).parse(req.params);
    const { motivo } = z.object({ motivo: z.string().min(3).max(300) }).parse(req.body);
    const r = await ctx.db.one(`update entradas set estado = 'anulada', notas = coalesce(notas || ' · ', '') || $3 where codigo = $1 and organizador_id = $2 and estado = 'valida' and tipo_entrada <> 'venta' returning id, funcion_id`, [codigo, c.organizadorId, motivo]);
    if (!r) throw conflicto('Solo se pueden anular invitaciones o acreditaciones sin usar (las entradas vendidas se devuelven)');
    await auditar(ctx.db, { organizadorId: c.organizadorId, usuarioId: c.usuarioId, accion: 'entrada.anular', entidad: 'entrada', entidadId: r.id, datos: { codigo, motivo }, ip: req.ip });
    return { ok: true };
  });
}
