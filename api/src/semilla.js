import { TARIFA_POR_DEFECTO, VALIDEZ_DIAS } from './dominio/importes.js';
import { diaLocal, sumarDias, DIA_MS } from './dominio/fechas.js';
import { idDe } from './dominio/presupuestos.js';
import { slug } from './dominio/textos.js';
import { crearAzar, huella } from './web/azar.js';

// La cartera de clase: los cinco clientes del curso, cada uno atascado en un dolor de quien vende IA,
// y un lead nuevo (Obrador Trigal) para redactar un presupuesto desde cero.
// Todas las fechas son relativas a «ahora», para que «¿a quién llamo hoy?» funcione el día de la clase.

// Un criterio en una línea: «Dado … | cuando … | entonces …».
const criterio = (texto) => {
  const [dado, cuando, entonces] = texto.split(' | ');
  return { dado, cuando, entonces };
};

function caso(codigo, nombre, criterios, ponderacion = {}, extra = {}) {
  return {
    codigo,
    nombre,
    criterios: criterios.map(criterio),
    ponderacion: { datosPersonales: false, pagos: false, incertidumbre: 'baja', ...ponderacion },
    acta: { estado: 'pendiente', fecha: null },
    facturado: null,
    ...extra,
  };
}

export const CLIENTES_DE_CLASE = [
  'ribera-industrial',
  'albor-climatizacion',
  'lince-mudanzas',
  'nucleo-pilates',
  'administracion-atalaya',
  'obrador-trigal',
];

export const carteraVacia = () => ({ clientes: [], presupuestos: [], seguimientos: [], correos: [], contador: {} });

