# Cartera

El embudo de propuestas de quien vende proyectos de IA a pymes: clientes, presupuestos por casos de uso, envío por correo con una página pública que el cliente acepta o rechaza, seguimientos, facturación caso a caso y pilotos con hoja de retorno. Es la API sobre la que se construye el MCP de la sesión 6 de PotenzIA.

Las reglas y los escenarios están en [SPEC.md](SPEC.md). Cada escenario tiene una prueba que lo cita.

- **Sin dependencias.** Lo que va a producción (`src/` menos `src/node/`) solo usa APIs Web: `Request`, `Response`, `URL`, `crypto.subtle`, `crypto.getRandomValues` e `Intl`. Sirve en Cloudflare Workers.
- **Node 22 o superior** para ejecutarlo en local, con el adaptador de `src/node/`.

## Probarlo ya

```bash
npm test                                                   # 47 pruebas: 44 escenarios y 3 de plataforma
npm run trazabilidad                                       # «44 escenarios, 0 escenarios sin prueba»
node scripts/alta.js --datos datos --nombre "Jesús" --id jesus   # imprime el token; siembra la cartera de clase
node scripts/alta.js --datos datos --lote 20               # alumno-01 … alumno-20, cada uno con su cartera
node src/node/servidor.js --datos datos --puerto 3361      # o: npm start
npm run reiniciar-clase -- --datos datos                   # carteras como recién sembradas (copia antes en datos/archivo/)
```

En producción, define `URL_PUBLICA` (por ejemplo, `https://cartera.embed.build`) para construir los enlaces del correo. Sin ella, se usa el origen de la petición.

## La cartera de clase

Cada usuario empieza con seis clientes. Las fechas se calculan desde el momento de sembrar, así que «¿a quién llamo hoy?» funciona el día de la clase.

| Cliente | Situación |
|---|---|
| Ribera Industrial | Borrador con dos casos de uso sin criterios, y un «le dije “unos 3.000”» por teléfono con el seguimiento vencido ayer. |
| Albor Climatización | Ganado, a 280 € el punto. Dos casos facturados. Hoy toca presupuestar el SMS que pidió «ya que estáis» (una ampliación). |
| Lince Mudanzas | Piloto gratis que termina en 3 días, con métricas y sin propuesta de pago. Su hoja de retorno da 1,4 meses. |
| Núcleo Pilates | Propuesta enviada hace 12 días y abierta 2 veces, sin seguimiento. |
| Administración Atalaya | Aceptada: 10 criterios, 18 puntos, 4.500 €. CU1 facturado y CU2 con el acta aceptada sin facturar. |
| Obrador Trigal | Solo las notas de la reunión. Es el ejercicio de redactar un presupuesto desde cero. |

## Rutas

