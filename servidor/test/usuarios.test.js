// Cuentas con correo y contraseña, sin Cloudflare: el KV es un Map con la misma forma (get, put, get(k, 'json')).
// Una prueba por escenario: «cuentas › Dado … › Cuando … › Entonces …».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCuenta, entrarConCorreo, publico } from '../src/usuarios.js';

function entornoFalso() {
  const datos = new Map();
  return {
    USUARIOS: {
      async get(clave, tipo) {
        const valor = datos.get(clave) ?? null;
        return tipo === 'json' && valor !== null ? JSON.parse(valor) : valor;
      },
      async put(clave, valor) {
        datos.set(clave, valor);
      },
    },
  };
}

const ANA = { nombre: 'Ana López', correo: 'ana@ejemplo.com', contrasena: 'huerto-2026' };

test('cuentas › Dado un correo nuevo › Cuando crea la cuenta › Entonces entra y no se guarda la contraseña en claro', async () => {
  const env = entornoFalso();
  const { usuario, error } = await crearCuenta(env, ANA);
  assert.equal(error, undefined);
  assert.equal(usuario.nombre, 'Ana López');
  assert.equal(usuario.email, 'ana@ejemplo.com');
  const guardado = await env.USUARIOS.get(`usuario:${usuario.id}`, 'json');
  assert.ok(guardado.clave.huella);
  assert.ok(!JSON.stringify(guardado).includes(ANA.contrasena));
});

test('cuentas › Dado una cuenta creada › Cuando entra con el correo en mayúsculas › Entonces entra', async () => {
  const env = entornoFalso();
  const { usuario } = await crearCuenta(env, ANA);
  const otraVez = await entrarConCorreo(env, { correo: '  ANA@Ejemplo.COM ', contrasena: ANA.contrasena });
  assert.equal(otraVez.id, usuario.id);
});

test('cuentas › Dado una cuenta creada › Cuando entra con una contraseña mala › Entonces no entra', async () => {
  const env = entornoFalso();
  await crearCuenta(env, ANA);
  assert.equal(await entrarConCorreo(env, { correo: ANA.correo, contrasena: 'otra-cosa-123' }), null);
});

test('cuentas › Dado un correo sin cuenta › Cuando intenta entrar › Entonces no entra', async () => {
  const env = entornoFalso();
  assert.equal(await entrarConCorreo(env, { correo: 'nadie@ejemplo.com', contrasena: 'lo-que-sea-1' }), null);
});

test('cuentas › Dado un correo ya registrado › Cuando crea otra cuenta con él › Entonces se le avisa', async () => {
  const env = entornoFalso();
  await crearCuenta(env, ANA);
  const { usuario, error } = await crearCuenta(env, { ...ANA, nombre: 'Otra Ana' });
  assert.equal(usuario, undefined);
  assert.match(error, /Ya hay una cuenta con ese correo/);
});

test('cuentas › Dado una contraseña de menos de 8 caracteres › Cuando crea la cuenta › Entonces se le pide una más larga', async () => {
  const { usuario, error } = await crearCuenta(entornoFalso(), { ...ANA, contrasena: 'corta' });
  assert.equal(usuario, undefined);
  assert.match(error, /al menos 8 caracteres/);
});

test('cuentas › Dado un nombre vacío › Cuando crea la cuenta › Entonces se le pide el nombre', async () => {
  const { usuario, error } = await crearCuenta(entornoFalso(), { ...ANA, nombre: '   ' });
  assert.equal(usuario, undefined);
  assert.match(error, /escribe también tu nombre/);
});

test('cuentas › Dado un correo mal escrito › Cuando crea la cuenta › Entonces se le pide uno válido', async () => {
  const { usuario, error } = await crearCuenta(entornoFalso(), { ...ANA, correo: 'ana-arroba-ejemplo' });
  assert.equal(usuario, undefined);
  assert.match(error, /correo válido/);
});

test('cuentas › Dado un usuario guardado › Cuando se presenta al resto de Cartera › Entonces no lleva la huella de su contraseña', async () => {
  const env = entornoFalso();
  const { usuario } = await crearCuenta(env, ANA);
  const guardado = await env.USUARIOS.get(`usuario:${usuario.id}`, 'json');
  assert.equal(publico(guardado).clave, undefined);
  assert.equal(usuario.clave, undefined);
});
