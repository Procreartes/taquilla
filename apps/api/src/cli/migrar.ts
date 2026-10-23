import { cargarDotenv, leerConfig } from '../config';
import { abrirDb } from '../arranque';
import { migrar } from '../db';

cargarDotenv();
const db = await abrirDb(leerConfig());
const hechas = await migrar(db);
console.log(hechas.length ? `Migraciones aplicadas: ${hechas.join(', ')}` : 'La base de datos ya estaba al día');
await db.close();
