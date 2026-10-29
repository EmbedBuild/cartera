import { ErrorDominio, comprobarErrores } from './errores.js';
import { INCERTIDUMBRE, VALIDEZ_DIAS, centimosDesdeEuros, puntosDeCaso } from './importes.js';
import { LIMITES, MAX_CASOS, MAX_CRITERIOS, MAX_METRICAS, texto } from './textos.js';
import { esDia, fechaLarga, sumarDias } from './fechas.js';

export const TIPOS = Object.freeze(['proyecto', 'ampliacion', 'piloto']);
export const ESTADOS = Object.freeze(['borrador', 'enviado', 'visto', 'aceptado', 'rechazado', 'caducado', 'sustituido']);
const ABIERTOS = ['enviado', 'visto'];
const MAX_APERTURAS_GUARDADAS = 20;

// Caducado no se guarda: se calcula al consultar (30 días desde el envío sin decisión).
export function estadoEfectivo(presupuesto, ahora) {
  if (ABIERTOS.includes(presupuesto.estado) && presupuesto.caduca && ahora.getTime() > Date.parse(presupuesto.caduca)) {
    return 'caducado';
  }
  return presupuesto.estado;
}

export const estaAbierto = (presupuesto, ahora) => ABIERTOS.includes(estadoEfectivo(presupuesto, ahora));

// Número por cartera y año: P-2026-001. Las versiones comparten número. «contador» es { año: último número }.
export function siguienteNumero(contador, ahora) {
  const anio = ahora.getUTCFullYear();
  const n = (contador[anio] ?? 0) + 1;
  return { anio, n, numero: `P-${anio}-${String(n).padStart(3, '0')}` };
}

export const idDe = (numero, version) => `${numero}-v${version}`;

// Un caso de uso tal y como se guarda. Los puntos o importes que lleguen de fuera ni se leen.
function validarCaso(entrada, codigo, ruta, errores) {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    errores[ruta] = 'Cada caso de uso tiene que llevar nombre y criterios';
    return null;
  }
  const nombre = texto(entrada.nombre, `${ruta}.nombre`, errores, { max: LIMITES.casoNombre, obligatorio: true, etiqueta: 'el nombre del caso de uso' });
  const criteriosEntrada = entrada.criterios ?? [];
  const criterios = [];
  if (!Array.isArray(criteriosEntrada)) errores[`${ruta}.criterios`] = 'Los criterios tienen que ser una lista';
  else if (criteriosEntrada.length > MAX_CRITERIOS) errores[`${ruta}.criterios`] = `Como mucho ${MAX_CRITERIOS} criterios por caso de uso`;
  else {
    criteriosEntrada.forEach((c, i) => {
      const r = `${ruta}.criterios[${i}]`;
      const partes = {};
      for (const parte of ['dado', 'cuando', 'entonces']) {
        partes[parte] = texto(c?.[parte], `${r}.${parte}`, errores, { max: LIMITES.criterio, etiqueta: `el «${parte}»` });
      }
      if (!partes.dado || !partes.cuando || !partes.entonces) {
        errores[r] = 'Cada criterio necesita dado, cuando y entonces';
      }
      criterios.push(partes);
    });
  }
  const p = entrada.ponderacion ?? {};
  const incertidumbre = p.incertidumbre ?? 'baja';
  if (!(incertidumbre in INCERTIDUMBRE)) errores[`${ruta}.ponderacion.incertidumbre`] = 'La incertidumbre es baja, media o alta';
  return {
    codigo,
    nombre,
    criterios,
    ponderacion: { datosPersonales: p.datosPersonales === true, pagos: p.pagos === true, incertidumbre },
    acta: { estado: 'pendiente', fecha: null },
    facturado: null,
  };
}

// «rutaDe» nombra cada caso en los errores: casosDeUso[0]… o, al añadir uno suelto, «caso».
export function validarCasos(lista, { desde = 1, ruta = 'casosDeUso', rutaDe = (i) => `${ruta}[${i}]` } = {}) {
  const errores = {};
  if (!Array.isArray(lista)) {
    errores[ruta] = 'Los casos de uso tienen que ser una lista';
    comprobarErrores(errores, 'Revisa los casos de uso');
  }
  if (lista.length > MAX_CASOS) errores[ruta] = `Como mucho ${MAX_CASOS} casos de uso por presupuesto`;
  const casos = lista.map((c, i) => validarCaso(c, `CU${desde + i}`, rutaDe(i), errores));
  comprobarErrores(errores, mensajeCriterios(errores) ?? 'Revisa los casos de uso');
  return casos;
}