Todas las rutas de `/api` piden `Authorization: Bearer <token>`. Devuelven JSON con importes en céntimos (`…Centimos`) y en texto (`"4.500,00 €"`). Los errores llevan `{ mensaje, errores? }` en español.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/yo` | Usuario, tarifa del punto y totales |
| GET | `/api/clientes?etapa=` | Clientes, ordenados por etapa |
| POST | `/api/clientes` | Alta: `{ nombre, sector?, contacto: { nombre, email }, notas?, precioPuntoEuros?, etapa? }` |
| GET | `/api/clientes/:id` | Ficha con historial, presupuestos y seguimientos |
| POST | `/api/clientes/:id` | Editar datos (los mismos campos, todos opcionales) |
| POST | `/api/clientes/:id/etapa` | `{ etapa, nota? }`. «ganado» solo con un presupuesto aceptado |
| GET | `/api/presupuestos?estado=&cliente=` | Lista resumida |
| POST | `/api/presupuestos` | Borrador: `{ clienteId, titulo, resumen?, casosDeUso: [{ nombre, criterios: [{ dado, cuando, entonces }], ponderacion: { datosPersonales, pagos, incertidumbre } }], mantenimientoMensualEuros?, tipo?: "proyecto" \| "piloto", piloto? }` |
| GET | `/api/presupuestos/:ref` | Detalle. `ref` es `P-2026-004` (la última versión) o `P-2026-004-v2` |
| POST | `/api/presupuestos/:ref` | Editar. Si ya está enviado, crea una versión nueva y lo dice en `aviso` |
| POST | `/api/presupuestos/:ref/casos` | Añadir un caso de uso (mismo criterio de versiones) |
| POST | `/api/presupuestos/:ref/enviar` | `{ mensaje? }`: estado «enviado», enlace público, correo a la bandeja de salida |
| POST | `/api/presupuestos/:ref/casos/:cu/acta` | El cliente firma el acta del caso |
| POST | `/api/presupuestos/:ref/casos/:cu/facturar` | Factura el caso: necesita el presupuesto aceptado y el acta aceptada |
| POST | `/api/presupuestos/:ref/ampliacion` | `{ titulo?, casosDeUso }`: borrador de ampliación, con los códigos siguiendo la numeración (CU5…) |
| POST | `/api/seguimientos` | `{ clienteId, presupuestoId?, canal: email\|llamada\|reunion\|whatsapp, nota, proximo?: "AAAA-MM-DD" }` |
| GET | `/api/hoy` | A quién llamar hoy, con prioridad y un motivo legible |
| GET | `/api/embudo` | En juego por etapa, facturado, pendiente y cuotas |
| GET | `/api/correos` | Bandeja de salida |
| GET | `/api/pilotos/:ref/retorno` | Hoja de retorno de un piloto |
| POST | `/api/pilotos/:ref/metricas` | `{ metricas: [{ nombre, unidad, antes, despues, valorUnidadEuros }] }` |
| GET | `/p/:token` | Página pública de la propuesta. Abrirla la marca como «visto» |
| POST | `/p/:token/aceptar` · `/p/:token/rechazar` | Formulario del cliente (`comentario` opcional) |
| GET | `/salud` · `/propuesta.css` | Estado del servicio y estilos de la página |

DELETE, PUT y PATCH devuelven 405: en Cartera nada se borra.

```bash
T=cart_…   # el token que imprimió scripts/alta.js
curl -s localhost:3361/api/hoy -H "Authorization: Bearer $T"
curl -s localhost:3361/api/presupuestos -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"clienteId":"obrador-trigal","titulo":"Pedidos de los bares","casosDeUso":[{"nombre":"El bar hace su pedido","criterios":[{"dado":"un bar con cuenta","cuando":"pide antes de las 21:00","entonces":"el pedido queda guardado"}]}]}'
curl -s -X POST localhost:3361/api/presupuestos/P-2026-006/enviar -H "Authorization: Bearer $T"
curl -s -X POST localhost:3361/api/presupuestos/P-2026-001/ampliacion -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"titulo":"SMS de técnico en camino","casosDeUso":[{"nombre":"SMS al salir","criterios":[{"dado":"un técnico","cuando":"pulsa «voy de camino»","entonces":"el cliente recibe un SMS"}],"ponderacion":{"datosPersonales":true}}]}'
```

## Para desplegarlo (Workers u otro)

`src/web/manejador.js` exporta `manejar(request, entorno) → Promise<Response>`. El entorno trae lo que cambia según dónde se ejecute:

| Clave | Qué es | Por defecto |
|---|---|---|
| `almacen` | `leerCartera(id)`, `guardarCartera(id, cartera)`, `leerUsuario(id)`, `guardarUsuario(u)`, `buscarUsuarioPorHuella(h)`, `listarUsuarios()`, todo asíncrono | Obligatorio. Hay dos: `src/almacen-memoria.js` (referencia y pruebas) y `src/node/almacen-fichero.js` |
| `correo` | `{ enviarCorreo({ para, paraNombre, asunto, texto, html }) → { via, … } }` | Buzón interno: no sale nada. `src/correo.js` trae `redirigirAPruebas(correo, buzon)` para mandarlo todo a un buzón de pruebas |
| `autenticar` | `(request, entorno) → usuario \| null` | Token de desarrollo Bearer (huella SHA-256 en el usuario). Aquí se enchufa OAuth |
| `reloj`, `aleatorio` | `() → Date` y `(n) → Uint8Array` | `new Date()` y `crypto.getRandomValues` |
| `urlPublica` | Base de los enlaces públicos | El origen de la petición |
| `sembrarAlEntrar` | Un usuario sin cartera recibe la de clase en su primera petición (útil con OAuth) | `true` |

Notas para el almacén:

- **Cada cartera es un objeto JSON por usuario.** Recién sembrada ocupa unos 19 KB en JSON compacto. El manejador se niega a guardar una de más de 120 KB, así que cabe en un valor de Durable Object.
- **El enlace público lleva el usuario dentro** (`base64url(usuarioId).azar`), así que no hace falta índice. Aun así, el token tiene que existir en su cartera.
- **Las escrituras de un mismo usuario van en serie dentro del proceso o isolate.** Entre isolates, serializa en el Durable Object del usuario (o acepta que gane la última escritura).

## Estructura

```
src/dominio/      reglas puras: importes, presupuestos, clientes, seguimientos, hoy, embudo, retorno, fechas, textos
src/cartera.js    operaciones por usuario sobre su cartera (leer → cambiar → guardar)
src/semilla.js    cartera de clase, alta de usuarios y reinicio
src/web/          manejador Request → Response, autenticación, azar y huellas, página pública y estilos
src/correo.js     buzón interno y redirección al buzón de pruebas
src/almacen-memoria.js   almacén de referencia (pruebas)
src/node/         solo para Node: almacén de ficheros y adaptador node:http
scripts/          alta, sembrar, reiniciar-clase y trazabilidad
test/             una prueba por escenario («capacidad › Regla › Escenario») y tres de plataforma
```
