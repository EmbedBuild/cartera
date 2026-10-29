import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenMemoria } from '../src/almacen-memoria.js';
import { altaUsuario, reiniciarClase, sembrarCartera } from '../src/semilla.js';
import { calcularImportes } from '../src/dominio/importes.js';
import { LIMITE_CARTERA } from '../src/cartera.js';
import { AHORA } from './ayudas.js';

async function almacenConUsuario() {
  const almacen = crearAlmacenMemoria();
  const { usuario } = await altaUsuario(almacen, { id: 'jesus', nombre: 'Jesús' }, { ahora: new Date(AHORA) });
  return { almacen, usuario };
}

test('semilla › Cartera de clase › Sale bien: los seis clientes con sus números', async () => {
  const { almacen, usuario } = await almacenConUsuario();
  assert.deepEqual(await sembrarCartera(almacen, usuario, { ahora: new Date(AHORA) }), { sembrado: true });
  const cartera = await almacen.leerCartera('jesus');
  assert.deepEqual(
    cartera.clientes.map((c) => c.nombre),
    ['Ribera Industrial', 'Albor Climatización', 'Lince Mudanzas', 'Núcleo Pilates', 'Administración Atalaya', 'Obrador Trigal'],
  );
  const atalaya = cartera.presupuestos.find((p) => p.clienteId === 'administracion-atalaya');
  const imp = calcularImportes(atalaya, atalaya.precioPunto);
  assert.equal(imp.criterios, 10);
  assert.equal(imp.puntos, 18);
  assert.equal(imp.instalacion, 450000);
  assert.deepEqual(imp.casos.map((c) => c.puntos), [6, 2, 6, 4]);
  // Obrador Trigal no tiene presupuesto: es el ejercicio de redactar uno desde cero.
  assert.ok(!cartera.presupuestos.some((p) => p.clienteId === 'obrador-trigal'));
  assert.match(cartera.clientes.find((c) => c.id === 'obrador-trigal').notas, /resumen de producción/);
  // Cabe de sobra en un Durable Object.
  assert.ok(new TextEncoder().encode(JSON.stringify(cartera)).length < LIMITE_CARTERA / 4);
});

test('semilla › Cartera de clase › Puede salir mal: sembrar dos veces no duplica', async () => {
  const { almacen, usuario } = await almacenConUsuario();
  await sembrarCartera(almacen, usuario, { ahora: new Date(AHORA) });
  assert.deepEqual(await sembrarCartera(almacen, usuario, { ahora: new Date(AHORA) }), { sembrado: false });
  const cartera = await almacen.leerCartera('jesus');
  assert.equal(cartera.clientes.length, 6);
  assert.equal(cartera.presupuestos.length, 5);
  // Reiniciar sí la deja como recién sembrada y conserva el usuario y su token.
  cartera.clientes[0].notas = 'tocado en clase';
  await almacen.guardarCartera('jesus', cartera);
  assert.deepEqual(await reiniciarClase(almacen, { ahora: new Date(AHORA) }), ['jesus']);
  const reiniciada = await almacen.leerCartera('jesus');
  assert.equal(reiniciada.clientes.length, 6);
  assert.ok(!reiniciada.clientes[0].notas.includes('tocado'));
  assert.equal((await almacen.listarUsuarios()).length, 1);
  assert.equal((await almacen.leerUsuario('jesus')).tokens.length, 1);
});
