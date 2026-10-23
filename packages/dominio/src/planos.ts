/**
 * Planos de butacas · formato «plano-taquilla/1».
 *
 * `plano` es la receta (zonas, bloques de filas, numeración, pasillos, PMR, butacas quitadas,
 * excepciones y ajustes a mano) y `butacas` el resultado ya calculado, con coordenadas en cm.
 * La lógica de `generar` y `comprobar` está portada del prototipo validado
 * (referencia/prototipo-taquilla.html) y debe dar exactamente el mismo resultado.
 */

export const FORMATO_PLANO = 'plano-taquilla/1';

export type Numeracion = 'derecha' | 'izquierda' | 'pares_impares';
export type TipoButaca = 'normal' | 'silla_ruedas' | 'acompanante' | 'visibilidad_reducida';

export interface Zona {
  codigo: string;
  nombre: string;
  color: string;
  /** Precio orientativo en euros (el precio real se fija por función). */
  precio?: number;
}

export interface Tramo { desde: number | string; hasta: number | string; zona: string }
export interface Excepcion { fila: number | string; butacas: number | string }
export interface Quitar { fila: number | string; butacas: string }
export interface Pmr { fila: number | string; sustituye: string; cantidad: number | string }

export interface Bloque {
  id: string;
  nombre: string;
  codigo: string;
  desde: number | string;
  hasta: number | string;
  prefijo: string;
  butacas: number | string;
  numeracion: Numeracion;
  imparesA?: 'derecha' | 'izquierda';
  /** Ancho del pasillo central en cm (0 = sin pasillo). */
  pasilloCentral?: number | string;
  /** Filas detrás de las cuales hay pasillo transversal, p. ej. "7, 16". */
  pasillos?: string;
  tramos?: Tramo[];
  excepciones?: Excepcion[];
  quitar?: Quitar[];
  pmr?: Pmr[];
}

export interface Ajuste {
  zona?: string;
  tipo?: TipoButaca;
  bloqueado?: boolean;
  quitada?: boolean;
}

export interface RecetaPlano {
  id: string;
  nombre: string;
  recinto?: string;
  fuente?: string;
  notas?: string;
  aforo?: { butacas: number; pmr: number };
  zonas: Zona[];
  bloques: Bloque[];
  ajustes?: Record<string, Ajuste>;
}

export interface Asiento {
  codigo: string;
  seccion: string;
  bloque: string;
  fila: string;
  numero: string;
  zona: string;
  tipo: TipoButaca;
  bloqueado: boolean;
  quitada: boolean;
  x: number;
  y: number;
  ancho: number;
}

export interface ObjetoPlano {
  tipo: 'escenario' | 'pasillo' | 'texto';
  x: number;
  x1: number;
  y: number;
  alto?: number;
  texto?: string;
  sec?: string;
}

export interface PlanoGenerado {
  asientos: Asiento[];
  filas: { seccion: string; etiqueta: string; y: number }[];
  objetos: ObjetoPlano[];
  lienzo: { ancho: number; alto: number };
  avisosGen: string[];
}

/** Butaca tal como se guarda en el formato plano-taquilla/1. */
export interface ButacaExportada {
  codigo: string;
  seccion: string;
  fila: string;
  numero: string;
  zona: string;
  tipo: TipoButaca;
  bloqueado: boolean;
  x: number;
  y: number;
  ancho: number;
}

export interface DocumentoPlano {
  formato: typeof FORMATO_PLANO;
  comprobacion?: { butacas: number; pmr: number; ok: boolean; avisos?: string[] };
  plano: RecetaPlano;
  butacas: ButacaExportada[];
}

// Constantes de dibujo del prototipo (cm)
export const KY = 0.62;
export const PROF = 52;
export const MARGEN = 100;

/** Extrae los números de un texto: "2, 4 y 6" → [2, 4, 6]. */
export const numeros = (s: unknown): number[] => String(s ?? '').split(/[^0-9]+/).filter(Boolean).map(Number);

/**
 * Número de la butaca en la posición p (0 = la más a la izquierda del espectador) de una fila de n.
 * - derecha: 1 en el extremo derecho
 * - izquierda: 1 en el extremo izquierdo
 * - pares_impares: desde el centro; impares a un lado y pares al otro
 */
export function numeroEn(p: number, n: number, b: Pick<Bloque, 'numeracion' | 'imparesA'>): number {
  if (b.numeracion === 'derecha') return n - p;
  if (b.numeracion === 'izquierda') return p + 1;
  const der = Math.floor(n / 2), izq = n - der, impD = b.imparesA !== 'izquierda';
  if (p >= izq) {
    const k = p - izq;
    return impD ? 2 * k + 1 : 2 * k + 2;
  }
  const k = izq - 1 - p;
  return impD ? 2 * k + 2 : 2 * k + 1;
}

