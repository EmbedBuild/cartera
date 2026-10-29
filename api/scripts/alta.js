// Da de alta usuarios con su token de desarrollo y les siembra la cartera de clase (almacén de ficheros).
//
//   node scripts/alta.js --datos datos --nombre "Jesús Pérez" --id jesus [--email jesus@example.com]
//   node scripts/alta.js --datos datos --lote 20            → alumno-01 … alumno-20
//   node scripts/alta.js --datos datos --reemitir alumno-03 → token nuevo; el anterior deja de valer
//   --sin-semilla: la cartera empieza vacía.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { crearAlmacenFichero } from '../src/node/almacen-fichero.js';
import { altaUsuario, sembrarCartera } from '../src/semilla.js';
import { slug } from '../src/dominio/textos.js';

export async function alta(almacen, personas, { sembrar = true, ahora = new Date() } = {}) {
  const resultado = [];
  for (const persona of personas) {
    const { usuario, token } = await altaUsuario(almacen, persona, { ahora, vacia: !sembrar });
    const { sembrado } = sembrar ? await sembrarCartera(almacen, usuario, { ahora }) : { sembrado: false };
    resultado.push({ ...persona, token, sembrado });
  }
  return resultado;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      datos: { type: 'string', default: process.env.CARTERA_DATOS ?? 'datos' },
      nombre: { type: 'string' },
      id: { type: 'string' },
      email: { type: 'string' },
      lote: { type: 'string' },
      prefijo: { type: 'string', default: 'alumno' },
      reemitir: { type: 'string' },
      'sin-semilla': { type: 'boolean', default: false },
    },
  });
  const almacen = crearAlmacenFichero(values.datos);
  let personas;
  if (values.reemitir) {
    const usuario = await almacen.leerUsuario(values.reemitir);
    if (!usuario) throw new Error(`No existe el usuario ${values.reemitir}`);
    personas = [{ id: usuario.id, nombre: usuario.nombre, email: usuario.email }];
  } else if (values.lote) {
    personas = Array.from({ length: Number(values.lote) }, (_, i) => {
      const num = String(i + 1).padStart(2, '0');
      return { id: `${values.prefijo}-${num}`, nombre: `${values.prefijo.charAt(0).toUpperCase()}${values.prefijo.slice(1)} ${num}` };
    });
  } else if (values.nombre) {
    personas = [{ id: values.id ?? slug(values.nombre), nombre: values.nombre, email: values.email ?? null }];
  } else {
    console.error('Uso: --nombre "Nombre" [--id id] | --lote 20 | --reemitir id   (con --datos <carpeta>)');
    process.exit(1);
  }
  // Al reemitir no se toca la cartera: sembrarCartera no hace nada si ya tiene clientes.
  const hechos = await alta(almacen, personas, { sembrar: !values['sin-semilla'] });
  console.log('Guarda estos tokens: no se vuelven a mostrar.\n');
  for (const h of hechos) console.log(`${h.id}\t${h.nombre}\t${h.token}${h.sembrado ? '\t(cartera sembrada)' : ''}`);
}
