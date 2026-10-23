/**
 * Datos de partida. Se puede ejecutar varias veces: no duplica nada.
 * Todo lo que crea está marcado como de prueba (es_prueba = true).
 */
import type { Config } from '../config';
import type { Db } from '../db';
import { hashClave, tokenAleatorio } from '../infra/cripto';

export const ORG_ASOMBRA = 'asombra-coproduccion';
export const ORG_AISLAMIENTO = 'teatro-de-prueba';

export const USUARIOS_PRUEBA = [
  { email: 'admin@taquilla.test', nombre: 'Administración de plataforma (prueba)', superadmin: true, rol: null },
  { email: 'produccion@taquilla.test', nombre: 'Producción ASOMBRA (prueba)', rol: 'produccion' },
  { email: 'taquilla@taquilla.test', nombre: 'Taquilla ASOMBRA (prueba)', rol: 'taquilla' },
  { email: 'puerta@taquilla.test', nombre: 'Puerta ASOMBRA (prueba)', rol: 'puerta' },
  { email: 'contabilidad@taquilla.test', nombre: 'Contabilidad ASOMBRA (prueba)', rol: 'contabilidad' },
  { email: 'lectura@taquilla.test', nombre: 'Solo lectura ASOMBRA (prueba)', rol: 'lectura' },
  { email: 'gerencia@asombra.test', nombre: 'Gerencia ASOMBRA (prueba)', rol: 'admin' },
  { email: 'teatro@ejemplo.test', nombre: 'Teatro de prueba · administración', rol: 'admin', org: ORG_AISLAMIENTO },
] as const;

export async function sembrarBase(db: Db, config: Pick<Config, 'CLAVE_USUARIOS_PRUEBA'>) {
  const asombra = await asegurarOrganizador(db, {
    slug: ORG_ASOMBRA,
    nombre: 'ASOMBRA (coproducción Grupo Livon · Héctor Sansegundo)',
    razon_social: 'Pendiente: entidad que venderá ASOMBRA (organizador de prueba)',
    color_primario: '#2469b0',
    color_secundario: '#111116',
  });
  const teatro = await asegurarOrganizador(db, {
    slug: ORG_AISLAMIENTO,
    nombre: 'Teatro de prueba (para comprobar que los datos no se mezclan)',
    razon_social: 'Organizador ficticio',
    color_primario: '#0f8a6c',
    color_secundario: '#131a28',
  });
  const orgs: Record<string, string> = { [ORG_ASOMBRA]: asombra, [ORG_AISLAMIENTO]: teatro };

  // Sin CLAVE_USUARIOS_PRUEBA se genera una aleatoria (en modo demo se entra con el botón «Entrar como…»).
  const clave = config.CLAVE_USUARIOS_PRUEBA || tokenAleatorio(18);
  const huella = await hashClave(clave);
  for (const u of USUARIOS_PRUEBA) {
    const fila = await db.one<{ id: string }>(
      `insert into usuarios (email, nombre, hash_clave, superadmin, es_prueba)
       values ($1, $2, $3, $4, true)
       on conflict (email) do update set nombre = excluded.nombre, hash_clave = excluded.hash_clave
       returning id`,
      [u.email, u.nombre, huella, 'superadmin' in u && u.superadmin],
    );
    if (u.rol) {
      const org = orgs['org' in u ? u.org : ORG_ASOMBRA];
      await db.query(
        `insert into membresias (usuario_id, organizador_id, rol) values ($1, $2, $3)
         on conflict (usuario_id, organizador_id) do update set rol = excluded.rol`,
        [fila!.id, org, u.rol],
      );
    }
  }
  return { asombra, teatro };
}

async function asegurarOrganizador(db: Db, o: { slug: string; nombre: string; razon_social: string; color_primario: string; color_secundario: string }) {
  const r = await db.one<{ id: string }>(
    `insert into organizadores (slug, nombre, razon_social, color_primario, color_secundario, es_prueba)
     values ($1, $2, $3, $4, $5, true)
     on conflict (slug) do update set nombre = excluded.nombre
     returning id`,
    [o.slug, o.nombre, o.razon_social, o.color_primario, o.color_secundario],
  );
  return r!.id;
}

export async function sembrar(db: Db, config: Config) {
  const base = await sembrarBase(db, config);
  return base;
}
