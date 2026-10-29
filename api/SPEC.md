# Cartera · Especificación

Cartera lleva el embudo de propuestas de quien vende proyectos de IA a pequeñas empresas: clientes, presupuestos por casos de uso, envío por correo con una página pública que el cliente acepta o rechaza, seguimientos, facturación caso a caso y pilotos con su hoja de retorno. Es la API que usará el MCP de la sesión 6.

Sigue el método de la sesión 5, «Presupuestar por casos de uso, en cinco pasos»:
1. Agrupa los criterios en casos de uso.
2. Pondera cada caso.
3. Pacta el precio del punto con cada cliente.
4. Factura cada caso al aceptar su acta.
5. Un cambio es un criterio nuevo: se especifica, se presupuesta y se firma antes de construirlo.

## Fórmula del precio (la calcula siempre la API)

- **Puntos de un caso de uso** = número de criterios + 2 si toca datos personales + 2 si toca pagos + incertidumbre (baja 0, media 1, alta 3).
- **Importe de un caso** = puntos × precio del punto pactado con el cliente (250 € por defecto).
- **Instalación** = suma de los importes de los casos.
- **Mantenimiento mensual** = 10 % de la instalación, redondeado a 10 €. Se puede pactar otro.
- **IVA** del 21 %, aparte, sobre la instalación y sobre el mantenimiento.
- Todo se guarda en céntimos enteros. Ningún importe que llegue de fuera se usa para calcular.

Estados de un presupuesto: borrador, enviado, visto, aceptado, rechazado, caducado (se calcula al consultar: 30 días desde el envío sin decisión) y sustituido (cuando se envía una versión más nueva). Etapas de un cliente: contacto, reunión, propuesta, negociación, ganado y perdido.

Cada cartera es de un usuario y se guarda entera (en Workers, en un Durable Object por usuario), así que tiene un tamaño máximo.

Cada escenario tiene una prueba cuyo nombre lo cita: «capacidad › Regla › Escenario» (`npm run trazabilidad`).

## acceso

### Regla: Sin credencial no hay datos

#### Escenario: Sale bien: entra con su token
- **Dado** un usuario dado de alta con su token
- **Cuando** consulta sus datos con `Authorization: Bearer <token>`
- **Entonces** ve su nombre y su tarifa del punto

#### Escenario: Puede salir mal: sin token o con uno falso
- **Dado** una petición sin token, o con un token que no existe
- **Cuando** pide cualquier dato de la API
- **Entonces** recibe un 401 con el mensaje «Falta la credencial o no es válida»
- **Y** no ve ningún dato

### Regla: Cada usuario ve solo su cartera

#### Escenario: Sale bien: ve sus propios clientes
- **Dado** dos usuarios con su cartera
- **Cuando** uno lista sus clientes
- **Entonces** ve solo los suyos

#### Escenario: Puede salir mal: pide algo de otro usuario
- **Dado** un cliente y un presupuesto de otro usuario
- **Cuando** intenta verlos, cambiarlos o registrarles un seguimiento
- **Entonces** recibe un 404, como si no existieran
- **Y** los datos del otro usuario no cambian

### Regla: Nada se borra

#### Escenario: Sale bien: lo rechazado sigue en la cartera
- **Dado** un presupuesto que el cliente ha rechazado
- **Cuando** el usuario lista sus presupuestos
- **Entonces** sigue ahí, en estado «rechazado» y con el comentario del cliente

#### Escenario: Puede salir mal: alguien intenta borrar
- **Dado** un cliente de la cartera
- **Cuando** llega un DELETE, PUT o PATCH
- **Entonces** se rechaza con un 405 y el cliente sigue igual

### Regla: La cartera cabe en 120 KB

#### Escenario: Sale bien: los cambios normales se guardan
- **Dado** la cartera de clase, que ocupa unos 20 KB
- **Cuando** el usuario da de alta un cliente
- **Entonces** se guarda

#### Escenario: Puede salir mal: un cambio que la haría pasar del límite
- **Dado** una cartera a punto de llegar a 120 KB
- **Cuando** el usuario intenta añadir otro cliente con notas largas
- **Entonces** se rechaza con un mensaje que lo explica y la cartera no cambia

## clientes

### Regla: Alta de cliente

#### Escenario: Sale bien: el cliente nace en contacto con la tarifa del usuario
- **Dado** un usuario con tarifa de 250 € el punto
- **Cuando** da de alta un cliente con nombre y email de contacto
- **Entonces** el cliente queda en la etapa «contacto» con un precio del punto de 250 €

#### Escenario: Puede salir mal: faltan datos o el email no vale
- **Dado** un alta sin nombre o con un email sin @
- **Cuando** se envía
- **Entonces** se rechaza con un 400 que dice qué campo falla
- **Y** no se crea ningún cliente

### Regla: Etapas del embudo

#### Escenario: Sale bien: avanza de etapa y queda en el historial
- **Dado** un cliente en «reunión»
- **Cuando** el usuario lo pasa a «negociación»
- **Entonces** el cliente queda en «negociación» y el historial guarda el cambio con su fecha

