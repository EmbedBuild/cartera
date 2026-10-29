# Reto 1 · Comprueba que el correo es tuyo

**Nivel:** medio · **Módulo:** `servidor/`

## Por qué importa

Hoy, para crear una cuenta en Cartera basta con escribir un correo, sin demostrar que es tuyo. Cualquiera podría registrarse con el correo de otra persona, y nunca podríamos escribirle para nada importante (por ejemplo, para el reto 2). Es como dejar el teléfono de otra persona al pedir algo: nunca podrán avisarte a ti.

La solución habitual: al crear la cuenta llega un código de 6 cifras al correo, y la cuenta no vale hasta que lo escribes.

## Escenarios

```gherkin
Escenario: crea la cuenta y confirma el correo
  Dado alguien que crea su cuenta con su correo, una contraseña y su nombre
  Cuando escribe el código de 6 cifras que le ha llegado, antes de 15 minutos
  Entonces entra en Cartera y su cuenta queda marcada como verificada

Escenario: el código ha caducado
  Dado alguien que ha creado su cuenta hace más de 15 minutos sin confirmar el correo
  Cuando escribe el código que le llegó
  Entonces no entra, se le explica que el código ha caducado y puede pedir uno nuevo

Escenario: código equivocado demasiadas veces
  Dado alguien que tiene un código pendiente
  Cuando escribe un código equivocado por tercera vez
  Entonces ese código deja de valer y tiene que pedir uno nuevo

Escenario: una cuenta sin verificar intenta entrar
  Dado una cuenta creada que nunca confirmó su correo
  Cuando intenta entrar con su correo y su contraseña
  Entonces se le pide primero el código, y se le puede reenviar
```

Añade los que echas en falta, incluido alguno que salga mal (¿qué pasa si pide 20 códigos seguidos?).

## Pistas

- **Dónde tocar:**
  - `servidor/src/usuarios.js`: un estado `verificado` en el usuario;
  - `servidor/src/index.js`: el paso intermedio dentro de `/authorize`, antes de `completeAuthorization()`;
  - `servidor/src/paginas.js`: la pantalla «Escribe el código que te hemos enviado».
- **Guarda la huella del código, nunca el código.** Puedes reutilizar la idea de `hmacCodigo()`. Un KV con caducidad hace el resto: `env.USUARIOS.put('verificacion:<id>', huella, { expirationTtl: 900 })` desaparece solo a los 15 minutos.
- **La pantalla de permiso vale una vez y 10 minutos.** Piensa cómo encaja el paso del código: por ejemplo, completar la verificación y volver a mostrar la pantalla de entrada con un `parseAuthRequest()` nuevo (mira cómo lo hace `mostrarEntrada()` cuando la contraseña es incorrecta).
- **El correo se envía con `env.CORREO.send({ from, to, subject, text, html })`.** En la Cartera de la comunidad estamos **en modo clase**: Cloudflare solo deja enviar al buzón verificado del profesor, así que el código le llegará a él, con el destinatario original en el asunto (mira `redirigirAPruebas()` en `api/src/correo.js`). Para tus pruebas no importa: en local, `npx wrangler dev` simula el envío y lo enseña en la consola.
- **Frena los abusos:** el freno de intentos `env.LIMITE_CODIGOS` ya existe; úsalo también para pedir códigos.

## Qué entregar

1. Los escenarios (en este archivo o en el PR).
2. El código, con una prueba por escenario en `servidor/test/` (mira cómo `usuarios.test.js` usa un KV falso).
3. `npm test` en verde en `servidor/`.
