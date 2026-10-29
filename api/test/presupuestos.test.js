import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arrancar, borradorListo, casoDePrueba, tokenDe } from './ayudas.js';
import { calcularImportes, puntosDeCaso } from '../src/dominio/importes.js';

describe('presupuestos', () => {
  let app;
  before(async () => {
    app = await arrancar();
  });
  after(() => app.cerrar());

  test('presupuestos › Puntos de un caso de uso › Sale bien: los puntos salen de la fórmula', async () => {
    const caso = casoDePrueba('Avisar de una avería', 3, { datosPersonales: true, incertidumbre: 'media' });
    assert.equal(puntosDeCaso({ ...caso, ponderacion: { ...caso.ponderacion, pagos: false } }), 6);
    assert.equal(puntosDeCaso({ criterios: [{}, {}], ponderacion: { pagos: true, incertidumbre: 'alta' } }), 7);
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Fórmula', casos: [caso] });
    assert.equal(presupuesto.casosDeUso[0].puntos, 6);
    assert.equal(presupuesto.casosDeUso[0].importe, '1.500,00 €');
  });

  test('presupuestos › Puntos de un caso de uso › Puede salir mal: llega un importe de fuera', async () => {
    const trampa = { ...casoDePrueba('Caso con trampa', 2), puntos: 99, importeCentimos: 1, importe: '1 €' };
    const { cliente } = await borradorListo(app.beto, { nombre: 'Trampa' });
    const { estado, datos } = await app.beto('POST', '/api/presupuestos', {
      clienteId: cliente.id,
      titulo: 'Con importes inventados',
      casosDeUso: [trampa],
      instalacionCentimos: 100,
      importes: { instalacionCentimos: 100 },
      puntos: 1,
    });
    assert.equal(estado, 201);
    assert.equal(datos.puntos, 2);
    assert.equal(datos.importes.instalacionCentimos, 50000);
    assert.equal((await app.cartera('beto')).presupuestos.find((p) => p.id === datos.id).casosDeUso[0].puntos, undefined);
  });

  test('presupuestos › Importes del presupuesto › Sale bien: instalación, mantenimiento e IVA', async () => {
    const casos = [
      { criterios: Array(3).fill({}), ponderacion: { datosPersonales: true, incertidumbre: 'media' } },
      { criterios: Array(2).fill({}), ponderacion: {} },
      { criterios: Array(3).fill({}), ponderacion: { datosPersonales: true, incertidumbre: 'media' } },
      { criterios: Array(2).fill({}), ponderacion: { datosPersonales: true } },
    ].map((c, i) => ({ codigo: `CU${i + 1}`, ...c }));
    const imp = calcularImportes({ casosDeUso: casos, mantenimientoPactado: null }, 25000);
    assert.equal(imp.puntos, 18);
    assert.deepEqual(
      [imp.instalacion, imp.ivaInstalacion, imp.totalInstalacion, imp.mantenimientoMensual, imp.ivaMantenimiento],
      [450000, 94500, 544500, 45000, 9450],
    );
    // Redondeo a 10 €: 3.250 € de instalación dan 330 € al mes.
    assert.equal(calcularImportes({ casosDeUso: [{ codigo: 'CU1', criterios: Array(13).fill({}) }], mantenimientoPactado: null }, 25000).mantenimientoMensual, 33000);
  });

  test('presupuestos › Importes del presupuesto › Puede salir mal: un mantenimiento que no es un importe', async () => {
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Mantenimiento' });
    for (const valor of [-10, 'cien', Number.MAX_SAFE_INTEGER]) {
      const { estado, datos } = await app.beto('POST', `/api/presupuestos/${presupuesto.id}`, { mantenimientoMensualEuros: valor });
      assert.equal(estado, 400, String(valor));
      assert.match(datos.errores.mantenimientoMensualEuros, /mantenimiento mensual tiene que ser un importe/);
    }
    const pactado = await app.beto('POST', `/api/presupuestos/${presupuesto.id}`, { mantenimientoMensualEuros: 75.5 });
    assert.equal(pactado.datos.importes.mantenimientoMensualCentimos, 7550);
    const igual = await app.beto('GET', `/api/presupuestos/${presupuesto.id}`);
    assert.equal(igual.datos.importes.mantenimientoMensualCentimos, 7550);
  });

  test('presupuestos › Precio del punto pactado con el cliente › Sale bien: el presupuesto usa el precio del cliente', async () => {
    const { presupuesto } = await borradorListo(app.beto, {
      nombre: 'Precio pactado',
      precioPuntoEuros: 300,
      casos: [casoDePrueba('Diez puntos', 10)],
    });
    assert.equal(presupuesto.puntos, 10);
    assert.equal(presupuesto.importes.instalacionCentimos, 300000);
    assert.equal(presupuesto.precioPunto, '300,00 €');
  });

  test('presupuestos › Precio del punto pactado con el cliente › Puede salir mal: el precio cambia después de enviar', async () => {
    const { cliente, presupuesto } = await borradorListo(app.beto, { nombre: 'Precio congelado', casos: [casoDePrueba('Cuatro', 4)] });
    await app.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
    const cambio = await app.beto('POST', `/api/clientes/${cliente.id}`, { precioPuntoEuros: 300 });
    assert.equal(cambio.datos.precioPuntoCentimos, 30000);
    const enviado = await app.beto('GET', `/api/presupuestos/${presupuesto.id}`);
    assert.equal(enviado.datos.importes.instalacionCentimos, 100000);
    assert.equal(enviado.datos.precioCongelado, true);
  });

  test('presupuestos › Criterios en Dado / Cuando / Entonces › Sale bien: se añade un caso de uso con sus criterios', async () => {
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Casos' });
    const { estado, datos } = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/casos`, {
      nombre: 'Resumen de producción a las 22:00',
      criterios: [{ dado: 'treinta pedidos cerrados', cuando: 'son las 22:00', entonces: 'el obrador ve cuántas barras hacer' }],
      ponderacion: { incertidumbre: 'media' },
    });
    assert.equal(estado, 200);
    const nuevo = datos.casosDeUso.at(-1);
    assert.equal(nuevo.codigo, 'CU2');
    assert.equal(nuevo.puntos, 2);
  });

  test('presupuestos › Criterios en Dado / Cuando / Entonces › Puede salir mal: un criterio incompleto', async () => {
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Criterio incompleto' });
    const { estado, datos } = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/casos`, {
      nombre: 'Sin entonces',
      criterios: [{ dado: 'un bar', cuando: 'pide' }],
    });
    assert.equal(estado, 400);
    assert.equal(datos.mensaje, 'Cada criterio necesita dado, cuando y entonces');
    assert.equal(datos.errores['caso.criterios[0]'], 'Cada criterio necesita dado, cuando y entonces');
    const igual = await app.beto('GET', `/api/presupuestos/${presupuesto.id}`);
    assert.equal(igual.datos.casosDeUso.length, 1);
  });

  test('presupuestos › Lo enviado no se edita › Sale bien: editar un enviado crea una versión nueva', async () => {
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Versiones' });
    const v1 = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
    const v2 = await app.beto('POST', `/api/presupuestos/${presupuesto.numero}`, { titulo: 'Con un caso más' });
    assert.equal(v2.datos.version, 2);
    assert.equal(v2.datos.estado, 'borrador');
    assert.equal(v2.datos.id, `${presupuesto.numero}-v2`);
    assert.match(v2.datos.aviso, /he creado la versión 2/);
    const sigueV1 = await app.beto('GET', `/api/presupuestos/${presupuesto.id}`);
    assert.equal(sigueV1.datos.titulo, presupuesto.titulo);
    assert.equal(sigueV1.datos.estado, 'enviado');
    // El número, sin versión, da la más reciente.
    assert.equal((await app.beto('GET', `/api/presupuestos/${presupuesto.numero}`)).datos.version, 2);
    // Una segunda edición de la v1 se rechaza: ya hay una versión nueva.
    const otra = await app.beto('POST', `/api/presupuestos/${presupuesto.id}`, { titulo: 'Otra' });
    assert.equal(otra.estado, 409);
    await app.beto('POST', `/api/presupuestos/${v2.datos.id}/enviar`);
    const sustituida = await app.beto('GET', `/api/presupuestos/${presupuesto.id}`);
    assert.equal(sustituida.datos.estado, 'sustituido');
    assert.equal(sustituida.datos.sustituidoPor, v2.datos.id);
    const pagina = await app.pagina('GET', `/p/${tokenDe(v1.datos)}`);
    assert.match(pagina.html, /Hay una versión más nueva/);
  });

  test('presupuestos › Lo enviado no se edita › Puede salir mal: editar un aceptado', async () => {
    for (const [ruta, cuerpo] of [
      ['/api/presupuestos/P-2026-002', { titulo: 'Otro título' }],
      ['/api/presupuestos/P-2026-002/casos', casoDePrueba('Caso extra')],
    ]) {
      const { estado, datos } = await app.ana('POST', ruta, cuerpo);
      assert.equal(estado, 422);
      assert.match(datos.mensaje, /está aceptado y ya no cambia. Los cambios van en una ampliación/);
    }
    const igual = await app.ana('GET', '/api/presupuestos/P-2026-002');
    assert.equal(igual.datos.titulo, 'Avisos de averías para las comunidades');
    assert.equal(igual.datos.casosDeUso.length, 4);
  });

  test('presupuestos › Caducidad › Sale bien: dentro de plazo sigue abierto', async () => {
    const otra = await arrancar();
    try {
      const { presupuesto } = await borradorListo(otra.beto, { nombre: 'En plazo' });
      await otra.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
      otra.reloj.avanzarDias(10);
      const { datos } = await otra.beto('GET', `/api/presupuestos/${presupuesto.id}`);
      assert.equal(datos.estado, 'enviado');
      assert.equal(Math.round((Date.parse(datos.caduca) - otra.reloj().getTime()) / 86400000), 20);
    } finally {
      await otra.cerrar();
    }
  });

  test('presupuestos › Caducidad › Puede salir mal: pasados 30 días caduca', async () => {
    const otra = await arrancar();
    try {
      const { presupuesto } = await borradorListo(otra.beto, { nombre: 'Caduca' });
      const enviado = await otra.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
      otra.reloj.avanzarDias(31);
      const { datos } = await otra.beto('GET', `/api/presupuestos/${presupuesto.id}`);
      assert.equal(datos.estado, 'caducado');
      const aceptar = await otra.pagina('POST', `/p/${tokenDe(enviado.datos)}/aceptar`);
      assert.equal(aceptar.estado, 409);
      assert.match(aceptar.html, /caducó el/);
      assert.equal((await otra.beto('GET', `/api/presupuestos/${presupuesto.id}`)).datos.estado, 'caducado');
    } finally {
      await otra.cerrar();
    }
  });
});