/** Números de una fila de n butacas, de izquierda a derecha del espectador. */
export const numeracionFila = (n: number, b: Pick<Bloque, 'numeracion' | 'imparesA'>) =>
  Array.from({ length: n }, (_, p) => numeroEn(p, n, b));

export function generar(spec: RecetaPlano): PlanoGenerado {
  const PX = 52, PY = 90, PAS = 120, SEP = 250, ESC = 300;
  const asientos: Asiento[] = [], filas: PlanoGenerado['filas'] = [], objetos: ObjetoPlano[] = [], avisosGen: string[] = [];
  let yCursor = MARGEN + ESC + SEP;
  const multi = spec.bloques.length > 1, etiquetas: ObjetoPlano[] = [];
  for (const b of spec.bloques) {
    const desde = +b.desde, hasta = +b.hasta, n0 = +b.butacas;
    if (!(desde >= 1 && hasta >= desde && n0 >= 1)) {
      avisosGen.push(`El bloque «${b.nombre}» tiene filas o butacas mal indicadas`);
      continue;
    }
    if (multi) yCursor += 70;
    const pas = numeros(b.pasillos), exc = b.excepciones || [];
    const maxN = Math.max(n0, ...exc.map((e) => +e.butacas || 0));
    const pref = b.prefijo ?? '', comp = pref.replace(/[^A-Za-z0-9]/g, '');
    const sec = (b.codigo || b.nombre || 'S').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'S';
    const yC = yCursor;
    const yF = (r: number) => yC + (r - desde) * PY + pas.filter((f) => f < r && f >= desde).length * PAS;
    const bAs: Asiento[] = [];
    for (let r = desde; r <= hasta; r++) {
      const fila = `${pref}${r}`, y = yF(r);
      filas.push({ seccion: sec, etiqueta: fila, y });
      const n = +(exc.find((e) => +e.fila === r)?.butacas ?? 0) || n0;
      const des = ((maxN - n) * PX) / 2, gap = +(b.pasilloCentral || 0);
      const zona = (b.tramos || []).find((t) => r >= +t.desde && r <= +t.hasta)?.zona || '';
      const pm = (b.pmr || []).filter((e) => +e.fila === r), sus = new Set(pm.flatMap((e) => numeros(e.sustituye)));
      const qt = new Set((b.quitar || []).filter((q) => +q.fila === r).flatMap((q) => numeros(q.butacas)));
      const xDe = (p: number) => des + p * PX + (gap && p >= n - Math.floor(n / 2) ? gap : 0);
      const pos = new Map<number, number>();
      for (let p = 0; p < n; p++) {
        const num = numeroEn(p, n, b);
        pos.set(num, p);
        if (sus.has(num) || qt.has(num)) continue;
        bAs.push({ codigo: `${sec}-${comp}${r}-${num}`, seccion: sec, bloque: b.nombre, fila, numero: String(num), zona, tipo: 'normal', bloqueado: false, quitada: false, x: xDe(p), y, ancho: PX * 0.85 });
      }
      let c = 0;
      for (const e of pm) {
        const ps = numeros(e.sustituye).map((v) => pos.get(v)).filter((v): v is number => v !== undefined);
        const k = Math.max(1, +e.cantidad || 1);
        if (!ps.length) {
          avisosGen.push(`En ${fila} no existen las butacas ${e.sustituye} para los espacios PMR`);
          continue;
        }
        const x0 = xDe(Math.min(...ps)), x1 = xDe(Math.max(...ps)) + PX, h = (x1 - x0) / k;
        for (let i = 0; i < k; i++) {
          c++;
          bAs.push({ codigo: `${sec}-${comp}${r}-PMR${c}`, seccion: sec, bloque: b.nombre, fila, numero: `PMR ${c}`, zona, tipo: 'silla_ruedas', bloqueado: false, quitada: false, x: x0 + i * h, y, ancho: h - PX * 0.15 });
        }
      }
    }
    if (bAs.length) {
      const xa = Math.min(...bAs.map((a) => a.x)), xb = Math.max(...bAs.map((a) => a.x + a.ancho));
      for (const f of pas) {
        if (f < desde || f >= hasta) continue;
        const y = yF(f) + PY * 0.7;
        objetos.push({ tipo: 'pasillo', x: xa, x1: xb, y, alto: yF(f + 1) - y - PY * 0.1, sec });
      }
      if (multi) etiquetas.push({ tipo: 'texto', x: xa, x1: xb, y: yCursor - 62, texto: b.nombre, sec });
    }
    asientos.push(...bAs);
    yCursor = yF(hasta) + PY + PAS * 1.6;
  }
  objetos.push(...etiquetas);
  // Centrar cada sección respecto a la más ancha
  const porSec: Record<string, { x0: number; x1: number }> = {};
  asientos.forEach((a) => {
    const s = porSec[a.seccion] || (porSec[a.seccion] = { x0: 1e9, x1: -1e9 });
    s.x0 = Math.min(s.x0, a.x);
    s.x1 = Math.max(s.x1, a.x + a.ancho);
  });
  const anchoMax = Math.max(0, ...Object.values(porSec).map((s) => s.x1 - s.x0));
  for (const [k, s] of Object.entries(porSec)) {
    const dx = MARGEN + (anchoMax - (s.x1 - s.x0)) / 2 - s.x0;
    asientos.filter((a) => a.seccion === k).forEach((a) => (a.x += dx));
    objetos.filter((o) => o.sec === k).forEach((o) => {
      o.x += dx;
      o.x1 += dx;
    });
  }
  objetos.unshift({ tipo: 'escenario', x: MARGEN + anchoMax * 0.1, x1: MARGEN + anchoMax * 0.9, y: MARGEN, alto: ESC });
  const aj = spec.ajustes || {};
  for (const a of asientos) {
    const j = aj[a.codigo];
    if (!j) continue;
    if (j.zona) a.zona = j.zona;
    if (j.tipo && a.tipo !== 'silla_ruedas') a.tipo = j.tipo;
    if (j.bloqueado) a.bloqueado = true;
    if (j.quitada) a.quitada = true;
  }
  const alto = (asientos.length ? Math.max(...asientos.map((a) => a.y)) : MARGEN + ESC + SEP) + PROF / KY + MARGEN;
  return { asientos, filas, objetos, lienzo: { ancho: anchoMax + 2 * MARGEN, alto }, avisosGen };
}

