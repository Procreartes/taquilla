#!/usr/bin/env node
/**
 * Prueba de carga de Taquilla (sin dependencias).
 *
 *   node scripts/carga/prueba-carga.mjs [--api http://localhost:4000] [--cola 5000] [--compras 200] [--minutos 1]
 *
 * 1. Cola virtual: N personas entran a la vez en la sala de espera de una función de prueba.
 * 2. Compras: R compras por minuto (reserva + datos + pago simulado) durante M minutos.
 * 3. Comprobación: ninguna butaca vendida dos veces.
 *
 * Necesita el modo demostración (pasarela simulada y usuarios de prueba) y límites de peticiones altos,
 * porque todo sale de la misma IP:
 *   LIMITE_COMPRA_POR_MINUTO=100000 LIMITE_GLOBAL_POR_MINUTO=1000000 npm run demo
 */
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const API = arg('api', 'http://localhost:4000');
const N_COLA = Number(arg('cola', 5000));
const COMPRAS_MIN = Number(arg('compras', 200));
const MINUTOS = Number(arg('minutos', 1));
const CONCURRENCIA = Number(arg('concurrencia', 200));

const percentil = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);
async function pedir(metodo, ruta, cuerpo, cookie) {
  const t0 = performance.now();
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { ...(cuerpo ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const ms = performance.now() - t0;
  let datos = null;
  try { datos = await r.json(); } catch {}
  return { estado: r.status, datos, ms, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
async function enLotes(n, conc, fn) {
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => { while (i < n) { const k = i++; res[k] = await fn(k); } }));
  return res;
}

const salud = await pedir('GET', '/api/salud');
if (!salud.datos?.modoDemo) {
  console.error('La prueba de carga solo se ejecuta contra el modo demostración (pasarela simulada).');
  process.exit(1);
}
const admin = await pedir('POST', '/api/auth/demo', { email: 'produccion@taquilla.test' });
const cookie = admin.cookie;
const evento = await pedir('GET', '/api/publico/eventos/asombra-2026');
const fPDR = evento.datos.funciones.find((f) => f.es_prueba && f.modo_venta === 'numerada' && f.recinto_nombre.includes('Auditorio'));
const fAnt = evento.datos.funciones.find((f) => f.es_prueba && f.modo_venta === 'numerada' && f.recinto_nombre.includes('Antigua'));
console.log(`API: ${API} · base de datos: ${salud.datos.db}\n`);

// ---------------------------------------------------------------- 1. Cola virtual
await pedir('PATCH', `/api/funciones/${fAnt.id}`, { cola_virtual: true, cola_apertura: new Date(Date.now() - 1000).toISOString(), cola_ritmo: 300 }, cookie);
const t0 = performance.now();
const cola = await enLotes(N_COLA, CONCURRENCIA, () => pedir('POST', `/api/publico/cola/${fAnt.id}/entrar`, {}));
const tCola = (performance.now() - t0) / 1000;
const okCola = cola.filter((r) => r.estado === 200 && r.datos?.turno);
const numeros = new Set(okCola.map((r) => r.datos.turno.split('.')[0]));
const conPase = okCola.filter((r) => r.datos.pase).length;
console.log(`1) Cola virtual: ${N_COLA} personas en ${tCola.toFixed(1)} s`);
console.log(`   correctas ${okCola.length} · errores ${N_COLA - okCola.length} · números únicos ${numeros.size} · con pase inmediato ${conPase}`);
console.log(`   latencia p50 ${percentil(cola.map((r) => r.ms), 50).toFixed(0)} ms · p95 ${percentil(cola.map((r) => r.ms), 95).toFixed(0)} ms`);
// consulta de estado de una muestra
const muestra = okCola.slice(-200);
const estados = await enLotes(muestra.length, 50, (i) => pedir('GET', `/api/publico/cola/${fAnt.id}/estado?turno=${encodeURIComponent(muestra[i].datos.turno)}`));
console.log(`   consultas de turno: ${estados.filter((r) => r.estado === 200).length}/${muestra.length} correctas · p95 ${percentil(estados.map((r) => r.ms), 95).toFixed(0)} ms`);
await pedir('PATCH', `/api/funciones/${fAnt.id}`, { cola_virtual: false }, cookie);

// ---------------------------------------------------------------- 2. Compras
const datos = { nombre: 'Carga de prueba', email: 'carga@ejemplo.test', idioma: 'es', isla: 'Fuerteventura', consentimientos: { condiciones: true, privacidad: true } };
const total = COMPRAS_MIN * MINUTOS;
const intervalo = 60_000 / COMPRAS_MIN;
const resultados = [];
let reintentos = 0;
async function compra() {
  const t = performance.now();
  for (let intento = 0; intento < 5; intento++) {
    const r = await pedir('POST', '/api/publico/reservas', { funcionId: fPDR.id, mejorSitio: { cantidad: 1 } });
    if (r.estado === 409 && r.datos?.error === 'ocupadas') { reintentos++; continue; }
    if (r.estado !== 200) return { ok: false, paso: 'reserva', estado: r.estado, error: r.datos?.error, ms: performance.now() - t };
    const p = await pedir('POST', `/api/publico/pedidos/${r.datos.token}/pagar`, datos);
    if (p.estado !== 200) return { ok: false, paso: 'pagar', estado: p.estado, ms: performance.now() - t };
    const sesion = String(p.datos.url).split('?')[0].split('/').pop();
    const s = await pedir('POST', `/api/pagos/simulado/${sesion}/pagar`, { tarjeta: '4242424242424242' });
    if (s.estado !== 200) return { ok: false, paso: 'pago', estado: s.estado, ms: performance.now() - t };
    return { ok: true, butaca: r.datos.lineas[0].butaca_codigo, ms: performance.now() - t };
  }
  return { ok: false, paso: 'reserva', estado: 409, error: 'sin_butaca_tras_reintentos', ms: performance.now() - t };
}
const inicio = performance.now();
const enCurso = [];
for (let i = 0; i < total; i++) {
  const espera = inicio + i * intervalo - performance.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  enCurso.push(compra().then((r) => resultados.push(r)));
}
await Promise.all(enCurso);
const dur = (performance.now() - inicio) / 1000;
const ok = resultados.filter((r) => r.ok);
const fallos = resultados.filter((r) => !r.ok);
console.log(`\n2) Compras: ${total} en ${dur.toFixed(1)} s (${((ok.length / dur) * 60).toFixed(0)} compras/minuto completadas)`);
console.log(`   correctas ${ok.length} · fallidas ${fallos.length} · reintentos por butaca ocupada ${reintentos}`);
if (fallos.length) console.log('   fallos:', Object.entries(fallos.reduce((a, f) => ((a[`${f.paso} ${f.estado} ${f.error ?? ''}`] = (a[`${f.paso} ${f.estado} ${f.error ?? ''}`] ?? 0) + 1), a), {})));
console.log(`   tiempo de compra completa p50 ${percentil(ok.map((r) => r.ms), 50).toFixed(0)} ms · p95 ${percentil(ok.map((r) => r.ms), 95).toFixed(0)} ms`);

// ---------------------------------------------------------------- 3. Sin sobreventa
const vendidasCompra = ok.map((r) => r.butaca);
const duplicadas = vendidasCompra.length - new Set(vendidasCompra).size;
const disp = await pedir('GET', `/api/publico/funciones/${fPDR.id}/disponibilidad`);
const vendidasServidor = disp.datos.vendidas;
console.log(`\n3) Sobreventa: butacas repetidas entre compras correctas = ${duplicadas} · vendidas según el servidor ${vendidasServidor.length} (únicas ${new Set(vendidasServidor).size})`);
const bien = duplicadas === 0 && new Set(vendidasServidor).size === vendidasServidor.length && fallos.length === 0 && okCola.length === N_COLA && numeros.size === N_COLA;
console.log(bien ? '\nRESULTADO: OK' : '\nRESULTADO: revisar');
process.exit(bien ? 0 : 1);
