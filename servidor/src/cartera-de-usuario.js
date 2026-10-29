// Un Durable Object por alumno: guarda su cartera y ejecuta en él el núcleo de Cartera (../../api).
// Al ser uno por usuario, sus cambios van en serie y ninguna cartera puede leer ni escribir la de otro.
import { DurableObject } from 'cloudflare:workers';
import { manejar } from '../../api/src/web/manejador.js';
import { redirigirAPruebas } from '../../api/src/correo.js';
import { TARIFA_POR_DEFECTO } from '../../api/src/dominio/importes.js';
import { leerUsuario, publico } from './usuarios.js';

export class CarteraDeUsuario extends DurableObject {
  async entorno(usuarioId) {
    // Quien acaba de crear su cuenta queda registrado aquí al momento; el KV puede tardar en verla desde otro sitio.
    const registrado = await this.ctx.storage.get('usuario');
    const datos = registrado?.id === usuarioId ? registrado : usuarioId ? await leerUsuario(this.env, usuarioId) : null;
    if (!datos) return null;
    const usuario = { tarifaPunto: TARIFA_POR_DEFECTO, ...publico(datos) };
    const { storage } = this.ctx;
    const env = this.env;
    return {
      urlPublica: env.EMISOR,
      autenticar: async () => usuario,
      almacen: {
        leerCartera: async (id) => (id === usuario.id ? ((await storage.get('cartera')) ?? null) : null),
        guardarCartera: async (id, cartera) => {
          if (id !== usuario.id) throw new Error('Este objeto solo guarda la cartera de su usuario');
          await storage.put('cartera', cartera);
        },
        leerUsuario: async (id) => (id === usuario.id ? usuario : null),
        guardarUsuario: async () => {},
        buscarUsuarioPorHuella: async () => null,
        listarUsuarios: async () => [usuario],
      },
      // Todo correo sale hacia el buzón de pruebas, con el destinatario original en el asunto.
      // El binding CORREO, además, solo admite esa dirección: aunque el código fallara, no saldría a otra.
      correo: {
        via: 'cloudflare-email',
        async enviarCorreo(correo) {
          const real = redirigirAPruebas(correo, env.BUZON_PRUEBAS);
          const { messageId } = await env.CORREO.send({
            from: { email: env.REMITENTE, name: `${usuario.nombre} · Cartera` },
            to: real.para,
            subject: real.asunto,
            text: real.texto,
            html: real.html,
          });
          return {
            via: 'cloudflare-email',
            entregadoA: real.para,
            id: messageId,
            // Para que la IA lo explique bien y no lo tome por un fallo de entrega.
            nota: 'Cartera está en modo clase: todos los correos se entregan en el buzón de pruebas del profesor, con el destinatario original indicado en el asunto. El envío es correcto; el cliente abre la propuesta con el enlace público.',
          };
        },
      },
    };
  }

  // La API en nombre del usuario, tal como la pide el MCP: { ok, estado, datos }.
  async pedir(usuarioId, metodo, ruta, cuerpo) {
    if (!String(ruta).startsWith('/api/')) return { ok: false, estado: 404, datos: { mensaje: 'No existe esa dirección de la API' } };
    const entorno = await this.entorno(usuarioId);
    if (!entorno) return { ok: false, estado: 401, datos: { mensaje: 'Ese usuario no existe en Cartera' } };
    const request = new Request(new URL(ruta, this.env.EMISOR), {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: metodo === 'POST' ? JSON.stringify(cuerpo ?? {}) : undefined,
    });
    const respuesta = await manejar(request, entorno);
    const texto = await respuesta.text();
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = { mensaje: texto };
    }
    return { ok: respuesta.ok, estado: respuesta.status, datos };
  }

  // La página pública /p/<token>: el Worker ya ha sacado del enlace de quién es y lo trae en la cabecera.
  async fetch(request) {
    const entorno = await this.entorno(request.headers.get('x-cartera-usuario'));
    if (!entorno) return new Response('No existe', { status: 404 });
    return manejar(request, { ...entorno, autenticar: async () => null });
  }

  // Se llama al crear la cuenta, para que la cartera conozca a su dueño desde la primera petición.
  async registrar(usuario) {
    await this.ctx.storage.put('usuario', publico(usuario));
    return true;
  }

  // La siguiente petición vuelve a sembrar la cartera de clase, con las fechas de ese día.
  async reiniciar() {
    await this.ctx.storage.delete('cartera');
    return true;
  }
}
