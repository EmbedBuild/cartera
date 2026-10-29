// Cartera en Cloudflare. Este Worker es a la vez:
// - el servidor de autorización OAuth 2.1 de los MCP de Cartera (CIMD, DCR por compatibilidad, PKCE, renovación);
// - la página de entrada, donde el alumno pone su código y da permiso;
// - la API interna, que los MCP usan por service binding (entrypoint ApiInterna), nunca desde internet.
import { AuthorizationError, CimdFetchError, OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider';
import { WorkerEntrypoint, env } from 'cloudflare:workers';
import { manejar } from '../../api/src/web/manejador.js';
import { usuarioDeTokenPublico } from '../../api/src/web/azar.js';
import { paginaEntrada, paginaError, paginaPortada, respuestaHtml } from './paginas.js';
import { buscarUsuarioPorCodigo, crearCuenta, entrarConCorreo } from './usuarios.js';

export { CarteraDeUsuario } from './cartera-de-usuario.js';

// Todo lo que esta Cartera puede conceder. Leer y escribir van separados para enseñar el mínimo privilegio.
export const ALCANCES = ['cartera:leer', 'cartera:escribir', 'offline_access'];

const autorizacion = new OAuthAuthorizationServer({
  issuer: env.EMISOR,
  resources: env.RECURSOS.split(/\s+/),
  scopesSupported: ALCANCES,
  // El registro preferido en MCP 2026: el cliente se identifica con la URL de sus metadatos.
  clientIdMetadataDocumentEnabled: true,
  // Obsoleto en MCP 2026-07-28, pero aún lo usan clientes como el Inspector o VS Code.
  clientRegistrationEndpoint: '/oauth/register',
  accessTokenTTL: 60 * 60,
  refreshTokenTTL: 30 * 24 * 60 * 60,
});

async function mostrarEntrada(request, volver, error, valores) {
  const oauth = autorizacion.getOAuthApi(env);
  const peticion = await oauth.parseAuthRequest(request);
  const detalles = await oauth.describeConsent(peticion);
  const permiso = await oauth.beginConsent(peticion);
  return respuestaHtml(paginaEntrada(detalles, permiso.handle, volver, { error, valores }), {
    estado: error ? 400 : 200,
    cabeceras: permiso.headers,
  });
}

// Cada pantalla de permiso vale una vez. Un doble clic en «Permitir» manda el formulario dos veces: el primero
// conecta y el segundo llega con la pantalla ya gastada. No es un fallo de quien conecta, así que no lo parece.
async function yaUsada(accion) {
  try {
    return await accion();
  } catch (error) {
    if (!(error instanceof AuthorizationError) || error.redirectTo) throw error;
    return respuestaHtml(
      paginaError(
        'Esta pantalla ya se ha usado',
        'Si acabas de pulsar «Permitir», la conexión ya está hecha: vuelve a Claude y pruébala. Si no, vuelve a conectar desde Claude.',
      ),
      { estado: 400 },
    );
  }
}

async function autorizar(request) {
  const url = new URL(request.url);
  try {
    if (request.method === 'GET') return await mostrarEntrada(request, url.pathname + url.search);
    if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 });

    const oauth = autorizacion.getOAuthApi(env);
    const formulario = await request.formData();
    const handle = String(formulario.get('handle') ?? '');
    const volver = String(formulario.get('volver') ?? '');
    const decision = formulario.get('decision');
    if (decision !== 'entrar' && decision !== 'crear') {
      const denegado = await yaUsada(() => oauth.denyConsent(request, handle));
      return denegado instanceof Response ? denegado : new Response(null, { status: 302, headers: denegado.headers });
    }

    const ip = request.headers.get('cf-connecting-ip') ?? 'desconocida';
    const { success } = await env.LIMITE_CODIGOS.limit({ key: ip });
    if (!success) {
      return respuestaHtml(paginaError('Demasiados intentos', 'Has hecho muchos intentos seguidos. Espera un minuto y vuelve a intentarlo.'), { estado: 429 });
    }

    const correo = String(formulario.get('correo') ?? '');
    const nombre = String(formulario.get('nombre') ?? '');
    const contrasena = String(formulario.get('contrasena') ?? '');
    let usuario = null;
    let error = 'Correo o contraseña incorrectos. Si es tu primera vez, escribe también tu nombre y pulsa «Crear cuenta y entrar».';
    if (decision === 'crear') {
      ({ usuario, error } = await crearCuenta(env, { nombre, correo, contrasena }));
      if (usuario) await env.CARTERAS.getByName(usuario.id).registrar(usuario);
    } else if (!correo.includes('@')) {
      usuario = await buscarUsuarioPorCodigo(env, correo); // plan B: un código de clase en el campo del correo
    } else {
      usuario = await entrarConCorreo(env, { correo, contrasena });
    }
    if (!usuario) {
      // Se vuelve a pintar la misma pantalla con el aviso; la petición original sigue en «volver».
      if (volver.startsWith('/authorize?')) {
        return await mostrarEntrada(new Request(env.EMISOR + volver, { headers: request.headers }), volver, error, { correo, nombre });
      }
      return respuestaHtml(paginaError('No se ha podido entrar', `${error} Vuelve a conectar desde Claude.`), { estado: 400 });
    }

    const aprobado = await yaUsada(() => oauth.approveConsent(request, handle, { scope: formulario.getAll('scope').map(String) }));
    if (aprobado instanceof Response) return aprobado;
    const { redirectTo } = await oauth.completeAuthorization({
      request: aprobado.request,
      userId: usuario.id,
      metadata: {},
      scope: aprobado.request.scope,
      props: { usuarioId: usuario.id, nombre: usuario.nombre },
    });
    aprobado.headers.set('location', redirectTo);
    return new Response(null, { status: 302, headers: aprobado.headers });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError) {
      return respuestaHtml(paginaError('No se ha podido conectar', `${error.description} Vuelve a conectar desde Claude.`), { estado: 400 });
    }
    if (error instanceof CimdFetchError) {
      return respuestaHtml(paginaError('No se ha podido verificar la aplicación', 'No hemos podido leer los datos de la aplicación que pide permiso.'), { estado: 400 });
    }
    throw error;
  }
}