function mensajeCriterios(errores) {
  return Object.values(errores).includes('Cada criterio necesita dado, cuando y entonces')
    ? 'Cada criterio necesita dado, cuando y entonces'
    : null;
}

function validarPiloto(entrada, errores) {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    errores.piloto = 'Un piloto necesita fecha de fin y métricas';
    return null;
  }
  if (!esDia(entrada.fechaFin)) errores['piloto.fechaFin'] = 'La fecha de fin del piloto va como AAAA-MM-DD';
  const piloto = { fechaFin: entrada.fechaFin };
  if (esDia(entrada.inicio)) piloto.inicio = entrada.inicio;
  // Sin métricas en la entrada, se conservan las que hubiera.
  if (entrada.metricas !== undefined) piloto.metricas = validarMetricas(entrada.metricas, errores);
  return piloto;
}

// Métricas de un piloto: cuánto había antes, cuánto hay ahora y lo que vale cada unidad (al mes).
export function validarMetricas(lista, errores = {}) {
  if (!Array.isArray(lista) || lista.length > MAX_METRICAS) {
    errores['piloto.metricas'] = `Las métricas son una lista de como mucho ${MAX_METRICAS}`;
    return [];
  }
  return lista.map((m, i) => {
    const r = `piloto.metricas[${i}]`;
    const nombre = texto(m?.nombre, `${r}.nombre`, errores, { max: LIMITES.metrica, obligatorio: true, etiqueta: 'el nombre de la métrica' });
    const unidad = texto(m?.unidad, `${r}.unidad`, errores, { max: 40, etiqueta: 'la unidad' });
    for (const campo of ['antes', 'despues']) {
      if (typeof m?.[campo] !== 'number' || !Number.isFinite(m[campo]) || m[campo] < 0) {
        errores[`${r}.${campo}`] = `«${campo}» tiene que ser un número de 0 en adelante`;
      }
    }
    let valorUnidad = 0;
    try {
      valorUnidad = centimosDesdeEuros(m?.valorUnidadEuros, `${r}.valorUnidadEuros`, 'El valor de cada unidad');
    } catch (e) {
      Object.assign(errores, e.extra.errores);
    }
    return { nombre, unidad, antes: m?.antes, despues: m?.despues, valorUnidad };
  });
}

// Título, resumen, casos, mantenimiento y piloto. Con «parcial», solo lo que llega (para editar).
export function validarContenido(entrada, { parcial = false, tipo = 'proyecto' } = {}) {
  const errores = {};
  const datos = {};
  const llega = (campo) => !parcial || entrada[campo] !== undefined;
  if (llega('titulo')) datos.titulo = texto(entrada.titulo, 'titulo', errores, { max: LIMITES.titulo, obligatorio: true, etiqueta: 'el título' });
  if (llega('resumen')) datos.resumen = texto(entrada.resumen, 'resumen', errores, { max: LIMITES.resumen, etiqueta: 'el resumen' });
  if (entrada.mantenimientoMensualEuros !== undefined) {
    // null devuelve el mantenimiento al 10 % por defecto.
    if (entrada.mantenimientoMensualEuros === null) datos.mantenimientoPactado = null;
    else {
      try {
        datos.mantenimientoPactado = centimosDesdeEuros(entrada.mantenimientoMensualEuros, 'mantenimientoMensualEuros', 'El mantenimiento mensual');
      } catch (e) {
        Object.assign(errores, e.extra.errores);
      }
    }
  }
  if (tipo === 'piloto' && (llega('piloto') || entrada.piloto !== undefined)) {
    datos.piloto = validarPiloto(entrada.piloto, errores);
    if (entrada.gratuito !== undefined) datos.gratuito = entrada.gratuito !== false;
  }
  comprobarErrores(errores, 'Revisa el presupuesto');
  if (llega('casosDeUso')) datos.casosDeUso = validarCasos(entrada.casosDeUso ?? []);
  return datos;
}