export function carteraDeClase({ usuario, ahora, azar = crearAzar() }) {
  const hace = (dias, horas = 0) => new Date(ahora.getTime() - dias * DIA_MS - horas * 3600_000).toISOString();
  const dia = (desplazamiento) => diaLocal(sumarDias(ahora, desplazamiento));
  const tarifa = usuario.tarifaPunto ?? TARIFA_POR_DEFECTO;

  function cliente(nombre, sector, contacto, etapa, historia, extra = {}) {
    return {
      id: slug(nombre),
      nombre,
      sector,
      contacto,
      etapa,
      historialEtapas: historia.map(([de, a, dias]) => ({ de, a, fecha: hace(dias), por: 'usuario', nota: '' })),
      precioPunto: tarifa,
      notas: '',
      creado: hace(historia[0][2]),
      actualizado: hace(historia.at(-1)[2]),
      ...extra,
    };
  }

  function presupuesto(n, clienteId, campos) {
    const numero = `P-${ahora.getUTCFullYear()}-${String(n).padStart(3, '0')}`;
    return {
      id: idDe(numero, 1),
      numero,
      version: 1,
      versionAnteriorId: null,
      tipo: 'proyecto',
      padreId: null,
      clienteId,
      resumen: '',
      mantenimientoPactado: null,
      gratuito: false,
      piloto: null,
      estado: 'borrador',
      enviadoEn: null,
      caduca: null,
      precioPunto: null,
      tokenPublico: null,
      aperturas: [],
      nAperturas: 0,
      decision: null,
      sustituidoPor: null,
      ...campos,
      actualizado: campos.actualizado ?? campos.creado,
    };
  }

  const enviado = (dias) => ({ enviadoEn: hace(dias), caduca: hace(dias - VALIDEZ_DIAS), tokenPublico: azar.tokenPublico(usuario.id) });
  const aceptado = (dias, comentario = '') => ({ estado: 'aceptado', decision: { tipo: 'aceptado', fecha: hace(dias), comentario } });

  const clientes = [
    cliente(
      'Ribera Industrial',
      'Distribuidora de material industrial',
      { nombre: 'Andrés Ribera', email: 'andres.ribera@example.com' },
      'propuesta',
      [[null, 'contacto', 20], ['contacto', 'reunion', 12], ['reunion', 'propuesta', 6]],
      { notas: 'Los pedidos de los clientes llegan por correo y alguien los teclea a mano en el ERP. Se equivocan en referencias y plazos.' },
    ),
    cliente(
      'Albor Climatización',
      'Instalación y mantenimiento de climatización (35 personas)',
      { nombre: 'Marta Albor', email: 'marta.albor@example.com' },
      'ganado',
      [[null, 'contacto', 75], ['contacto', 'reunion', 70], ['reunion', 'propuesta', 60], ['propuesta', 'ganado', 55]],
      { precioPunto: 28000, notas: 'Precio del punto pactado: 280 €.' },
    ),
    cliente(
      'Lince Mudanzas',
      'Mudanzas (14 personas, 3 camiones, 45 mudanzas al mes)',
      { nombre: 'Tomás Lince', email: 'tomas.lince@example.com' },
      'negociacion',
      [[null, 'contacto', 40], ['contacto', 'reunion', 33], ['reunion', 'negociacion', 27]],
      { notas: 'El presupuesto por WhatsApp lo hizo el sobrino del dueño en un fin de semana. Ticket medio de 900 € y señal del 20 %.' },
    ),
    cliente(
      'Núcleo Pilates',
      'Estudio de pilates (2 salas, 4 instructoras, 160 socias)',
      { nombre: 'Irene Núñez', email: 'irene.nucleo@example.com' },
      'propuesta',
      [[null, 'contacto', 30], ['contacto', 'reunion', 20], ['reunion', 'propuesta', 12]],
    ),
    cliente(
      'Administración Atalaya',
      'Administradora de fincas (42 comunidades, unas 180 incidencias al mes)',
      { nombre: 'Pilar Atalaya', email: 'pilar.atalaya@example.com' },
      'ganado',
      [[null, 'contacto', 40], ['contacto', 'reunion', 33], ['reunion', 'propuesta', 25], ['propuesta', 'ganado', 21]],
    ),
    cliente(
      'Obrador Trigal',
      'Obrador de pan y bollería para hostelería',
      { nombre: 'Julián Trigal', email: 'julian.trigal@example.com' },
      'reunion',
      [[null, 'contacto', 4], ['contacto', 'reunion', 1]],
      {
        notas: [
          'Notas de la reunión de ayer:',
          '- Unos 30 bares les piden pan y bollería cada día, por WhatsApp y por teléfono, hasta las 21:00.',
          '- Hay errores de cantidades: la semana pasada salieron 40 barras en vez de 14 para un bar.',
          '- Quieren que cada bar haga su pedido desde el móvil y pueda cambiarlo hasta las 21:00.',
          '- A las 22:00 el obrador necesita el resumen de producción por producto para empezar a amasar.',
          '- Varios dueños de bar son mayores: tiene que ser muy fácil.',
          '- Albaranes y facturas, más adelante (no ahora).',
          '- Les prometí el presupuesto esta semana.',
        ].join('\n'),
      },
    ),
  ];

  const presupuestos = [
    presupuesto(1, 'albor-climatizacion', {
      titulo: 'Partes de trabajo y agenda de técnicos',
      resumen: 'Que los técnicos cierren los partes desde el móvil y la oficina vea la agenda por zonas.',
      creado: hace(62),
      ...enviado(60),
      precioPunto: 28000,
      ...aceptado(55),
      aperturas: [{ fecha: hace(59) }],
      nAperturas: 1,
      primeraApertura: hace(59),
      casosDeUso: [
        caso('CU1', 'Partes de trabajo desde el móvil', [
          'un técnico con un aviso asignado | termina la reparación y firma el cliente | el parte queda cerrado con la firma y la hora',
          'un técnico sin cobertura en un sótano | cierra el parte | se guarda en el móvil y se envía al recuperar la conexión',
          'un parte sin firma del cliente | el técnico intenta cerrarlo | la app no lo deja y le pide la firma',
        ], { datosPersonales: true }, { acta: { estado: 'aceptada', fecha: hace(31) }, facturado: { fecha: hace(30), importe: 5 * 28000 } }),
        caso('CU2', 'Agenda de técnicos por zona', [
          'tres técnicos en la zona norte | la oficina asigna un aviso del norte | ve primero a los técnicos de esa zona',
          'un técnico con la agenda llena | se le intenta asignar otro aviso a la misma hora | la app avisa del choque',
          'un técnico de baja | se abre la agenda | no aparece como disponible',
        ], { incertidumbre: 'media' }, { acta: { estado: 'aceptada', fecha: hace(21) }, facturado: { fecha: hace(20), importe: 4 * 28000 } }),
        caso('CU3', 'Renovación de contratos de mantenimiento', [
          'un contrato que vence en 30 días | llega la fecha | el cliente recibe la renovación con el enlace de pago',
          'un pago de renovación rechazado | el banco lo devuelve | la oficina recibe un aviso y el contrato no se da por renovado',
        ], { pagos: true }),
        caso('CU4', 'Informe mensual para el cliente', [
          'un cliente con contrato | termina el mes | recibe un informe con las visitas y las averías resueltas',
          'un mes sin visitas | termina el mes | el informe lo dice en vez de llegar vacío',
        ]),
      ],
    }),
    presupuesto(2, 'administracion-atalaya', {
      titulo: 'Avisos de averías para las comunidades',
      resumen: 'Que los vecinos avisen desde el móvil, la gestora atienda antes lo urgente y nadie tenga que llamar para saber cómo va su aviso.',
      creado: hace(27),
      ...enviado(25),
      precioPunto: tarifa,
      ...aceptado(21, 'Adelante. Empezamos por dos comunidades.'),
      aperturas: [{ fecha: hace(24) }, { fecha: hace(22) }],
      nAperturas: 2,
      primeraApertura: hace(24),
      casosDeUso: [
        caso('CU1', 'Avisar de una avería', [
          'un vecino de Calle Mayor 12 | envía un aviso de tipo «agua» con su descripción | recibe un número de seguimiento',
          'un vecino que abre un aviso | lo rellena | se le piden como mucho tres datos: tipo, descripción y foto opcional',
          'un vecino sin cobertura | el envío falla | ve un mensaje claro y puede reintentarlo sin perder lo escrito',
        ], { datosPersonales: true, incertidumbre: 'media' }, { acta: { estado: 'aceptada', fecha: hace(8) }, facturado: { fecha: hace(7), importe: 6 * tarifa } }),
        caso('CU2', 'Ver las incidencias por urgencia', [
          'un aviso de gas y otro de la luz de la escalera | la gestora abre su panel | el de gas aparece primero',
          'un aviso urgente con más de 24 horas | la gestora abre su panel | aparece marcado como fuera de plazo',
        ], {}, { acta: { estado: 'aceptada', fecha: hace(2) } }),
        caso('CU3', 'Saber el estado de mi aviso', [
          'un vecino con un aviso «recibido» | la gestora lo pasa a «asignado» | el vecino recibe un aviso en la app',
          'un vecino con su número de seguimiento | lo consulta | ve el estado y la fecha de cada cambio',
          'un vecino | intenta cambiar el estado de su aviso | la app lo rechaza y el estado no cambia',
        ], { datosPersonales: true, incertidumbre: 'media' }),
        caso('CU4', 'Cada vecino, solo su comunidad', [
          'un vecino de Calle Mayor 12 | consulta los avisos | solo ve los de su comunidad',
          'un vecino de Plaza del Sol 3 | pide un aviso de Calle Mayor 12 por su número | la app responde que no lo encuentra',
        ], { datosPersonales: true }),
      ],
    }),
    presupuesto(3, 'lince-mudanzas', {
      tipo: 'piloto',
      gratuito: true,
      titulo: 'Piloto gratis: presupuestos de mudanza por fotos',
      resumen: 'Un mes de prueba sin coste: el cliente manda fotos, recibe el presupuesto y reserva con la señal.',
      creado: hace(28),
      ...enviado(28),
      precioPunto: tarifa,
      ...aceptado(27, 'Probamos un mes.'),
      aperturas: [{ fecha: hace(27, 2) }],
      nAperturas: 1,
      primeraApertura: hace(27, 2),
      piloto: {
        inicio: dia(-25),
        fechaFin: dia(3),
        metricas: [
          { nombre: 'Horas del dueño haciendo presupuestos', unidad: 'horas', antes: 60, despues: 15, valorUnidad: 2500 },
          { nombre: 'Visitas a domicilio para medir', unidad: 'visitas', antes: 40, despues: 15, valorUnidad: 3500 },
          { nombre: 'Mudanzas perdidas por tardar en presupuestar', unidad: 'mudanzas', antes: 6, despues: 2, valorUnidad: 18000 },
        ],
      },
      casosDeUso: [
        caso('CU1', 'Presupuesto a partir de fotos', [
          'un cliente que manda fotos de su salón y su cocina | pide presupuesto | recibe un precio en menos de 2 horas',
          'unas fotos en las que no se ve el volumen | se piden presupuestos | la app pide más fotos antes de dar precio',
          'un piano entre los muebles | se presupuesta | sale como partida aparte',
        ], { incertidumbre: 'media' }),
        caso('CU2', 'Reserva con la señal del 20 %', [
          'un cliente con el presupuesto aceptado | paga la señal | la fecha queda reservada',
          'un pago de señal rechazado | el banco lo devuelve | la fecha sigue libre y el cliente recibe un aviso',
        ], { pagos: true, datosPersonales: true }),
        caso('CU3', 'Calendario de camiones', [
          'tres camiones con mudanzas el sábado | se reserva otra el sábado | la app avisa de que no hay camión',
          'una mudanza cancelada | se cancela | el camión vuelve a quedar libre ese día',
          'una mudanza de dos días | se reserva | el camión queda ocupado los dos días',
        ]),
      ],
    }),
    presupuesto(4, 'nucleo-pilates', {
      titulo: 'Reservas, lista de espera y bono',
      resumen: 'Que las socias reserven desde el móvil, la lista de espera avance sola y el bono se renueve sin ir a recepción.',
      creado: hace(13),
      ...enviado(12),
      estado: 'visto',
      aperturas: [{ fecha: hace(11) }, { fecha: hace(4) }],
      nAperturas: 2,
      primeraApertura: hace(11),
      precioPunto: tarifa,
      casosDeUso: [
        caso('CU1', 'Reservar clase desde el móvil', [
          'una socia con bono | reserva la clase de las 19:00 | queda apuntada y se descuenta una clase',
          'una clase con las 8 plazas ocupadas | una socia intenta reservar | se le ofrece la lista de espera',
          'una socia sin clases en el bono | intenta reservar | la app le explica cómo renovarlo',
        ], { datosPersonales: true }),
        caso('CU2', 'Lista de espera automática', [
          'una clase llena con dos socias en espera | alguien cancela | entra la primera de la lista y recibe un aviso',
          'una cancelación a 30 minutos de la clase | alguien cancela | la plaza se ofrece pero no se asigna sola',
          'una socia en espera | la clase empieza sin plaza | sale de la lista y no se le descuenta nada',
        ], { incertidumbre: 'media' }),
        caso('CU3', 'Bono mensual de 8 clases', [
          'una socia con el bono a punto de acabar | lo renueva desde el móvil | paga 96 € y tiene 8 clases más',
          'un pago con tarjeta caducada | se intenta renovar | el bono no se renueva y la socia ve el motivo',
        ], { pagos: true, datosPersonales: true }),
      ],
    }),
    presupuesto(5, 'ribera-industrial', {
      titulo: 'Pedidos por correo sin teclear',
      resumen: '',
      creado: hace(5),
      casosDeUso: [
        caso('CU1', 'Leer los pedidos que llegan por correo', []),
        caso('CU2', 'Confirmar al cliente el plazo de entrega', []),
      ],
    }),
  ];

  const seguimiento = (clienteId, dias, canal, nota, proximo = null, presupuestoId = null) => ({
    id: azar.id(),
    clienteId,
    presupuestoId,
    fecha: hace(dias),
    canal,
    nota,
    proximo,
  });

  const seguimientos = [
    seguimiento('albor-climatizacion', 55, 'email', 'Aceptan el presupuesto. Facturamos caso a caso al firmar cada acta.', null, idDe(presupuestos[0].numero, 1)),
    seguimiento('lince-mudanzas', 25, 'reunion', 'Arranca el piloto gratis de un mes. Medimos horas de presupuestos, visitas y mudanzas perdidas.'),
    seguimiento('ribera-industrial', 6, 'llamada', 'Le dije “unos 3.000” por teléfono, sin haber especificado nada. Quiere verlo por escrito esta semana.', dia(-1)),
    seguimiento('administracion-atalaya', 2, 'email', 'Pilar firma el acta de CU2 (ver las incidencias por urgencia).', null, idDe(presupuestos[1].numero, 1)),
    seguimiento(
      'albor-climatizacion',
      1,
      'llamada',
      'Llama Marta: quiere que al cliente le llegue un SMS cuando el técnico va de camino, “ya que estáis”.',
      dia(0),
      idDe(presupuestos[0].numero, 1),
    ),
    seguimiento('obrador-trigal', 1, 'reunion', 'Primera reunión en el obrador (ver notas del cliente). Prometido el presupuesto esta semana.', dia(2)),
  ];

  return { clientes, presupuestos, seguimientos, correos: [], contador: { [ahora.getUTCFullYear()]: presupuestos.length } };
}

