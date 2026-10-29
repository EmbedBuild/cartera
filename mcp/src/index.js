// MCP de Cartera: las herramientas con las que Claude lleva tu embudo de propuestas.
// La puerta (OAuth) la pone OAuthResourceServer; las herramientas (src/herramientas.js) hablan con la API de
// Cartera por service binding, en nombre de quien se ha conectado. La IA redacta, Cartera cuenta.
import { OAuthResourceServer, insufficientScope } from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { env } from 'cloudflare:workers';
import { registrarHerramientas } from './herramientas.js';

// Pide a la API de Cartera en nombre de quien está conectado y devuelve el resultado como texto para la IA.
async function pedir(metodo, ruta, cuerpo) {
  const { usuarioId, alcances = [] } = getMcpAuthContext().props;
  if (metodo === 'POST' && !alcances.includes('cartera:escribir')) {
    return texto({ mensaje: 'No tienes permiso para cambiar la cartera: al conectar solo diste permiso de lectura.' }, true);
  }
  const respuesta = await env.CARTERA.pedir(usuarioId, metodo, ruta, cuerpo);
  return texto(respuesta.datos, !respuesta.ok);
}

const texto = (datos, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(datos, null, 2) }], isError });

function crearServidor() {
  const servidor = new McpServer({ name: 'cartera', version: '1.0.0' });
  registrarHerramientas(servidor, pedir);
  return servidor;
}

const manejadorMcp = createMcpHandler(crearServidor, {
  route: '/mcp',
  allowedHostnames: [new URL(env.URL_MCP).hostname],
});

export default new OAuthResourceServer({
  resourceMetadata: {
    resource: env.URL_MCP,
    authorization_servers: [env.URL_CARTERA],
    resource_name: 'Cartera',
  },
  // Lo que Claude pide al conectar: leer y escribir en tu cartera.
  requiredScopes: ['cartera:leer', 'cartera:escribir'],
  validateToken: (entorno) => entorno.CARTERA.validateToken,
  handler: {
    fetch(request, entorno, ctx) {
      if (!ctx.auth.scope.includes('cartera:leer')) return insufficientScope(ctx.auth, ['cartera:leer']);
      // Las herramientas leen quién es y qué permisos dio con getMcpAuthContext().props.
      ctx.props = { ...ctx.props, alcances: ctx.auth.scope };
      return manejadorMcp(request, entorno, ctx);
    },
  },
});
