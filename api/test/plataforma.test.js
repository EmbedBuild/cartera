// Pruebas de la plataforma (no son escenarios de la spec): que lo que va a Workers no dependa de Node,
// que el adaptador node:http funcione con el almacén de ficheros y que las escrituras de un usuario no se pisen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAlmacenFichero } from '../src/node/almacen-fichero.js';
import { crearServidorNode } from '../src/node/servidor.js';
import { alta } from '../scripts/alta.js';
import { arrancar, carpetaTemporal } from './ayudas.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

test('plataforma › lo que va a Workers solo usa APIs Web', async () => {
  const archivos = (await readdir(SRC, { recursive: true })).filter((f) => f.endsWith('.js') && !f.startsWith('node'));
  assert.ok(archivos.length > 10);
  for (const f of archivos) {
    const codigo = await readFile(join(SRC, f), 'utf8');
    assert.doesNotMatch(codigo, /from ['"]node:|require\(|\bBuffer\b|\bprocess\./, f);
  }
});

test('plataforma › el adaptador node:http con el almacén de ficheros', async () => {
  const dir = await carpetaTemporal();
  const almacen = crearAlmacenFichero(dir);
  const [{ token }] = await alta(almacen, [{ id: 'jesus', nombre: 'Jesús' }]);
  const servidor = crearServidorNode({ almacen });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const yo = await fetch(`${base}/api/yo`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(yo.status, 200);
    assert.equal((await yo.json()).clientes, 6);
    const nuevo = await fetch(`${base}/api/clientes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Por el adaptador' }),
    });
    assert.equal(nuevo.status, 201);
    assert.equal((await almacen.leerCartera('jesus')).clientes.length, 7);
    const envio = await fetch(`${base}/api/presupuestos/P-2026-004`, { headers: { authorization: `Bearer ${token}` } });
    const enlace = (await envio.json()).enlacePublico;
    assert.ok(enlace.startsWith(base));
    const pagina = await fetch(enlace.replace(/^https?:\/\/[^/]+/, base));
    assert.equal(pagina.status, 200);
    assert.match(await pagina.text(), /Reservas, lista de espera y bono/);
    const grande = await fetch(`${base}/api/clientes`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: 'x'.repeat(2 * 1024 * 1024) });
    assert.equal(grande.status, 413);
  } finally {
    servidor.closeAllConnections();
    await new Promise((ok) => servidor.close(ok));
  }
});

test('plataforma › diez altas a la vez del mismo usuario no se pisan', async () => {
  const app = await arrancar();
  const respuestas = await Promise.all(Array.from({ length: 10 }, (_, i) => app.beto('POST', '/api/clientes', { nombre: `A la vez ${i}` })));
  assert.ok(respuestas.every((r) => r.estado === 201));
  assert.equal((await app.cartera('beto')).clientes.length, 10);
});
