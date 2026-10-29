import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manejar } from '../src/web/manejador.js';
import { crearAlmacenMemoria } from '../src/almacen-memoria.js';
import { altaUsuario, sembrarCartera } from '../src/semilla.js';
import { crearAzar } from '../src/web/azar.js';

export const AHORA = '2026-10-29T08:00:00Z';
export const BASE = 'https://cartera.prueba';
export const carpetaTemporal = () => mkdtemp(join(tmpdir(), 'cartera-'));

export function relojFijo(iso) {
  let ahora = new Date(iso);
  const reloj = () => new Date(ahora);
  reloj.avanzarDias = (dias) => {
    ahora = new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000);
  };
  return reloj;
}

// Un caso de uso de prueba con n criterios completos.
export function casoDePrueba(nombre, n = 2, ponderacion = {}) {
  return {
    nombre,
    criterios: Array.from({ length: n }, (_, i) => ({ dado: `una situación ${i + 1}`, cuando: 'pasa algo', entonces: 'se ve el resultado' })),
    ponderacion,
  };
}

// El manejador contra un almacén en memoria, sin servidor: cada petición es un Request construido aquí.
// ana tiene la cartera de clase sembrada; beto y carla empiezan con la cartera vacía.
export async function arrancar({ iso = AHORA } = {}) {
  const almacen = crearAlmacenMemoria();
  const ahora = new Date(iso);
  const azar = crearAzar();
  const { usuario: ana, token: tokenAna } = await altaUsuario(almacen, { id: 'ana', nombre: 'Ana Prueba' }, { ahora, azar });
  await sembrarCartera(almacen, ana, { ahora, azar });
  const { token: tokenBeto } = await altaUsuario(almacen, { id: 'beto', nombre: 'Beto Prueba' }, { ahora, azar, vacia: true });
  const { token: tokenCarla } = await altaUsuario(almacen, { id: 'carla', nombre: 'Carla Prueba' }, { ahora, azar, vacia: true });
  const reloj = relojFijo(iso);
  const correosEnviados = [];
  const entorno = {
    almacen,
    reloj,
    correo: {
      via: 'prueba',
      async enviarCorreo(correo) {
        correosEnviados.push(correo);
        return { via: 'prueba', entregadoA: correo.para };
      },
    },
  };

  const atender = (ruta, init) => manejar(new Request(BASE + ruta, init), entorno);

  function cliente(token) {
    return async function pedir(metodo, ruta, cuerpo) {
      const respuesta = await atender(ruta, {
        method: metodo,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      const tipo = respuesta.headers.get('content-type') ?? '';
      const datos = tipo.includes('json') ? await respuesta.json() : await respuesta.text();
      return { estado: respuesta.status, datos, cabeceras: respuesta.headers };
    };
  }

  // La página pública: GET para abrirla, POST de formulario para decidir.
  async function pagina(metodo, ruta, formulario) {
    const respuesta = await atender(ruta, {
      method: metodo,
      headers: formulario ? { 'content-type': 'application/x-www-form-urlencoded' } : {},
      body: formulario ? new URLSearchParams(formulario).toString() : undefined,
    });
    return { estado: respuesta.status, html: await respuesta.text(), cabeceras: respuesta.headers };
  }

  return {
    reloj,
    almacen,
    entorno,
    correosEnviados,
    cartera: (id) => almacen.leerCartera(id),
    ana: cliente(tokenAna),
    beto: cliente(tokenBeto),
    carla: cliente(tokenCarla),
    anonimo: cliente(null),
    conToken: cliente,
    pagina,
    // Sin servidor no hay nada que cerrar; se mantiene para que las pruebas se lean igual.
    cerrar: async () => {},
  };
}

// Atajo: cliente nuevo con un borrador listo para enviar. Devuelve { cliente, presupuesto }.
export async function borradorListo(pedir, { nombre = 'Cliente de prueba', casos = [casoDePrueba('Primer caso')], ...extra } = {}) {
  const cliente = await pedir('POST', '/api/clientes', { nombre, contacto: { nombre: 'Persona', email: 'persona@example.com' }, ...extra });
  if (cliente.estado !== 201) throw new Error(JSON.stringify(cliente.datos));
  const presupuesto = await pedir('POST', '/api/presupuestos', { clienteId: cliente.datos.id, titulo: `Propuesta para ${nombre}`, casosDeUso: casos });
  if (presupuesto.estado !== 201) throw new Error(JSON.stringify(presupuesto.datos));
  return { cliente: cliente.datos, presupuesto: presupuesto.datos };
}

export const tokenDe = (presupuesto) => presupuesto.enlacePublico.split('/p/')[1];
