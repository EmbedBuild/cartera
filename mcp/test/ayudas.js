// Monta las herramientas sin Cloudflare: un servidor falso apunta lo que se registra y
// un pedir falso apunta lo que se le pide a la API y devuelve la respuesta que se le indique.
import { registrarHerramientas } from '../src/herramientas.js';

export function montar(respuestaApi = { ok: true, datos: {} }) {
  const herramientas = new Map();
  const llamadas = [];
  const servidor = { registerTool: (nombre, config, manejar) => herramientas.set(nombre, { config, manejar }) };
  const pedir = async (metodo, ruta, cuerpo) => {
    llamadas.push({ metodo, ruta, cuerpo });
    return { content: [{ type: 'text', text: JSON.stringify(respuestaApi.datos) }], isError: !respuestaApi.ok };
  };
  registrarHerramientas(servidor, pedir);
  // Valida los argumentos con el esquema de la herramienta, como haría el SDK, antes de usarla.
  const usar = (nombre, args = {}) => {
    const { config, manejar } = herramientas.get(nombre);
    return manejar(config.inputSchema ? config.inputSchema.parse(args) : args);
  };
  return { herramientas, llamadas, usar };
}
