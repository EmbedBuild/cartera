# Cómo aportar a Cartera

Cartera es de la comunidad: cualquier mejora es bienvenida, programes o no. La regla de la casa es la misma que en clase: **primero se cambia el contrato y después el código.** El contrato son los escenarios «Dado / Cuando / Entonces» de cada módulo (en la cocina, [`api/SPEC.md`](api/SPEC.md)).

## Forma 1 · Sin programar: escribe los escenarios

Lo más valioso de cada reto es decidir **qué** tiene que pasar, incluido lo que puede salir mal. Eso no exige programar.

1. Abre el reto que te interese en la pestaña **Issues** y lee lo que ya está escrito.
2. Si quieres comentar o proponer un escenario rápido, escríbelo en la propia incidencia. Por ejemplo: «Dado alguien que pide el enlace tres veces seguidas, cuando lo pide la cuarta, entonces…».
3. Si quieres dejarlo en el contrato, abre el archivo del reto (en la carpeta `retos/`) o `api/SPEC.md` en la web de GitHub y pulsa el lápiz. GitHub crea tu copia y te deja guardar los cambios como una **propuesta de cambio** (pull request). En el título pon el número del reto: «Reto 2 · escenarios del enlace que caduca».

Una buena propuesta de escenarios tiene:
- al menos uno que sale bien y otro que sale mal;
- un «entonces» que se pueda comprobar con un sí o un no;
- nada de cómo se programa: solo lo que ve la persona.

## Forma 2 · Programando: contrato, código y pruebas

1. Haz tu copia del repositorio (*fork*) y crea una rama con el nombre del reto: `reto-2-olvide-contrasena`.
2. **Primero los escenarios**, en el archivo del reto o en el contrato del módulo que tocas.
3. Después el código y **una prueba por escenario**, con el nombre del escenario: `cuentas › Dado … › Cuando … › Entonces …`.
4. Comprueba en tu ordenador que todo está en verde en las carpetas que has tocado: `npm test` en `api/`, `servidor/` o `mcp/`.
5. Abre la propuesta de cambio (pull request), **una por reto**, y escribe «Cierra #N» con el número de la incidencia.

Reglas:
- **Sin dependencias nuevas**, salvo que lo justifiques en el PR.
- **Sin secretos:** ni claves, ni contraseñas, ni direcciones personales. Los secretos van con `npx wrangler secret put`, nunca en un archivo.
- **Datos ficticios** siempre, también en las pruebas.
- Nombres, mensajes y comentarios en español, como el resto del código. Los mensajes de error los lee la IA y una persona: que se entiendan.
- En la cocina (`api/`) solo se usan APIs Web (nada de `node:`, `Buffer` ni `process.` fuera de `api/src/node/`): una prueba lo vigila.

## Revisión y despliegue

Las propuestas las revisa Jesús Pérez y, cuando se aceptan, las publica él a mano en Cloudflare. El repositorio **no tiene acciones automáticas** que se disparen al subir cambios o al abrir un PR: las pruebas se pasan en local, en tu ordenador.
