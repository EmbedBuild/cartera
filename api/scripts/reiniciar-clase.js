// Deja todas las carteras (o la de un usuario) como recién sembradas, con las fechas de hoy.
// Usuarios y tokens se conservan. Antes se archiva una copia en datos/archivo/<fecha>/.
//   npm run reiniciar-clase -- --datos datos [--usuario alumno-03]
import { parseArgs } from 'node:util';
import { crearAlmacenFichero } from '../src/node/almacen-fichero.js';
import { reiniciarClase } from '../src/semilla.js';

const { values } = parseArgs({
  options: {
    datos: { type: 'string', default: process.env.CARTERA_DATOS ?? 'datos' },
    usuario: { type: 'string' },
  },
});
const almacen = crearAlmacenFichero(values.datos);
console.log(`Copia de antes: ${await almacen.archivar()}`);
const usuarios = await reiniciarClase(almacen, { usuarioId: values.usuario ?? null });
console.log(`Carteras reiniciadas: ${usuarios.length ? usuarios.join(', ') : 'ninguna (no hay usuarios)'}`);
