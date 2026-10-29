import { huella } from './azar.js';

// Costura única de autenticación: autenticar(request, entorno) → usuario | null (asíncrona).
// Hoy: «Authorization: Bearer <token de desarrollo>», con los tokens que imprime scripts/alta.js.
// El OAuth se enchufa poniendo otro `autenticar` en el entorno; tiene que devolver un usuario
// con la forma de almacen.leerUsuario (id, nombre, tarifaPunto…), o null.
export async function autenticarConTokenDesarrollo(request, { almacen }) {
  const token = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  return almacen.buscarUsuarioPorHuella(await huella(token));
}
