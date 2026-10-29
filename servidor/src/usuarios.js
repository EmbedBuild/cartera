// Usuarios de Cartera en KV. Se entra con correo y contraseña; los códigos de clase siguen valiendo como plan B.
// Nunca se guarda una contraseña ni un código en claro: solo su huella (PBKDF2 para las contraseñas, HMAC para
// los códigos). Como la huella dactilar: se puede comprobar, pero no se puede reconstruir el dedo.

const ITERACIONES = 100_000; // el máximo que admite Workers para PBKDF2
const texto = new TextEncoder();

// Compara dos huellas sin delatar por el tiempo cuántas cifras coinciden. Hecho a mano para que el módulo
// funcione igual en Workers y en Node (crypto.subtle.timingSafeEqual solo existe en Workers).
function igualesEnTiempoConstante(a, b) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

const base64 = (bytes) => btoa(String.fromCharCode(...bytes));
const desdeBase64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

// Lo que sale de aquí hacia el resto de Cartera: el usuario sin la huella de su contraseña.
export const publico = ({ clave, ...resto }) => resto;

// TRIGO-4821, trigo 4821 y «trigo-4821 » valen lo mismo.
export function normalizarCodigo(codigo) {
  return String(codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function hmacCodigo(secreto, codigo) {
  const clave = await crypto.subtle.importKey('raw', texto.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', clave, texto.encode(normalizarCodigo(codigo)))));
}

export async function buscarUsuarioPorCodigo(env, codigo) {
  if (normalizarCodigo(codigo).length < 6) return null;
  const usuarioId = await env.USUARIOS.get(`codigo:${await hmacCodigo(env.SECRETO_CODIGOS, codigo)}`);
  const usuario = usuarioId ? await leerUsuario(env, usuarioId) : null;
  return usuario && publico(usuario);
}

export function leerUsuario(env, usuarioId) {
  return env.USUARIOS.get(`usuario:${usuarioId}`, 'json');
}

const normalizarCorreo = (correo) => String(correo ?? '').trim().toLowerCase();
const correoValido = (correo) => correo.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo);
const claveDeCorreo = async (correo) => `correo:${hex(new Uint8Array(await crypto.subtle.digest('SHA-256', texto.encode(correo))))}`;

async function huellaContrasena(contrasena, sal, iteraciones = ITERACIONES) {
  const base = await crypto.subtle.importKey('raw', texto.encode(String(contrasena ?? '')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, base, 256));
}

// Alta: { usuario } si ha ido bien, o { error } con un mensaje para la persona.
export async function crearCuenta(env, { nombre, correo, contrasena }) {
  correo = normalizarCorreo(correo);
  nombre = String(nombre ?? '').trim();
  if (!correoValido(correo)) return { error: 'Escribe un correo válido, por ejemplo nombre@dominio.com.' };
  if (String(contrasena ?? '').length < 8) return { error: 'La contraseña tiene que tener al menos 8 caracteres.' };
  if (nombre.length < 2 || nombre.length > 60) return { error: 'Para crear la cuenta, escribe también tu nombre.' };
  const claveCorreo = await claveDeCorreo(correo);
  if (await env.USUARIOS.get(claveCorreo)) return { error: 'Ya hay una cuenta con ese correo. Escribe tu contraseña y pulsa «Entrar».' };

  const sal = crypto.getRandomValues(new Uint8Array(16));
  const usuario = {
    id: `c-${hex(crypto.getRandomValues(new Uint8Array(8)))}`,
    nombre,
    email: correo,
    clave: { sal: base64(sal), huella: base64(await huellaContrasena(contrasena, sal)), iteraciones: ITERACIONES },
    creado: new Date().toISOString(),
  };
  await env.USUARIOS.put(`usuario:${usuario.id}`, JSON.stringify(usuario));
  await env.USUARIOS.put(claveCorreo, usuario.id);
  return { usuario: publico(usuario) };
}

// Entrada: el usuario si el correo y la contraseña casan; si no, null (sin decir cuál de los dos falla).
export async function entrarConCorreo(env, { correo, contrasena }) {
  const usuarioId = await env.USUARIOS.get(await claveDeCorreo(normalizarCorreo(correo)));
  const usuario = usuarioId ? await leerUsuario(env, usuarioId) : null;
  if (!usuario?.clave) {
    await huellaContrasena(contrasena, new Uint8Array(16)); // tarda lo mismo exista o no la cuenta
    return null;
  }
  const huella = await huellaContrasena(contrasena, desdeBase64(usuario.clave.sal), usuario.clave.iteraciones);
  return igualesEnTiempoConstante(huella, desdeBase64(usuario.clave.huella)) ? publico(usuario) : null;
}