export function nuevoPresupuesto({ id, numero, clienteId, tipo = 'proyecto', padreId = null, contenido, ahora }) {
  if (!TIPOS.includes(tipo)) {
    throw new ErrorDominio('validacion', 'El tipo es proyecto, ampliacion o piloto', { errores: { tipo: 'Tipo desconocido' } });
  }
  if (tipo === 'piloto' && !contenido.piloto) {
    throw new ErrorDominio('validacion', 'Un piloto necesita fecha de fin y métricas', { errores: { piloto: 'Falta el piloto' } });
  }
  const fecha = ahora.toISOString();
  return {
    id: id ?? idDe(numero, 1),
    numero,
    version: 1,
    versionAnteriorId: null,
    tipo,
    padreId,
    clienteId,
    titulo: contenido.titulo,
    resumen: contenido.resumen ?? '',
    casosDeUso: contenido.casosDeUso ?? [],
    mantenimientoPactado: contenido.mantenimientoPactado ?? null,
    gratuito: tipo === 'piloto' ? contenido.gratuito !== false : false,
    piloto: tipo === 'piloto' ? { inicio: fecha.slice(0, 10), metricas: [], ...contenido.piloto } : null,
    estado: 'borrador',
    creado: fecha,
    actualizado: fecha,
    enviadoEn: null,
    caduca: null,
    precioPunto: null,
    tokenPublico: null,
    aperturas: [],
    nAperturas: 0,
    decision: null,
    sustituidoPor: null,
  };
}

// Qué se puede cambiar y cómo: el borrador se edita; lo enviado, visto, rechazado o caducado da una versión nueva.
export function comoSeModifica(presupuesto, ahora, versionMasNueva) {
  const estado = estadoEfectivo(presupuesto, ahora);
  if (estado === 'borrador') return 'en-sitio';
  if (estado === 'aceptado') {
    throw new ErrorDominio('regla', `El presupuesto ${presupuesto.numero} está aceptado y ya no cambia. Los cambios van en una ampliación, con su propio presupuesto.`);
  }
  if (estado === 'sustituido' || versionMasNueva) {
    const nueva = versionMasNueva ?? { id: presupuesto.sustituidoPor };
    throw new ErrorDominio('conflicto', `Ya hay una versión más nueva de ${presupuesto.numero} (${nueva.id}). Haz los cambios en esa.`, {
      versionMasNueva: nueva.id,
    });
  }
  return 'nueva-version';
}

export function nuevaVersion(presupuesto, ahora) {
  const version = presupuesto.version + 1;
  const fecha = ahora.toISOString();
  return {
    ...structuredClone(presupuesto),
    id: idDe(presupuesto.numero, version),
    version,
    versionAnteriorId: presupuesto.id,
    estado: 'borrador',
    creado: fecha,
    actualizado: fecha,
    enviadoEn: null,
    caduca: null,
    precioPunto: null,
    tokenPublico: null,
    aperturas: [],
    nAperturas: 0,
    decision: null,
    sustituidoPor: null,
  };
}

// Solo se envía lo especificado: al menos un caso de uso y todos con criterios.
export function comprobarEnviable(presupuesto, ahora) {
  const estado = estadoEfectivo(presupuesto, ahora);
  if (estado !== 'borrador') {
    throw new ErrorDominio('conflicto', `El presupuesto ${presupuesto.id} ya está ${estado}: solo se envía un borrador`);
  }
  if (!presupuesto.casosDeUso.length) {
    throw new ErrorDominio('regla', 'No se puede enviar un presupuesto sin casos de uso: añade al menos uno con sus criterios');
  }
  const sinCriterios = presupuesto.casosDeUso.filter((c) => !c.criterios.length);
  if (sinCriterios.length) {
    const lista = sinCriterios.map((c) => `${c.codigo} «${c.nombre}»`).join(', ');
    throw new ErrorDominio('regla', `No se puede enviar: ${lista} no tiene criterios. Lo que no está especificado no se presupuesta.`, {
      casosSinCriterios: sinCriterios.map((c) => c.codigo),
    });
  }
}

// El precio del punto se congela al enviar: lo que ve el cliente no cambia aunque cambie la tarifa.
export function marcarEnviado(presupuesto, { precioPunto, token, ahora }) {
  return {
    ...presupuesto,
    estado: 'enviado',
    enviadoEn: ahora.toISOString(),
    caduca: sumarDias(ahora, VALIDEZ_DIAS).toISOString(),
    precioPunto,
    tokenPublico: token,
    actualizado: ahora.toISOString(),
  };
}

export function registrarApertura(presupuesto, ahora) {
  const aperturas = [...presupuesto.aperturas, { fecha: ahora.toISOString() }].slice(-MAX_APERTURAS_GUARDADAS);
  return {
    ...presupuesto,
    estado: presupuesto.estado === 'enviado' && estadoEfectivo(presupuesto, ahora) === 'enviado' ? 'visto' : presupuesto.estado,
    aperturas,
    nAperturas: presupuesto.nAperturas + 1,
    primeraApertura: presupuesto.primeraApertura ?? ahora.toISOString(),
  };
}

