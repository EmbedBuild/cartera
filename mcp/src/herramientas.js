// Las herramientas del MCP de Cartera: los platos de la carta. Cada una es un caso de uso con su nombre, su
// descripción (lo que lee la IA para decidir cuándo usarla), sus datos de entrada y la llamada a la cocina (la API).
// pedir(metodo, ruta, cuerpo) habla con la API en nombre de quien está conectado (ver src/index.js); en las
// pruebas se cambia por uno falso, así que aquí no hay nada de Cloudflare. El precio lo calcula siempre la API.
import { z } from 'zod';

// Para meter en una ruta lo que escribe el usuario sin romperla: ruta`/api/clientes/${id}`.
export const ruta = (plantilla, ...partes) => plantilla.reduce((r, trozo, i) => r + trozo + (i < partes.length ? encodeURIComponent(partes[i]) : ''), '');

const LEER = { readOnlyHint: true, openWorldHint: false };
const CAMBIAR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const Criterio = z.object({
  dado: z.string().describe('La situación de partida'),
  cuando: z.string().describe('Lo que pasa o lo que hace alguien'),
  entonces: z.string().describe('Lo que se ve o se comprueba, con un sí o un no'),
});

const CasoDeUso = z.object({
  nombre: z.string().describe('Algo que el cliente puede usar y comprobar por sí solo, por ejemplo «El bar hace su pedido»'),
  criterios: z.array(Criterio).min(1).describe('Escenarios Dado / Cuando / Entonces: al menos el que sale bien y el que sale mal'),
  ponderacion: z
    .object({
      datosPersonales: z.boolean().default(false).describe('Toca datos personales (suma 2 puntos)'),
      pagos: z.boolean().default(false).describe('Toca pagos (suma 2 puntos)'),
      incertidumbre: z.enum(['baja', 'media', 'alta']).default('baja').describe('Lo que aún no se conoce: baja 0, media 1, alta 3 puntos'),
    })
    .optional(),
});