// Siembra la cartera de un usuario. Idempotente: si ya tiene clientes, no toca nada.
export async function sembrarCartera(almacen, usuario, { ahora = new Date(), azar = crearAzar() } = {}) {
  const actual = await almacen.leerCartera(usuario.id);
  if (actual?.clientes.length) return { sembrado: false };
  await almacen.guardarCartera(usuario.id, carteraDeClase({ usuario, ahora, azar }));
  return { sembrado: true };
}

// Alta (o actualización) de un usuario con un token de desarrollo nuevo; los anteriores dejan de valer.
// El token solo se ve aquí: se guarda su huella. «vacia» le deja la cartera vacía en vez de sembrarla al entrar.
export async function altaUsuario(almacen, { id, nombre, email = null, tarifaPunto = TARIFA_POR_DEFECTO }, { ahora = new Date(), azar = crearAzar(), vacia = false } = {}) {
  const token = azar.token();
  const marca = { huella: await huella(token), creado: ahora.toISOString(), revocado: false };
  const existente = await almacen.leerUsuario(id);
  const usuario = existente
    ? { ...existente, nombre, email: email ?? existente.email, tokens: [...(existente.tokens ?? []).map((t) => ({ ...t, revocado: true })), marca] }
    : { id, nombre, email, tarifaPunto, tokens: [marca], creado: ahora.toISOString() };
  await almacen.guardarUsuario(usuario);
  if (vacia && !(await almacen.leerCartera(id))) await almacen.guardarCartera(id, carteraVacia());
  return { usuario, token };
}

// Deja la cartera de todos (o de un usuario) como recién sembrada, con fechas de hoy. Usuarios y tokens se conservan.
// La copia de seguridad previa es cosa del almacén (en el de fichero, scripts/reiniciar-clase.js la hace antes).
export async function reiniciarClase(almacen, { usuarioId = null, ahora = new Date(), azar = crearAzar() } = {}) {
  const usuarios = (await almacen.listarUsuarios()).filter((u) => !usuarioId || u.id === usuarioId);
  for (const usuario of usuarios) await almacen.guardarCartera(usuario.id, carteraDeClase({ usuario, ahora, azar }));
  return usuarios.map((u) => u.id);
}
