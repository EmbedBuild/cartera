// Una prueba por escenario: «herramienta › Dado … › Cuando … › Entonces …». Sin Cloudflare: el pedir es falso
// y apunta qué se le pide a la cocina (la API), que es lo que de verdad decide cada herramienta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar } from './ayudas.js';

const caso = {
  nombre: 'El bar hace su pedido',
  criterios: [{ dado: 'un bar con cuenta', cuando: 'pide antes de las 21:00', entonces: 'el pedido queda guardado' }],
};

test('a_quien_llamo_hoy › Dado una cartera › Cuando se pregunta a quién llamar › Entonces se pide /api/hoy sin cambiar nada', async () => {
  const { usar, llamadas } = montar();
  await usar('a_quien_llamo_hoy');
  assert.deepEqual(llamadas, [{ metodo: 'GET', ruta: '/api/hoy', cuerpo: undefined }]);
});

test('listar_clientes › Dado una etapa › Cuando se listan los clientes › Entonces la etapa va en la ruta', async () => {
  const { usar, llamadas } = montar();
  await usar('listar_clientes', { etapa: 'negociacion' });
  assert.equal(llamadas[0].ruta, '/api/clientes?etapa=negociacion');
});

test('listar_clientes › Dado una etapa que no existe › Cuando se listan los clientes › Entonces se rechaza antes de llegar a la cocina', () => {
  const { usar, llamadas } = montar();
  assert.throws(() => usar('listar_clientes', { etapa: 'cerrado' }));
  assert.equal(llamadas.length, 0);
});

test('ficha_del_cliente › Dado un identificador con caracteres raros › Cuando se pide la ficha › Entonces no rompe la ruta', async () => {
  const { usar, llamadas } = montar();
  await usar('ficha_del_cliente', { clienteId: 'obrador/../trigal' });
  assert.equal(llamadas[0].ruta, '/api/clientes/obrador%2F..%2Ftrigal');
});

test('redactar_presupuesto › Dado casos de uso con criterios › Cuando se redacta › Entonces se manda a la cocina sin ningún importe', async () => {
  const { usar, llamadas } = montar();
  await usar('redactar_presupuesto', { clienteId: 'obrador-trigal', titulo: 'Pedidos', casosDeUso: [caso], importe: 99999 });
  assert.equal(llamadas[0].metodo, 'POST');
  assert.equal(llamadas[0].ruta, '/api/presupuestos');
  assert.equal(llamadas[0].cuerpo.importe, undefined, 'la IA no puede poner precio: lo calcula la API');
});

test('redactar_presupuesto › Dado un caso de uso sin criterios › Cuando se redacta › Entonces se rechaza', () => {
  const { usar, llamadas } = montar();
  assert.throws(() => usar('redactar_presupuesto', { clienteId: 'x', titulo: 'y', casosDeUso: [{ nombre: 'Sin criterios', criterios: [] }] }));
  assert.equal(llamadas.length, 0);
});

test('enviar_presupuesto › Dado un envío al cliente › Cuando la IA lee la herramienta › Entonces sabe que tiene que confirmar y que sale fuera', () => {
  const { herramientas } = montar();
  const { config } = herramientas.get('enviar_presupuesto');
  assert.match(config.description, /confirmación/);
  assert.equal(config.annotations.openWorldHint, true);
});

test('cerrar_caso_de_uso › Dado un caso con el acta firmada › Cuando se factura › Entonces se pide la ruta de facturar de ese caso', async () => {
  const { usar, llamadas } = montar();
  await usar('cerrar_caso_de_uso', { referencia: 'P-2026-005', caso: 'CU2', accion: 'facturar' });
  assert.deepEqual(llamadas[0], { metodo: 'POST', ruta: '/api/presupuestos/P-2026-005/casos/CU2/facturar', cuerpo: undefined });
});

test('Toda herramienta tiene título, una descripción que la IA pueda entender y dice si solo lee', () => {
  const { herramientas } = montar();
  assert.equal(herramientas.size, 15);
  for (const [nombre, { config }] of herramientas) {
    assert.ok(config.title, `${nombre} sin título`);
    assert.ok(config.description?.length >= 40, `${nombre}: descripción demasiado corta`);
    assert.equal(typeof config.annotations?.readOnlyHint, 'boolean', `${nombre}: falta decir si solo lee`);
  }
});

test('Las herramientas que solo leen nunca cambian nada en la cocina', async () => {
  const { herramientas, usar, llamadas } = montar();
  const argumentos = { ficha_del_cliente: { clienteId: 'albor' }, ver_presupuesto: { referencia: 'P-2026-001' }, hoja_de_retorno: { referencia: 'P-2026-003' } };
  for (const [nombre, { config }] of herramientas) {
    if (config.annotations.readOnlyHint) await usar(nombre, argumentos[nombre] ?? {});
  }
  assert.ok(llamadas.length >= 6);
  assert.ok(llamadas.every((l) => l.metodo === 'GET'));
});
