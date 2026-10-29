// Comprueba que cada escenario de SPEC.md tiene una prueba que lo cita.
// El nombre de la prueba debe contener «capacidad › Regla › Escenario». Uso: npm run trazabilidad
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

export async function escenarios(ruta = join(RAIZ, 'SPEC.md')) {
  const lista = [];
  let capacidad = null;
  let regla = null;
  for (const linea of (await readFile(ruta, 'utf8')).split('\n')) {
    const c = linea.match(/^## ([a-z]+)$/);
    if (c) capacidad = c[1];
    const r = linea.match(/^### Regla: (.+)$/);
    if (r) regla = r[1].trim();
    const e = linea.match(/^#### Escenario: (.+)$/);
    if (e) lista.push(`${capacidad} › ${regla} › ${e[1].trim()}`);
  }
  return lista;
}

async function textoDePruebas() {
  const carpeta = join(RAIZ, 'test');
  const archivos = (await readdir(carpeta)).filter((n) => n.endsWith('.test.js'));
  return (await Promise.all(archivos.map((n) => readFile(join(carpeta, n), 'utf8')))).join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const todos = await escenarios();
  const pruebas = await textoDePruebas();
  const sinPrueba = todos.filter((e) => !pruebas.includes(e));
  for (const e of sinPrueba) console.log(`  ✗ ${e}`);
  console.log(`${todos.length} escenarios, ${sinPrueba.length} escenarios sin prueba`);
  process.exitCode = sinPrueba.length ? 1 : 0;
}
