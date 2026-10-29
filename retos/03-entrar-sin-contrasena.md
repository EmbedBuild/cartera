# Reto 3 · Entrar sin contraseña

**Nivel:** medio · **Módulo:** `servidor/`

## Por qué importa

Cartera guarda las contraseñas de forma segura: solo su huella, nunca la contraseña. Aun así, guardar contraseñas es una responsabilidad: si un día se filtrara la base de datos, alguien podría intentar adivinarlas, y mucha gente repite la misma contraseña en todas partes. **Lo más seguro es no tener que guardarlas.**

Dos formas conocidas, elige una:

- **A · Enlace mágico.** Escribes tu correo, te llega un enlace y, al abrirlo, entras. Como el portero que te conoce: no hace falta llave.
- **B · Entrar con Google.** Google comprueba quién eres y le dice a Cartera tu nombre y tu correo. Cartera nunca ve tu contraseña de Google.

## Escenarios

```gherkin
Escenario (A): entra con un enlace mágico
  Dado alguien con cuenta en Cartera
  Cuando pide entrar con su correo y abre el enlace antes de 10 minutos
  Entonces entra en Cartera y Claude queda conectado, sin escribir ninguna contraseña

Escenario (A): el enlace mágico solo vale una vez y en el mismo navegador
  Dado un enlace mágico ya usado, o abierto en otro navegador
  Cuando alguien lo abre
  Entonces no entra y se le ofrece pedir otro

Escenario (B): primera vez con Google
  Dado alguien sin cuenta en Cartera
  Cuando pulsa «Entrar con Google» y Google confirma quién es
  Entonces se crea su cuenta con su nombre y su correo de Google, y su cartera empieza con los clientes de ejemplo

Escenario (B): dice que no en Google
  Dado alguien que pulsa «Entrar con Google»
  Cuando en la pantalla de Google pulsa «Cancelar»
  Entonces vuelve a Claude sin conectar, con un mensaje claro
```

## Pistas

- **Dónde tocar:** `servidor/src/index.js` (la ruta `/authorize` y las rutas nuevas), `servidor/src/paginas.js` (el botón o el formulario nuevo) y `servidor/src/usuarios.js` (crear o encontrar la cuenta por correo).
- **Opción A:** es el reto 2 con otra salida. Token al azar, su huella en KV con `expirationTtl: 600`, se borra al usarse y se envía con `env.CORREO.send(...)`. En modo clase el correo solo llega al buzón del profesor; en local, `npx wrangler dev` lo simula. Para que sirva solo en el navegador que lo pidió, guarda una pista en una cookie al pedirlo.
- **Opción B:** la librería de OAuth de Cartera ya trae lo necesario. Mira `beginUpstream()` y `finishUpstream()` en `node_modules/@cloudflare/workers-oauth-provider/docs/upstream-sign-in.md`. Se llaman después de `approveConsent()`, y la cuenta se busca o se crea con el correo que devuelve Google. Hace falta un cliente OAuth de Google: **no subas nunca su secreto al repositorio** (va con `npx wrangler secret put`). Para el despliegue de la comunidad, el cliente lo crea Jesús.
- **Las contraseñas de quien ya las tiene** pueden seguir funcionando: explica en el PR qué harías con ellas.

## Qué entregar

1. Los escenarios de la opción elegida, y por qué la elegiste.
2. El código, con una prueba por escenario en `servidor/test/`.
3. `npm test` en verde en `servidor/`.
