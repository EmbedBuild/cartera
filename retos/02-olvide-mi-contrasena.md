# Reto 2 · He olvidado mi contraseña

**Nivel:** medio · **Módulo:** `servidor/` · **Mejor después del reto 1** (para enviar el enlace, el correo tiene que ser de verdad tuyo)

## Por qué importa

Hoy, quien olvida su contraseña no tiene forma de recuperarla: tiene que crear otra cuenta y pierde su cartera. Es como perder la llave de casa y que la única solución sea mudarse.

La solución habitual: pides un enlace, te llega por correo, vale una sola vez y caduca pronto, y con él pones una contraseña nueva.

## Escenarios

```gherkin
Escenario: recupera la cuenta
  Dado alguien con cuenta que ha olvidado su contraseña
  Cuando pide el enlace y lo abre antes de 30 minutos
  Entonces puede poner una contraseña nueva y entra con ella

Escenario: el enlace solo vale una vez
  Dado alguien que ya ha usado su enlace para cambiar la contraseña
  Cuando vuelve a abrir el mismo enlace
  Entonces se le dice que el enlace ya no vale y puede pedir otro

Escenario: el enlace ha caducado
  Dado un enlace pedido hace más de 30 minutos
  Cuando alguien lo abre
  Entonces no puede cambiar la contraseña y puede pedir otro enlace

Escenario: no se delata quién tiene cuenta
  Dado un correo que no tiene cuenta en Cartera
  Cuando alguien pide el enlace para ese correo
  Entonces ve el mismo mensaje que si la tuviera: «Si hay una cuenta con ese correo, te hemos enviado un enlace»

Escenario: la contraseña vieja deja de valer
  Dado alguien que acaba de poner una contraseña nueva
  Cuando intenta entrar con la anterior
  Entonces no entra
```

## Pistas

- **Dónde tocar:**
  - `servidor/src/index.js`: dos rutas nuevas, por ejemplo `/contrasena/olvido` (el formulario para pedir el enlace) y `/contrasena/nueva` (abrir el enlace y poner la nueva);
  - `servidor/src/paginas.js`: las dos pantallas y el enlace «¿Has olvidado tu contraseña?» en la de entrada;
  - `servidor/src/usuarios.js`: cambiar la huella de la contraseña con `huellaContrasena()`, que ya existe.
- **El enlace lleva un token al azar** (`crypto.getRandomValues`). En el KV se guarda **su huella**, no el token, con caducidad: `put('restablecer:<huella>', usuarioId, { expirationTtl: 1800 })`. Al usarlo, bórralo con `env.USUARIOS.delete(...)` para que no valga dos veces.
- **El correo, como en el reto 1:** `env.CORREO.send(...)`. En modo clase solo llega al buzón del profesor; en local, `npx wrangler dev` lo simula.
- **Frena los abusos** con `env.LIMITE_CODIGOS`, también al pedir enlaces.
- **Reflexiona en el PR:** ¿qué pasa con Claude si cambias la contraseña? El permiso que le diste sigue valiendo hasta que lo quites. ¿Debería cortarse?

## Qué entregar

1. Los escenarios (en este archivo o en el PR).
2. El código, con una prueba por escenario en `servidor/test/`.
3. `npm test` en verde en `servidor/`.
