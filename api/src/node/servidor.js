import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { manejar } from '../web/manejador.js';
import { crearAlmacenFichero } from './almacen-fichero.js';

const LIMITE_LECTURA = 1024 * 1024;
// Cabeceras que pone el propio fetch de Node o que no tienen sentido al reenviar la petición.
const QUITAR = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'expect']);

// Adaptador mínimo node:http ↔ Request/Response para ejecutar el manejador en local o en un VPS.
export function crearServidorNode(entorno) {
  return createServer(async (req, res) => {
    try {
      const esquema = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const url = `${esquema}://${req.headers.host ?? 'localhost'}${req.url}`;
      const cabeceras = new Headers();
      for (const [nombre, valor] of Object.entries(req.headers)) {
        if (!QUITAR.has(nombre)) cabeceras.set(nombre, Array.isArray(valor) ? valor.join(', ') : valor);
      }
      let cuerpo;
      if (!['GET', 'HEAD'].includes(req.method)) {
        const trozos = [];
        let total = 0;
        for await (const trozo of req) {
          total += trozo.length;
          if (total > LIMITE_LECTURA) break;
          trozos.push(trozo);
        }
        if (total > LIMITE_LECTURA) {
          res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ mensaje: 'La petición es demasiado grande' }));
        }
        cuerpo = Buffer.concat(trozos);
      }
      const respuesta = await manejar(new Request(url, { method: req.method, headers: cabeceras, body: cuerpo }), entorno);
      res.writeHead(respuesta.status, Object.fromEntries(respuesta.headers));
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await respuesta.arrayBuffer()));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ mensaje: 'Algo ha fallado. Inténtalo otra vez.' }));
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      datos: { type: 'string', default: process.env.CARTERA_DATOS ?? 'datos' },
      puerto: { type: 'string', default: process.env.PORT ?? '3361' },
      host: { type: 'string', default: process.env.HOST ?? '127.0.0.1' },
    },
  });
  const entorno = { almacen: crearAlmacenFichero(values.datos), urlPublica: process.env.URL_PUBLICA };
  crearServidorNode(entorno).listen(Number(values.puerto), values.host, () => {
    console.log(`Cartera en marcha (datos en «${values.datos}»): http://${values.host}:${values.puerto}`);
  });
}
