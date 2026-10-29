import { ErrorDominio, comprobarErrores } from './dominio/errores.js';
import { ETAPAS, NOMBRE_ETAPA, cambiarEtapa, validarCliente } from './dominio/clientes.js';
import {
  ESTADOS,
  aceptarActa,
  comoSeModifica,
  comprobarAmpliacion,
  comprobarEnviable,
  decidir,
  estadoEfectivo,
  facturarCaso,
  marcarEnviado,
  nuevaVersion,
  nuevoPresupuesto,
  registrarApertura,
  siguienteCodigo,
  siguienteNumero,
  validarCasos,
  validarContenido,
  validarMetricas,
} from './dominio/presupuestos.js';
import { calcularImportes, euros } from './dominio/importes.js';
import { validarSeguimiento } from './dominio/seguimientos.js';
import { aQuienLlamoHoy } from './dominio/hoy.js';
import { resumenEmbudo } from './dominio/embudo.js';
import { hojaDeRetorno } from './dominio/retorno.js';
import { fechaLarga } from './dominio/fechas.js';
import { LIMITES, slug, texto } from './dominio/textos.js';
import { usuarioDeTokenPublico } from './web/azar.js';
import { carteraDeClase, carteraVacia } from './semilla.js';

// Una cartera tiene que caber en un Durable Object (valor de 128 KiB): por encima de esto, no se guarda.
export const LIMITE_CARTERA = 120 * 1024;

// Escrituras en serie por usuario dentro de este proceso o isolate. La cola vive con el almacén.
const colas = new WeakMap();

