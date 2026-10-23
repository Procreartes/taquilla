'use client';
/**
 * Plano de butacas a escala (SVG). Accesible con teclado: una sola butaca recibe el foco
 * (tabulador) y las flechas mueven entre butacas; Intro o Espacio la selecciona.
 * Cada butaca tiene su nombre para lectores de pantalla.
 */
import { useMemo, useRef, useState } from 'react';
import { KY, PROF, describirAsiento, type Asiento, type PlanoGenerado, type Zona } from '@taquilla/dominio';

export type EstadoButaca = 'libre' | 'vendida' | 'reservada' | 'bloqueada' | 'protocolo';

interface Props {
  plano: PlanoGenerado;
  zonas: Zona[];
  modo: 'editor' | 'venta';
  titulo: string;
  estado?: (codigo: string) => EstadoButaca;
  seleccion?: string[];
  onButaca?: (a: Asiento) => void;
  /** Texto extra por butaca para el lector de pantalla (p. ej. precio). */
  extra?: (a: Asiento) => string;
}

export default function PlanoSvg({ plano, zonas, modo, titulo, estado, seleccion = [], onButaca, extra }: Props) {
  const col = useMemo(() => Object.fromEntries(zonas.map((z) => [z.codigo, z.color])), [zonas]);
  const visibles = useMemo(() => plano.asientos.filter((a) => modo === 'editor' || !a.quitada), [plano, modo]);
  const [foco, setFoco] = useState<string | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const sel = useMemo(() => new Set(seleccion), [seleccion]);
  const W = plano.lienzo.ancho, H = plano.lienzo.alto * KY, Y = (y: number) => y * KY;
  const focoActual = foco && visibles.some((a) => a.codigo === foco) ? foco : visibles[0]?.codigo;

  const mover = (desde: Asiento, dir: string) => {
    const cy = desde.y, cx = desde.x;
    let mejor: Asiento | null = null, dmin = Infinity;
    for (const a of visibles) {
      if (a.codigo === desde.codigo) continue;
      const dx = a.x - cx, dy = a.y - cy;
      const ok = dir === 'ArrowRight' ? dx > 1 && Math.abs(dy) < 1 : dir === 'ArrowLeft' ? dx < -1 && Math.abs(dy) < 1 : dir === 'ArrowDown' ? dy > 1 : dy < -1;
      if (!ok) continue;
      const d = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dx) : Math.abs(dy) * 10 + Math.abs(dx);
      if (d < dmin) {
        dmin = d;
        mejor = a;
      }
    }
    if (mejor) {
      setFoco(mejor.codigo);
      requestAnimationFrame(() => (ref.current?.querySelector(`[data-c="${CSS.escape(mejor!.codigo)}"]`) as SVGGElement | null)?.focus());
    }
  };

  const filas = useMemo(() => {
    const fl: Record<string, { y: number; x0: number; x1: number; et: string }> = {};
    plano.asientos.forEach((a) => {
      const k = a.seccion + '|' + a.fila;
      const f = fl[k] || (fl[k] = { y: a.y, x0: 1e9, x1: -1e9, et: a.fila });
      f.x0 = Math.min(f.x0, a.x);
      f.x1 = Math.max(f.x1, a.x + a.ancho);
    });
    return Object.values(fl);
  }, [plano]);

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" role="group" aria-label={`${titulo}. Usa las flechas para moverte entre butacas e Intro para elegir.`} className="plano-svg">
      <defs>
        <pattern id={`rayas-${modo}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="var(--sold)" />
          <rect width="4" height="10" fill="var(--hold)" />
        </pattern>
      </defs>
      {plano.objetos.map((ob, i) =>
        ob.tipo === 'escenario' ? (
          <g key={i} aria-hidden="true">
            <rect x={ob.x} y={Y(ob.y)} width={ob.x1 - ob.x} height={Y(ob.alto!)} rx={18} fill="var(--stage)" />
            <text x={(ob.x + ob.x1) / 2} y={Y(ob.y + ob.alto! / 2) + 14} textAnchor="middle" fontFamily="var(--f-display)" fontWeight={700} fontSize={42} letterSpacing={16} fill="var(--stage-ink)">ESCENARIO</text>
          </g>
        ) : ob.tipo === 'texto' ? (
          <text key={i} aria-hidden="true" x={(ob.x + ob.x1) / 2} y={Y(ob.y) + 18} textAnchor="middle" fontFamily="var(--f-display)" fontWeight={700} fontSize={30} letterSpacing={6} fill="var(--ink)">{ob.texto!.toUpperCase()}</text>
        ) : (
          <g key={i} aria-hidden="true">
            <rect x={ob.x} y={Y(ob.y)} width={ob.x1 - ob.x} height={Y(ob.alto!)} fill="var(--soft)" />
            <text x={(ob.x + ob.x1) / 2} y={Y(ob.y + ob.alto! / 2) + 9} textAnchor="middle" fontSize={24} letterSpacing={12} fill="var(--muted)" fontFamily="var(--f-mono)">PASILLO</text>
          </g>
        ),
      )}
      {filas.map((f, i) => (
        <g key={i} aria-hidden="true" fontSize={22} fontWeight={600} fill="var(--muted)" fontFamily="var(--f-mono)">
          <text x={f.x0 - 14} y={Y(f.y) + PROF / 2 + 8} textAnchor="end">{f.et}</text>
          <text x={f.x1 + 14} y={Y(f.y) + PROF / 2 + 8}>{f.et}</text>
        </g>
      ))}
      {visibles.map((a) => {
        const y = Y(a.y), w = a.ancho, h = PROF;
        const st = estado?.(a.codigo) ?? 'libre';
        const elegida = sel.has(a.codigo);
        let fill = col[a.zona] || '#e0007a', txt = '#ffffff', op = 1, stroke: React.SVGProps<SVGRectElement> = {};
        let deshabilitada = false;
        if (modo === 'venta') {
          if (elegida) {
            fill = 'var(--sel)';
            txt = '#131a28';
            stroke = { stroke: 'var(--ink)', strokeWidth: 4 };
          } else if (a.bloqueado || st === 'vendida' || st === 'bloqueada' || st === 'protocolo') {
            fill = 'var(--sold)';
            txt = 'transparent';
            deshabilitada = true;
          } else if (st === 'reservada') {
            fill = `url(#rayas-${modo})`;
            txt = 'transparent';
            deshabilitada = true;
          }
        } else if (a.quitada) {
          return (
            <g key={a.codigo} data-c={a.codigo} role="button" tabIndex={a.codigo === focoActual ? 0 : -1} aria-label={`${a.fila}, posición ${a.numero}, quitada`}
              onClick={() => onButaca?.(a)} onFocus={() => setFoco(a.codigo)}
              onKeyDown={(e) => tecla(e, a)}>
              <rect x={a.x} y={y} width={w} height={h} rx={12} fill="none" stroke="var(--line)" strokeWidth={3} strokeDasharray="6 5" />
            </g>
          );
        } else if (a.bloqueado) op = 0.35;
        if (a.tipo === 'acompanante' && !elegida) stroke = { stroke: 'var(--ink)', strokeWidth: 4, strokeDasharray: '7 5' };
        const etiqueta = describirAsiento(a) + (modo === 'venta' ? (deshabilitada ? ', no disponible' : elegida ? ', elegida' : '') : '') + (extra ? extra(a) : '');
        return (
          <g key={a.codigo} data-c={a.codigo} role="button" tabIndex={a.codigo === focoActual ? 0 : -1} aria-label={etiqueta}
            aria-disabled={deshabilitada || undefined} aria-pressed={modo === 'venta' ? elegida : undefined}
            style={{ cursor: deshabilitada ? 'not-allowed' : 'pointer' }}
            onClick={() => !deshabilitada && onButaca?.(a)} onFocus={() => setFoco(a.codigo)} onKeyDown={(e) => tecla(e, a, deshabilitada)}>
            <title>{etiqueta}</title>
            <rect x={a.x} y={y} width={w} height={h} rx={a.tipo === 'silla_ruedas' ? 8 : 12} fill={fill} fillOpacity={op} {...stroke} />
            {a.tipo === 'silla_ruedas' ? (
              <text x={a.x + w / 2} y={y + h / 2 + 9} textAnchor="middle" fontSize={24} fontWeight={800} fill={txt} fontFamily="var(--f-body)" aria-hidden="true">PMR</text>
            ) : (
              <text x={a.x + w / 2} y={y + h / 2 + 7} textAnchor="middle" fontSize={19} fontWeight={600} fill={txt} fontFamily="var(--f-mono)" aria-hidden="true">{a.numero}</text>
            )}
            {a.tipo === 'visibilidad_reducida' && <circle cx={a.x + w - 6} cy={y + 6} r={7} fill="var(--hold)" />}
          </g>
        );
      })}
    </svg>
  );

  function tecla(e: React.KeyboardEvent, a: Asiento, deshabilitada = false) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!deshabilitada) onButaca?.(a);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      mover(a, e.key);
    }
  }
}
