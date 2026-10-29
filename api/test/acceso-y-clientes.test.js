import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arrancar, borradorListo, tokenDe } from './ayudas.js';

describe('acceso y clientes', () => {
  let app;
  before(async () => {
    app = await arrancar();
  });
  after(() => app.cerrar());

  // ---- acceso ----
  test('acceso › Sin credencial no hay datos › Sale bien: entra con su token', async () => {
    const { estado, datos } = await app.ana('GET', '/api/yo');
    assert.equal(estado, 200);
    assert.equal(datos.nombre, 'Ana Prueba');
    assert.equal(datos.tarifaPunto, '250,00 €');
  });

  test('acceso › Sin credencial no hay datos › Puede salir mal: sin token o con uno falso', async () => {
    for (const pedir of [app.anonimo, app.conToken('cart_inventado')]) {
      for (const ruta of ['/api/yo', '/api/clientes', '/api/hoy', '/api/presupuestos/P-2026-001']) {
        const { estado, datos, cabeceras } = await pedir('GET', ruta);
        assert.equal(estado, 401, ruta);
        assert.deepEqual(datos, { mensaje: 'Falta la credencial o no es válida' });
        assert.equal(cabeceras.get('www-authenticate'), 'Bearer');
      }
    }
  });

  test('acceso › Cada usuario ve solo su cartera › Sale bien: ve sus propios clientes', async () => {
    await app.beto('POST', '/api/clientes', { nombre: 'Cliente de Beto' });
    const deAna = await app.ana('GET', '/api/clientes');
    const deBeto = await app.beto('GET', '/api/clientes');
    assert.equal(deAna.datos.length, 6);
    assert.ok(!deAna.datos.some((c) => c.nombre === 'Cliente de Beto'));
    assert.deepEqual(deBeto.datos.map((c) => c.nombre), ['Cliente de Beto']);
  });

  test('acceso › Cada usuario ve solo su cartera › Puede salir mal: pide algo de otro usuario', async () => {
    const antes = (await app.cartera('ana')).presupuestos;
    const intentos = [
      ['GET', '/api/clientes/nucleo-pilates'],
      ['POST', '/api/clientes/nucleo-pilates', { notas: 'cambiado por otro' }],
      ['POST', '/api/clientes/nucleo-pilates/etapa', { etapa: 'perdido' }],
      ['GET', '/api/presupuestos/P-2026-004'],
      ['POST', '/api/presupuestos/P-2026-005', { titulo: 'Cambiado por otro' }],
      ['POST', '/api/presupuestos/P-2026-002/casos/CU2/facturar'],
      ['POST', '/api/seguimientos', { clienteId: 'nucleo-pilates', canal: 'llamada', nota: 'intruso' }],
      ['GET', '/api/pilotos/P-2026-003/retorno'],
    ];
    for (const [metodo, ruta, cuerpo] of intentos) {
      const { estado } = await app.carla(metodo, ruta, cuerpo);
      assert.equal(estado, 404, `${metodo} ${ruta}`);
    }
    assert.deepEqual((await app.cartera('ana')).presupuestos, antes);
    const ficha = await app.ana('GET', '/api/clientes/nucleo-pilates');
    assert.equal(ficha.datos.etapa, 'propuesta');
    assert.equal(ficha.datos.notas, '');
  });

  test('acceso › Nada se borra › Sale bien: lo rechazado sigue en la cartera', async () => {
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Cliente que rechaza' });
    const enviado = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
    await app.pagina('POST', `/p/${tokenDe(enviado.datos)}/rechazar`, { comentario: 'Ahora no tenemos presupuesto' });
    const rechazados = await app.beto('GET', '/api/presupuestos?estado=rechazado');
    assert.equal(rechazados.datos.length, 1);
    const detalle = await app.beto('GET', `/api/presupuestos/${presupuesto.id}`);
    assert.equal(detalle.datos.estado, 'rechazado');
    assert.equal(detalle.datos.decision.comentario, 'Ahora no tenemos presupuesto');
  });

  test('acceso › Nada se borra › Puede salir mal: alguien intenta borrar', async () => {
    for (const metodo of ['DELETE', 'PUT', 'PATCH']) {
      const { estado, datos } = await app.ana(metodo, '/api/clientes/nucleo-pilates');
      assert.equal(estado, 405, metodo);
      assert.match(datos.mensaje, /nada se borra/);
    }
    const ficha = await app.ana('GET', '/api/clientes/nucleo-pilates');
    assert.equal(ficha.estado, 200);
    assert.equal(ficha.datos.nombre, 'Núcleo Pilates');
  });

  test('acceso › La cartera cabe en 120 KB › Sale bien: los cambios normales se guardan', async () => {
    const { estado } = await app.ana('POST', '/api/clientes', { nombre: 'Cliente que cabe', notas: 'Una nota corta' });
    assert.equal(estado, 201);
    assert.ok((await app.cartera('ana')).clientes.some((c) => c.nombre === 'Cliente que cabe'));
  });

  test('acceso › La cartera cabe en 120 KB › Puede salir mal: un cambio que la haría pasar del límite', async () => {
    const otra = await arrancar();
    let ultimo;
    let nombre;
    for (let i = 0; i < 80; i++) {
      nombre = `Cliente ${i}`;
      ultimo = await otra.beto('POST', '/api/clientes', { nombre, notas: 'n'.repeat(2000) });
      if (ultimo.estado !== 201) break;
    }
    assert.equal(ultimo.estado, 422);
    assert.match(ultimo.datos.mensaje, /ha llegado a su tamaño máximo \(120 KB\) y este cambio no se ha guardado/);
    const cartera = await otra.cartera('beto');
    assert.ok(!cartera.clientes.some((c) => c.nombre === nombre));
    assert.ok(new TextEncoder().encode(JSON.stringify(cartera)).length <= 120 * 1024);
  });

  // ---- clientes ----
  test('clientes › Alta de cliente › Sale bien: el cliente nace en contacto con la tarifa del usuario', async () => {
    const { estado, datos } = await app.carla('POST', '/api/clientes', {
      nombre: 'Taller de Bicis Rueda',
      sector: 'Reparación de bicicletas',
      contacto: { nombre: 'Rosa', email: 'Rosa.Rueda@Example.com' },
    });
    assert.equal(estado, 201);
    assert.equal(datos.id, 'taller-de-bicis-rueda');
    assert.equal(datos.etapa, 'contacto');
    assert.equal(datos.precioPuntoCentimos, 25000);
    assert.equal(datos.contacto.email, 'rosa.rueda@example.com');
    // Otro con el mismo nombre no pisa al primero.
    const repetido = await app.carla('POST', '/api/clientes', { nombre: 'Taller de Bicis Rueda' });
    assert.equal(repetido.datos.id, 'taller-de-bicis-rueda-2');
  });

  test('clientes › Alta de cliente › Puede salir mal: faltan datos o el email no vale', async () => {
    const antes = (await app.cartera('carla')).clientes.length;
    const sinNombre = await app.carla('POST', '/api/clientes', { sector: 'Hostelería' });
    assert.equal(sinNombre.estado, 400);
    assert.equal(sinNombre.datos.errores.nombre, 'Falta el nombre');
    const emailMalo = await app.carla('POST', '/api/clientes', { nombre: 'Bar Manolo', contacto: { email: 'manolo.example.com' } });
    assert.equal(emailMalo.estado, 400);
    assert.equal(emailMalo.datos.errores['contacto.email'], 'El email del contacto no es válido');
    const largo = await app.carla('POST', '/api/clientes', { nombre: 'x'.repeat(200) });
    assert.match(largo.datos.errores.nombre, /como mucho 120/);
    assert.equal((await app.cartera('carla')).clientes.length, antes);
  });

  test('clientes › Etapas del embudo › Sale bien: avanza de etapa y queda en el historial', async () => {
    const { estado, datos } = await app.ana('POST', '/api/clientes/obrador-trigal/etapa', { etapa: 'negociacion', nota: 'Pide verlo con su socio' });
    assert.equal(estado, 200);
    assert.equal(datos.etapa, 'negociacion');
    const ultimo = datos.historialEtapas.at(-1);
    assert.deepEqual([ultimo.de, ultimo.a, ultimo.nota], ['reunion', 'negociacion', 'Pide verlo con su socio']);
    assert.ok(ultimo.fecha);
  });

  test('clientes › Etapas del embudo › Puede salir mal: ganado sin presupuesto aceptado', async () => {
    const ganado = await app.ana('POST', '/api/clientes/nucleo-pilates/etapa', { etapa: 'ganado' });
    assert.equal(ganado.estado, 422);
    assert.match(ganado.datos.mensaje, /cuando acepta un presupuesto/);
    const inventada = await app.ana('POST', '/api/clientes/nucleo-pilates/etapa', { etapa: 'cerrado' });
    assert.equal(inventada.estado, 400);
    assert.match(inventada.datos.mensaje, /Las etapas son: contacto, reunión, propuesta, negociación, ganado, perdido/);
    const ficha = await app.ana('GET', '/api/clientes/nucleo-pilates');
    assert.equal(ficha.datos.etapa, 'propuesta');
  });
});