export interface Comprobacion {
  /** true si el plano se puede poner a la venta. */
  ok: boolean;
  /** Errores que impiden vender. */
  err: string[];
  /** Avisos que no impiden vender. */
  av: string[];
  /** Butacas normales (sin PMR). */
  but: number;
  /** Espacios para silla de ruedas. */
  pmr: number;
  /** Bloqueos técnicos. */
  bl: number;
  /** Plazas que salen a la venta. */
  vend: number;
}

export function comprobar(spec: RecetaPlano, g: PlanoGenerado = generar(spec)): Comprobacion {
  const err = [...g.avisosGen], av: string[] = [];
  const vivos = g.asientos.filter((a) => !a.quitada);
  const pmr = vivos.filter((a) => a.tipo === 'silla_ruedas').length, but = vivos.length - pmr;
  const cods = new Map<string, number>();
  vivos.forEach((a) => cods.set(a.codigo, (cods.get(a.codigo) || 0) + 1));
  const dup = [...cods].filter(([, n]) => n > 1).map(([c]) => c);
  if (dup.length) err.push(`Hay butacas repetidas (${dup.slice(0, 4).join(', ')}): revisa que dos bloques no usen el mismo código interno`);
  const zs = new Set(spec.zonas.map((z) => z.codigo));
  const sin = vivos.filter((a) => !zs.has(a.zona));
  if (sin.length) err.push(`${sin.length} butacas sin zona de precio (por ejemplo ${sin.slice(0, 3).map((a) => a.fila + ' · ' + a.numero).join(', ')}). Revisa los tramos de filas de cada bloque.`);
  const usadas = new Set(vivos.map((a) => a.zona));
  spec.zonas.forEach((z) => {
    if (!usadas.has(z.codigo)) av.push(`La zona «${z.nombre}» no tiene butacas asignadas`);
  });
  if (spec.aforo && (+spec.aforo.butacas || +spec.aforo.pmr)) {
    if (but !== +spec.aforo.butacas) {
      const d = but - spec.aforo.butacas;
      err.push(`El plano oficial dice ${spec.aforo.butacas} butacas y aquí salen ${but} (diferencia ${d > 0 ? '+' : ''}${d})`);
    }
    if (pmr !== +spec.aforo.pmr) err.push(`El plano oficial dice ${spec.aforo.pmr} espacios PMR y aquí salen ${pmr}`);
  } else av.push('Indica el aforo del plano oficial para poder comprobar que coincide');
  if (!pmr && vivos.length) av.push('El plano no tiene espacios para silla de ruedas');
  const filasPmr = new Set(vivos.filter((a) => a.tipo === 'silla_ruedas').map((a) => a.seccion + a.fila));
  for (const f of filasPmr) {
    if (!vivos.some((a) => a.tipo === 'acompanante' && a.seccion + a.fila === f)) {
      av.push('Hay espacios PMR sin butaca de acompañante marcada en su fila (márcala con la herramienta «Acompañante»)');
      break;
    }
  }
  const bl = vivos.filter((a) => a.bloqueado).length;
  if (bl) av.push(`${bl} butacas con bloqueo técnico no saldrán a la venta`);
  const q = g.asientos.length - vivos.length;
  if (q) av.push(`${q} posiciones quitadas a mano (columnas, puertas, etc.)`);
  return { ok: !err.length, err, av, but, pmr, bl, vend: vivos.length - bl };
}

