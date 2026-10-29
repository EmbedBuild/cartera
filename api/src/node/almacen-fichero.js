import { cp, mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

// Almacén en ficheros JSON (Node): datos/usuarios.json y una cartera por usuario en datos/carteras/<id>.json.
// Misma interfaz que almacen-memoria.js. Cada escritura va a un temporal, se sincroniza y se renombra:
// un corte a mitad no deja un JSON a medias. Lee del disco cada vez, así que los scripts pueden escribir
// con el servicio en marcha (salvo en el mismo instante que una petición de ese usuario).
export function crearAlmacenFichero(dir) {
  const rutaUsuarios = join(dir, 'usuarios.json');
  const rutaCartera = (id) => join(dir, 'carteras', `${nombreDeFichero(id)}.json`);
  let colaUsuarios = Promise.resolve();

  async function leerJson(ruta, porDefecto) {
    try {
      return JSON.parse(await readFile(ruta, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return porDefecto;
      throw e;
    }
  }

  async function escribirJson(ruta, valor) {
    await mkdir(join(ruta, '..'), { recursive: true });
    const temporal = `${ruta}.${process.pid}.tmp`;
    const archivo = await open(temporal, 'w');
    try {
      await archivo.writeFile(JSON.stringify(valor, null, 1));
      await archivo.sync();
    } finally {
      await archivo.close();
    }
    await rename(temporal, ruta);
  }

  const leerUsuarios = () => leerJson(rutaUsuarios, []);

  return {
    leerCartera: (id) => leerJson(rutaCartera(id), null),
    guardarCartera: (id, cartera) => escribirJson(rutaCartera(id), cartera),
    leerUsuario: async (id) => (await leerUsuarios()).find((u) => u.id === id) ?? null,
    // En serie: dos altas a la vez no se pisan la lista.
    guardarUsuario: (usuario) => {
      colaUsuarios = colaUsuarios.then(async () => {
        const usuarios = await leerUsuarios();
        const i = usuarios.findIndex((u) => u.id === usuario.id);
        if (i < 0) usuarios.push(usuario);
        else usuarios[i] = usuario;
        await escribirJson(rutaUsuarios, usuarios);
      });
      return colaUsuarios;
    },
    buscarUsuarioPorHuella: async (h) => (await leerUsuarios()).find((u) => u.tokens?.some((t) => t.huella === h && !t.revocado)) ?? null,
    listarUsuarios: leerUsuarios,
    // Copia de todo (usuarios y carteras) en datos/archivo/<fecha>/ antes de reiniciar la clase.
    archivar: async (ahora = new Date()) => {
      const destino = join(dir, 'archivo', ahora.toISOString().replace(/[:.]/g, '-'));
      await mkdir(destino, { recursive: true });
      await cp(rutaUsuarios, join(destino, 'usuarios.json')).catch(ignorarSiNoExiste);
      await cp(join(dir, 'carteras'), join(destino, 'carteras'), { recursive: true }).catch(ignorarSiNoExiste);
      return destino;
    },
  };
}

function ignorarSiNoExiste(e) {
  if (e.code !== 'ENOENT') throw e;
}

// Los ids de OAuth pueden traer caracteres que no valen en un nombre de fichero: entonces, en base64url.
function nombreDeFichero(id) {
  const texto = String(id);
  return /^[\w-]{1,80}$/.test(texto) ? texto : `b64-${Buffer.from(texto).toString('base64url')}`;
}
