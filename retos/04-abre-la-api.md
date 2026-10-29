# Reto 4 · Abre la API

**Nivel:** avanzado · **Módulo:** `servidor/`

## Por qué importa

Hoy la API de Cartera solo atiende a **su propio MCP**: el MCP de `mcp/` le habla por una conexión interna de Cloudflare (las funciones `pedir` y `validateToken` de `ApiInterna`; ver «El contrato entre módulos» en el README). Por eso el MCP solo se puede publicar en la misma cuenta de Cloudflare que la API.

El reto es **abrir la API al mundo, con sus propios permisos**: que cualquiera pueda construir su propio MCP o su propia app (desde su cuenta de Cloudflare, o desde donde quiera) y pedir a la API de Cartera en nombre de una persona, solo si esa persona le ha dado permiso.

## Escenarios

```gherkin
Escenario: una app de fuera pide con permiso
  Dado una app externa a la que una persona ha dado permiso para leer su cartera
  Cuando pide «a quién llamo hoy» a la API con su token
  Entonces la API responde con la cartera de esa persona y de nadie más

Escenario: el token del MCP no abre la API
  Dado un token emitido para el MCP de Cartera
  Cuando alguien lo usa para llamar directamente a la API
  Entonces la API lo rechaza: cada token vale solo para aquello para lo que se emitió

Escenario: permiso de solo lectura
  Dado una app con permiso solo para leer
  Cuando intenta enviar un presupuesto
  Entonces la API responde que le falta el permiso de escritura y no envía nada
```

## Pistas

- **La API tiene que ser un recurso con nombre propio**, por ejemplo `https://cartera.embed.build/api`, con sus permisos (`cartera:leer`, `cartera:escribir`). Añádelo a `resources` del servidor de autorización en `servidor/src/index.js`.
- **El mismo Worker puede hacer de servidor de autorización y de recurso:** mira la sección «Same Worker» de `docs/resource-servers.md` en `@cloudflare/workers-oauth-provider`. Las rutas `/api/*` se envuelven con `OAuthResourceServer`, y el usuario del token se pasa al núcleo como `autenticar` en el entorno de `manejar()`, que ya existe para eso. Recuerda llevar cada petición al Durable Object de su usuario (`env.CARTERAS.getByName(id)`), como hace `ApiInterna.pedir`.
- **Los clientes de fuera se registran solos,** por CIMD (lo preferido) o por registro dinámico, como ya hacen Claude o ChatGPT con el MCP. Y cada uno pasa por la pantalla de permiso.
- **La pista honesta:** un MCP de fuera no puede «convertir» el token que le da Claude en uno para la API. La librería admite el intercambio de tokens (RFC 8693), pero ese intercambio **no puede cambiar el recurso** para el que se emitió el token (`docs/advanced-configuration.md`, «OAuth 2.0 Token Exchange»). Así que ese MCP necesitaría pedir su propio permiso a la persona hacia la API, con el patrón de inicio de sesión en otro proveedor (`docs/upstream-sign-in.md`). Escríbelo en tus escenarios: ¿qué ve la persona, una pantalla de permiso o dos?
- **No reenvíes tokens:** la especificación MCP lo prohíbe expresamente («token passthrough»).

## Qué entregar

1. Los escenarios, incluido el de la persona que ve las pantallas de permiso.
2. El código, con pruebas en `servidor/test/`, y una actualización de «El contrato entre módulos» en el README.
3. `npm test` en verde en `api/` y en `servidor/`.
