/**
 * Datos de partida. Se puede ejecutar varias veces: no duplica nada.
 * Todo lo que crea está marcado como de prueba (es_prueba = true).
 */
import type { Config } from '../config';
import type { Db } from '../db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocumentoPlano } from '@taquilla/dominio';
import { hashClave, tokenAleatorio } from '../infra/cripto';
import { crearVersion } from '../modulos/planos';
import { importarProgramacion, ponerALaVenta } from '../modulos/eventos';

export const CARPETA_DATOS = join(import.meta.dirname, '..', '..', '..', '..', 'datos');
export const leerDatos = <T = any>(ruta: string): T => JSON.parse(readFileSync(join(CARPETA_DATOS, ruta), 'utf8'));

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

/** Recintos con plano oficial (Cabildo de Fuerteventura) para el organizador de ASOMBRA. */
export async function sembrarPlanos(db: Db, organizadorId: string) {
  const recintos = [
    { codigo: 'auditorio-pdr', nombre: 'Auditorio Insular', municipio: 'Puerto del Rosario', isla: 'fuerteventura', fichero: 'puerto-del-rosario.json' },
    { codigo: 'antigua', nombre: 'Centro Cultural Polivalente de Antigua', municipio: 'Antigua', isla: 'fuerteventura', fichero: 'antigua.json' },
  ];
  const ids: Record<string, { recinto: string; version: string }> = {};
  for (const r of recintos) {
    const fila = await db.one<{ id: string }>(
      `insert into recintos (organizador_id, codigo, nombre, municipio, isla) values ($1, $2, $3, $4, $5)
       on conflict (organizador_id, codigo) do update set nombre = excluded.nombre returning id`,
      [organizadorId, r.codigo, r.nombre, r.municipio, r.isla],
    );
    let v = await db.one<{ id: string }>(
      `select v.id from versiones_plano v join planos p on p.id = v.plano_id where p.recinto_id = $1 order by v.numero limit 1`,
      [fila!.id],
    );
    if (!v) {
      const doc = leerDatos<DocumentoPlano>(join('planos', r.fichero));
      v = await db.tx(async (t) => {
        const p = await t.one<{ id: string }>('insert into planos (organizador_id, recinto_id, nombre) values ($1, $2, $3) returning id', [organizadorId, fila!.id, doc.plano.nombre]);
        return (await crearVersion(t, organizadorId, p!.id, doc.plano, null)) as { id: string };
      });
    }
    ids[r.codigo] = { recinto: fila!.id, version: v!.id };
  }
  return ids;
}

export const EVENTO_ASOMBRA = 'asombra-2026';

/**
 * Festival ASOMBRA 2026 con su programación real (la venta oficial sigue en Entradas Canarias)
 * y tres funciones de PRUEBA, claramente marcadas, para poder probar la compra.
 */
export async function sembrarFestival(db: Db, organizadorId: string, planos: Awaited<ReturnType<typeof sembrarPlanos>>) {
  const r = await db.tx((t) =>
    importarProgramacion(t, organizadorId, leerDatos('programacion-asombra-2026.json'), {
      slug: EVENTO_ASOMBRA,
      nombre: 'ASOMBRA 2026 · Festival Internacional de Magia de Canarias',
      socios: [{ nombre: 'Grupo Livon', porcentaje: 50 }, { nombre: 'Héctor Sansegundo', porcentaje: 50 }],
    }),
  );
  const sala = await db.one<{ id: string }>(
    `insert into recintos (organizador_id, codigo, nombre, municipio, isla) values ($1, 'sala-prueba', 'Sala de prueba (aforo general)', 'Puerto del Rosario', 'fuerteventura')
     on conflict (organizador_id, codigo) do update set nombre = excluded.nombre returning id`,
    [organizadorId],
  );
  const pruebas = [
    { codigo: 't01', titulo: 'Prueba técnica de venta · Antigua', fecha: '2026-11-27', hora: '20:30', recinto: planos.antigua.recinto, modo: 'numerada', version: planos.antigua.version, aforo: null, precios: { preferente: 2200, central: 1800, fondo: 1400 } },
    { codigo: 't02', titulo: 'Prueba técnica de venta · Puerto del Rosario', fecha: '2026-11-20', hora: '20:00', recinto: planos['auditorio-pdr'].recinto, modo: 'numerada', version: planos['auditorio-pdr'].version, aforo: null, precios: { platea: 1500, anfiteatro: 1200 } },
    { codigo: 't03', titulo: 'Prueba técnica de venta · aforo general', fecha: '2026-11-29', hora: '19:00', recinto: sala!.id, modo: 'general', version: null, aforo: 200, precios: { general: 1500 } },
  ];
  for (const p of pruebas) {
    const f = await db.one<{ id: string; estado: string }>(
      `insert into funciones (organizador_id, evento_id, recinto_id, codigo, titulo, artistas, nota, fecha, hora, modo_venta, version_plano_id, aforo, es_prueba)
       values ($1, $2, $3, $4, $5, '["Función ficticia para probar la plataforma"]', 'Función de PRUEBA: no es real y sus entradas no valen para nada.', $6, $7, $8, $9, $10, true)
       on conflict (evento_id, codigo) do update set titulo = excluded.titulo returning id, estado`,
      [organizadorId, r.eventoId, p.recinto, p.codigo, p.titulo, p.fecha, p.hora, p.modo, p.version, p.aforo],
    );
    if (f!.estado !== 'borrador') continue;
    for (const [zona, cent] of Object.entries(p.precios)) {
      await db.query('insert into precios_funcion (funcion_id, zona_codigo, precio_cent) values ($1, $2, $3) on conflict do nothing', [f!.id, zona, cent]);
    }
    await db.tx((t) => ponerALaVenta(t, organizadorId, f!.id));
  }
  return r;
}

export async function sembrar(db: Db, config: Config) {
  const base = await sembrarBase(db, config);
  const planos = await sembrarPlanos(db, base.asombra);
  const festival = await sembrarFestival(db, base.asombra, planos);
  return { ...base, planos, festival };
}
