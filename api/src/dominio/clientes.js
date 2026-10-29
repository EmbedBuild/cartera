import { ErrorDominio, comprobarErrores } from './errores.js';
import { centimosDesdeEuros } from './importes.js';
import { EMAIL, LIMITES, texto } from './textos.js';

export const ETAPAS = Object.freeze(['contacto', 'reunion', 'propuesta', 'negociacion', 'ganado', 'perdido']);
export const NOMBRE_ETAPA = Object.freeze({
  contacto: 'contacto',
  reunion: 'reunión',
  propuesta: 'propuesta',
  negociacion: 'negociación',
  ganado: 'ganado',
  perdido: 'perdido',
});

// Valida los datos de un cliente. Con «parcial», solo los campos que llegan (para editar).
export function validarCliente(entrada, { parcial = false } = {}) {
  const errores = {};
  const datos = {};
  const llega = (campo) => !parcial || entrada[campo] !== undefined;

  if (llega('nombre')) datos.nombre = texto(entrada.nombre, 'nombre', errores, { max: LIMITES.nombre, obligatorio: true, etiqueta: 'el nombre' });
  if (llega('sector')) datos.sector = texto(entrada.sector, 'sector', errores, { max: LIMITES.sector, etiqueta: 'el sector' });
  if (llega('notas')) datos.notas = texto(entrada.notas, 'notas', errores, { max: LIMITES.notas, etiqueta: 'las notas' });
  if (llega('contacto')) {
    const contacto = entrada.contacto ?? {};
    if (typeof contacto !== 'object' || Array.isArray(contacto)) errores.contacto = 'El contacto tiene que llevar nombre y email';
    else {
      const nombre = texto(contacto.nombre, 'contacto.nombre', errores, { max: LIMITES.nombre, etiqueta: 'el nombre del contacto' });
      const email = texto(contacto.email, 'contacto.email', errores, { max: LIMITES.email, etiqueta: 'el email del contacto' });
      if (email && !EMAIL.test(email)) errores['contacto.email'] = 'El email del contacto no es válido';
      datos.contacto = { nombre, email: email?.toLowerCase() };
    }
  }
  if (entrada.precioPuntoEuros !== undefined) {
    try {
      datos.precioPunto = centimosDesdeEuros(entrada.precioPuntoEuros, 'precioPuntoEuros', 'El precio del punto');
      if (datos.precioPunto === 0) errores.precioPuntoEuros = 'El precio del punto no puede ser 0';
    } catch (e) {
      Object.assign(errores, e.extra.errores);
    }
  }
  comprobarErrores(errores, 'Revisa los datos del cliente');
  return datos;
}

// El cambio de etapa queda en el historial. «Ganado» solo con un presupuesto aceptado: la API no deja maquillar el embudo.
export function cambiarEtapa(cliente, etapa, { tieneAceptado, ahora, nota = '', por = 'usuario' }) {
  if (!ETAPAS.includes(etapa)) {
    throw new ErrorDominio('validacion', `Esa etapa no existe. Las etapas son: ${ETAPAS.map((e) => NOMBRE_ETAPA[e]).join(', ')}`, {
      errores: { etapa: 'Etapa desconocida' },
    });
  }
  if (etapa === 'ganado' && !tieneAceptado) {
    throw new ErrorDominio('regla', 'Un cliente pasa a «ganado» cuando acepta un presupuesto, y este no tiene ninguno aceptado');
  }
  if (etapa === cliente.etapa) return cliente;
  return {
    ...cliente,
    etapa,
    historialEtapas: [...cliente.historialEtapas, { de: cliente.etapa, a: etapa, fecha: ahora.toISOString(), por, nota }],
  };
}
