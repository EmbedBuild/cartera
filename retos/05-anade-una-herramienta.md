# Reto 5 · Añade una herramienta al MCP

**Nivel:** fácil · **Módulo:** `mcp/` · **Buen primer reto si programas poco**

## Por qué importa

La API de Cartera sabe hacer más cosas de las que el MCP ofrece a Claude. Cada herramienta nueva es una cosa más que puedes pedir hablando. Y añadir uno enseña lo más importante de un MCP: **la descripción de cada herramienta es lo que lee la IA para decidir cuándo usarla.** Si la descripción se explica mal, la IA se equivoca.

Cosas que la API ya hace y el MCP todavía no ofrece (todas en `api/README.md`):

| Herramienta posible | Lo que pide a la API |
|---|---|
| Listar mis presupuestos (por estado o por cliente) | `GET /api/presupuestos?estado=&cliente=` |
| Corregir los datos de un cliente | `POST /api/clientes/:id` |
| Editar un presupuesto en borrador (o crear su versión nueva) | `POST /api/presupuestos/:ref` |
| Apuntar las métricas de un piloto | `POST /api/pilotos/:ref/metricas` |
| Proponer un piloto | `POST /api/presupuestos` con `tipo: "piloto"` |

## Escenarios (ejemplo: listar presupuestos)

```gherkin
Escenario: lista los presupuestos que esperan respuesta
  Dado una cartera con presupuestos enviados y aceptados
  Cuando la persona pregunta «¿qué presupuestos tengo pendientes de respuesta?»
  Entonces Claude usa la herramienta con el estado «enviado» y enseña solo esos

Escenario: estado que no existe
  Dado una petición con un estado inventado, por ejemplo «olvidado»
  Cuando se usa la herramienta
  Entonces se rechaza antes de llegar a la API, con los estados válidos
```

Escribe los de tu herramienta: al menos uno que sale bien y otro que sale mal.

## Pistas

- **Dónde tocar:** solo `mcp/src/herramientas.js` y una prueba en `mcp/test/`. No hace falta tocar la puerta (`mcp/src/index.js`) ni la API.
- **Copia el patrón de una herramienta parecida:** `listar_clientes` para leer y `registrar_seguimiento` para escribir. Cada uno lleva:
  - un nombre en español con guiones bajos (un verbo: `listar_presupuestos`);
  - `title` y `description`. La descripción es para la IA: cuándo usarla, qué devuelve y qué no hace;
  - `inputSchema` con `zod`, con `.describe()` en cada dato;
  - `annotations`: `LEER` si solo mira y `CAMBIAR` si escribe;
  - la llamada `pedir(metodo, ruta, cuerpo)`, con `ruta\`…${dato}\`` para meter lo que escribe la persona.
- **Nunca aceptes importes ni puntos:** el precio lo calcula siempre la API.
- **La prueba,** con `montar()` de `test/ayudas.js`: usa la herramienta y comprueba qué se le pide a la API (`llamadas`). Mira `test/herramientas.test.js`; la prueba que cuenta las herramientas (15) tendrás que subirla.
- **Pruébala con Claude:** si tienes cuenta de Cloudflare, `npx wrangler dev` en `mcp/`. Si no, deja que Jesús la publique al aceptar el PR.

## Qué entregar

1. Los escenarios de tu herramienta.
2. La herramienta y su prueba.
3. `npm install && npm test` en verde en `mcp/`.