export function registrarHerramientas(servidor, pedir) {

  servidor.registerTool(
    'a_quien_llamo_hoy',
    {
      title: 'A quién llamo hoy',
      description: 'Lista lo que pide acción hoy en la cartera: seguimientos vencidos, propuestas enviadas o vistas sin respuesta, pilotos que terminan, presupuestos a punto de caducar y casos aceptados sin facturar. Cada entrada trae prioridad y motivo.',
      annotations: LEER,
    },
    () => pedir('GET', '/api/hoy'),
  );

  servidor.registerTool(
    'ver_embudo',
    {
      title: 'Ver el embudo',
      description: 'Resumen del embudo: clientes e importe en juego en cada etapa, lo facturado, lo pendiente de facturar y las cuotas mensuales de mantenimiento.',
      annotations: LEER,
    },
    () => pedir('GET', '/api/embudo'),
  );

  servidor.registerTool(
    'listar_clientes',
    {
      title: 'Listar clientes',
      description: 'Lista los clientes con su etapa del embudo. Úsala para encontrar el identificador (clienteId) de un cliente por su nombre.',
      inputSchema: z.object({
        etapa: z.enum(['contacto', 'reunion', 'propuesta', 'negociacion', 'ganado', 'perdido']).optional().describe('Filtra por etapa'),
      }),
      annotations: LEER,
    },
    ({ etapa }) => pedir('GET', etapa ? ruta`/api/clientes?etapa=${etapa}` : '/api/clientes'),
  );

  servidor.registerTool(
    'ficha_del_cliente',
    {
      title: 'Ficha del cliente',
      description: 'La ficha de un cliente: datos, notas de reuniones, historial de etapas, sus presupuestos y sus seguimientos. Léela antes de redactar o enviar nada para ese cliente.',
      inputSchema: z.object({ clienteId: z.string().describe('Identificador del cliente, por ejemplo «obrador-trigal»') }),
      annotations: LEER,
    },
    ({ clienteId }) => pedir('GET', ruta`/api/clientes/${clienteId}`),
  );

  servidor.registerTool(
    'nuevo_cliente',
    {
      title: 'Nuevo cliente',
      description: 'Da de alta un cliente en el embudo. El precio del punto se pacta una vez con cada cliente; si no se indica, se usa la tarifa del usuario.',
      inputSchema: z.object({
        nombre: z.string(),
        sector: z.string().optional(),
        contacto: z.object({ nombre: z.string(), email: z.string().describe('Correo del contacto') }),
        notas: z.string().optional().describe('Lo que se sabe del cliente o de la primera reunión'),
        precioPuntoEuros: z.number().positive().optional().describe('Precio del punto pactado con este cliente, en euros'),
        etapa: z.enum(['contacto', 'reunion', 'propuesta', 'negociacion']).optional(),
      }),
      annotations: CAMBIAR,
    },
    (cliente) => pedir('POST', '/api/clientes', cliente),
  );

  servidor.registerTool(
    'mover_de_etapa',
    {
      title: 'Mover de etapa',
      description: 'Cambia la etapa del embudo de un cliente y lo deja en su historial. «ganado» solo se acepta si tiene un presupuesto aceptado.',
      inputSchema: z.object({
        clienteId: z.string(),
        etapa: z.enum(['contacto', 'reunion', 'propuesta', 'negociacion', 'ganado', 'perdido']),
        nota: z.string().optional().describe('Por qué cambia, por ejemplo el motivo de una pérdida'),
      }),
      annotations: CAMBIAR,
    },
    ({ clienteId, etapa, nota }) => pedir('POST', ruta`/api/clientes/${clienteId}/etapa`, { etapa, nota }),
  );

  servidor.registerTool(
    'redactar_presupuesto',
    {
      title: 'Redactar presupuesto',
      description:
        'Crea un presupuesto en borrador a partir de casos de uso con sus criterios Dado / Cuando / Entonces. Tú propones los casos y los criterios a partir de lo que se sabe del cliente; Cartera calcula los puntos y el importe con el precio del punto pactado. Nunca inventes ni escribas importes: enséñale al usuario el desglose que devuelve Cartera. No se envía nada al cliente.',
      inputSchema: z.object({
        clienteId: z.string(),
        titulo: z.string(),
        resumen: z.string().optional().describe('Qué problema resuelve, en dos frases'),
        casosDeUso: z.array(CasoDeUso).min(1),
        mantenimientoMensualEuros: z.number().nonnegative().optional().describe('Cuota mensual pactada; si no se indica, el 10 % de la instalación'),
      }),
      annotations: CAMBIAR,
    },
    (presupuesto) => pedir('POST', '/api/presupuestos', presupuesto),
  );

  servidor.registerTool(
    'ver_presupuesto',
    {
      title: 'Ver presupuesto',
      description: 'Detalle de un presupuesto: casos de uso, criterios, puntos, importes con IVA, estado, aperturas y enlace público.',
      inputSchema: z.object({ referencia: z.string().describe('Por ejemplo «P-2026-004» (la última versión) o «P-2026-004-v2»') }),
      annotations: LEER,
    },
    ({ referencia }) => pedir('GET', ruta`/api/presupuestos/${referencia}`),
  );

  servidor.registerTool(
    'anadir_caso_de_uso',
    {
      title: 'Añadir caso de uso',
      description: 'Añade un caso de uso a un presupuesto. Si el presupuesto ya se envió, Cartera crea una versión nueva en borrador y lo avisa.',
      inputSchema: z.object({ referencia: z.string(), casoDeUso: CasoDeUso }),
      annotations: CAMBIAR,
    },
    ({ referencia, casoDeUso }) => pedir('POST', ruta`/api/presupuestos/${referencia}/casos`, casoDeUso),
  );

  servidor.registerTool(
    'enviar_presupuesto',
    {
      title: 'Enviar presupuesto por correo',
      description:
        'Envía el presupuesto al contacto del cliente por correo, con el enlace a la página donde puede aceptarlo o rechazarlo. Antes de usarla, enseña al usuario el resumen y el importe y pídele confirmación explícita: el envío no se deshace.',
      inputSchema: z.object({
        referencia: z.string(),
        mensaje: z.string().optional().describe('Unas líneas personales para el cliente, que van al principio del correo'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ referencia, mensaje }) => pedir('POST', ruta`/api/presupuestos/${referencia}/enviar`, { mensaje }),
  );

  servidor.registerTool(
    'registrar_seguimiento',
    {
      title: 'Registrar seguimiento',
      description: 'Apunta un contacto con el cliente (llamada, correo, reunión o WhatsApp) y, si se acuerda, la fecha del próximo.',
      inputSchema: z.object({
        clienteId: z.string(),
        canal: z.enum(['email', 'llamada', 'reunion', 'whatsapp']),
        nota: z.string().describe('Qué se habló y qué se acordó'),
        proximo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fecha del próximo seguimiento, AAAA-MM-DD'),
        presupuestoId: z.string().optional(),
      }),
      annotations: CAMBIAR,
    },
    (seguimiento) => pedir('POST', '/api/seguimientos', seguimiento),
  );

  servidor.registerTool(
    'presupuestar_ampliacion',
    {
      title: 'Presupuestar una ampliación',
      description:
        'Cuando un cliente con un presupuesto aceptado pide algo más («ya que estáis…»), lo convierte en una ampliación con sus casos de uso y su precio. Un cambio es un criterio nuevo: nunca va gratis dentro de lo ya aceptado.',
      inputSchema: z.object({
        referencia: z.string().describe('El presupuesto aceptado al que amplía'),
        titulo: z.string().optional(),
        casosDeUso: z.array(CasoDeUso).min(1),
      }),
      annotations: CAMBIAR,
    },
    ({ referencia, ...ampliacion }) => pedir('POST', ruta`/api/presupuestos/${referencia}/ampliacion`, ampliacion),
  );

  servidor.registerTool(
    'cerrar_caso_de_uso',
    {
      title: 'Acta o factura de un caso de uso',
      description: 'Marca que el cliente ha firmado el acta de un caso de uso (todos sus criterios en «sí») o lo factura. Solo se factura un caso con el acta aceptada y el presupuesto aceptado.',
      inputSchema: z.object({
        referencia: z.string(),
        caso: z.string().describe('Código del caso, por ejemplo «CU2»'),
        accion: z.enum(['acta', 'facturar']),
      }),
      annotations: CAMBIAR,
    },
    ({ referencia, caso, accion }) => pedir('POST', ruta`/api/presupuestos/${referencia}/casos/${caso}/${accion}`),
  );

  servidor.registerTool(
    'hoja_de_retorno',
    {
      title: 'Hoja de retorno de un piloto',
      description: 'Para un piloto: lo que ahorra al mes según sus métricas, lo que costaría seguir y en cuántos meses se amortiza. Sirve para proponer el paso a pago.',
      inputSchema: z.object({ referencia: z.string().describe('Referencia del presupuesto de tipo piloto') }),
      annotations: LEER,
    },
    ({ referencia }) => pedir('GET', ruta`/api/pilotos/${referencia}/retorno`),
  );

  servidor.registerTool(
    'bandeja_de_salida',
    {
      title: 'Bandeja de salida',
      description: 'Los correos de propuestas enviados desde Cartera, con su destinatario, asunto y enlace.',
      annotations: LEER,
    },
    () => pedir('GET', '/api/correos'),
  );
}