#### Escenario: Puede salir mal: ganado sin presupuesto aceptado
- **Dado** un cliente sin ningún presupuesto aceptado
- **Cuando** el usuario intenta pasarlo a «ganado», o a una etapa que no existe
- **Entonces** se rechaza con un mensaje que lo explica
- **Y** el cliente sigue en su etapa

## presupuestos

### Regla: Puntos de un caso de uso

#### Escenario: Sale bien: los puntos salen de la fórmula
- **Dado** un caso de uso con 3 criterios, que toca datos personales y con incertidumbre media
- **Cuando** se calcula
- **Entonces** vale 6 puntos

#### Escenario: Puede salir mal: llega un importe de fuera
- **Dado** un borrador que llega con puntos o importes ya escritos
- **Cuando** se guarda
- **Entonces** esos valores se ignoran y los puntos e importes salen de la fórmula

### Regla: Importes del presupuesto

#### Escenario: Sale bien: instalación, mantenimiento e IVA
- **Dado** un presupuesto de 18 puntos para un cliente a 250 € el punto
- **Cuando** se calcula
- **Entonces** la instalación es 4.500 € más 945 € de IVA, y el mantenimiento 450 € al mes más 94,50 € de IVA

#### Escenario: Puede salir mal: un mantenimiento que no es un importe
- **Dado** un mantenimiento pactado negativo, o que no es un número
- **Cuando** se guarda
- **Entonces** se rechaza con un 400 y el presupuesto no cambia

### Regla: Precio del punto pactado con el cliente

#### Escenario: Sale bien: el presupuesto usa el precio del cliente
- **Dado** un cliente con el punto pactado a 300 €
- **Cuando** se crea un borrador de 10 puntos
- **Entonces** la instalación es de 3.000 €

#### Escenario: Puede salir mal: el precio cambia después de enviar
- **Dado** un presupuesto ya enviado a 250 € el punto
- **Cuando** se cambia el precio del punto del cliente a 300 €
- **Entonces** el presupuesto enviado conserva sus importes a 250 €

### Regla: Criterios en Dado / Cuando / Entonces

#### Escenario: Sale bien: se añade un caso de uso con sus criterios
- **Dado** un borrador con un caso de uso
- **Cuando** se añade otro con criterios completos
- **Entonces** recibe el código CU2 y sus puntos

#### Escenario: Puede salir mal: un criterio incompleto
- **Dado** un criterio sin «entonces»
- **Cuando** se intenta añadir
- **Entonces** se rechaza con «Cada criterio necesita dado, cuando y entonces»

### Regla: Lo enviado no se edita

#### Escenario: Sale bien: editar un enviado crea una versión nueva
- **Dado** un presupuesto enviado en su versión 1
- **Cuando** el usuario lo edita
- **Entonces** se crea la versión 2 en borrador y la 1 no cambia
- **Y** al enviar la versión 2, la 1 pasa a «sustituido»

#### Escenario: Puede salir mal: editar un aceptado
- **Dado** un presupuesto aceptado
- **Cuando** el usuario intenta editarlo
- **Entonces** se rechaza: los cambios van en una ampliación

### Regla: Caducidad

#### Escenario: Sale bien: dentro de plazo sigue abierto
- **Dado** un presupuesto enviado hace 10 días
- **Cuando** se consulta
- **Entonces** sigue «enviado» y caduca en 20 días

#### Escenario: Puede salir mal: pasados 30 días caduca
- **Dado** un presupuesto enviado hace 31 días sin decisión
- **Cuando** se consulta
- **Entonces** está «caducado»
- **Y** el cliente ya no puede aceptarlo desde la página

## publicacion

### Regla: Solo se envía lo especificado

#### Escenario: Sale bien: se envía con enlace y correo
- **Dado** un borrador con casos de uso y criterios, y un cliente con email
- **Cuando** el usuario lo envía
- **Entonces** queda «enviado», con un enlace público y validez de 30 días
- **Y** en la bandeja de salida aparece el correo al contacto del cliente con ese enlace
- **Y** si el cliente estaba en contacto o reunión, pasa a «propuesta»

#### Escenario: Puede salir mal: casos de uso sin criterios
- **Dado** un borrador sin casos de uso, o con alguno sin criterios
- **Cuando** el usuario intenta enviarlo
- **Entonces** se rechaza diciendo qué caso falla y sigue en borrador

### Regla: Abrir la propuesta la marca como vista

#### Escenario: Sale bien: la primera apertura pasa a visto
- **Dado** un presupuesto enviado
- **Cuando** alguien abre su enlace público
- **Entonces** ve la propuesta con sus casos de uso, criterios e importes con IVA
- **Y** el presupuesto pasa a «visto» y cuenta la apertura

#### Escenario: Puede salir mal: un enlace que no existe o una versión sustituida
- **Dado** un enlace inventado, o el de una versión sustituida
- **Cuando** alguien lo abre
- **Entonces** ve «Esta propuesta no existe», o el aviso de que hay una versión más nueva, sin botones para decidir

### Regla: El cliente decide desde la página

