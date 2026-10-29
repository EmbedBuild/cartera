import { crearCartera } from '../cartera.js';
import { crearBuzonInterno } from '../correo.js';
import { ErrorDominio } from '../dominio/errores.js';
import { crearAzar } from './azar.js';
import { autenticarConTokenDesarrollo } from './autenticacion.js';
import { ESTILOS } from './estilos.js';
import { paginaNoExiste, paginaPropuesta } from './pagina-publica.js';

const LIMITE_CUERPO = 64 * 1024;
// La página pública no carga nada de fuera ni ejecuta JavaScript: solo su hoja de estilos y sus formularios.
const CSP = "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const ESTADO_POR_CODIGO = { validacion: 400, 'no-encontrado': 404, prohibido: 403, conflicto: 409, cerrado: 409, regla: 422 };

class ErrorHttp extends Error {
  constructor(estado, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

// Las rutas de la API. Cada manejador recibe { cartera, usuario, url, cuerpo, params, base }.
const ID = '([\\w-]+)';
const ruta = (texto) => new RegExp(`^${texto.replaceAll(':id', ID).replaceAll(':cu', '(CU\\d+)')}$`, 'i');
const filtro = (url, campo) => url.searchParams.get(campo) || undefined;
const RUTAS = [
  ['GET', '/api/yo', ({ cartera, usuario }) => cartera.yo(usuario)],
  ['GET', '/api/clientes', ({ cartera, usuario, url }) => cartera.listarClientes(usuario, { etapa: filtro(url, 'etapa') })],
  ['POST', '/api/clientes', ({ cartera, usuario, cuerpo }) => cartera.crearCliente(usuario, cuerpo), 201],
  ['GET', ruta('/api/clientes/:id'), ({ cartera, usuario, params: [id], base }) => cartera.fichaCliente(usuario, id, { base })],
  ['POST', ruta('/api/clientes/:id'), ({ cartera, usuario, params: [id], cuerpo }) => cartera.editarCliente(usuario, id, cuerpo)],
  ['POST', ruta('/api/clientes/:id/etapa'), ({ cartera, usuario, params: [id], cuerpo }) => cartera.cambiarEtapaCliente(usuario, id, cuerpo)],
  ['GET', '/api/presupuestos', ({ cartera, usuario, url, base }) => cartera.listarPresupuestos(usuario, { estado: filtro(url, 'estado'), cliente: filtro(url, 'cliente') }, { base })],
  ['POST', '/api/presupuestos', ({ cartera, usuario, cuerpo, base }) => cartera.crearPresupuesto(usuario, cuerpo, { base }), 201],
  ['GET', ruta('/api/presupuestos/:id'), ({ cartera, usuario, params: [ref], base }) => cartera.verPresupuesto(usuario, ref, { base })],
  ['POST', ruta('/api/presupuestos/:id'), ({ cartera, usuario, params: [ref], cuerpo, base }) => cartera.editarPresupuesto(usuario, ref, cuerpo, { base })],
  ['POST', ruta('/api/presupuestos/:id/casos'), ({ cartera, usuario, params: [ref], cuerpo, base }) => cartera.anadirCaso(usuario, ref, cuerpo, { base })],
  ['POST', ruta('/api/presupuestos/:id/enviar'), ({ cartera, usuario, params: [ref], cuerpo, base }) => cartera.enviarPresupuesto(usuario, ref, cuerpo, { base })],
  ['POST', ruta('/api/presupuestos/:id/casos/:cu/acta'), ({ cartera, usuario, params: [ref, cu], base }) => cartera.aceptarActaDeCaso(usuario, ref, cu, { base })],
  ['POST', ruta('/api/presupuestos/:id/casos/:cu/facturar'), ({ cartera, usuario, params: [ref, cu], base }) => cartera.facturar(usuario, ref, cu, { base })],
  ['POST', ruta('/api/presupuestos/:id/ampliacion'), ({ cartera, usuario, params: [ref], cuerpo, base }) => cartera.crearAmpliacion(usuario, ref, cuerpo, { base }), 201],
  ['POST', '/api/seguimientos', ({ cartera, usuario, cuerpo }) => cartera.registrarSeguimiento(usuario, cuerpo), 201],
  ['GET', '/api/hoy', ({ cartera, usuario }) => cartera.hoy(usuario)],
  ['GET', '/api/embudo', ({ cartera, usuario }) => cartera.embudo(usuario)],
  ['GET', '/api/correos', ({ cartera, usuario }) => cartera.correos(usuario)],
  ['GET', ruta('/api/pilotos/:id/retorno'), ({ cartera, usuario, params: [ref] }) => cartera.retorno(usuario, ref)],
  ['POST', ruta('/api/pilotos/:id/metricas'), ({ cartera, usuario, params: [ref], cuerpo }) => cartera.actualizarMetricas(usuario, ref, cuerpo)],
];

function buscarRuta(metodo, camino) {
  let otroMetodo = null;
  for (const [m, patron, manejar, estado = 200] of RUTAS) {
    const coincide = typeof patron === 'string' ? (patron === camino ? [] : null) : camino.match(patron)?.slice(1);
    if (!coincide) continue;
    if (m === metodo) return { manejar, estado, params: coincide.map(decodeURIComponent) };
    otroMetodo = m;
  }
  if (otroMetodo) throw new ErrorHttp(405, `Esta dirección se usa con ${otroMetodo}`, { permitido: otroMetodo });
  return null;
}

// El manejador de Cartera: Request → Response, solo con APIs Web. Sirve tal cual en Workers y, con
// src/node/servidor.js, en Node. El entorno trae las piezas que cambian según dónde se ejecute:
//   almacen   (obligatorio) leerCartera/guardarCartera, leerUsuario/guardarUsuario, buscarUsuarioPorHuella, listarUsuarios
//   correo    { enviarCorreo({ para, asunto, texto, html }) } · por defecto, buzón interno (no sale nada)
//   autenticar(request, entorno) → usuario | null · por defecto, token de desarrollo Bearer
//   reloj     () → Date · aleatorio (n) → Uint8Array · urlPublica (base de los enlaces; si no, el origen de la petición)
//   sembrarAlEntrar (true): un usuario sin cartera recibe la de clase en su primera petición
export async function manejar(request, entorno) {
  const reloj = entorno.reloj ?? (() => new Date());
  const cartera = crearCartera({
    almacen: entorno.almacen,
    reloj,
    azar: crearAzar(entorno.aleatorio),
    correo: entorno.correo ?? crearBuzonInterno(),
    sembrarAlEntrar: entorno.sembrarAlEntrar ?? true,
  });
  const url = new URL(request.url);
  const base = (entorno.urlPublica || url.origin).replace(/\/$/, '');
  try {
    // Nada se borra: DELETE, PUT, PATCH y cualquier método no previsto se rechazan sin tocar los datos.
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
      throw new ErrorHttp(405, 'Esta operación no está permitida: en Cartera nada se borra ni se sobrescribe');
    }
    if (url.pathname.startsWith('/api/')) return await atenderApi(request, entorno, { cartera, url, base });
    if (url.pathname.startsWith('/p/')) return await atenderPublica(request, { cartera, url, base });
    if (url.pathname === '/propuesta.css') {
      return new Response(request.method === 'HEAD' ? null : ESTILOS, {
        headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' },
      });
    }
    if (url.pathname === '/' || url.pathname === '/salud') {
      return json(200, { servicio: 'Cartera', estado: 'en marcha', fecha: reloj().toISOString() });
    }
    throw new ErrorHttp(404, 'No existe');
  } catch (error) {
    return responderError(error);
  }
}

async function atenderApi(request, entorno, { cartera, url, base }) {
  const encontrada = buscarRuta(request.method === 'HEAD' ? 'GET' : request.method, url.pathname);
  if (!encontrada) throw new ErrorHttp(404, 'No existe esa dirección de la API');
  const usuario = await (entorno.autenticar ?? autenticarConTokenDesarrollo)(request, entorno);
  if (!usuario) throw new ErrorHttp(401, 'Falta la credencial o no es válida');
  const cuerpo = request.method === 'POST' ? await leerJson(request) : {};
  const respuesta = await encontrada.manejar({ cartera, usuario, url, cuerpo, params: encontrada.params, base });
  return json(encontrada.estado, respuesta);
}

// /p/<token>: la propuesta que abre el cliente desde el correo. El enlace es la llave: no hay usuario.
async function atenderPublica(request, { cartera, url, base }) {
  const [, token, accion] = url.pathname.match(/^\/p\/([\w.-]+)(?:\/(aceptar|rechazar))?$/) ?? [];
  if (!token) return html(404, paginaNoExiste());
  if (!accion) {
    if (!['GET', 'HEAD'].includes(request.method)) throw new ErrorHttp(405, 'Esta operación no está permitida');
    // HEAD no cuenta como apertura: solo la cuenta quien abre la página.
    if (request.method === 'HEAD') return html((await cartera.vistaPorToken(token, { base })) ? 200 : 404, null);
    const vista = await cartera.abrirPublica(token, { base });
    return vista ? html(200, paginaPropuesta(vista)) : html(404, paginaNoExiste());
  }
  if (request.method !== 'POST') throw new ErrorHttp(405, 'Esta operación no está permitida');
  const formulario = new URLSearchParams(await leerTexto(request));
  try {
    const vista = await cartera.decidirPublica(token, accion, formulario.get('comentario') ?? '', { base });
    const aviso = accion === 'aceptar' ? 'Propuesta aceptada. Te escribiremos para empezar.' : 'Hemos recibido tu respuesta. Gracias por decírnoslo.';
    return html(200, paginaPropuesta(vista, { aviso }));
  } catch (error) {
    if (error instanceof ErrorDominio && error.codigo === 'no-encontrado') return html(404, paginaNoExiste());
    if (error instanceof ErrorDominio) {
      return html(ESTADO_POR_CODIGO[error.codigo] ?? 400, paginaPropuesta(await cartera.vistaPorToken(token, { base }), { aviso: error.message }));
    }
    throw error;
  }
}

async function leerTexto(request) {
  const declarado = Number(request.headers.get('content-length') ?? 0);
  if (declarado > LIMITE_CUERPO) throw demasiadoGrande();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > LIMITE_CUERPO) throw demasiadoGrande();
  return new TextDecoder().decode(bytes);
}

