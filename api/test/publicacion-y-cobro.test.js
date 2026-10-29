import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, arrancar, borradorListo, casoDePrueba, tokenDe } from './ayudas.js';

describe('publicación, facturación, seguimiento, embudo y pilotos', () => {
  let app;
  before(async () => {
    app = await arrancar();
  });
  after(() => app.cerrar());

  // ---- publicacion ----
  test('publicacion › Solo se envía lo especificado › Sale bien: se envía con enlace y correo', async () => {
    const { cliente, presupuesto } = await borradorListo(app.beto, { nombre: 'Envío correcto', casos: [casoDePrueba('Pedido desde el móvil', 3)] });
    const { estado, datos } = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`, { mensaje: 'Te paso lo que hablamos.' });
    assert.equal(estado, 200);
    assert.equal(datos.estado, 'enviado');
    assert.match(datos.enlacePublico, new RegExp(`^${BASE}/p/[\\w-]+\\.[\\w-]{20,}$`));
    assert.equal(Math.round((Date.parse(datos.caduca) - Date.parse(datos.enviadoEn)) / 86400000), 30);
    assert.equal(datos.correo.entrega.via, 'prueba');
    // El adaptador recibe para, asunto, texto y html; la bandeja de salida guarda el registro sin el HTML.
    const entregado = app.correosEnviados.at(-1);
    assert.equal(entregado.para, 'persona@example.com');
    assert.match(entregado.html, /<a href="https:\/\/cartera\.prueba\/p\//);
    const [correo] = (await app.beto('GET', '/api/correos')).datos;
    assert.equal(correo.para, 'persona@example.com');
    assert.equal(correo.asunto, `Propuesta ${presupuesto.numero}: Propuesta para Envío correcto`);
    assert.ok(correo.texto.includes(datos.enlacePublico));
    assert.ok(correo.texto.includes('Te paso lo que hablamos.'));
    assert.ok(correo.texto.includes('Instalación: 750,00 € + IVA (907,50 € con IVA).'));
    const ficha = await app.beto('GET', `/api/clientes/${cliente.id}`);
    assert.equal(ficha.datos.etapa, 'propuesta');
  });

  test('publicacion › Solo se envía lo especificado › Puede salir mal: casos de uso sin criterios', async () => {
    const ribera = await app.ana('POST', '/api/presupuestos/P-2026-005/enviar');
    assert.equal(ribera.estado, 422);
    assert.match(ribera.datos.mensaje, /CU1 «Leer los pedidos que llegan por correo», CU2 «Confirmar al cliente el plazo de entrega» no tiene criterios/);
    assert.deepEqual(ribera.datos.casosSinCriterios, ['CU1', 'CU2']);
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Sin casos', casos: [] });
    const vacio = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
    assert.equal(vacio.estado, 422);
    assert.match(vacio.datos.mensaje, /sin casos de uso/);
    assert.equal((await app.ana('GET', '/api/presupuestos/P-2026-005')).datos.estado, 'borrador');
    assert.equal((await app.ana('GET', '/api/correos')).datos.length, 0);
  });

  test('publicacion › Abrir la propuesta la marca como vista › Sale bien: la primera apertura pasa a visto', async () => {
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Se abre', casos: [casoDePrueba('Ver los pedidos <del> día', 2, { datosPersonales: true })] });
    const enviado = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
    const { estado, html, cabeceras } = await app.pagina('GET', `/p/${tokenDe(enviado.datos)}`);
    assert.equal(estado, 200);
    assert.match(cabeceras.get('content-security-policy'), /default-src 'none'/);
    assert.ok(html.includes('Ver los pedidos &lt;del&gt; día'));
    assert.ok(html.includes('<b>Dado</b> una situación 1, <b>cuando</b> pasa algo, <b>entonces</b> se ve el resultado.'));
    assert.ok(html.includes('Total instalación'));
    assert.ok(html.includes('1.210,00 €'));
    assert.ok(html.includes('Aceptar la propuesta'));
    await app.pagina('GET', `/p/${tokenDe(enviado.datos)}`);
    const visto = await app.beto('GET', `/api/presupuestos/${presupuesto.id}`);
    assert.equal(visto.datos.estado, 'visto');
    assert.equal(visto.datos.aperturas, 2);
  });

  test('publicacion › Abrir la propuesta la marca como vista › Puede salir mal: un enlace que no existe o una versión sustituida', async () => {
    const inventado = await app.pagina('GET', '/p/no-existe-este-enlace');
    assert.equal(inventado.estado, 404);
    assert.match(inventado.html, /Esta propuesta no existe/);
    // Con la forma buena (usuario real y azar inventado) tampoco: el enlace tiene que existir en su cartera.
    const falsificado = await app.pagina('GET', `/p/${btoa('beto').replace(/=+$/, '')}.${'A'.repeat(24)}`);
    assert.equal(falsificado.estado, 404);
    assert.equal((await app.pagina('POST', `/p/${btoa('beto').replace(/=+$/, '')}.${'A'.repeat(24)}/aceptar`)).estado, 404);
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Sustituida' });
    const v1 = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
    const v2 = await app.beto('POST', `/api/presupuestos/${presupuesto.id}`, { titulo: 'Versión 2' });
    const v2enviada = await app.beto('POST', `/api/presupuestos/${v2.datos.id}/enviar`);
    const vieja = await app.pagina('GET', `/p/${tokenDe(v1.datos)}`);
    assert.match(vieja.html, /Hay una versión más nueva/);
    assert.ok(vieja.html.includes(tokenDe(v2enviada.datos)));
    assert.ok(!vieja.html.includes('Aceptar la propuesta'));
  });

  test('publicacion › El cliente decide desde la página › Sale bien: acepta y el cliente pasa a ganado', async () => {
    const { cliente, presupuesto } = await borradorListo(app.beto, { nombre: 'Acepta' });
    const enviado = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
    await app.pagina('GET', `/p/${tokenDe(enviado.datos)}`);
    const { estado, html } = await app.pagina('POST', `/p/${tokenDe(enviado.datos)}/aceptar`);
    assert.equal(estado, 200);
    assert.match(html, /Propuesta aceptada/);
    const aceptado = await app.beto('GET', `/api/presupuestos/${presupuesto.id}`);
    assert.equal(aceptado.datos.estado, 'aceptado');
    assert.ok(aceptado.datos.decision.fecha);
    const ficha = await app.beto('GET', `/api/clientes/${cliente.id}`);
    assert.equal(ficha.datos.etapa, 'ganado');
    assert.equal(ficha.datos.historialEtapas.at(-1).por, 'cliente');
  });

  test('publicacion › El cliente decide desde la página › Puede salir mal: decidir sobre una propuesta cerrada', async () => {
    const { presupuesto } = await borradorListo(app.beto, { nombre: 'Ya decidido' });
    const enviado = await app.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
    await app.pagina('POST', `/p/${tokenDe(enviado.datos)}/aceptar`);
    const otraVez = await app.pagina('POST', `/p/${tokenDe(enviado.datos)}/rechazar`, { comentario: 'Me lo he pensado' });
    assert.equal(otraVez.estado, 409);
    assert.match(otraVez.html, /ya está aceptada/);
    const sigue = await app.beto('GET', `/api/presupuestos/${presupuesto.id}`);
    assert.equal(sigue.datos.estado, 'aceptado');
    assert.equal(sigue.datos.decision.comentario, '');
  });

  // ---- facturacion ----
  test('facturacion › Se factura caso a caso con el acta aceptada › Sale bien: se factura un caso con su acta aceptada', async () => {
    const { estado, datos } = await app.ana('POST', '/api/presupuestos/P-2026-002/casos/CU2/facturar');
    assert.equal(estado, 200);
    const cu2 = datos.casosDeUso.find((c) => c.codigo === 'CU2');
    assert.equal(cu2.facturado.importeCentimos, 50000);
    assert.equal(datos.aviso, 'CU2 facturado: 500,00 € + IVA');
    // Y el ciclo entero en un caso nuevo: acta, después factura.
    const acta = await app.ana('POST', '/api/presupuestos/P-2026-002/casos/CU3/acta');
    assert.equal(acta.datos.casosDeUso[2].acta.estado, 'aceptada');
    const cu3 = await app.ana('POST', '/api/presupuestos/P-2026-002/casos/cu3/facturar');
    assert.equal(cu3.datos.casosDeUso[2].facturado.importe, '1.500,00 €');
  });

  test('facturacion › Se factura caso a caso con el acta aceptada › Puede salir mal: acta pendiente o presupuesto sin aceptar', async () => {
    const pendiente = await app.ana('POST', '/api/presupuestos/P-2026-002/casos/CU4/facturar');
    assert.equal(pendiente.estado, 422);
    assert.match(pendiente.datos.mensaje, /El acta de CU4 no está aceptada/);
    const sinAceptar = await app.ana('POST', '/api/presupuestos/P-2026-004/casos/CU1/facturar');
    assert.equal(sinAceptar.estado, 422);
    assert.match(sinAceptar.datos.mensaje, /está visto: se factura solo con el presupuesto aceptado/);
    const yaFacturado = await app.ana('POST', '/api/presupuestos/P-2026-002/casos/CU1/facturar');
    assert.equal(yaFacturado.estado, 409);
    const p = (await app.ana('GET', '/api/presupuestos/P-2026-002')).datos;
    assert.equal(p.casosDeUso[3].facturado, null);
  });

  test('facturacion › Un cambio, un criterio nuevo › Sale bien: la ampliación tiene su propio presupuesto', async () => {
    const { estado, datos } = await app.ana('POST', '/api/presupuestos/P-2026-001/ampliacion', {
      titulo: 'Aviso por SMS cuando el técnico va de camino',
      casosDeUso: [
        {
          nombre: 'SMS de «técnico en camino»',
          criterios: [
            { dado: 'un técnico que sale hacia un aviso', cuando: 'pulsa «voy de camino»', entonces: 'el cliente recibe un SMS con la hora aproximada' },
            { dado: 'un cliente sin móvil en la ficha', cuando: 'el técnico sale', entonces: 'no se envía nada y la oficina ve el aviso' },
          ],
          ponderacion: { datosPersonales: true },
        },
      ],
    });
    assert.equal(estado, 201);
    assert.equal(datos.tipo, 'ampliacion');
    assert.equal(datos.padreId, 'P-2026-001-v1');
    assert.equal(datos.numero, 'P-2026-006');
    assert.equal(datos.estado, 'borrador');
    assert.equal(datos.casosDeUso[0].codigo, 'CU5');
    // Precio del punto de Albor (280 €): 2 criterios + datos personales = 4 puntos.
    assert.equal(datos.importes.instalacionCentimos, 4 * 28000);
  });

  test('facturacion › Un cambio, un criterio nuevo › Puede salir mal: ampliación gratis o sobre algo no aceptado', async () => {
    const gratis = await app.ana('POST', '/api/presupuestos/P-2026-002/ampliacion', { titulo: 'Gratis', casosDeUso: [{ nombre: 'Sin criterios', criterios: [] }] });
    assert.equal(gratis.estado, 422);
    assert.match(gratis.datos.mensaje, /Un cambio es un criterio nuevo/);
    const vacia = await app.ana('POST', '/api/presupuestos/P-2026-002/ampliacion', { titulo: 'Vacía' });
    assert.equal(vacia.estado, 422);
    const noAceptado = await app.ana('POST', '/api/presupuestos/P-2026-004/ampliacion', { casosDeUso: [casoDePrueba('Extra')] });
    assert.equal(noAceptado.estado, 422);
    assert.match(noAceptado.datos.mensaje, /se amplía solo con el presupuesto aceptado/);
    const antes = (await app.ana('GET', '/api/presupuestos')).datos.length;
    assert.equal(antes, (await app.cartera('ana')).presupuestos.length);
  });

  // ---- seguimiento ----
  test('seguimiento › Registrar un seguimiento › Sale bien: queda en la ficha con su próxima fecha', async () => {
    const { estado, datos } = await app.ana('POST', '/api/seguimientos', {
      clienteId: 'obrador-trigal',
      canal: 'llamada',
      nota: 'Le cuento cómo será el presupuesto por casos de uso',
      proximo: '2026-11-02',
    });
    assert.equal(estado, 201);
    const ficha = await app.ana('GET', '/api/clientes/obrador-trigal');
    assert.equal(ficha.datos.seguimientos[0].id, datos.id);
    assert.equal(ficha.datos.seguimientos[0].proximo, '2026-11-02');
  });

  test('seguimiento › Registrar un seguimiento › Puede salir mal: canal desconocido o próxima fecha pasada', async () => {
    const canal = await app.ana('POST', '/api/seguimientos', { clienteId: 'obrador-trigal', canal: 'paloma', nota: 'Hola' });
    assert.equal(canal.estado, 400);
    assert.match(canal.datos.errores.canal, /email, llamada, reunion, whatsapp/);
    const pasada = await app.ana('POST', '/api/seguimientos', { clienteId: 'obrador-trigal', canal: 'email', nota: 'Hola', proximo: '2026-10-01' });
    assert.equal(pasada.estado, 400);
    assert.equal(pasada.datos.errores.proximo, 'La próxima fecha tiene que ser hoy (2026-10-29) o después');
    const otroCliente = await app.ana('POST', '/api/seguimientos', { clienteId: 'obrador-trigal', presupuestoId: 'P-2026-002', canal: 'email', nota: 'Hola' });
    assert.equal(otroCliente.estado, 400);
  });

  test('seguimiento › A quién llamo hoy › Sale bien: aparecen los pendientes con su motivo', async () => {
    const otra = await arrancar();
    try {
      const { datos } = await otra.ana('GET', '/api/hoy');
      const por = Object.fromEntries(datos.entradas.map((e) => [e.cliente.id, e]));
      assert.deepEqual(Object.keys(por).sort(), ['administracion-atalaya', 'albor-climatizacion', 'lince-mudanzas', 'nucleo-pilates', 'ribera-industrial']);
      assert.match(por['ribera-industrial'].motivo, /Quedaste en volver a contactar para el 28 de octubre de 2026 \(ayer\)/);
      assert.match(por['albor-climatizacion'].motivo, /para hoy.*ya que estáis/);
      assert.match(por['nucleo-pilates'].motivo, /enviado hace 12 días y sin seguimiento \(lo ha abierto 2 veces\)/);
      assert.match(por['lince-mudanzas'].motivo, /termina en 3 días y no hay propuesta de pago/);
      assert.match(por['administracion-atalaya'].motivo, /CU2 «Ver las incidencias por urgencia» con el acta aceptada y sin facturar/);
      assert.deepEqual(datos.entradas.map((e) => e.prioridad), [1, 1, 1, 2, 3]);
    } finally {
      await otra.cerrar();
    }
  });

  test('seguimiento › A quién llamo hoy › Puede salir mal: lo ya atendido no aparece', async () => {
    const otra = await arrancar();
    try {
      const { cliente, presupuesto } = await borradorListo(otra.beto, { nombre: 'Atendido' });
      await otra.beto('POST', `/api/presupuestos/${presupuesto.id}/enviar`);
      otra.reloj.avanzarDias(6);
      await otra.beto('POST', '/api/seguimientos', { clienteId: cliente.id, canal: 'llamada', nota: 'Lo está mirando', proximo: '2026-11-11' });
      otra.reloj.avanzarDias(2);
      assert.equal((await otra.beto('GET', '/api/hoy')).datos.total, 0);
      // Si no se hubiera atendido, ocho días después sí saldría.
      const { presupuesto: olvidado } = await borradorListo(otra.carla, { nombre: 'Olvidado' });
      await otra.carla('POST', `/api/presupuestos/${olvidado.id}/enviar`);
      otra.reloj.avanzarDias(8);
      assert.equal((await otra.carla('GET', '/api/hoy')).datos.total, 1);
    } finally {
      await otra.cerrar();
    }
  });

  // ---- embudo ----
  test('embudo › Resumen del embudo › Sale bien: importe en juego por etapa y lo facturado', async () => {
    const otra = await arrancar();
    try {
      const { datos } = await otra.ana('GET', '/api/embudo');
      const etapa = Object.fromEntries(datos.etapas.map((e) => [e.etapa, e]));
      assert.equal(etapa.propuesta.clientes, 2);
      assert.equal(etapa.propuesta.enJuegoCentimos, 375000);
      assert.equal(etapa.ganado.clientes, 2);
      assert.equal(datos.aceptado.instalacionCentimos, 420000 + 450000);
      assert.equal(datos.aceptado.facturadoCentimos, 5 * 28000 + 4 * 28000 + 6 * 25000);
      assert.equal(datos.aceptado.cuotasMensualesCentimos, 42000 + 45000);
      assert.match(datos.aceptado.texto, /pendiente de facturar 4.680,00 €/);
    } finally {
      await otra.cerrar();
    }
  });

  test('embudo › Resumen del embudo › Puede salir mal: lo caducado no cuenta', async () => {
    const otra = await arrancar();
    try {
      otra.reloj.avanzarDias(19);
      const { datos } = await otra.ana('GET', '/api/embudo');
      assert.equal(datos.enJuegoCentimos, 0);
      assert.equal(datos.caducados, 1);
    } finally {
      await otra.cerrar();
    }
  });

  // ---- pilotos ----
  test('pilotos › Hoja de retorno › Sale bien: ahorro, cuota y meses para amortizar', async () => {
    const { estado, datos } = await app.ana('GET', '/api/pilotos/P-2026-003/retorno');
    assert.equal(estado, 200);
    assert.equal(datos.ahorroMensualCentimos, 272000);
    assert.equal(datos.cuotaMensualCentimos, 33000);
    assert.equal(datos.instalacionCentimos, 325000);
    assert.equal(datos.mesesParaAmortizar, 1.4);
    assert.match(datos.conclusion, /se recupera en 1,4 meses/);
  });

  test('pilotos › Hoja de retorno › Puede salir mal: un piloto que no se amortiza', async () => {
    const { estado, datos } = await app.ana('POST', '/api/pilotos/P-2026-003/metricas', {
      metricas: [{ nombre: 'Horas de presupuestos', unidad: 'horas', antes: 20, despues: 15, valorUnidadEuros: 25 }],
    });
    assert.equal(estado, 200);
    assert.equal(datos.seAmortiza, false);
    assert.equal(datos.mesesParaAmortizar, null);
    assert.match(datos.conclusion, /no se amortiza: el ahorro \(125,00 € al mes\) no cubre la cuota \(330,00 € al mes\)/);
    const noPiloto = await app.ana('GET', '/api/pilotos/P-2026-002/retorno');
    assert.equal(noPiloto.estado, 422);
    assert.match(noPiloto.datos.mensaje, /solo los pilotos tienen hoja de retorno/);
  });
});
