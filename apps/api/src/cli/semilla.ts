import { cargarDotenv, leerConfig } from '../config';
import { abrirDb } from '../arranque';
import { migrar } from '../db';
import { sembrar } from '../semilla';

cargarDotenv();
const config = leerConfig();
if (config.NODE_ENV === 'production') {
  console.error('La semilla de prueba no se ejecuta en producción.');
  process.exit(1);
}
const db = await abrirDb(config);
await migrar(db);
await sembrar(db, config);
console.log('Datos de prueba listos.');
await db.close();
