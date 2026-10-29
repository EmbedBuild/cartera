# Reto 5 · Añade un plato a la carta

**Nivel:** fácil · **Módulo:** `mcp/` · **Buen primer reto si programas poco**

## Por qué importa

La cocina de Cartera (la API) sabe hacer más cosas de las que la carta (el MCP) ofrece a Claude. Cada plato nuevo es una cosa más que puedes pedir hablando. Y añadir uno enseña lo más importante de un MCP: **la descripción de cada herramienta es lo que lee la IA para decidir cuándo usarla.** Si la carta se explica mal, el camarero se equivoca.

Cosas que la cocina ya hace y la carta todavía no ofrece (todas en `api/README.md`):

| Plato posible | Lo que pide a la cocina |
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
  Entonces se rechaza antes de llegar a la cocina, con los estados válidos
```

Escribe los de tu plato: al menos uno que sale bien y otro que sale mal.

## Pistas

- **Dónde tocar:** solo `mcp/src/herramientas.js` y una prueba en `mcp/test/`. No hace falta tocar la puerta (`mcp/src/index.js`) ni la cocina.
- **Copia el patrón de un plato parecido:** `listar_clientes` para leer y `registrar_seguimiento` para escribir. Cada uno lleva:
  - un nombre en español con guiones bajos (un verbo: `listar_presupuestos`);
  - `title` y `description`. La descripción es para la IA: cuándo usarla, qué devuelve y qué no hace;
  - `inputSchema` con `zod`, con `.describe()` en cada dato;
  - `annotations`: `LEER` si solo mira y `CAMBIAR` si escribe;
  - la llamada `pedir(metodo, ruta, cuerpo)`, con `ruta\`…${dato}\`` para meter lo que escribe la persona.
- **Nunca aceptes importes ni puntos:** el precio lo calcula siempre la cocina.
- **La prueba,** con `montar()` de `test/ayudas.js`: usa la herramienta y comprueba qué se le pide a la cocina (`llamadas`). Mira `test/herramientas.test.js`; la prueba que cuenta las herramientas (15) tendrás que subirla.
- **Pruébala con Claude:** si tienes cuenta de Cloudflare, `npx wrangler dev` en `mcp/`. Si no, deja que Jesús la publique al aceptar el PR.

## Qué entregar

1. Los escenarios de tu plato.
2. La herramienta y su prueba.
3. `npm install && npm test` en verde en `mcp/`.