/** Butacas en formato de exportación (sin las quitadas, coordenadas redondeadas). */
export function butacasExportadas(g: PlanoGenerado): ButacaExportada[] {
  return g.asientos
    .filter((a) => !a.quitada)
    .map(({ codigo, seccion, fila, numero, zona, tipo, bloqueado, x, y, ancho }) => ({
      codigo, seccion, fila, numero, zona, tipo, bloqueado, x: Math.round(x), y: Math.round(y), ancho: Math.round(ancho),
    }));
}

export function exportarPlano(spec: RecetaPlano): DocumentoPlano {
  const g = generar(spec), c = comprobar(spec, g);
  return {
    formato: FORMATO_PLANO,
    comprobacion: { butacas: c.but, pmr: c.pmr, ok: c.ok, avisos: [...c.err, ...c.av] },
    plano: spec,
    butacas: butacasExportadas(g),
  };
}

/**
 * Compara las butacas que trae un documento importado con las que sale de su receta.
 * Devuelve la lista de diferencias (vacía si cuadra).
 */
export function diferenciasImportacion(doc: DocumentoPlano): string[] {
  if (!doc.butacas?.length) return [];
  const calc = new Map(butacasExportadas(generar(doc.plano)).map((b) => [b.codigo, b]));
  const dif: string[] = [];
  const traidas = new Set<string>();
  for (const b of doc.butacas) {
    traidas.add(b.codigo);
    const c = calc.get(b.codigo);
    if (!c) dif.push(`La butaca ${b.codigo} viene en el fichero pero no sale de la receta`);
    else if (c.zona !== b.zona || c.tipo !== b.tipo || c.bloqueado !== b.bloqueado) dif.push(`La butaca ${b.codigo} tiene otra zona, tipo o bloqueo en el fichero`);
  }
  for (const c of calc.keys()) if (!traidas.has(c)) dif.push(`La butaca ${c} sale de la receta pero no viene en el fichero`);
  return dif;
}

/** Plano vacío para empezar uno nuevo. */
export function planoNuevo(nombre = 'Aforo completo', recinto = ''): RecetaPlano {
  return {
    id: 'p' + Math.random().toString(36).slice(2, 8),
    nombre,
    recinto,
    fuente: '',
    aforo: { butacas: 0, pmr: 0 },
    zonas: [{ codigo: 'general', nombre: 'General', color: '#1b78b5', precio: 15 }],
    bloques: [
      { id: 'b1', nombre: 'Patio de butacas', codigo: 'PLATEA', desde: 1, hasta: 10, prefijo: 'F-', butacas: 16, numeracion: 'derecha', imparesA: 'derecha', pasilloCentral: 0, pasillos: '', tramos: [{ desde: 1, hasta: 10, zona: 'general' }], excepciones: [], quitar: [], pmr: [] },
    ],
    ajustes: {},
  };
}

/** Nombre legible de una butaca para pantallas y lectores de pantalla. */
export function describirAsiento(a: Pick<Asiento, 'fila' | 'numero' | 'tipo' | 'bloqueado'>) {
  const tipo = a.tipo === 'silla_ruedas' ? ', espacio para silla de ruedas' : a.tipo === 'acompanante' ? ', acompañante' : a.tipo === 'visibilidad_reducida' ? ', visibilidad reducida' : '';
  return `Fila ${a.fila}, ${a.tipo === 'silla_ruedas' ? a.numero : 'butaca ' + a.numero}${tipo}${a.bloqueado ? ', bloqueo técnico' : ''}`;
}