#### Escenario: Sale bien: acepta y el cliente pasa a ganado
- **Dado** una propuesta vista y en plazo
- **Cuando** el cliente pulsa «Aceptar»
- **Entonces** queda «aceptada» con la fecha y el cliente pasa a «ganado»

#### Escenario: Puede salir mal: decidir sobre una propuesta cerrada
- **Dado** una propuesta ya aceptada, rechazada o caducada
- **Cuando** el cliente intenta decidir otra vez
- **Entonces** se rechaza y la decisión anterior no cambia

## facturacion

### Regla: Se factura caso a caso con el acta aceptada

#### Escenario: Sale bien: se factura un caso con su acta aceptada
- **Dado** un presupuesto aceptado y el acta de CU2 aceptada
- **Cuando** el usuario factura CU2
- **Entonces** CU2 queda facturado con su importe y su fecha

#### Escenario: Puede salir mal: acta pendiente o presupuesto sin aceptar
- **Dado** un caso con el acta pendiente, o un presupuesto que no está aceptado
- **Cuando** el usuario intenta facturarlo
- **Entonces** se rechaza diciendo por qué y no se factura nada

### Regla: Un cambio, un criterio nuevo

#### Escenario: Sale bien: la ampliación tiene su propio presupuesto
- **Dado** un presupuesto aceptado con CU1 a CU4
- **Cuando** el cliente pide algo nuevo y el usuario crea una ampliación con un caso y sus criterios
- **Entonces** nace un borrador de tipo ampliación, con número propio, enlazado al aceptado y con el caso CU5

#### Escenario: Puede salir mal: ampliación gratis o sobre algo no aceptado
- **Dado** una ampliación sin criterios, o sobre un presupuesto que no está aceptado
- **Cuando** el usuario intenta crearla
- **Entonces** se rechaza: un cambio es un criterio nuevo y se presupuesta sobre lo aceptado

## seguimiento

### Regla: Registrar un seguimiento

#### Escenario: Sale bien: queda en la ficha con su próxima fecha
- **Dado** un cliente de la cartera
- **Cuando** el usuario registra una llamada con nota y próxima fecha
- **Entonces** aparece en la ficha del cliente

#### Escenario: Puede salir mal: canal desconocido o próxima fecha pasada
- **Dado** un seguimiento por un canal que no existe, o con la próxima fecha en el pasado
- **Cuando** se registra
- **Entonces** se rechaza con un 400 que dice qué falla

### Regla: A quién llamo hoy

#### Escenario: Sale bien: aparecen los pendientes con su motivo
- **Dado** una cartera con un seguimiento vencido, una propuesta abierta sin seguimiento hace 12 días, un piloto que termina en 3 días y un acta aceptada sin facturar
- **Cuando** el usuario pregunta a quién llama hoy
- **Entonces** aparece cada uno con un motivo que se entiende sin abrir nada

#### Escenario: Puede salir mal: lo ya atendido no aparece
- **Dado** una propuesta enviada con un seguimiento de hace 2 días y la próxima fecha la semana que viene
- **Cuando** el usuario pregunta a quién llama hoy
- **Entonces** esa propuesta no aparece

## embudo

### Regla: Resumen del embudo

#### Escenario: Sale bien: importe en juego por etapa y lo facturado
- **Dado** una cartera con propuestas abiertas, aceptadas y casos facturados
- **Cuando** el usuario pide el embudo
- **Entonces** ve, por etapa, cuántos clientes hay y cuánto está en juego
- **Y** lo facturado, lo pendiente de facturar y las cuotas mensuales de lo aceptado

#### Escenario: Puede salir mal: lo caducado no cuenta
- **Dado** una propuesta caducada
- **Cuando** el usuario pide el embudo
- **Entonces** su importe no está en juego

## pilotos

### Regla: Hoja de retorno

#### Escenario: Sale bien: ahorro, cuota y meses para amortizar
- **Dado** un piloto con métricas de antes y después y su valor por unidad
- **Cuando** el usuario pide la hoja de retorno
- **Entonces** ve el ahorro mensual, la cuota que costaría y en cuántos meses se amortiza la instalación

#### Escenario: Puede salir mal: un piloto que no se amortiza
- **Dado** un piloto cuyo ahorro no cubre la cuota, o un presupuesto que no es un piloto
- **Cuando** el usuario pide la hoja de retorno
- **Entonces** se le dice que no se amortiza, o que solo los pilotos tienen hoja de retorno

## semilla

### Regla: Cartera de clase

#### Escenario: Sale bien: los seis clientes con sus números
- **Dado** un usuario nuevo
- **Cuando** se siembra su cartera
- **Entonces** tiene Ribera Industrial, Albor Climatización, Lince Mudanzas, Núcleo Pilates, Administración Atalaya y Obrador Trigal
- **Y** el presupuesto de Atalaya suma 10 criterios, 18 puntos y 4.500 € de instalación

#### Escenario: Puede salir mal: sembrar dos veces no duplica
- **Dado** un usuario con la cartera ya sembrada
- **Cuando** se vuelve a sembrar
- **Entonces** sigue teniendo seis clientes