// Las operaciones de la cartera. Cada usuario tiene la suya (leerCartera / guardarCartera), así que
// lo de otro usuario no existe para él (404): ni para leer ni para escribir.
// Un usuario sin cartera (por ejemplo, el primero que entra por OAuth) recibe la cartera de clase.
export function crearCartera({ almacen, reloj, azar, correo, sembrarAlEntrar = true }) {
  if (!colas.has(almacen)) colas.set(almacen, new Map());
  const cola = colas.get(almacen);

  function enCola(usuarioId, tarea) {
    const anterior = cola.get(usuarioId) ?? Promise.resolve();
    const actual = anterior.then(tarea);
    const sigue = actual.catch(() => {});
    cola.set(usuarioId, sigue);
    sigue.then(() => {
      if (cola.get(usuarioId) === sigue) cola.delete(usuarioId);
    });
    return actual;
  }

  const nueva = (usuario) => (sembrarAlEntrar ? carteraDeClase({ usuario, ahora: reloj(), azar }) : carteraVacia());

  // Lee, cambia y guarda. Si el cambio lanza un error, no se guarda nada.
  function modificar(usuario, cambio) {
    return enCola(usuario.id, async () => {
      const c = (await almacen.leerCartera(usuario.id)) ?? nueva(usuario);
      const resultado = await cambio(c);
      const bytes = new TextEncoder().encode(JSON.stringify(c)).length;
      if (bytes > LIMITE_CARTERA) {
        throw new ErrorDominio('regla', `Tu cartera ha llegado a su tamaño máximo (${Math.round(LIMITE_CARTERA / 1024)} KB) y este cambio no se ha guardado`);
      }
      await almacen.guardarCartera(usuario.id, c);
      return resultado;
    });
  }

  async function leer(usuario) {
    return (await almacen.leerCartera(usuario.id)) ?? modificar(usuario, (c) => c);
  }

  // ---- Búsquedas dentro de la cartera ----
  function buscarCliente(c, id) {
    const cliente = c.clientes.find((x) => x.id === String(id ?? '').trim().toLowerCase());
    if (!cliente) throw new ErrorDominio('no-encontrado', `No encontramos el cliente «${id}» en tu cartera`);
    return cliente;
  }

  // Acepta el id de una versión (P-2026-004-v2) o el número (P-2026-004), que da la versión más reciente.
  function buscarPresupuesto(c, ref) {
    const r = String(ref ?? '').trim().toUpperCase();
    const exacto = c.presupuestos.find((p) => p.id.toUpperCase() === r);
    if (exacto) return exacto;
    const versiones = c.presupuestos.filter((p) => p.numero === r).sort((a, b) => b.version - a.version);
    if (!versiones.length) throw new ErrorDominio('no-encontrado', `No encontramos el presupuesto «${ref}» en tu cartera`);
    return versiones[0];
  }

  const clienteDe = (c, p) => c.clientes.find((x) => x.id === p.clienteId);
  // Precio del punto: el congelado al enviar o, en borrador, el pactado hoy con el cliente.
  const precioDe = (c, p) => p.precioPunto ?? clienteDe(c, p).precioPunto;
  const versionMasNueva = (c, p) => c.presupuestos.find((o) => o.numero === p.numero && o.version > p.version) ?? null;
  const tieneAceptado = (c, clienteId) =>
    c.presupuestos.some((p) => p.clienteId === clienteId && !p.gratuito && estadoEfectivo(p, reloj()) === 'aceptado');
  const enlace = (base, p) => (p.tokenPublico ? `${base}/p/${p.tokenPublico}` : null);
  const reemplazar = (lista, viejo, nuevo) => {
    lista[lista.indexOf(viejo)] = nuevo;
    return nuevo;
  };

  // ---- Presentación: lo que devuelve la API, pensado para que lo lea una persona o una IA ----
  function presentarCliente(x) {
    return {
      id: x.id,
      nombre: x.nombre,
      sector: x.sector,
      contacto: x.contacto,
      etapa: x.etapa,
      etapaNombre: NOMBRE_ETAPA[x.etapa],
      precioPuntoCentimos: x.precioPunto,
      precioPunto: euros(x.precioPunto),
      notas: x.notas,
      creado: x.creado,
    };
  }

  function presentarPresupuesto(c, p, { base, resumido = false } = {}) {
    const precio = precioDe(c, p);
    const imp = calcularImportes(p, precio);
    const cliente = clienteDe(c, p);
    const resumen = {
      id: p.id,
      numero: p.numero,
      version: p.version,
      tipo: p.tipo,
      estado: estadoEfectivo(p, reloj()),
      titulo: p.titulo,
      cliente: { id: cliente.id, nombre: cliente.nombre },
      casosDeUso: p.casosDeUso.length,
      criterios: imp.criterios,
      puntos: imp.puntos,
      instalacion: euros(imp.instalacion),
      mantenimientoMensual: euros(imp.mantenimientoMensual),
      gratuito: p.gratuito,
      enviadoEn: p.enviadoEn,
      caduca: p.caduca,
      aperturas: p.nAperturas,
    };
    if (resumido) return resumen;
    return {
      ...resumen,
      casosDeUso: p.casosDeUso.map((k, i) => ({
        codigo: k.codigo,
        nombre: k.nombre,
        criterios: k.criterios,
        ponderacion: k.ponderacion,
        puntos: imp.casos[i].puntos,
        importeCentimos: imp.casos[i].importe,
        importe: euros(imp.casos[i].importe),
        acta: k.acta,
        facturado: k.facturado ? { fecha: k.facturado.fecha, importeCentimos: k.facturado.importe, importe: euros(k.facturado.importe) } : null,
      })),
      resumen: p.resumen,
      versionAnteriorId: p.versionAnteriorId,
      sustituidoPor: p.sustituidoPor,
      padreId: p.padreId,
      precioPuntoCentimos: precio,
      precioPunto: euros(precio),
      precioCongelado: p.precioPunto !== null,
      mantenimientoPactado: p.mantenimientoPactado !== null,
      importes: {
        instalacionCentimos: imp.instalacion,
        ivaInstalacionCentimos: imp.ivaInstalacion,
        totalInstalacionCentimos: imp.totalInstalacion,
        mantenimientoMensualCentimos: imp.mantenimientoMensual,
        ivaMantenimientoCentimos: imp.ivaMantenimiento,
        totalMantenimientoCentimos: imp.totalMantenimiento,
        texto: `${imp.puntos} puntos a ${euros(precio)}: instalación ${euros(imp.instalacion)} + IVA ${euros(imp.ivaInstalacion)} = ${euros(imp.totalInstalacion)}. Mantenimiento ${euros(imp.mantenimientoMensual)} al mes + IVA ${euros(imp.ivaMantenimiento)} = ${euros(imp.totalMantenimiento)}.`,
      },
      piloto: p.piloto,
      primeraApertura: p.primeraApertura ?? null,
      ultimaApertura: p.aperturas.at(-1)?.fecha ?? null,
      decision: p.decision,
      enlacePublico: enlace(base, p),
      creado: p.creado,
      actualizado: p.actualizado,
    };
  }

  const presentarSeguimiento = (s) => ({ id: s.id, clienteId: s.clienteId, presupuestoId: s.presupuestoId, fecha: s.fecha, canal: s.canal, nota: s.nota, proximo: s.proximo });

  // ---- Usuario ----
  async function yo(usuario) {
    const c = await leer(usuario);
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email ?? null,
      tarifaPuntoCentimos: usuario.tarifaPunto,
      tarifaPunto: euros(usuario.tarifaPunto),
      clientes: c.clientes.length,
      presupuestos: c.presupuestos.length,
    };
  }

  // ---- Clientes ----
  async function listarClientes(usuario, { etapa } = {}) {
    if (etapa && !ETAPAS.includes(etapa)) {
      throw new ErrorDominio('validacion', `Esa etapa no existe. Las etapas son: ${ETAPAS.join(', ')}`);
    }
    const c = await leer(usuario);
    return c.clientes
      .filter((x) => !etapa || x.etapa === etapa)
      .sort((a, b) => ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa) || a.nombre.localeCompare(b.nombre, 'es'))
      .map(presentarCliente);
  }

  function crearCliente(usuario, entrada) {
    const campos = validarCliente(entrada);
    const etapa = entrada.etapa ?? 'contacto';
    if (!ETAPAS.includes(etapa) || etapa === 'ganado') {
      throw new ErrorDominio('validacion', 'Un cliente nuevo empieza en contacto, reunion, propuesta, negociacion o perdido', {
        errores: { etapa: 'Etapa no válida para un alta' },
      });
    }
    return modificar(usuario, (c) => {
      const base = slug(campos.nombre);
      let id = base;
      for (let n = 2; c.clientes.some((x) => x.id === id); n++) id = `${base}-${n}`;
      const fecha = reloj().toISOString();
      const cliente = {
        id,
        nombre: campos.nombre,
        sector: campos.sector ?? '',
        contacto: campos.contacto ?? { nombre: '', email: '' },
        etapa,
        historialEtapas: [{ de: null, a: etapa, fecha, por: 'usuario', nota: 'Alta' }],
        precioPunto: campos.precioPunto ?? usuario.tarifaPunto,
        notas: campos.notas ?? '',
        creado: fecha,
        actualizado: fecha,
      };
      c.clientes.push(cliente);
      return presentarCliente(cliente);
    });
  }

  async function fichaCliente(usuario, id, { base }) {
    const c = await leer(usuario);
    const cliente = buscarCliente(c, id);
    return {
      ...presentarCliente(cliente),
      historialEtapas: cliente.historialEtapas,
      presupuestos: c.presupuestos
        .filter((p) => p.clienteId === cliente.id)
        .sort((a, b) => a.numero.localeCompare(b.numero) || a.version - b.version)
        .map((p) => presentarPresupuesto(c, p, { base, resumido: true })),
      seguimientos: c.seguimientos
        .filter((s) => s.clienteId === cliente.id)
        .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))
        .map(presentarSeguimiento),
    };
  }

  function editarCliente(usuario, id, entrada) {
    const campos = validarCliente(entrada, { parcial: true });
    return modificar(usuario, (c) => {
      const cliente = buscarCliente(c, id);
      Object.assign(cliente, campos, { actualizado: reloj().toISOString() });
      return presentarCliente(cliente);
    });
  }

  function cambiarEtapaCliente(usuario, id, { etapa, nota }) {
    const errores = {};
    const limpia = texto(nota, 'nota', errores, { max: LIMITES.nota, etiqueta: 'la nota' });
    comprobarErrores(errores);
    return modificar(usuario, (c) => {
      const actual = buscarCliente(c, id);
      const cliente = reemplazar(c.clientes, actual, cambiarEtapa(actual, etapa, { tieneAceptado: tieneAceptado(c, actual.id), ahora: reloj(), nota: limpia }));
      return { ...presentarCliente(cliente), historialEtapas: cliente.historialEtapas };
    });
  }

  // ---- Presupuestos ----
  async function listarPresupuestos(usuario, { estado, cliente } = {}, { base }) {
    if (estado && !ESTADOS.includes(estado)) {
      throw new ErrorDominio('validacion', `Ese estado no existe. Los estados son: ${ESTADOS.join(', ')}`);
    }
    const c = await leer(usuario);
    return c.presupuestos
      .filter((p) => (!estado || estadoEfectivo(p, reloj()) === estado) && (!cliente || p.clienteId === cliente))
      .sort((a, b) => b.numero.localeCompare(a.numero) || b.version - a.version)
      .map((p) => presentarPresupuesto(c, p, { base, resumido: true }));
  }

  function crearPresupuesto(usuario, entrada, { base }) {
    const tipo = entrada.tipo ?? 'proyecto';
    if (tipo === 'ampliacion') {
      throw new ErrorDominio('regla', 'Las ampliaciones se crean desde el presupuesto aceptado que amplían');
    }
    const contenido = validarContenido(entrada, { tipo });
    return modificar(usuario, (c) => {
      const cliente = buscarCliente(c, entrada.clienteId);
      const { anio, n, numero } = siguienteNumero(c.contador, reloj());
      const p = nuevoPresupuesto({ numero, clienteId: cliente.id, tipo, contenido, ahora: reloj() });
      c.contador[anio] = n;
      c.presupuestos.push(p);
      return presentarPresupuesto(c, p, { base });
    });
  }

  async function verPresupuesto(usuario, ref, { base }) {
    const c = await leer(usuario);
    return presentarPresupuesto(c, buscarPresupuesto(c, ref), { base });
  }

  // El borrador se cambia en su sitio; lo ya enviado da una versión nueva y la anterior no se toca.
  // «preparar» recibe el presupuesto actual y devuelve la función que aplica el cambio.
  function modificarPresupuesto(usuario, ref, preparar, { base }) {
    return modificar(usuario, (c) => {
      const actual = buscarPresupuesto(c, ref);
      const cambiar = preparar(actual);
      const modo = comoSeModifica(actual, reloj(), versionMasNueva(c, actual));
      if (modo === 'en-sitio') {
        const p = reemplazar(c.presupuestos, actual, { ...cambiar(structuredClone(actual)), actualizado: reloj().toISOString() });
        return presentarPresupuesto(c, p, { base });
      }
      const nuevaV = cambiar(nuevaVersion(actual, reloj()));
      c.presupuestos.push(nuevaV);
      return {
        ...presentarPresupuesto(c, nuevaV, { base }),
        aviso: `${actual.id} ya estaba ${estadoEfectivo(actual, reloj())} y no se edita: he creado la versión ${nuevaV.version} (${nuevaV.id}) en borrador. Cuando la envíes, la anterior quedará sustituida.`,
      };
    });
  }

  function editarPresupuesto(usuario, ref, entrada, { base }) {
    return modificarPresupuesto(
      usuario,
      ref,
      (actual) => {
        const contenido = validarContenido(entrada, { parcial: true, tipo: actual.tipo });
        // Al sustituir la lista entera, los códigos se renumeran desde el primero del presupuesto.
        if (contenido.casosDeUso) contenido.casosDeUso = validarCasos(entrada.casosDeUso, { desde: actual.primerCodigo ?? 1 });
        return (p) => ({ ...p, ...contenido, piloto: contenido.piloto ? { ...p.piloto, ...contenido.piloto } : p.piloto });
      },
      { base },
    );
  }

  function anadirCaso(usuario, ref, entrada, { base }) {
    return modificarPresupuesto(
      usuario,
      ref,
      (actual) => {
        const desde = actual.casosDeUso.length ? siguienteCodigo(actual.casosDeUso) : actual.primerCodigo ?? 1;
        const [caso] = validarCasos([entrada], { desde, ruta: 'caso', rutaDe: () => 'caso' });
        return (p) => ({ ...p, casosDeUso: [...p.casosDeUso, caso] });
      },
      { base },
    );
  }

  async function enviarPresupuesto(usuario, ref, entrada, { base }) {
    const errores = {};
    const mensaje = texto(entrada.mensaje, 'mensaje', errores, { max: LIMITES.mensaje, etiqueta: 'el mensaje' });
    comprobarErrores(errores);
    const { presentado, correoGuardado, html } = await modificar(usuario, (c) => {
      const actual = buscarPresupuesto(c, ref);
      comprobarEnviable(actual, reloj());
      const cliente = clienteDe(c, actual);
      if (!cliente.contacto?.email) {
        throw new ErrorDominio('regla', `Falta el email de contacto de ${cliente.nombre}: añádelo en la ficha del cliente antes de enviar`);
      }
      // Al enviar una versión nueva, la anterior queda sustituida (salvo que el cliente ya la hubiera aceptado).
      if (actual.versionAnteriorId) {
        const anterior = c.presupuestos.find((p) => p.id === actual.versionAnteriorId);
        if (estadoEfectivo(anterior, reloj()) === 'aceptado') {
          throw new ErrorDominio('conflicto', `El cliente ya aceptó ${anterior.id}: esta versión no se envía. Si hace falta un cambio, crea una ampliación.`);
        }
        anterior.estado = 'sustituido';
        anterior.sustituidoPor = actual.id;
      }
      const enviado = reemplazar(c.presupuestos, actual, marcarEnviado(actual, { precioPunto: cliente.precioPunto, token: azar.tokenPublico(usuario.id), ahora: reloj() }));
      if (['contacto', 'reunion'].includes(cliente.etapa)) {
        reemplazar(c.clientes, cliente, cambiarEtapa(cliente, 'propuesta', { tieneAceptado: false, ahora: reloj(), por: 'sistema', nota: `Enviado ${enviado.id}` }));
      }
      const { registro, html } = componerCorreo({ usuario, cliente, presupuesto: enviado, mensaje, enlacePublico: enlace(base, enviado) });
      c.correos.push(registro);
      return { presentado: presentarPresupuesto(c, enviado, { base }), correoGuardado: registro, html };
    });
    // La entrega va después de guardar: si fallara, el envío y el correo siguen registrados.
    let entrega;
    try {
      entrega = await correo.enviarCorreo({ para: correoGuardado.para, paraNombre: correoGuardado.paraNombre, asunto: correoGuardado.asunto, texto: correoGuardado.texto, html });
    } catch (error) {
      entrega = { via: correo.via ?? 'desconocida', error: String(error?.message ?? error) };
    }
    entrega = { ...entrega, fecha: reloj().toISOString() };
    await modificar(usuario, (c) => {
      const guardado = c.correos.find((x) => x.id === correoGuardado.id);
      if (guardado) guardado.entrega = entrega;
    });
    return { ...presentado, correo: { id: correoGuardado.id, para: correoGuardado.para, asunto: correoGuardado.asunto, entrega } };
  }

  // El registro de la bandeja de salida no guarda el HTML (se puede rehacer y la cartera tiene que ser pequeña).
  function componerCorreo({ usuario, cliente, presupuesto: p, mensaje, enlacePublico }) {
    const imp = calcularImportes(p, p.precioPunto);
    const saludo = cliente.contacto.nombre || cliente.nombre;
    const asunto = `Propuesta ${p.numero}${p.version > 1 ? ` (versión ${p.version})` : ''}: ${p.titulo}`;
    const lineas = [
      `Hola, ${saludo}:`,
      '',
      mensaje || `Te envío la propuesta «${p.titulo}» que hablamos.`,
      '',
      'Puedes verla, aceptarla o rechazarla aquí:',
      enlacePublico,
      '',
      `Incluye ${p.casosDeUso.length} ${p.casosDeUso.length === 1 ? 'caso de uso' : 'casos de uso'} con ${imp.criterios} criterios de aceptación (${imp.puntos} puntos).`,
      ...(p.gratuito
        ? [`Es un piloto gratuito${p.piloto?.fechaFin ? ` hasta el ${fechaLarga(p.piloto.fechaFin)}` : ''}. Seguir después costaría ${euros(imp.instalacion)} + IVA de instalación y ${euros(imp.mantenimientoMensual)} al mes + IVA.`]
        : [`Instalación: ${euros(imp.instalacion)} + IVA (${euros(imp.totalInstalacion)} con IVA).`, `Mantenimiento: ${euros(imp.mantenimientoMensual)} al mes + IVA.`]),
      `Válida hasta el ${fechaLarga(p.caduca)}.`,
      '',
      'Un saludo,',
      usuario.nombre,
    ];
    const html = `<p>${lineas.map((l) => (l === enlacePublico ? `<a href="${escaparHtml(l)}">${escaparHtml(l)}</a>` : escaparHtml(l))).join('<br>')}</p>`;
    return {
      html,
      registro: {
        id: azar.id(),
        presupuestoId: p.id,
        clienteId: cliente.id,
        para: cliente.contacto.email,
        paraNombre: cliente.contacto.nombre,
        asunto,
        texto: lineas.join('\n'),
        enlacePublico,
        fecha: reloj().toISOString(),
        entrega: null,
      },
    };
  }

  function aceptarActaDeCaso(usuario, ref, codigo, { base }) {
    return modificar(usuario, (c) => {
      const actual = buscarPresupuesto(c, ref);
      return presentarPresupuesto(c, reemplazar(c.presupuestos, actual, aceptarActa(actual, codigo, reloj())), { base });
    });
  }

  function facturar(usuario, ref, codigo, { base }) {
    return modificar(usuario, (c) => {
      const actual = buscarPresupuesto(c, ref);
      const p = reemplazar(c.presupuestos, actual, facturarCaso(actual, codigo, reloj()));
      const caso = p.casosDeUso.find((k) => k.codigo === String(codigo).toUpperCase());
      return { ...presentarPresupuesto(c, p, { base }), aviso: `${caso.codigo} facturado: ${euros(caso.facturado.importe)} + IVA` };
    });
  }

  function crearAmpliacion(usuario, ref, entrada, { base }) {
    const contenido = validarContenido({ titulo: 'Ampliación', ...entrada, casosDeUso: undefined }, { parcial: true });
    return modificar(usuario, (c) => {
      const padre = buscarPresupuesto(c, ref);
      // La numeración sigue después del aceptado y de las ampliaciones que ya tenga (CU5 después de CU4).
      const familia = [padre, ...c.presupuestos.filter((p) => p.padreId === padre.id)];
      const desde = siguienteCodigo(familia.flatMap((p) => p.casosDeUso));
      const casos = validarCasos(entrada.casosDeUso ?? [], { desde });
      comprobarAmpliacion(padre, casos, reloj());
      const { anio, n, numero } = siguienteNumero(c.contador, reloj());
      const p = nuevoPresupuesto({
        numero,
        clienteId: padre.clienteId,
        tipo: 'ampliacion',
        padreId: padre.id,
        contenido: { ...contenido, titulo: entrada.titulo ? contenido.titulo : `Ampliación de ${padre.numero}`, casosDeUso: casos },
        ahora: reloj(),
      });
      p.primerCodigo = desde;
      c.contador[anio] = n;
      c.presupuestos.push(p);
      return presentarPresupuesto(c, p, { base });
    });
  }

  // ---- Seguimientos ----
  function registrarSeguimiento(usuario, entrada) {
    const campos = validarSeguimiento(entrada, reloj());
    return modificar(usuario, (c) => {
      const cliente = buscarCliente(c, entrada.clienteId);
      let presupuestoId = null;
      if (entrada.presupuestoId) {
        const p = buscarPresupuesto(c, entrada.presupuestoId);
        if (p.clienteId !== cliente.id) throw new ErrorDominio('validacion', `${p.id} no es de ${cliente.nombre}`);
        presupuestoId = p.id;
      }
      const seguimiento = { id: azar.id(), clienteId: cliente.id, presupuestoId, fecha: reloj().toISOString(), ...campos };
      c.seguimientos.push(seguimiento);
      return presentarSeguimiento(seguimiento);
    });
  }

  // ---- Vistas de conjunto ----
  async function hoy(usuario) {
    const c = await leer(usuario);
    const entradas = aQuienLlamoHoy({ clientes: c.clientes, presupuestos: c.presupuestos, seguimientos: c.seguimientos, ahora: reloj() });
    return { fecha: reloj().toISOString(), total: entradas.length, entradas };
  }

  async function embudo(usuario) {
    const c = await leer(usuario);
    return resumenEmbudo({ clientes: c.clientes, presupuestos: c.presupuestos, precioDe: (p) => precioDe(c, p), ahora: reloj() });
  }

  async function correos(usuario) {
    const c = await leer(usuario);
    return [...c.correos].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
  }

  async function retorno(usuario, ref) {
    const c = await leer(usuario);
    const p = buscarPresupuesto(c, ref);
    return hojaDeRetorno(p, precioDe(c, p));
  }

  function actualizarMetricas(usuario, ref, entrada) {
    const errores = {};
    const metricas = validarMetricas(entrada.metricas ?? [], errores);
    comprobarErrores(errores, 'Revisa las métricas');
    return modificar(usuario, (c) => {
      const p = buscarPresupuesto(c, ref);
      if (p.tipo !== 'piloto') throw new ErrorDominio('regla', `${p.id} no es un piloto: solo los pilotos tienen métricas`);
      p.piloto = { ...p.piloto, metricas };
      p.actualizado = reloj().toISOString();
      return hojaDeRetorno(p, precioDe(c, p));
    });
  }

  // ---- Página pública (sin usuario: el enlace es la llave y lleva dentro de quién es la cartera) ----
  async function duenoDe(token) {
    const usuarioId = usuarioDeTokenPublico(token);
    const usuario = usuarioId ? await almacen.leerUsuario(usuarioId) : null;
    const c = usuario ? await almacen.leerCartera(usuario.id) : null;
    return c?.presupuestos.some((p) => p.tokenPublico === token) ? usuario : null;
  }

  function vistaPublica(c, usuario, p, base) {
    const nuevaV = p.sustituidoPor ? c.presupuestos.find((o) => o.id === p.sustituidoPor) : null;
    return {
      token: p.tokenPublico,
      presupuesto: presentarPresupuesto(c, p, { base }),
      proveedor: usuario.nombre,
      enlaceVersionNueva: nuevaV ? enlace(base, nuevaV) : null,
    };
  }

  // Abrir la página registra la apertura (y pasa de enviado a visto). Devuelve null si el enlace no existe.
  async function abrirPublica(token, { base }) {
    const usuario = await duenoDe(token);
    if (!usuario) return null;
    return modificar(usuario, (c) => {
      const actual = c.presupuestos.find((p) => p.tokenPublico === token);
      return vistaPublica(c, usuario, reemplazar(c.presupuestos, actual, registrarApertura(actual, reloj())), base);
    });
  }

  // Sin registrar apertura: para volver a pintar la página tras un intento fallido.
  async function vistaPorToken(token, { base }) {
    const usuario = await duenoDe(token);
    if (!usuario) return null;
    const c = await almacen.leerCartera(usuario.id);
    return vistaPublica(c, usuario, c.presupuestos.find((p) => p.tokenPublico === token), base);
  }

  async function decidirPublica(token, decision, comentarioEntrada, { base }) {
    const errores = {};
    const comentario = texto(comentarioEntrada, 'comentario', errores, { max: LIMITES.comentario, etiqueta: 'el comentario' });
    comprobarErrores(errores);
    const usuario = await duenoDe(token);
    if (!usuario) throw new ErrorDominio('no-encontrado', 'Esta propuesta no existe');
    return modificar(usuario, (c) => {
      const actual = c.presupuestos.find((p) => p.tokenPublico === token);
      const p = reemplazar(c.presupuestos, actual, decidir(actual, decision, comentario, reloj()));
      const cliente = clienteDe(c, p);
      if (decision === 'aceptar' && !p.gratuito && cliente.etapa !== 'ganado') {
        reemplazar(c.clientes, cliente, cambiarEtapa(cliente, 'ganado', { tieneAceptado: true, ahora: reloj(), por: 'cliente', nota: `Aceptado ${p.id}` }));
      }
      return vistaPublica(c, usuario, p, base);
    });
  }

  return {
    yo,
    listarClientes,
    crearCliente,
    fichaCliente,
    editarCliente,
    cambiarEtapaCliente,
    listarPresupuestos,
    crearPresupuesto,
    verPresupuesto,
    editarPresupuesto,
    anadirCaso,
    enviarPresupuesto,
    aceptarActaDeCaso,
    facturar,
    crearAmpliacion,
    registrarSeguimiento,
    hoy,
    embudo,
    correos,
    retorno,
    actualizarMetricas,
    abrirPublica,
    vistaPorToken,
    decidirPublica,
  };
}

export function escaparHtml(t) {
  return String(t ?? '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
}
