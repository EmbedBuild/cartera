# Cartera

**La herramienta de presupuestos de la comunidad PotenzIA.** Guarda tus clientes, tus presupuestos por casos de uso y tus seguimientos, y se usa hablando: desde Claude, también desde la cuenta gratuita.

Le preguntas «¿a quién llamo hoy?», «redacta el presupuesto para este cliente» o «envíaselo», y Cartera lo hace. La IA redacta; Cartera decide y hace las cuentas.

> Los clientes, los importes y los correos de ejemplo son ficticios.

## Cómo funciona, en llano

| Pieza | Qué hace | Dónde está |
|---|---|---|
| **La API** | Las reglas y los datos: clientes, presupuestos, puntos, importes y seguimientos. Hace todas las cuentas | `api/` |
| **La entrada** | Entrar con tu correo y tu contraseña, y el permiso que das a Claude. Cada persona tiene su propia cartera | `servidor/` |
| **El MCP** | Las 15 herramientas que Claude sabe usar. Claude conversa; la API decide y calcula | `mcp/` |
| **Publicar** | Cloudflare: Cartera está publicada en `cartera.embed.build` | `servidor/` y `mcp/` |

## Úsala desde Claude (vale la cuenta gratuita)

1. En Claude, ve a **Configuración → Conectores → Añadir conector personalizado**.
2. Ponle de nombre `Cartera` y pega esta dirección: `https://cartera-mcp.embed.build/mcp`.
3. Pulsa **Conectar**. Se abre la página de Cartera: crea tu cuenta (correo, una contraseña de al menos 8 caracteres y tu nombre) o entra si ya la tienes, y pulsa el botón.
4. En una conversación nueva, activa Cartera en el menú de herramientas y pregunta: **«¿A quién llamo hoy?»**

Tu cartera empieza con seis clientes de ejemplo para que puedas probarlo todo: redactar, enviar, aceptar desde el enlace del correo, facturar por caso de uso… El plan gratuito de Claude admite un solo conector personalizado: si ya tienes otro, quítalo antes.

## Cómo está hecha: tres módulos

Cada carpeta es un módulo con su contrato (lo que hace, escrito como escenarios «Dado / Cuando / Entonces») y sus pruebas. Se puede cambiar una pieza sin tocar las otras.

- **`api/` · la API.** Las reglas de negocio y la API. JavaScript sin dependencias, 47 pruebas, una por escenario de [`api/SPEC.md`](api/SPEC.md). Funciona igual en tu ordenador (Node 22 o superior) que en Cloudflare.
- **`servidor/` · la entrada y la publicación.** El programa que publica Cartera en Cloudflare: la entrada con correo y contraseña (y el permiso que das a Claude), la cartera de cada persona guardada aparte, el envío de correos y la página donde el cliente acepta o rechaza la propuesta.
- **`mcp/` · el MCP.** Las 15 herramientas que usa Claude, en [`mcp/src/herramientas.js`](mcp/src/herramientas.js). Cada una lleva un nombre, una descripción (es lo que lee la IA para decidir cuándo usarla) y lo que pide a la API.

### El contrato entre módulos

`mcp/` solo habla con `servidor/` por dos funciones. Se llaman por una conexión interna de Cloudflare (un *service binding* llamado `CARTERA`, con el punto de entrada `ApiInterna`), no por internet. Mientras las dos funciones digan lo mismo, cualquiera de los dos lados puede cambiar por dentro.

| Función | Recibe | Devuelve |
|---|---|---|
| `validateToken(recurso, token)` | La dirección del MCP que pregunta (`https://…/mcp`) y el token que Claude le ha enviado | Si el token es válido, lo ha emitido Cartera y es **para ese MCP**: `{ props: { usuarioId, nombre }, scope, audience, expiresAt, userId, clientId }`. Si no, `null` |
| `pedir(usuarioId, metodo, ruta, cuerpo)` | Quién pide (el `usuarioId` del token), `'GET'` o `'POST'`, una ruta de la API que empieza por `/api/` (todas en [`api/README.md`](api/README.md)) y, si es POST, el cuerpo como objeto | `{ ok, estado, datos }`: si fue bien, el código HTTP y el JSON de la API. Si no, `datos` trae `{ mensaje, errores? }` en español, para devolvérselo tal cual a la IA |

La consecuencia: hoy el MCP solo puede desplegarse en la misma cuenta de Cloudflare que el servidor. Abrir la API al mundo es el [reto 4](retos/04-abre-la-api.md).

## Pruébala en tu ordenador

Necesitas Node 22 o superior.

```bash
cd api && npm test          # 47 pruebas de la API (sin instalar nada)
cd servidor && npm test     # pruebas de las cuentas
cd mcp && npm install && npm test   # pruebas de las herramientas
```

Para arrancar la API sola, con datos de ejemplo: `cd api && node scripts/alta.js --datos datos --nombre "Tu nombre" --id yo` y luego `npm start`. Para el servidor completo en local: `cd servidor && npm install && npx wrangler dev`, que simula Cloudflare (y también el envío de correos).

`servidor/wrangler.jsonc` y `mcp/wrangler.jsonc` apuntan a la Cartera de la comunidad: para desplegar la tuya necesitas tu cuenta de Cloudflare, tus propios espacios de datos y un buzón verificado.

## Retos para la comunidad

| Reto | Nivel | Qué resuelve |
|---|---|---|
| [1 · Comprueba que el correo es tuyo](retos/01-verificar-correo.md) | Medio | Hoy cualquiera puede crear una cuenta con un correo ajeno |
| [2 · He olvidado mi contraseña](retos/02-olvide-mi-contrasena.md) | Medio | Hoy quien la olvida tiene que crear otra cuenta |
| [3 · Entrar sin contraseña](retos/03-entrar-sin-contrasena.md) | Medio | Que Cartera no tenga que guardar contraseñas |
| [4 · Abre la API](retos/04-abre-la-api.md) | Avanzado | Que cualquiera pueda conectar su propio MCP o app a la API |
| [5 · Añade una herramienta al MCP](retos/05-anade-una-herramienta.md) | Fácil | Una herramienta nueva para algo que la API ya sabe hacer |

Cómo aportar, programes o no: [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

MIT. Úsala, cámbiala y compártela; solo te pedimos que cites el origen.
