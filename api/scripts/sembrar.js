// Siembra la cartera de clase de un usuario ya dado de alta. Si ya tiene clientes, no toca nada.
//   node scripts/sembrar.js --datos datos --usuario jesus
import { parseArgs } from 'node:util';
import { crearAlmacenFichero } from '../src/node/almacen-fichero.js';
import { sembrarCartera } from '../src/semilla.js';

const { values } = parseArgs({
  options: {
    datos: { type: 'string', default: process.env.CARTERA_DATOS ?? 'datos' },
    usuario: { type: 'string' },
  },
});
const almacen = crearAlmacenFichero(values.datos);
const usuario = values.usuario && (await almacen.leerUsuario(values.usuario));
if (!usuario) {
  console.error('Uso: node scripts/sembrar.js --datos datos --usuario <id de un usuario dado de alta>');
  process.exit(1);
}
const { sembrado } = await sembrarCartera(almacen, usuario);
console.log(sembrado ? `Cartera de ${usuario.id} sembrada.` : `${usuario.id} ya tenía cartera: no se ha tocado.`);
