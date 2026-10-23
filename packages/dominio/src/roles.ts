/**
 * Roles del equipo de un organizador y qué puede hacer cada uno.
 * Un usuario tiene un rol por organizador (tabla membresias).
 */
export const ROLES = ['admin', 'produccion', 'taquilla', 'puerta', 'contabilidad', 'lectura'] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administración',
  produccion: 'Producción',
  taquilla: 'Taquilla',
  puerta: 'Puerta',
  contabilidad: 'Contabilidad',
  lectura: 'Solo lectura',
};

export const PERMISOS = [
  'organizador.editar',
  'equipo.gestionar',
  'recintos.ver',
  'recintos.editar',
  'eventos.ver',
  'eventos.editar',
  'precios.editar',
  'venta.taquilla',
  'pedidos.ver',
  'devoluciones.hacer',
  'funciones.cancelar',
  'invitaciones.gestionar',
  'puerta.validar',
  'informes.ver',
  'liquidacion.ver',
  'auditoria.ver',
  'correos.ver',
] as const;
export type Permiso = (typeof PERMISOS)[number];

const TODOS = [...PERMISOS];
const LECTURA: Permiso[] = ['recintos.ver', 'eventos.ver', 'pedidos.ver', 'informes.ver'];

export const PERMISOS_POR_ROL: Record<Rol, readonly Permiso[]> = {
  admin: TODOS,
  produccion: [...LECTURA, 'recintos.editar', 'eventos.editar', 'precios.editar', 'invitaciones.gestionar', 'puerta.validar', 'correos.ver'],
  taquilla: [...LECTURA, 'venta.taquilla', 'invitaciones.gestionar', 'correos.ver'],
  puerta: ['eventos.ver', 'puerta.validar'],
  contabilidad: [...LECTURA, 'devoluciones.hacer', 'liquidacion.ver', 'auditoria.ver'],
  lectura: LECTURA,
};

export function puede(rol: Rol | null | undefined, permiso: Permiso): boolean {
  if (!rol) return false;
  return PERMISOS_POR_ROL[rol]?.includes(permiso) ?? false;
}

export function esRol(v: unknown): v is Rol {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}
