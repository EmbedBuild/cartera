import { comprobarErrores } from './errores.js';
import { diaLocal, esDia } from './fechas.js';
import { LIMITES, texto } from './textos.js';

export const CANALES = Object.freeze(['email', 'llamada', 'reunion', 'whatsapp']);

// Un seguimiento: qué se habló, por dónde y cuándo toca el siguiente. La próxima fecha nunca en el pasado.
export function validarSeguimiento(entrada, ahora) {
  const errores = {};
  const canal = entrada.canal;
  if (!CANALES.includes(canal)) errores.canal = `El canal es uno de estos: ${CANALES.join(', ')}`;
  const nota = texto(entrada.nota, 'nota', errores, { max: LIMITES.nota, obligatorio: true, etiqueta: 'la nota' });
  let proximo = null;
  if (entrada.proximo !== undefined && entrada.proximo !== null && entrada.proximo !== '') {
    if (!esDia(entrada.proximo)) errores.proximo = 'La próxima fecha va como AAAA-MM-DD';
    else if (entrada.proximo < diaLocal(ahora)) errores.proximo = `La próxima fecha tiene que ser hoy (${diaLocal(ahora)}) o después`;
    else proximo = entrada.proximo;
  }
  comprobarErrores(errores, 'Revisa el seguimiento');
  return { canal, nota, proximo };
}