// La propuesta que abre el cliente desde el correo: el enlace lleva dentro de quién es, y va a su Durable Object.
function atenderPublica(request, env) {
  const token = new URL(request.url).pathname.split('/')[2] ?? '';
  const usuarioId = usuarioDeTokenPublico(token);
  if (!usuarioId) return manejar(request, { almacen: ALMACEN_VACIO });
  const reenviada = new Request(request);
  reenviada.headers.set('x-cartera-usuario', usuarioId);
  return env.CARTERAS.getByName(usuarioId).fetch(reenviada);
}

const ALMACEN_VACIO = {
  leerCartera: async () => null,
  guardarCartera: async () => {},
  leerUsuario: async () => null,
  guardarUsuario: async () => {},
  buscarUsuarioPorHuella: async () => null,
  listarUsuarios: async () => [],
};

// Para el profesor: deja como recién sembradas todas las carteras (o la de ?usuario=u01).
async function reiniciar(request, env) {
  const clave = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const esperada = new TextEncoder().encode(env.SECRETO_ADMIN ?? '');
  const recibida = new TextEncoder().encode(clave);
  if (request.method !== 'POST' || !esperada.length || recibida.length !== esperada.length || !crypto.subtle.timingSafeEqual(recibida, esperada)) {
    return Response.json({ mensaje: 'No autorizado' }, { status: 401 });
  }
  const uno = new URL(request.url).searchParams.get('usuario');
  const ids = uno ? [uno] : (await env.USUARIOS.list({ prefix: 'usuario:' })).keys.map((k) => k.name.slice('usuario:'.length));
  await Promise.all(ids.map((id) => env.CARTERAS.getByName(id).reiniciar()));
  return Response.json({ reiniciadas: ids });
}

// La parte pública: portada, entrada, propuestas y los extremos OAuth que sirve la librería (metadatos, token, registro).
export default class Cartera extends WorkerEntrypoint {
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/') return respuestaHtml(paginaPortada());
    if (pathname === '/authorize') return autorizar(request);
    if (pathname.startsWith('/p/')) return atenderPublica(request, this.env);
    if (pathname === '/propuesta.css') return manejar(request, { almacen: ALMACEN_VACIO });
    if (pathname === '/admin/reiniciar') return reiniciar(request, this.env);
    return autorizacion.fetch(request, this.env, this.ctx);
  }
}

// Solo alcanzable por service binding desde los MCP de Cartera.
export class ApiInterna extends WorkerEntrypoint {
  // El MCP comprueba aquí cada token que le llega: firma, caducidad y que sea para ese MCP.
  validateToken(recurso, token) {
    return autorizacion.validateToken(recurso, token, this.env);
  }

  // Petición a la API de Cartera en nombre de un usuario ya autenticado por el MCP: va a su Durable Object.
  pedir(usuarioId, metodo, ruta, cuerpo) {
    return this.env.CARTERAS.getByName(usuarioId).pedir(usuarioId, metodo, ruta, cuerpo);
  }
}