const demasiadoGrande = () => new ErrorHttp(413, `La petición es demasiado grande: como mucho ${LIMITE_CUERPO / 1024} KB`);

async function leerJson(request) {
  const texto = await leerTexto(request);
  if (!texto) return {};
  try {
    const cuerpo = JSON.parse(texto);
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) throw new Error();
    return cuerpo;
  } catch {
    throw new ErrorHttp(400, 'El cuerpo de la petición tiene que ser un objeto JSON');
  }
}

const COMUNES = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };

function json(estado, cuerpo, cabeceras = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...COMUNES, ...cabeceras },
  });
}

function html(estado, cuerpo) {
  return new Response(cuerpo, {
    status: estado,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': CSP, ...COMUNES },
  });
}

function responderError(error) {
  if (error instanceof ErrorHttp) {
    const cabeceras = {};
    if (error.estado === 401) cabeceras['www-authenticate'] = 'Bearer';
    if (error.extra.permitido) cabeceras.allow = error.extra.permitido;
    return json(error.estado, { mensaje: error.message, ...error.extra }, cabeceras);
  }
  if (error instanceof ErrorDominio) return json(ESTADO_POR_CODIGO[error.codigo] ?? 400, { mensaje: error.message, ...error.extra });
  console.error(error);
  return json(500, { mensaje: 'Algo ha fallado. Inténtalo otra vez.' });
}
