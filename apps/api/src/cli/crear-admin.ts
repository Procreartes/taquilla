/**
 * Crea (o promueve) la persona administradora de la plataforma y genera un enlace de un solo uso
 * para que defina su propia contraseña. Nadie más ve la contraseña.
 *
 *   npm run crear-admin -w @taquilla/api -- correo@dominio.com "Nombre Apellido"
 *
 * En Coolify: servicio «api» → Terminal → ejecutar el comando de arriba.
 */
import { cargarDotenv, leerConfig } from '../config';
import { abrirDb } from '../arranque';
import { migrar } from '../db';
import { sha256, tokenAleatorio } from '../infra/cripto';

cargarDotenv();
const config = leerConfig();
const [emailBruto, ...resto] = process.argv.slice(2);
const nombre = resto.join(' ').trim();
const email = (emailBruto ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || nombre.length < 2) {
  console.error('Uso: npm run crear-admin -w @taquilla/api -- correo@dominio.com "Nombre Apellido"');
  process.exit(1);
}

const db = await abrirDb(config);
await migrar(db);
const token = tokenAleatorio(24);
await db.tx(async (t) => {
  let u = await t.one<{ id: string }>('select id from usuarios where email = $1', [email]);
  if (!u) u = await t.one<{ id: string }>('insert into usuarios (email, nombre, superadmin) values ($1, $2, true) returning id', [email, nombre]);
  else await t.query('update usuarios set superadmin = true, activo = true where id = $1', [u.id]);
  await t.query(
    `insert into invitaciones_equipo (usuario_id, token_hash, caduca_en) values ($1, $2, now() + interval '1 day')`,
    [u!.id, sha256(token)],
  );
});
console.log(`\nAdministración lista para ${email}.`);
console.log(`Abre este enlace (caduca en 24 horas, un solo uso) y define tu contraseña:\n\n  ${config.URL_PUBLICA}/entrar/definir?t=${token}\n`);
await db.close();