// El cliente decide una sola vez, y solo mientras la propuesta está abierta.
export function decidir(presupuesto, decision, comentario, ahora) {
  const estado = estadoEfectivo(presupuesto, ahora);
  if (estado === 'caducado') {
    throw new ErrorDominio('cerrado', `Esta propuesta caducó el ${fechaLarga(presupuesto.caduca)}. Pide una nueva.`);
  }
  if (estado === 'sustituido') throw new ErrorDominio('cerrado', 'Hay una versión más nueva de esta propuesta.');
  if (!ABIERTOS.includes(estado)) {
    throw new ErrorDominio('cerrado', `Esta propuesta ya está ${estado === 'aceptado' ? 'aceptada' : estado === 'rechazado' ? 'rechazada' : estado}.`);
  }
  const fecha = ahora.toISOString();
  return {
    ...presupuesto,
    estado: decision === 'aceptar' ? 'aceptado' : 'rechazado',
    decision: { tipo: decision === 'aceptar' ? 'aceptado' : 'rechazado', fecha, comentario },
    actualizado: fecha,
  };
}

function casoDe(presupuesto, codigo) {
  const caso = presupuesto.casosDeUso.find((c) => c.codigo === String(codigo).toUpperCase());
  if (!caso) throw new ErrorDominio('no-encontrado', `El presupuesto ${presupuesto.id} no tiene el caso ${codigo}`);
  return caso;
}

function exigirAceptado(presupuesto, ahora, accion) {
  const estado = estadoEfectivo(presupuesto, ahora);
  if (estado !== 'aceptado') {
    throw new ErrorDominio('regla', `El presupuesto ${presupuesto.id} está ${estado}: ${accion} solo con el presupuesto aceptado`);
  }
}

// El acta de un caso: el cliente comprueba sus criterios y firma que se cumplen.
export function aceptarActa(presupuesto, codigo, ahora) {
  exigirAceptado(presupuesto, ahora, 'el acta se acepta');
  const caso = casoDe(presupuesto, codigo);
  if (caso.acta.estado === 'aceptada') throw new ErrorDominio('conflicto', `El acta de ${caso.codigo} ya estaba aceptada`);
  return conCaso(presupuesto, caso.codigo, { acta: { estado: 'aceptada', fecha: ahora.toISOString() } }, ahora);
}

// Se factura caso a caso, con el presupuesto aceptado y el acta del caso aceptada.
export function facturarCaso(presupuesto, codigo, ahora) {
  exigirAceptado(presupuesto, ahora, 'se factura');
  if (presupuesto.gratuito) throw new ErrorDominio('regla', `${presupuesto.id} es un piloto gratuito: no se factura`);
  const caso = casoDe(presupuesto, codigo);
  if (caso.facturado) throw new ErrorDominio('conflicto', `${caso.codigo} ya se facturó el ${fechaLarga(caso.facturado.fecha)}`);
  if (caso.acta.estado !== 'aceptada') {
    throw new ErrorDominio('regla', `El acta de ${caso.codigo} no está aceptada: hasta que el cliente la firme, ese caso no se factura`);
  }
  const importe = puntosDeCaso(caso) * presupuesto.precioPunto;
  return conCaso(presupuesto, caso.codigo, { facturado: { fecha: ahora.toISOString(), importe } }, ahora);
}

function conCaso(presupuesto, codigo, cambios, ahora) {
  return {
    ...presupuesto,
    casosDeUso: presupuesto.casosDeUso.map((c) => (c.codigo === codigo ? { ...c, ...cambios } : c)),
    actualizado: ahora.toISOString(),
  };
}

// Un cambio es un criterio nuevo: solo sobre lo aceptado y nunca a cero puntos.
export function comprobarAmpliacion(padre, casos, ahora) {
  exigirAceptado(padre, ahora, 'se amplía');
  if (padre.tipo === 'piloto') throw new ErrorDominio('regla', 'Un piloto no se amplía: el paso siguiente es un presupuesto de proyecto');
  if (!casos.length || casos.some((c) => !c.criterios.length)) {
    throw new ErrorDominio('regla', 'Un cambio es un criterio nuevo: la ampliación necesita al menos un caso de uso y cada caso, sus criterios. Gratis no.');
  }
}

// Los casos de una ampliación siguen la numeración del presupuesto aceptado (CU5 después de CU4).
export function siguienteCodigo(casos) {
  return casos.reduce((max, c) => Math.max(max, Number(c.codigo.slice(2)) || 0), 0) + 1;
}
