// Da de alta a los alumnos en el KV USUARIOS de Cartera e imprime sus códigos.
// Uso: node scripts/alta.mjs [número de alumnos, 20 por defecto]
// Necesita el secreto de los códigos en .secreto-codigos (el mismo que se sube con «wrangler secret put SECRETO_CODIGOS»).
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hmacCodigo } from '../src/usuarios.js';

const PALABRAS = ['TRIGO', 'OLIVO', 'ROBLE', 'SALVIA', 'TOMILLO', 'ENCINA', 'ROMERO', 'LAUREL', 'ALMENDRO', 'CASTANO', 'NOGAL', 'TEJO', 'ACEBO', 'BREZO', 'JARA', 'LIRIO', 'MALVA', 'CEDRO', 'HAYA', 'SAUCE', 'ABETO', 'ALISO', 'ENEBRO', 'MIRTO', 'OLMO'];

const secreto = readFileSync(new URL('../.secreto-codigos', import.meta.url), 'utf8').trim();
const cuantos = Number(process.argv[2] ?? 20);

const usuarios = [
  { id: 'profe', nombre: 'Jesús (profesor)' },
  { id: 'prueba', nombre: 'Cuenta de prueba' },
  ...Array.from({ length: cuantos }, (_, i) => ({ id: `u${String(i + 1).padStart(2, '0')}`, nombre: `Alumno ${String(i + 1).padStart(2, '0')}` })),
];

const usadas = new Set();
const pares = [];
const lineas = [];
for (const [i, usuario] of usuarios.entries()) {
  let codigo;
  do codigo = `${PALABRAS[i % PALABRAS.length]}-${randomInt(1000, 10000)}`;
  while (usadas.has(codigo));
  usadas.add(codigo);
  pares.push({ key: `usuario:${usuario.id}`, value: JSON.stringify({ ...usuario, creado: new Date().toISOString() }) });
  pares.push({ key: `codigo:${await hmacCodigo(secreto, codigo)}`, value: usuario.id });
  lineas.push(`${usuario.nombre.padEnd(18)} ${codigo}`);
}

const carpeta = mkdtempSync(join(tmpdir(), 'cartera-alta-'));
const fichero = join(carpeta, 'usuarios.json');
writeFileSync(fichero, JSON.stringify(pares));
try {
  execFileSync('npx', ['wrangler', 'kv', 'bulk', 'put', fichero, '--binding', 'USUARIOS', '--remote'], { stdio: 'inherit' });
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}
writeFileSync(new URL('../codigos-alumnos.txt', import.meta.url), `${lineas.join('\n')}\n`, { mode: 0o600 });
console.log(`\n${usuarios.length} usuarios dados de alta. Códigos en codigos-alumnos.txt`);
