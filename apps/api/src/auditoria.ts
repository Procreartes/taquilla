import type { Consultor } from './db';

export interface EntradaAuditoria {
  organizadorId?: string | null;
  usuarioId?: string | null;
  accion: string;
  entidad?: string;
  entidadId?: string;
  datos?: Record<string, unknown>;
  ip?: string;
}

/** Deja constancia de una acción sensible (precios, devoluciones, invitaciones, anulaciones, permisos…). */
export async function auditar(c: Consultor, e: EntradaAuditoria) {
  await c.query(
    `insert into auditoria (organizador_id, usuario_id, accion, entidad, entidad_id, datos, ip)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [e.organizadorId ?? null, e.usuarioId ?? null, e.accion, e.entidad ?? null, e.entidadId ?? null, JSON.stringify(e.datos ?? {}), e.ip ?? null],
  );
}
